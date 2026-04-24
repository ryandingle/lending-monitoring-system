CREATE TABLE "accounting_days" (
    "id" UUID NOT NULL,
    "accountingDate" DATE NOT NULL,
    "receipts" JSONB NOT NULL,
    "payments" JSONB NOT NULL,
    "dailyExpenses" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounting_days_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_days_accountingDate_key" ON "accounting_days"("accountingDate");
CREATE INDEX "accounting_days_createdById_createdAt_idx" ON "accounting_days"("createdById", "createdAt");
CREATE INDEX "accounting_days_updatedById_updatedAt_idx" ON "accounting_days"("updatedById", "updatedAt");

ALTER TABLE "accounting_days"
ADD CONSTRAINT "accounting_days_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "accounting_days"
ADD CONSTRAINT "accounting_days_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
