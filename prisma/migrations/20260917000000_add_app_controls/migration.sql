CREATE TABLE IF NOT EXISTS "app_controls" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "value" TEXT,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "expiresAt" TIMESTAMPTZ,
  "updatedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "app_controls_key_key" ON "app_controls"("key");
CREATE INDEX IF NOT EXISTS "app_controls_key_idx" ON "app_controls"("key");
CREATE INDEX IF NOT EXISTS "app_controls_expiresAt_idx" ON "app_controls"("expiresAt");

ALTER TABLE "app_controls" ADD CONSTRAINT "app_controls_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
