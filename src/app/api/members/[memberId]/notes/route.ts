import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCollectorScopedGroupIds } from "@/lib/auth/access";
import { requireRole, requireUser } from "@/lib/auth/session";
import { MemberNote, Role } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
    const user = await requireUser();
    requireRole(user, ["SUPER_ADMIN", "ENCODER", "VIEWER", "COLLECTOR"] as Role[]);
    const { memberId } = await params;
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");
    const collectorGroupIds = await getCollectorScopedGroupIds(user);

    if (!memberId) {
        return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    try {
        if (collectorGroupIds) {
            const member = await prisma.member.findUnique({
                where: { id: memberId },
                select: { groupId: true },
            });
            if (!member?.groupId || !collectorGroupIds.includes(member.groupId)) {
                return NextResponse.json({ error: "Member not found" }, { status: 404 });
            }
        }

        const [notes, memberWithCount] = await Promise.all([
            (prisma as any).member.findUnique({
                where: { id: memberId },
            }).notes({
                orderBy: { createdAt: "desc" },
                skip: (page - 1) * limit,
                take: limit,
            }),
            (prisma as any).member.findUnique({
                where: { id: memberId },
                select: {
                    _count: {
                        select: { notes: true }
                    }
                }
            })
        ]);

        const total = memberWithCount?._count?.notes ?? 0;

        const serializedNotes = (notes as MemberNote[]).map((note: MemberNote) => ({
            ...note,
            createdAt: note.createdAt.toISOString(),
        }));

        return NextResponse.json({
            items: serializedNotes,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error("Error fetching member notes:", error);
        return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
    }
}
