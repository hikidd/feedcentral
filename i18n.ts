import { getRequestConfig } from 'next-intl/server';
import { defaultLocale, locales, type Locale } from './i18n-config';

export { defaultLocale, locales } from './i18n-config';
export type { Locale } from './i18n-config';

export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});

