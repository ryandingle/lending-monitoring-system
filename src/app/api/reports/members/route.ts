import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getReportActionStatusMap } from "@/lib/report-actions";

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") ?? "20") || 20);
  const q = searchParams.get("q")?.trim() || "";
  const sort = searchParams.get("sort") === "desc" ? "desc" : "asc";

  const where = {
    status: "ACTIVE",
    ...(q
      ? {
          OR: [
            // @ts-ignore
            { firstName: { contains: q, mode: "insensitive" } },
            // @ts-ignore
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.member.findMany({
      // @ts-ignore
      where,
      orderBy: [{ lastName: sort }, { firstName: sort }],
      select: { id: true, firstName: true, lastName: true },
      skip: (page - 1) * limit,
      take: limit,
    }),
    // @ts-ignore
    prisma.member.count({ where }),
  ]);

  const reportActions = await getReportActionStatusMap(
    items.map((member) => ({ reportType: "MEMBER", reportAreaId: member.id })),
    user.id,
  );

  return NextResponse.json({
    items: items.map((member) => ({
      ...member,
      reportActions: reportActions[`MEMBER:${member.id}`],
    })),
    total,
    pages: Math.ceil(total / limit),
    page,
  });
}
