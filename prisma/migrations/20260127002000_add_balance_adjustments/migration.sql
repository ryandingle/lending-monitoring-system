-- Balance adjustments ledger (weekly collections / payments)

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "BalanceUpdateType" AS ENUM ('INCREASE', 'DEDUCT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "balance_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "memberId" UUID NOT NULL,
  "encodedById" UUID NOT NULL,
  "type" "BalanceUpdateType" NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "balanceBefore" NUMERIC(14,2) NOT NULL,
  "balanceAfter" NUMERIC(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "balance_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "balance_adjustments_memberId_createdAt_idx"
  ON "balance_adjustments"("memberId", "createdAt");

CREATE INDEX IF NOT EXISTS "balance_adjustments_encodedById_createdAt_idx"
  ON "balance_adjustments"("encodedById", "createdAt");

DO $$ BEGIN
  ALTER TABLE "balance_adjustments"
    ADD CONSTRAINT "balance_adjustments_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "balance_adjustments"
    ADD CONSTRAINT "balance_adjustments_encodedById_fkey"
    FOREIGN KEY ("encodedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

