export function getIntlLocale(locale: string) {
  switch (locale) {
    case 'fr':
      return 'fr-FR';
    case 'cn':
      return 'zh-CN';
    case 'en':
    default:
      return 'en-US';
  }
}
