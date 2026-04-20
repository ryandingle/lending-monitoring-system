import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  collectionOfficerId: z.string().uuid().optional().nullable(),
});

export async function GET(req: NextRequest) {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20);
  const q = searchParams.get("q")?.trim() || "";
  const groupId = searchParams.get("groupId")?.trim() || "";
  const officerId = searchParams.get("officerId")?.trim() || "";

  const where: any = {};
  if (groupId && /^[0-9a-fA-F-]{36}$/.test(groupId)) {
    where.id = groupId;
  }
  if (officerId) {
    if (officerId === "unassigned") {
      where.collectionOfficerId = null;
    } else if (/^[0-9a-fA-F-]{36}$/.test(officerId)) {
      where.collectionOfficerId = officerId;
    }
  }
  if (q) {
    where.OR = [
      // @ts-ignore
      { name: { contains: q, mode: "insensitive" } },
      // @ts-ignore
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: {
            members: {
              where: { status: "ACTIVE" },
            },
          },
        },
        collectionOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.group.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  try {
    const body = await req.json();
    const parsed = CreateGroupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const request = await tryGetAuditRequestContext();
    let group;

    await prisma.$transaction(async (tx) => {
      group = await tx.group.create({
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          collectionOfficerId: parsed.data.collectionOfficerId ?? null,
          createdById: user.id,
        },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "GROUP_CREATE",
        entityType: "Group",
        entityId: group.id,
        metadata: {
          name: group.name,
          description: group.description ?? null,
          collectionOfficerId: group.collectionOfficerId ?? null,
        },
        request,
      });
    });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("Error creating group:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
