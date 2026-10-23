import { createAuditLog, type AuditRequestContext } from "@/lib/audit";
import { formatDateYMD, getManilaToday } from "@/lib/date";
import { prisma } from "@/lib/db";
import { Prisma, ReportActionType } from "@prisma/client";

const REPORT_ACTION_ENTITY = {
  GROUP: "Group",
  MEMBER: "Member",
  OFFICER: "Employee",
} as const;

export type ReportAreaType = keyof typeof REPORT_ACTION_ENTITY;

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
    super("REPORT_ACTION_ALREADY_USED_TODAY");
    this.name = "ReportActionLockedError";
    this.lock = lock;
  }
}

function getTodayReportDate() {
  return new Date(`${formatDateYMD(getManilaToday())}T00:00:00.000+08:00`);
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

export async function getTodayReportActionStatusMap(
  items: Array<{ reportType: ReportAreaType; reportAreaId: string }>,
): Promise<ReportActionStatusMap> {
  if (items.length === 0) {
    return {};
  }

  const initial = createEmptyStatusMap(items);
  const today = getTodayReportDate();
  const rows = await prisma.reportActionLock.findMany({
    where: {
      reportDate: today,
      actionType: ReportActionType.DOWNLOAD,
      OR: items.map((item) => ({
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
  const reportDate = getTodayReportDate();
  // Reports are only distributable via the app-owned Download action.
  const actionType = ReportActionType.DOWNLOAD;

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.reportActionLock.findUnique({
        where: {
          reportDate_reportType_reportAreaId_actionType: {
            reportDate,
            reportType: input.reportType,
            reportAreaId: input.reportAreaId,
            actionType,
          },
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
          reportLabel: input.reportLabel,
          reportAreaName: input.reportAreaName,
          reportDate: formatDateYMD(reportDate),
          from: input.from ?? null,
          to: input.to ?? null,
        },
        request: input.request,
      });

      return tx.reportActionLock.create({
        data: {
          reportDate,
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
      const existing = await prisma.reportActionLock.findUnique({
        where: {
          reportDate_reportType_reportAreaId_actionType: {
            reportDate,
            reportType: input.reportType,
            reportAreaId: input.reportAreaId,
            actionType,
          },
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
