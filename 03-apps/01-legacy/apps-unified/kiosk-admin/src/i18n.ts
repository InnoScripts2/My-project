import { createI18n } from 'vue-i18n';

const messages = {
  en: {
    appTitle: 'Kiosk Management System',
    menu: { dashboard: 'Dashboard', kiosks: 'Kiosks', sessions: 'Sessions', alerts: 'Alerts' },
    logout: 'Logout',
    user: 'User'
  },
  ru: {
    appTitle: 'Система управления киосками',
    menu: { dashboard: 'Панель', kiosks: 'Киоски', sessions: 'Сессии', alerts: 'Оповещения' },
    logout: 'Выйти',
    user: 'Клиент'
  }
};

export const i18n = createI18n({
  legacy: false,
  locale: 'ru',
  fallbackLocale: 'en',
  messages
});
