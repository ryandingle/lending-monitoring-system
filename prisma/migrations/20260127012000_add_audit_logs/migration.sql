-- Audit trail + user activation flag

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "AuditActorType" AS ENUM ('USER', 'SYSTEM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add isActive to users
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;

-- Audit logs table
CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "actorType" "AuditActorType" NOT NULL DEFAULT 'USER',
  "actorUserId" UUID NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NULL,
  "entityId" TEXT NULL,
  "ip" TEXT NULL,
  "userAgent" TEXT NULL,
  "referer" TEXT NULL,
  "metadata" JSONB NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"
  ON "audit_logs"("createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_actorUserId_createdAt_idx"
  ON "audit_logs"("actorUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "audit_logs_action_createdAt_idx"
  ON "audit_logs"("action", "createdAt");

DO $$ BEGIN
  ALTER TABLE "audit_logs"
    ADD CONSTRAINT "audit_logs_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

