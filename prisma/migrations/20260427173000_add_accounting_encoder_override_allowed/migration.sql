ALTER TABLE "accounting_days"
ADD COLUMN "encoderOverrideAllowed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "accounting_days"
SET "encoderOverrideAllowed" = true
WHERE COALESCE(("receipts" ->> '__encoderOverrideAllowed')::boolean, false) = true;
