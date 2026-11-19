import { en, type TranslationKey } from './en';

const dictionaries: Record<string, Record<TranslationKey, string>> = {
  en
};

let activeLocale = 'en';

export function setLocale(locale: string): void {
  activeLocale = dictionaries[locale] ? locale : 'en';
}

export function t(key: TranslationKey): string {
  const dict = dictionaries[activeLocale] ?? en;
  return dict[key] ?? en[key] ?? key;
}
