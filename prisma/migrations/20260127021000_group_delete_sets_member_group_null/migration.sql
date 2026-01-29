-- When a Group is deleted, members remain and become "unassigned".

-- Make groupId nullable.
ALTER TABLE "members"
  ALTER COLUMN "groupId" DROP NOT NULL;

-- Recreate FK with ON DELETE SET NULL.
DO $$ BEGIN
  ALTER TABLE "members" DROP CONSTRAINT IF EXISTS "members_group_id_fkey";
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "members"
    ADD CONSTRAINT "members_group_id_fkey"
    FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

