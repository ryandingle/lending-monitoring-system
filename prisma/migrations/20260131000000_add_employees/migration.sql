-- CreateEnum
CREATE TYPE "EmployeePosition" AS ENUM ('COLLECTION_OFFICER', 'OFFICE_CLERK', 'UNIT_MANAGER', 'OPERATIONS_MANAGER');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" "EmployeePosition" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_createdAt_idx" ON "employees"("createdAt");
