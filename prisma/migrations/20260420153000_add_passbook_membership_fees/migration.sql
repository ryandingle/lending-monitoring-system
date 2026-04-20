-- Passbook fee and membership fee ledgers

CREATE TABLE IF NOT EXISTS "passbook_fees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "memberId" UUID NOT NULL,
  "encodedById" UUID NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "passbook_fees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "passbook_fees_memberId_createdAt_idx"
  ON "passbook_fees"("memberId", "createdAt");

CREATE INDEX IF NOT EXISTS "passbook_fees_encodedById_createdAt_idx"
  ON "passbook_fees"("encodedById", "createdAt");

DO $$ BEGIN
  ALTER TABLE "passbook_fees"
    ADD CONSTRAINT "passbook_fees_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "passbook_fees"
    ADD CONSTRAINT "passbook_fees_encodedById_fkey"
    FOREIGN KEY ("encodedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "membership_fees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "memberId" UUID NOT NULL,
  "encodedById" UUID NOT NULL,
  "amount" NUMERIC(14,2) NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "membership_fees_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "membership_fees_memberId_createdAt_idx"
  ON "membership_fees"("memberId", "createdAt");

CREATE INDEX IF NOT EXISTS "membership_fees_encodedById_createdAt_idx"
  ON "membership_fees"("encodedById", "createdAt");

DO $$ BEGIN
  ALTER TABLE "membership_fees"
    ADD CONSTRAINT "membership_fees_memberId_fkey"
    FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "membership_fees"
    ADD CONSTRAINT "membership_fees_encodedById_fkey"
    FOREIGN KEY ("encodedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
