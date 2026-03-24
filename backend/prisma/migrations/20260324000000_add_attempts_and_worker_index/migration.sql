-- AlterTable
ALTER TABLE "Payment" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Payment_status_processedAt_idx" ON "Payment"("status", "processedAt");
