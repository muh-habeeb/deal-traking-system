ALTER TABLE "FilterConfig"
ADD COLUMN IF NOT EXISTS "categoryKey" TEXT NOT NULL DEFAULT 'all';

CREATE INDEX IF NOT EXISTS "FilterConfig_categoryKey_idx" ON "FilterConfig"("categoryKey");
