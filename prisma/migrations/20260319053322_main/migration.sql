-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilterConfig" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "minPrice" INTEGER,
    "maxPrice" INTEGER,
    "location" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "FilterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" INTEGER,
    "location" TEXT,
    "url" TEXT NOT NULL,
    "image" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE INDEX "FilterConfig_keyword_idx" ON "FilterConfig"("keyword");

-- CreateIndex
CREATE INDEX "FilterConfig_location_idx" ON "FilterConfig"("location");

-- CreateIndex
CREATE INDEX "FilterConfig_createdAt_idx" ON "FilterConfig"("createdAt");

-- CreateIndex
CREATE INDEX "FilterConfig_userId_idx" ON "FilterConfig"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_url_key" ON "Listing"("url");

-- CreateIndex
CREATE INDEX "Listing_createdAt_idx" ON "Listing"("createdAt");

-- CreateIndex
CREATE INDEX "Listing_price_idx" ON "Listing"("price");

-- CreateIndex
CREATE INDEX "Listing_externalId_idx" ON "Listing"("externalId");

-- CreateIndex
CREATE INDEX "NotificationLog_listingId_idx" ON "NotificationLog"("listingId");

-- CreateIndex
CREATE INDEX "NotificationLog_sentAt_idx" ON "NotificationLog"("sentAt");

-- AddForeignKey
ALTER TABLE "FilterConfig" ADD CONSTRAINT "FilterConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationLog" ADD CONSTRAINT "NotificationLog_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
