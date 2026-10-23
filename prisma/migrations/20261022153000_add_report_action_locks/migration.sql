-- CreateEnum
CREATE TYPE "ReportActionType" AS ENUM ('DOWNLOAD', 'PRINT');

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN "entityValue" TEXT;

-- CreateTable
CREATE TABLE "report_action_locks" (
    "id" UUID NOT NULL,
    "reportDate" DATE NOT NULL,
    "reportType" TEXT NOT NULL,
    "reportAreaId" TEXT NOT NULL,
    "reportAreaName" TEXT,
    "actionType" "ReportActionType" NOT NULL,
    "actedByUserId" UUID NOT NULL,
    "auditLogId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_action_locks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "report_action_locks_reportDate_reportType_reportAreaId_actio_key"
ON "report_action_locks"("reportDate", "reportType", "reportAreaId", "actionType");

-- CreateIndex
CREATE UNIQUE INDEX "report_action_locks_auditLogId_key" ON "report_action_locks"("auditLogId");

-- CreateIndex
CREATE INDEX "report_action_locks_reportType_reportAreaId_reportDate_idx"
ON "report_action_locks"("reportType", "reportAreaId", "reportDate");

-- CreateIndex
CREATE INDEX "report_action_locks_actedByUserId_createdAt_idx"
ON "report_action_locks"("actedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "report_action_locks"
ADD CONSTRAINT "report_action_locks_actedByUserId_fkey"
FOREIGN KEY ("actedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_action_locks"
ADD CONSTRAINT "report_action_locks_auditLogId_fkey"
FOREIGN KEY ("auditLogId") REFERENCES "audit_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
