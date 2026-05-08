ALTER TABLE "bookmarks"
DROP CONSTRAINT IF EXISTS "bookmarks_userArticleId_fkey";

ALTER TABLE "bookmarks"
ADD CONSTRAINT "bookmarks_userArticleId_fkey"
FOREIGN KEY ("userArticleId") REFERENCES "user_articles"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX CONCURRENTLY IF NOT EXISTS "bookmarks_userArticleId_idx"
ON "bookmarks"("userArticleId");
