import { DEFAULT_ARTICLE_IMAGE_SRC, getFeedCardImageSrc } from '@/lib/feed/feed-card-image';

describe('getFeedCardImageSrc', () => {
  it('uses the original article image when the article has an image', () => {
    expect(getFeedCardImageSrc({ imageUrl: 'https://publisher.example/image.jpg' })).toBe('https://publisher.example/image.jpg');
  });

  it('normalizes protocol-relative image URLs', () => {
    expect(getFeedCardImageSrc({ imageUrl: '//publisher.example/image.jpg' })).toBe('https://publisher.example/image.jpg');
  });

  it('uses the default article image when the article has no valid image', () => {
    expect(getFeedCardImageSrc({ imageUrl: null })).toBe(DEFAULT_ARTICLE_IMAGE_SRC);
    expect(getFeedCardImageSrc({ imageUrl: 'javascript:alert(1)' })).toBe(DEFAULT_ARTICLE_IMAGE_SRC);
  });
});
