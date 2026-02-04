import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, EmployeePosition } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const UpdateEmployeeSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  position: z.enum([
    "COLLECTION_OFFICER",
    "OFFICE_CLERK",
    "UNIT_MANAGER",
    "OPERATIONS_MANAGER",
  ]),
  assignedGroupIds: z.union([z.string(), z.array(z.string())]).optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);
  const { id } = await params;

  const body = await req.json();

  // Normalize assignedGroupIds to array of strings
  let assignedGroupIds: string[] = [];
  if (Array.isArray(body.assignedGroupIds)) {
      assignedGroupIds = body.assignedGroupIds;
  } else if (typeof body.assignedGroupIds === 'string') {
      assignedGroupIds = [body.assignedGroupIds];
  }

  const parsed = UpdateEmployeeSchema.safeParse({
    firstName: String(body.firstName || "").trim(),
    lastName: String(body.lastName || "").trim(),
    position: String(body.position || ""),
    assignedGroupIds,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const request = await tryGetAuditRequestContext();

  try {
    let updatedEmployee;
    await prisma.$transaction(async (tx) => {
      updatedEmployee = await tx.employee.update({
        where: { id },
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          position: parsed.data.position as EmployeePosition,
          groupsAsCollectionOfficer: {
            set: assignedGroupIds.map((id) => ({ id })),
          },
        },
        include: { groupsAsCollectionOfficer: true },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "EMPLOYEE_UPDATE",
        entityType: "Employee",
        entityId: id,
        metadata: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          position: parsed.data.position,
          assignedGroupIds,
        },
        request,
      });
    });

    return NextResponse.json(updatedEmployee);
  } catch (error: any) {
    console.error("Error updating employee:", error);
    return NextResponse.json({ error: "Failed to update employee" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);
  const { id } = await params;

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id },
        select: { id: true, firstName: true, lastName: true, position: true },
      });
      if (!employee) return;

      await tx.employee.delete({ where: { id } });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "EMPLOYEE_DELETE",
        entityType: "Employee",
        entityId: employee.id,
        metadata: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          position: employee.position,
        },
        request,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting employee:", error);
    if (error.code === 'P2003') {
         return NextResponse.json({ error: "Cannot delete employee because they are assigned to records." }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to delete employee" }, { status: 500 });
  }
}
