import { DEFAULT_ARTICLE_IMAGE_SRC, getFeedCardImageSrc } from '@/lib/feed/feed-card-image';

describe('getFeedCardImageSrc', () => {
  it('uses the article image proxy when the article has an image', () => {
    expect(getFeedCardImageSrc({ id: 'article/1', imageUrl: 'https://publisher.example/image.jpg' })).toBe('/api/image-proxy/article%2F1');
  });

  it('uses the default article image when the article has no image', () => {
    expect(getFeedCardImageSrc({ id: 'article-1', imageUrl: null })).toBe(DEFAULT_ARTICLE_IMAGE_SRC);
  });
});
