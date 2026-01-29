-- Add per-user "notifications seen" timestamp for audit-driven notifications.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "notificationsLastSeenAt" TIMESTAMPTZ;

