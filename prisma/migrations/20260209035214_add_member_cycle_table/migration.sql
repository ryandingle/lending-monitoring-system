-- CreateTable
CREATE TABLE "member_cycles" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_cycles_memberId_idx" ON "member_cycles"("memberId");

-- AddForeignKey
ALTER TABLE "member_cycles" ADD CONSTRAINT "member_cycles_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
