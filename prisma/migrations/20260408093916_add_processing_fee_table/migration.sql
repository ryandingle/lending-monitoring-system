-- CreateTable
CREATE TABLE "processing_fees" (
    "id" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "encodedById" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "processing_fees_memberId_createdAt_idx" ON "processing_fees"("memberId", "createdAt");

-- CreateIndex
CREATE INDEX "processing_fees_encodedById_createdAt_idx" ON "processing_fees"("encodedById", "createdAt");

-- AddForeignKey
ALTER TABLE "processing_fees" ADD CONSTRAINT "processing_fees_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_fees" ADD CONSTRAINT "processing_fees_encodedById_fkey" FOREIGN KEY ("encodedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
