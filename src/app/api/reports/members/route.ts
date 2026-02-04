import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  await requireUser();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20);
  const q = searchParams.get("q")?.trim() || "";
  const sort = searchParams.get("sort") === "desc" ? "desc" : "asc";

  // Search by first or last name
  const where = q
    ? {
        OR: [
          // @ts-ignore
          { firstName: { contains: q, mode: "insensitive" } },
          // @ts-ignore
          { lastName: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.member.findMany({
      // @ts-ignore
      where,
      orderBy: { lastName: sort },
      select: { id: true, firstName: true, lastName: true },
      skip: (page - 1) * limit,
      take: limit,
    }),
    // @ts-ignore
    prisma.member.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}
