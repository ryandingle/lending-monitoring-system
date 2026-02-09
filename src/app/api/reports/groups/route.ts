import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20);
  const q = searchParams.get("q")?.trim() || "";

  // @ts-ignore - prisma types might complain about mode if not enabled, but it usually is for postgres
  const where = q ? { name: { contains: q, mode: "insensitive" } } : {};

  const [items, total] = await Promise.all([
    prisma.group.findMany({
      // @ts-ignore
      where,
      orderBy: { name: "asc" },
      select: { 
        id: true, 
        name: true,
        _count: {
          select: { members: true }
        }
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
    // @ts-ignore
    prisma.group.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}
