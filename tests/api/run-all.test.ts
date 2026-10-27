import { NextRequest } from 'next/server';

const mockFetchAllActiveSources = jest.fn();
const mockFetchEnabledUserSources = jest.fn();
const mockCleanupArticles = jest.fn();

jest.mock('@/lib/rss-parser', () => ({
  fetchAllActiveSources: (...args: unknown[]) => mockFetchAllActiveSources(...args),
}));

jest.mock('@/lib/cron/fetch-user-sources', () => ({
  fetchEnabledUserSources: (...args: unknown[]) => mockFetchEnabledUserSources(...args),
}));

jest.mock('@/lib/cron/cleanup-articles', () => ({
  cleanupArticles: (...args: unknown[]) => mockCleanupArticles(...args),
}));

jest.mock('@/lib/env', () => ({
  getCronApiKey: () => 'test-cron-key',
}));

let GET: typeof import('@/app/api/cron/run-all/route').GET;

const cleanupSummary = {
  success: true as const,
  timestamp: '2026-05-11T00:00:00.000Z',
  duration: '10ms',
  cleanup: {
    softDeleted: 1,
    archived: 1,
    hardDeleted: 1,
    userSoftDeleted: 1,
    userArchivedMarked: 1,
    userBookmarksDeleted: 1,
    userHardDeleted: 1,
    total: 7,
  },
  cutoffDates: {
    softDelete: '2026-05-04T00:00:00.000Z',
    hardDelete: '2026-04-27T00:00:00.000Z',
  },
};

describe('GET /api/cron/run-all', () => {
  beforeAll(async () => {
    ({ GET } = await import('@/app/api/cron/run-all/route'));
  });

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-12T00:00:00.000Z'));
    jest.clearAllMocks();
    delete process.env.CRON_SECRET;

    mockFetchAllActiveSources.mockResolvedValue([
      {
        source: 'Global source',
        status: 'fulfilled',
        data: { found: 3, added: 2 },
      },
    ]);
    mockFetchEnabledUserSources.mockResolvedValue({
      sourceCount: 1,
      results: [
        {
          source: 'Personal source',
          userId: 'admin-user',
          status: 'fulfilled',
          data: { found: 2, added: 1 },
        },
      ],
    });
    mockCleanupArticles.mockResolvedValue(cleanupSummary);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rejects requests without a cron credential', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/run-all');

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.success).toBe(false);
    expect(mockFetchAllActiveSources).not.toHaveBeenCalled();
    expect(mockCleanupArticles).not.toHaveBeenCalled();
  });

  it('fetches global and user sources without cleanup outside the weekly window', async () => {
    const request = new NextRequest('http://localhost:3000/api/cron/run-all', {
      headers: { authorization: 'Bearer test-cron-key' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.global.articlesAdded).toBe(2);
    expect(data.user.articlesAdded).toBe(1);
    expect(data.cleanup.ran).toBe(false);
    expect(mockFetchAllActiveSources).toHaveBeenCalledWith({ concurrency: 5 });
    expect(mockFetchEnabledUserSources).toHaveBeenCalledWith({ concurrency: 5 });
    expect(mockCleanupArticles).not.toHaveBeenCalled();
  });

  it('runs cleanup on the first Monday UTC invocation', async () => {
    jest.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
    const request = new NextRequest('http://localhost:3000/api/cron/run-all', {
      headers: { authorization: 'Bearer test-cron-key' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cleanup.ran).toBe(true);
    expect(data.cleanup.due).toBe(true);
    expect(mockCleanupArticles).toHaveBeenCalledWith(expect.any(Date));
  });

  it('supports forcing cleanup for an authenticated manual run', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/cron/run-all?forceCleanup=true',
      { headers: { authorization: 'Bearer test-cron-key' } }
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cleanup.ran).toBe(true);
    expect(data.cleanup.forced).toBe(true);
    expect(mockCleanupArticles).toHaveBeenCalledTimes(1);
  });

  it('continues with later stages and reports unexpected stage failures', async () => {
    mockFetchAllActiveSources.mockRejectedValue(new Error('database unavailable'));
    const request = new NextRequest('http://localhost:3000/api/cron/run-all', {
      headers: { authorization: 'Bearer test-cron-key' },
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.errors).toContain('global: database unavailable');
    expect(mockFetchEnabledUserSources).toHaveBeenCalledTimes(1);
  });
});
