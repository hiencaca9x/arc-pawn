import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import vi from './locales/vi.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ko from './locales/ko.json';
import ja from './locales/ja.json';

i18n.use(initReactI18next).init({
  resources: {
    vi: { translation: vi },
    en: { translation: en },
    zh: { translation: zh },
    ko: { translation: ko },
    ja: { translation: ja }
  },
  lng: navigator.language.split('-')[0] || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
});

export default i18n;
