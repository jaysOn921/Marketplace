import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sw from './locales/sw.json';

export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
] as const;
export type Language = (typeof LANGUAGES)[number]['code'];

const STORAGE_KEY = 'tzed.lang';

/** The saved choice, else Swahili if the browser prefers it, else English. */
function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'sw') return saved;
  } catch {
    // Storage can be blocked (private mode); fall through to the browser's languages.
  }
  const prefs = typeof navigator === 'undefined' ? [] : (navigator.languages ?? []);
  return prefs.some((l) => l.toLowerCase().startsWith('sw')) ? 'sw' : 'en';
}

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Not saved; it still applies for this visit.
  }
  void i18n.changeLanguage(lang);
}

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
});

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, sw: { translation: sw } },
  lng: import.meta.env.MODE === 'test' ? 'en' : initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
