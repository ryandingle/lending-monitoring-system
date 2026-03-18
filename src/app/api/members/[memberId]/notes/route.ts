import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { MemberNote } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
    await requireUser();
    const { memberId } = await params;
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") || "1");
    const limit = Number(searchParams.get("limit") || "10");

    if (!memberId) {
        return NextResponse.json({ error: "Member ID is required" }, { status: 400 });
    }

    try {
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
