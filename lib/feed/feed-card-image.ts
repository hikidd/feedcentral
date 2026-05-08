export const DEFAULT_ARTICLE_IMAGE_SRC = '/nophoto.png';

export function getFeedCardImageSrc(article: { id: string; imageUrl?: string | null }): string {
  return article.imageUrl ? `/api/image-proxy/${encodeURIComponent(article.id)}` : DEFAULT_ARTICLE_IMAGE_SRC;
}
