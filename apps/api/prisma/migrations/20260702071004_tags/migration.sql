-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scope" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "hiddenBuiltin" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_scope_label_key" ON "Tag"("scope", "label");
