-- Add COLLECTOR role to the Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'COLLECTOR';

-- Attach users to employees so collector accounts can inherit group access
ALTER TABLE "users"
ADD COLUMN "employeeId" UUID;

ALTER TABLE "users"
ADD CONSTRAINT "users_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "employees"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");
CREATE INDEX "users_employeeId_idx" ON "users"("employeeId");
