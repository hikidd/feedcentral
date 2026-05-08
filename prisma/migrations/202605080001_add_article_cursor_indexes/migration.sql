CREATE INDEX CONCURRENTLY IF NOT EXISTS "articles_deletedAt_publishedAt_id_idx"
ON "articles"("deletedAt", "publishedAt" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "articles_categoryId_deletedAt_publishedAt_id_idx"
ON "articles"("categoryId", "deletedAt", "publishedAt" DESC, "id" DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS "articles_sourceId_deletedAt_publishedAt_id_idx"
ON "articles"("sourceId", "deletedAt", "publishedAt" DESC, "id" DESC);

DROP INDEX CONCURRENTLY IF EXISTS "articles_deletedAt_publishedAt_idx";
DROP INDEX CONCURRENTLY IF EXISTS "articles_categoryId_deletedAt_publishedAt_idx";
DROP INDEX CONCURRENTLY IF EXISTS "articles_sourceId_deletedAt_publishedAt_idx";
