export const locales = ['en', 'fr', 'cn'] as const;
export const defaultLocale = 'cn' as const;

export type Locale = (typeof locales)[number];
