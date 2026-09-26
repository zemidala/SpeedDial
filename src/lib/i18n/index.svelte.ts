// Interface language. English is the primary one; by default the browser (system) language is used,
// and English if there's no translation for it. Works both on pages and in the service worker
import type {LanguageSetting} from '../settings/schema';
import {en, type Messages} from './en';
import {ru} from './ru';

export type {Messages} from './en';

export const LANGUAGES = ['en', 'ru'] as const;
export type Language = (typeof LANGUAGES)[number];

const DICTIONARIES: Record<Language, Messages> = {en, ru};

/** Language name in the language itself — easier to find in the list */
export const LANGUAGE_NAMES: Record<Language, string> = {en: 'English', ru: 'Русский'};

/** The browser language if there's a translation for it; otherwise English */
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
 * Texts in the current language: t.menu.open. Reads are tracked by Svelte —
 * switching the language re-renders the interface without a reload
 */
export const t: Messages = new Proxy({} as Messages, {
  get: (_target, key) => DICTIONARIES[language][key as keyof Messages],
});

/** Date and time in the current language's format */
export function formatDateTime(time: number): string {
  return new Intl.DateTimeFormat(language, {dateStyle: 'medium', timeStyle: 'short'}).format(time);
}
