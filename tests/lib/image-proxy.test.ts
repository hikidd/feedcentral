import { getImageProxyConfig } from '@/lib/imageProxyConfig';

describe('imageProxyConfig', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.IMAGE_PROXY_MAX_BYTES;
    delete process.env.IMAGE_PROXY_TIMEOUT_MS;
    delete process.env.IMAGE_PROXY_CACHE_MAX_AGE;
    delete process.env.IMAGE_PROXY_CACHE_SMAX;
  });

  test('default config returns sensible defaults', () => {
    const cfg = getImageProxyConfig();
    expect(cfg.maxBytes).toBeGreaterThan(0);
    expect(cfg.timeoutMs).toBeGreaterThan(0);
    expect(cfg.maxAge).toBeGreaterThan(0);
    expect(cfg.sMaxAge).toBeGreaterThan(0);
  });

  test('reads numeric proxy settings from env', () => {
    process.env.IMAGE_PROXY_MAX_BYTES = '2048';
    process.env.IMAGE_PROXY_TIMEOUT_MS = '7000';
    process.env.IMAGE_PROXY_CACHE_MAX_AGE = '120';
    process.env.IMAGE_PROXY_CACHE_SMAX = '600';

    const mod = require('@/lib/imageProxyConfig') as typeof import('@/lib/imageProxyConfig');
    const cfg = mod.getImageProxyConfig();

    expect(cfg.maxBytes).toBe(2048);
    expect(cfg.timeoutMs).toBe(7000);
    expect(cfg.maxAge).toBe(120);
    expect(cfg.sMaxAge).toBe(600);
  });
});
