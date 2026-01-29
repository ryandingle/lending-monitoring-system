-- Savings accrual ledger (traceable daily +20.00 entries)

CREATE TABLE IF NOT EXISTS "savings_accruals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "memberId" UUID NOT NULL,
  "accruedForDate" DATE NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "savings_accruals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "savings_accruals_memberId_accruedForDate_key"
  ON "savings_accruals"("memberId", "accruedForDate");

CREATE INDEX IF NOT EXISTS "savings_accruals_memberId_accruedForDate_idx"
  ON "savings_accruals"("memberId", "accruedForDate");

DO $$ BEGIN
  ALTER TABLE "savings_accruals"
    ADD CONSTRAINT "savings_accruals_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Default savings should start at 0.00 for new members
ALTER TABLE "members"
  ALTER COLUMN "savings" SET DEFAULT 0.00;

