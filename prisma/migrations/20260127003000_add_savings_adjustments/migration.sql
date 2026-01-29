-- Savings adjustments ledger (withdrawals / manual edits / apply-to-balance)

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "SavingsUpdateType" AS ENUM ('INCREASE', 'WITHDRAW', 'APPLY_TO_BALANCE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "savings_adjustments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "memberId" UUID NOT NULL,
  "encodedById" UUID NOT NULL,
  "type" "SavingsUpdateType" NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "savingsBefore" NUMERIC(14,2) NOT NULL,
  "savingsAfter" NUMERIC(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "savings_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "savings_adjustments_memberId_createdAt_idx"
  ON "savings_adjustments"("memberId", "createdAt");

CREATE INDEX IF NOT EXISTS "savings_adjustments_encodedById_createdAt_idx"
  ON "savings_adjustments"("encodedById", "createdAt");

DO $$ BEGIN
  ALTER TABLE "savings_adjustments"
    ADD CONSTRAINT "savings_adjustments_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "savings_adjustments"
    ADD CONSTRAINT "savings_adjustments_encodedById_fkey"
    FOREIGN KEY ("encodedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Ensure members.savings defaults to 0.00
ALTER TABLE "members"
  ALTER COLUMN "savings" SET DEFAULT 0.00;

