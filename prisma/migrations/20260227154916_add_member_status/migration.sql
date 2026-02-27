-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE';
