-- AlterTable
ALTER TABLE "member_cycles" ADD COLUMN     "endDate" DATE,
ALTER COLUMN "startDate" DROP NOT NULL;
