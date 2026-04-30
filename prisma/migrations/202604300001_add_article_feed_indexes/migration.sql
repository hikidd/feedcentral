CREATE INDEX "articles_deletedAt_publishedAt_idx"
ON "articles"("deletedAt", "publishedAt" DESC);

CREATE INDEX "articles_categoryId_deletedAt_publishedAt_idx"
ON "articles"("categoryId", "deletedAt", "publishedAt" DESC);

CREATE INDEX "articles_sourceId_deletedAt_publishedAt_idx"
ON "articles"("sourceId", "deletedAt", "publishedAt" DESC);
