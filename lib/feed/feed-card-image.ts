import { normalizeHttpUrl } from '@/lib/safe-url';

export const DEFAULT_ARTICLE_IMAGE_SRC = '/nophoto.png';

export function getFeedCardImageSrc(article: { imageUrl?: string | null }): string {
  return normalizeHttpUrl(article.imageUrl) ?? DEFAULT_ARTICLE_IMAGE_SRC;
}
