-- AlterTable
ALTER TABLE "User" ADD COLUMN "investorHorizon" TEXT;
ALTER TABLE "User" ADD COLUMN "investorNotes" TEXT;
ALTER TABLE "User" ADD COLUMN "investorRiskTolerance" TEXT;
ALTER TABLE "User" ADD COLUMN "investorStyle" TEXT;

-- CreateTable
CREATE TABLE "AdviserDebate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "memos" JSONB NOT NULL,
    "rebuttals" JSONB NOT NULL,
    "synthesis" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdviserDebate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AdviserDebate_sessionId_idx" ON "AdviserDebate"("sessionId");
