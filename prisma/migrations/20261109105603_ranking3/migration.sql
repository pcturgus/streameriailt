-- AlterTable
ALTER TABLE "Ranking" ADD COLUMN     "isNew" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partAudience" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "partConsistency" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "prevAvgViewers" INTEGER,
ADD COLUMN     "prevRank" INTEGER,
ALTER COLUMN "growthPct" DROP NOT NULL,
ALTER COLUMN "growthPct" DROP DEFAULT;

-- CreateTable
CREATE TABLE "RankingHistory" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channelId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,

    CONSTRAINT "RankingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RankingHistory_date_idx" ON "RankingHistory"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RankingHistory_date_channelId_key" ON "RankingHistory"("date", "channelId");
