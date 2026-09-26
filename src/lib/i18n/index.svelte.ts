// Язык интерфейса. Основной — английский; по умолчанию берётся язык браузера (системы),
// а если перевода на него нет — английский. Работает и на странице, и в service worker
import type {LanguageSetting} from '../settings/schema';
import {en, type Messages} from './en';
import {ru} from './ru';

export type {Messages} from './en';

export const LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

const DICTIONARIES: Record<Language, Messages> = {en, ru};

/** Название языка на нём самом — так его проще найти в списке */
export const LANGUAGE_NAMES: Record<Language, string> = {en: 'English', ru: 'Русский'};

/** Язык браузера, если на него есть перевод; иначе английский */
export function browserLanguage(): Language {
  const ui = globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? 'en';
  const code = ui.toLowerCase().split(/[-_]/)[0];
  return (LANGUAGES as readonly string[]).includes(code) ? code as Language : 'en';
}

export function resolveLanguage(setting: LanguageSetting): Language {
  return setting === 'auto' ? browserLanguage() : setting;
}

let language = $state<Language>(browserLanguage());

export function setLanguage(setting: LanguageSetting): void {
  language = resolveLanguage(setting);
}

export function currentLanguage(): Language {
  return language;
}

/**
 * Тексты текущего языка: t.menu.open. Чтение отслеживается Svelte —
 * при смене языка интерфейс перерисовывается без перезагрузки
 */
export const t: Messages = new Proxy({} as Messages, {
  get: (_target, key) => DICTIONARIES[language][key as keyof Messages],
});

/** Дата и время в формате текущего языка */
export function formatDateTime(time: number): string {
  return new Intl.DateTimeFormat(language, {dateStyle: 'medium', timeStyle: 'short'}).format(time);
}
