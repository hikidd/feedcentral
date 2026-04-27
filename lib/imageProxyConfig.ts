export type ImageProxyConfig = {
  maxBytes: number;
  timeoutMs: number;
  maxAge: number;
  sMaxAge: number;
};

export function getImageProxyConfig(): ImageProxyConfig {
  const maxBytes = Number(process.env.IMAGE_PROXY_MAX_BYTES || 1024 * 1024); // 1MB default
  const timeoutMs = Number(process.env.IMAGE_PROXY_TIMEOUT_MS || 5000); // 5s default
  const maxAge = Number(process.env.IMAGE_PROXY_CACHE_MAX_AGE || 60); // seconds
  const sMaxAge = Number(process.env.IMAGE_PROXY_CACHE_SMAX || 300);

  return {
    maxBytes,
    timeoutMs,
    maxAge,
    sMaxAge,
  };
}

export default getImageProxyConfig;
