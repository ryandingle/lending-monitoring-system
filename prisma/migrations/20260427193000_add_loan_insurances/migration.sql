CREATE TABLE "loan_insurances" (
  "id" UUID NOT NULL,
  "memberId" UUID NOT NULL,
  "encodedById" UUID NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "loan_insurances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "loan_insurances_memberId_createdAt_idx"
ON "loan_insurances"("memberId", "createdAt");

CREATE INDEX "loan_insurances_encodedById_createdAt_idx"
ON "loan_insurances"("encodedById", "createdAt");

ALTER TABLE "loan_insurances"
ADD CONSTRAINT "loan_insurances_memberId_fkey"
FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "loan_insurances"
ADD CONSTRAINT "loan_insurances_encodedById_fkey"
FOREIGN KEY ("encodedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
