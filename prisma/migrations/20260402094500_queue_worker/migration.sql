-- Add queue-aware fields to filters
ALTER TABLE "FilterConfig"
ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN "lastSeenCreatedAt" TIMESTAMP(3);

-- Create queue jobs table
CREATE TABLE "ScrapeJob" (
    "id" TEXT NOT NULL,
    "filterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "workerId" TEXT,
    "lastError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrapeJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScrapeJob_filterId_key" ON "ScrapeJob"("filterId");
CREATE INDEX "FilterConfig_priority_idx" ON "FilterConfig"("priority");
CREATE INDEX "ScrapeJob_status_nextRunAt_idx" ON "ScrapeJob"("status", "nextRunAt");
CREATE INDEX "ScrapeJob_priority_nextRunAt_idx" ON "ScrapeJob"("priority", "nextRunAt");
CREATE INDEX "ScrapeJob_updatedAt_idx" ON "ScrapeJob"("updatedAt");

ALTER TABLE "ScrapeJob"
ADD CONSTRAINT "ScrapeJob_filterId_fkey"
FOREIGN KEY ("filterId") REFERENCES "FilterConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
