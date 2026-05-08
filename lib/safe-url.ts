const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

export function normalizeHttpUrl(value: unknown, baseUrl?: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();

  if (!normalized) {
    return null;
  }

  const hasExplicitScheme = URL_SCHEME_PATTERN.test(normalized);
  const isProtocolRelative = normalized.startsWith('//');

  try {
    const resolved = hasExplicitScheme
      ? new URL(normalized)
      : isProtocolRelative
        ? new URL(`https:${normalized}`)
        : baseUrl
          ? new URL(normalized, baseUrl)
          : null;

    if (!resolved || (resolved.protocol !== 'http:' && resolved.protocol !== 'https:')) {
      return null;
    }

    return resolved.toString();
  } catch (error) {
    return null;
  }
}
