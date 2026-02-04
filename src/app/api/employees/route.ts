import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, EmployeePosition } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateEmployeeSchema = z.object({
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

export async function GET(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const searchParams = req.nextUrl.searchParams;
  const q = (searchParams.get("q") ?? "").trim();

  const where =
    q.length > 0
      ? {
          OR: [
            { firstName: { contains: q, mode: "insensitive" as const } },
            { lastName: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

  const employees = await prisma.employee.findMany({
    where,
    include: {
      groupsAsCollectionOfficer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(employees);
}

export async function POST(req: NextRequest) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const body = await req.json();
  
  // Normalize assignedGroupIds to array of strings
  let assignedGroupIds: string[] = [];
  if (Array.isArray(body.assignedGroupIds)) {
      assignedGroupIds = body.assignedGroupIds;
  } else if (typeof body.assignedGroupIds === 'string') {
      assignedGroupIds = [body.assignedGroupIds];
  }

  const parsed = CreateEmployeeSchema.safeParse({
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
    let createdEmployee;
    await prisma.$transaction(async (tx) => {
      createdEmployee = await tx.employee.create({
        data: {
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          position: parsed.data.position as EmployeePosition,
          groupsAsCollectionOfficer: {
            connect: assignedGroupIds.map((id) => ({ id })),
          },
        },
        include: { groupsAsCollectionOfficer: true },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "EMPLOYEE_CREATE",
        entityType: "Employee",
        entityId: createdEmployee.id,
        metadata: {
          firstName: createdEmployee.firstName,
          lastName: createdEmployee.lastName,
          position: createdEmployee.position,
          assignedGroupIds,
          assignedGroupNames: createdEmployee.groupsAsCollectionOfficer.map(g => g.name).join(", "),
        },
        request,
      });
    });

    return NextResponse.json(createdEmployee, { status: 201 });
  } catch (error: any) {
    console.error("Error creating employee:", error);
    return NextResponse.json({ error: "Failed to create employee" }, { status: 500 });
  }
}
