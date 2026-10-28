-- DropIndex
DROP INDEX "report_action_locks_reportDate_reportType_reportAreaId_actio_ke";

-- CreateIndex
CREATE UNIQUE INDEX "report_action_locks_reportDate_reportType_reportAreaId_acti_key" ON "report_action_locks"("reportDate", "reportType", "reportAreaId", "actionType", "actedByUserId");
