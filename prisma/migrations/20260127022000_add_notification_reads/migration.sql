-- Add per-notification read tracking for super-admin notifications.

CREATE TABLE IF NOT EXISTS "notification_reads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "auditLogId" UUID NOT NULL,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "notification_reads_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "notification_reads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "notification_reads_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "audit_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "notification_reads_userId_auditLogId_key"
ON "notification_reads"("userId", "auditLogId");

CREATE INDEX IF NOT EXISTS "notification_reads_userId_readAt_idx"
ON "notification_reads"("userId", "readAt");

CREATE INDEX IF NOT EXISTS "notification_reads_auditLogId_readAt_idx"
ON "notification_reads"("auditLogId", "readAt");

