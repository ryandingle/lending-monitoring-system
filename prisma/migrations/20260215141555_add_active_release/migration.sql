-- CreateTable
CREATE TABLE "active_releases" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "releaseDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "active_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "active_releases_memberId_releaseDate_idx" ON "active_releases"("memberId", "releaseDate");

-- AddForeignKey
ALTER TABLE "active_releases" ADD CONSTRAINT "active_releases_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;
