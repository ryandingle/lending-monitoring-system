-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "auth_sessions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "balance_adjustments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "groups" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "members" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "notification_reads" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "savings_accruals" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "savings_adjustments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- RenameForeignKey
ALTER TABLE "auth_sessions" RENAME CONSTRAINT "auth_sessions_user_id_fkey" TO "auth_sessions_userId_fkey";

-- RenameForeignKey
ALTER TABLE "groups" RENAME CONSTRAINT "groups_created_by_id_fkey" TO "groups_createdById_fkey";

-- RenameForeignKey
ALTER TABLE "members" RENAME CONSTRAINT "members_group_id_fkey" TO "members_groupId_fkey";
