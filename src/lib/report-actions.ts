import { createAuditLog, type AuditRequestContext } from "@/lib/audit";
import { formatDateYMD, getManilaToday, getMonday } from "@/lib/date";
import { prisma } from "@/lib/db";
import { Prisma, ReportActionType } from "@prisma/client";

const REPORT_ACTION_ENTITY = {
  GROUP: "Group",
  MEMBER: "Member",
  OFFICER: "Employee",
} as const;

export type ReportAreaType = keyof typeof REPORT_ACTION_ENTITY;
type ReportLockScope = "day" | "week";

export type ReportActionStatus = {
  download: {
    locked: boolean;
    createdAtIso: string | null;
    actedByName: string | null;
  };
};

export type ReportActionStatusMap = Record<string, ReportActionStatus>;

export class ReportActionLockedError extends Error {
  lock: {
    actionType: ReportActionType;
    reportType: ReportAreaType;
    reportAreaId: string;
    reportAreaName: string | null;
    createdAt: Date;
    actedByName: string | null;
  };

  constructor(lock: ReportActionLockedError["lock"]) {
    super("REPORT_ACTION_ALREADY_USED_IN_PERIOD");
    this.name = "ReportActionLockedError";
    this.lock = lock;
  }
}

function getCurrentReportDayStart() {
  return new Date(`${formatDateYMD(getManilaToday())}T00:00:00.000+08:00`);
}

/**
 * Group reports remain daily, while the other reports stay weekly.
 * Locks are still per user via the unique key that includes actedByUserId.
 */
function getCurrentReportWeekStart() {
  const weekStart = getMonday(getManilaToday());
  return new Date(`${formatDateYMD(weekStart)}T00:00:00.000+08:00`);
}

function getReportLockScope(reportType: ReportAreaType): ReportLockScope {
  return reportType === "GROUP" ? "day" : "week";
}

function getReportLockDate(reportType: ReportAreaType) {
  return getReportLockScope(reportType) === "day"
    ? getCurrentReportDayStart()
    : getCurrentReportWeekStart();
}

function emptyStatus(): ReportActionStatus {
  return {
    download: { locked: false, createdAtIso: null, actedByName: null },
  };
}

function getStatusKey(reportType: ReportAreaType, reportAreaId: string) {
  return `${reportType}:${reportAreaId}`;
}

export function createEmptyStatusMap(
  items: Array<{ reportType: ReportAreaType; reportAreaId: string }>,
): ReportActionStatusMap {
  return Object.fromEntries(
    items.map((item) => [getStatusKey(item.reportType, item.reportAreaId), emptyStatus()]),
  );
}

export async function getReportActionStatusMap(
  items: Array<{ reportType: ReportAreaType; reportAreaId: string }>,
  actorUserId: string,
): Promise<ReportActionStatusMap> {
  if (items.length === 0) {
    return {};
  }

  const initial = createEmptyStatusMap(items);
  const rows = await prisma.reportActionLock.findMany({
    where: {
      actedByUserId: actorUserId,
      actionType: ReportActionType.DOWNLOAD,
      OR: items.map((item) => ({
        reportDate: getReportLockDate(item.reportType),
        reportType: item.reportType,
        reportAreaId: item.reportAreaId,
      })),
    },
    include: {
      actedBy: {
        select: { name: true },
      },
    },
  });

  for (const row of rows) {
    const key = getStatusKey(row.reportType as ReportAreaType, row.reportAreaId);
    const current = initial[key] ?? emptyStatus();

    current.download = {
      locked: true,
      createdAtIso: row.createdAt.toISOString(),
      actedByName: row.actedBy?.name ?? null,
    };

    initial[key] = current;
  }

  return initial;
}

export async function consumeReportAction(input: {
  actorUserId: string;
  actorUserName?: string | null;
  reportType: ReportAreaType;
  reportAreaId: string;
  reportAreaName: string;
  reportLabel: string;
  from?: string | null;
  to?: string | null;
  request?: AuditRequestContext;
}) {
  const reportLockScope = getReportLockScope(input.reportType);
  const reportLockDate = getReportLockDate(input.reportType);
  // Reports are only distributable via the app-owned Download action.
  const actionType = ReportActionType.DOWNLOAD;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.reportActionLock.findFirst({
        where: {
          reportDate: reportLockDate,
          reportType: input.reportType,
          reportAreaId: input.reportAreaId,
          actionType,
          actedByUserId: input.actorUserId,
        },
        include: {
          actedBy: {
            select: { name: true },
          },
        },
      });

      if (existing) {
        throw new ReportActionLockedError({
          actionType: existing.actionType,
          reportType: existing.reportType as ReportAreaType,
          reportAreaId: existing.reportAreaId,
          reportAreaName: existing.reportAreaName ?? null,
          createdAt: existing.createdAt,
          actedByName: existing.actedBy?.name ?? null,
        });
      }

      const auditLog = await createAuditLog(tx, {
        actorUserId: input.actorUserId,
        action: "REPORT_DOWNLOAD",
        entityType: REPORT_ACTION_ENTITY[input.reportType],
        entityId: input.reportAreaId,
        entityValue: input.reportAreaName,
        metadata: {
          actionType,
          reportType: input.reportType,
          reportLockScope,
          reportLabel: input.reportLabel,
          reportAreaName: input.reportAreaName,
          reportLockDate: formatDateYMD(reportLockDate),
          from: input.from ?? null,
          to: input.to ?? null,
        },
        request: input.request,
      });

      return tx.reportActionLock.create({
        data: {
          reportDate: reportLockDate,
          reportType: input.reportType,
          reportAreaId: input.reportAreaId,
          reportAreaName: input.reportAreaName,
          actionType,
          actedByUserId: input.actorUserId,
          auditLogId: auditLog.id,
        },
      });
    });
  } catch (error) {
    if (error instanceof ReportActionLockedError) {
      throw error;
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.reportActionLock.findFirst({
        where: {
          reportDate: reportLockDate,
          reportType: input.reportType,
          reportAreaId: input.reportAreaId,
          actionType,
          actedByUserId: input.actorUserId,
        },
        include: {
          actedBy: {
            select: { name: true },
          },
        },
      });

      if (existing) {
        throw new ReportActionLockedError({
          actionType: existing.actionType,
          reportType: existing.reportType as ReportAreaType,
          reportAreaId: existing.reportAreaId,
          reportAreaName: existing.reportAreaName ?? null,
          createdAt: existing.createdAt,
          actedByName: existing.actedBy?.name ?? null,
        });
      }
    }

    throw error;
  }
}
