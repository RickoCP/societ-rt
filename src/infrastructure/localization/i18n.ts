/**
 * i18next Configuration — Sets up internationalization with Indonesian (id)
 * and English (en) translations.
 *
 * Usage in components:
 *   import { useTranslation } from 'react-i18next';
 *   const { t } = useTranslation();
 *   t('error.AUTH_INVALID_CREDENTIALS')
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import idTranslation from '@locales/id/translation.json';
import enTranslation from '@locales/en/translation.json';

const resources = {
  id: { translation: idTranslation },
  en: { translation: enTranslation },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: 'id',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
