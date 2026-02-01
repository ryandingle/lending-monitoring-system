-- AlterTable: add optional collection officer to groups (nullable for existing data).
ALTER TABLE "groups" ADD COLUMN "collectionOfficerId" UUID;

-- CreateIndex
CREATE INDEX "groups_collectionOfficerId_idx" ON "groups"("collectionOfficerId");

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_collectionOfficerId_fkey"
  FOREIGN KEY ("collectionOfficerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
