-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "devCodeVerifiedAt" DATETIME,
    "creditBalance" INTEGER NOT NULL DEFAULT 0,
    "lastCrClaimAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "sid" TEXT NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "wiwonCoverId" TEXT,
    "partSection" TEXT NOT NULL DEFAULT 'Contents',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '[]',
    "tables" TEXT NOT NULL DEFAULT '[]',
    "images" TEXT NOT NULL DEFAULT '[]',
    "footnote" TEXT,
    "authorName" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "iconLarge" TEXT,
    "iconSmall" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Article_wiwonCoverId_fkey" FOREIGN KEY ("wiwonCoverId") REFERENCES "WiwonCover" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WiwonCover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "updateDateLabel" TEXT,
    "coverImageUrl" TEXT,
    "heroTitle" TEXT,
    "heroSubtitle" TEXT,
    "heroImageUrl" TEXT,
    "hasData" BOOLEAN NOT NULL DEFAULT false,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "isFeature" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "fields" TEXT NOT NULL DEFAULT '{}',
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "source" TEXT NOT NULL DEFAULT 'Homebrew',
    "isHomebrew" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "isOfficialAdded" BOOLEAN NOT NULL DEFAULT false,
    "approvedFromHomebrew" BOOLEAN NOT NULL DEFAULT false,
    "iconUrl" TEXT,
    "durabilityRemaining" INTEGER,
    "woundsRemaining" INTEGER,
    "willpowerRemaining" INTEGER,
    "scratchCurrent" INTEGER,
    "ammoCurrent" INTEGER,
    "manaUsed" INTEGER,
    "nameCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CatalogItem_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrayMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL DEFAULT 'general',
    "catalogItemId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT,
    "subject" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "readByDev" BOOLEAN NOT NULL DEFAULT false,
    "readByUser" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "creditsAwarded" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrayMessage_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PrayMessage_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrayMessage_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PrayReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prayMessageId" TEXT NOT NULL,
    "byUserId" TEXT NOT NULL,
    "isDev" BOOLEAN NOT NULL DEFAULT false,
    "isNotify" BOOLEAN NOT NULL DEFAULT false,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrayReply_prayMessageId_fkey" FOREIGN KEY ("prayMessageId") REFERENCES "PrayMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PrayReply_byUserId_fkey" FOREIGN KEY ("byUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrLedgerEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refPrayMessageId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Comment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Bookmark" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "articleId" TEXT,
    "catalogItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bookmark_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Bookmark_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Article_category_status_idx" ON "Article"("category", "status");

-- CreateIndex
CREATE INDEX "Article_wiwonCoverId_idx" ON "Article"("wiwonCoverId");

-- CreateIndex
CREATE INDEX "CatalogItem_category_isHomebrew_idx" ON "CatalogItem"("category", "isHomebrew");

-- CreateIndex
CREATE INDEX "CatalogItem_ownerUserId_idx" ON "CatalogItem"("ownerUserId");

-- CreateIndex
CREATE INDEX "PrayMessage_toUserId_idx" ON "PrayMessage"("toUserId");

-- CreateIndex
CREATE INDEX "PrayMessage_fromUserId_idx" ON "PrayMessage"("fromUserId");

-- CreateIndex
CREATE INDEX "Bookmark_userId_idx" ON "Bookmark"("userId");
