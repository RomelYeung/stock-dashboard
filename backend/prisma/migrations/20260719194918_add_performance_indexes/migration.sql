-- DropIndex
DROP INDEX "Filing_investorId_idx";

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_createdAt_idx" ON "ChatMessage"("createdAt");

-- CreateIndex
CREATE INDEX "CusipMapping_ticker_idx" ON "CusipMapping"("ticker");

-- CreateIndex
CREATE INDEX "Filing_date_idx" ON "Filing"("date");

-- CreateIndex
CREATE INDEX "Filing_periodOfReport_idx" ON "Filing"("periodOfReport");

-- CreateIndex
CREATE INDEX "Filing_investorId_periodOfReport_idx" ON "Filing"("investorId", "periodOfReport");

-- CreateIndex
CREATE INDEX "Holding_ticker_idx" ON "Holding"("ticker");

-- CreateIndex
CREATE INDEX "Holding_CUSIP_idx" ON "Holding"("CUSIP");
