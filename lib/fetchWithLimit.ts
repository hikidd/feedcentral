import http from 'http';
import https from 'https';
import { createPublicHostnameLookup, ensureUrlAllowed } from '@/lib/rss-fetch';

type FetchOpts = {
  timeoutMs?: number;
  maxBytes?: number;
  redirect?: RequestRedirect;
};

export async function fetchWithLimit(
  url: string,
  opts: FetchOpts = {}
): Promise<{
  ok: boolean;
  status?: number;
  headers?: Headers;
  buffer?: ArrayBuffer;
  error?: 'timeout' | 'too-large' | 'unsupported-type' | 'redirect' | string;
}> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const maxBytes = opts.maxBytes ?? 1024 * 1024;

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'unsupported-protocol' };
    }

    await ensureUrlAllowed(parsed.toString());

    return await fetchWithHttpClient(parsed, {
      timeoutMs,
      maxBytes,
      redirect: opts.redirect ?? 'manual',
    });
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchWithHttpClient(
  url: URL,
  opts: Required<FetchOpts>
): ReturnType<typeof fetchWithLimit> {
  return new Promise((resolve) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.request(
      url,
      {
        method: 'GET',
        timeout: opts.timeoutMs,
        lookup: createPublicHostnameLookup(),
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = new Headers();

        for (const [key, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            headers.set(key, value.join(', '));
          } else if (value != null) {
            headers.set(key, String(value));
          }
        }

        if (status >= 300 && status < 400) {
          response.resume();
          resolve({ ok: false, status, error: 'redirect' });
          return;
        }

        if (status < 200 || status >= 300) {
          response.resume();
          resolve({ ok: false, status, error: 'bad-status' });
          return;
        }

        const contentType = headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
          response.resume();
          resolve({ ok: false, status, error: 'unsupported-type' });
          return;
        }

        const lengthHeader = headers.get('content-length');
        if (lengthHeader) {
          const length = Number(lengthHeader);
          if (!Number.isNaN(length) && length > opts.maxBytes) {
            response.resume();
            resolve({ ok: false, status, error: 'too-large' });
            return;
          }
        }

        const chunks: Buffer[] = [];
        let receivedBytes = 0;
        let resolved = false;

        response.on('data', (chunk) => {
          if (resolved) {
            return;
          }

          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          receivedBytes += buffer.length;

          if (receivedBytes > opts.maxBytes) {
            resolved = true;
            response.destroy();
            resolve({ ok: false, status, error: 'too-large' });
            return;
          }

          chunks.push(buffer);
        });
        response.on('end', () => {
          if (resolved) {
            return;
          }

          const buffer = Buffer.concat(chunks);
          resolve({
            ok: true,
            status,
            headers,
            buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
          });
        });
        response.on('error', (error) => {
          if (!resolved) {
            resolved = true;
            resolve({ ok: false, status, error: String(error) });
          }
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('timeout'));
    });
    request.on('error', (error) => {
      resolve({ ok: false, error: error.message === 'timeout' ? 'timeout' : String(error) });
    });
    request.end();
  });
}

export default fetchWithLimit;
