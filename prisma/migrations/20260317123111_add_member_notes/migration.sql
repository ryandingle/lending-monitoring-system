-- CreateTable
CREATE TABLE "member_notes" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_notes_memberId_createdAt_idx" ON "member_notes"("memberId", "createdAt");

-- AddForeignKey
ALTER TABLE "member_notes" ADD CONSTRAINT "member_notes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
