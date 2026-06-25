jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
}));

jest.mock('@/lib/env', () => ({
  getSiteUrl: jest.fn(() => 'https://feedcentral.example/'),
}));

import { revalidatePath } from 'next/cache';
import { getSiteUrl } from '@/lib/env';
import { refreshFeedCacheForArticles } from '@/lib/feed/cache-warmup';

const mockRevalidatePath = revalidatePath as jest.Mock;
const mockGetSiteUrl = getSiteUrl as jest.Mock;
const expectedFeedPaths = [
  '/cn/app',
  ...Array.from({ length: 9 }, (_, index) => `/cn/app/page/${index + 2}`),
];

describe('refreshFeedCacheForArticles', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    mockRevalidatePath.mockClear();
    mockGetSiteUrl.mockReturnValue('https://feedcentral.example/');
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('revalidates and prewarms cn all-feed and article pages', async () => {
    await refreshFeedCacheForArticles([
      { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
      { id: 'carticle0000000000000000002', category: { slug: 'tech' } },
    ]);

    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(expectedFeedPaths);
    expect(global.fetch).toHaveBeenCalledTimes(expectedFeedPaths.length + 2);

    for (const path of expectedFeedPaths) {
      expect(global.fetch).toHaveBeenCalledWith(
        `https://feedcentral.example${path}`,
        expect.objectContaining({
          method: 'GET',
          redirect: 'manual',
          signal: expect.any(AbortSignal),
        })
      );
    }

    expect(global.fetch).toHaveBeenCalledWith(
      'https://feedcentral.example/cn/article/carticle0000000000000000001',
      expect.objectContaining({ method: 'GET' })
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://feedcentral.example/cn/article/carticle0000000000000000002',
      expect.objectContaining({ method: 'GET' })
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://feedcentral.example/cn/app/tech',
      expect.anything()
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      'https://feedcentral.example/cn/app/tech/page/2',
      expect.anything()
    );
  });

  it('does nothing when no articles were created', async () => {
    await refreshFeedCacheForArticles([]);

    expect(mockRevalidatePath).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('limits cache prewarm requests to two at a time', async () => {
    const pending: Array<() => void> = [];
    const response = { ok: true, status: 200 };
    const expectedRequests = expectedFeedPaths.length + 2;

    (global.fetch as jest.Mock).mockImplementation(() => new Promise((resolve) => {
      pending.push(() => resolve(response));
    }));

    const task = refreshFeedCacheForArticles([
      { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
      { id: 'carticle0000000000000000002', category: { slug: 'tech' } },
    ]);

    await Promise.resolve();
    expect(global.fetch).toHaveBeenCalledTimes(2);

    const settlePendingBatch = async () => {
      const resolvers = pending.splice(0);
      resolvers.forEach((resolve) => resolve());
      await Promise.resolve();
      await Promise.resolve();
    };

    while ((global.fetch as jest.Mock).mock.calls.length < expectedRequests) {
      await settlePendingBatch();
    }

    await settlePendingBatch();
    await task;

    expect(global.fetch).toHaveBeenCalledTimes(expectedRequests);
  });

  it('ignores categories when revalidating feed pages', async () => {
    await refreshFeedCacheForArticles([
      { id: 'carticle0000000000000000001', category: { slug: '..' } },
      { id: 'carticle0000000000000000002', category: { slug: 'tech' } },
    ]);

    expect(mockRevalidatePath.mock.calls.map(([path]) => path)).toEqual(expectedFeedPaths);
  });

  it('prewarms each article page once per refresh', async () => {
    await refreshFeedCacheForArticles([
      { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
      { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(expectedFeedPaths.length + 1);
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) => url === 'https://feedcentral.example/cn/article/carticle0000000000000000001'
      )
    ).toHaveLength(1);
  });

  it('does not prewarm when the configured site URL is invalid', async () => {
    mockGetSiteUrl.mockReturnValue('javascript:alert(1)');

    await refreshFeedCacheForArticles([{ id: 'carticle0000000000000000001', category: { slug: 'tech' } }]);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      '[RSS] Failed to prepare cache prewarm:',
      expect.any(Error)
    );
  });

  it('keeps going when one prewarm request fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValue({ ok: true, status: 200 });

    await expect(
      refreshFeedCacheForArticles([
        { id: 'carticle0000000000000000001', category: { slug: 'tech' } },
        { id: 'carticle0000000000000000002', category: { slug: 'tech' } },
      ])
    ).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(expectedFeedPaths.length + 2);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://feedcentral.example/cn/article/carticle0000000000000000002',
      expect.objectContaining({ method: 'GET' })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[RSS] Failed to prewarm cache path:',
      expect.any(Error)
    );
  });
});
