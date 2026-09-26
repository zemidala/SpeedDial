import {afterEach, describe, expect, it, vi} from 'vitest';
import {en} from './en';
import {browserLanguage, formatDateTime, resolveLanguage, setLanguage, t} from './index.svelte';
import {ru} from './ru';

/** Dictionary structure: keys and value types (text, function, list) — without the texts themselves */
function shape(value: unknown): unknown {
  if (typeof value === 'function') return `function/${value.length}`;
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]));
  }
  return typeof value;
}

/** All texts of a dictionary: strings and function results with test arguments */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') return [String(value(...Array.from({length: value.length}, () => 3)))];
  if (Array.isArray(value)) return value.flatMap((item) => (typeof item === 'string' ? [item] : texts(item.title)));
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(texts);
  return [];
}

afterEach(() => {
  vi.unstubAllGlobals();
  setLanguage('ru');
});

describe('dictionaries', () => {
  it('the Russian translation has the same keys and parameters as English', () => {
    expect(shape(ru)).toEqual(shape(en));
  });

  it('the English dictionary has no Cyrillic, the Russian one no empty strings', () => {
    expect(texts(en).filter((text) => /[а-яё]/i.test(text))).toEqual([]);
    expect(texts(ru).filter((text) => !text.trim())).toEqual([]);
  });

  it('Russian plural forms', () => {
    expect(ru.backup.added(1)).toBe('Добавлено 1 закладка или папка');
    expect(ru.backup.added(3)).toBe('Добавлено 3 закладки или папки');
    expect(ru.backup.added(11)).toBe('Добавлено 11 закладок и папок');
    expect(ru.backup.added(22)).toBe('Добавлено 22 закладки или папки');
    expect(en.backup.added(1)).toBe('Added 1 bookmark or folder');
    expect(en.backup.added(5)).toBe('Added 5 bookmarks and folders');
  });
});

describe('language', () => {
  const withBrowserLanguage = (language: string) => vi.stubGlobal('chrome', {i18n: {getUILanguage: () => language}});

  it('browser language if translated; otherwise English', () => {
    withBrowserLanguage('ru');
    expect(browserLanguage()).toBe('ru');
    withBrowserLanguage('ru-RU');
    expect(browserLanguage()).toBe('ru');
    withBrowserLanguage('en-GB');
    expect(browserLanguage()).toBe('en');
    withBrowserLanguage('de');
    expect(browserLanguage()).toBe('en');
    withBrowserLanguage('pt_BR');
    expect(resolveLanguage('auto')).toBe('en');
    expect(resolveLanguage('ru')).toBe('ru');
  });

  it('switching changes texts immediately', () => {
    setLanguage('en');
    expect(t.menu.open).toBe('Open');
    expect(t.bookmark.deleted(true, 'Работа')).toBe('Folder “Работа” deleted');
    setLanguage('ru');
    expect(t.menu.open).toBe('Открыть');
    expect(t.bookmark.deleted(true, 'Работа')).toBe('Папка «Работа» удалена');
  });

  it('date in the language format', () => {
    const time = Date.UTC(2026, 8, 26, 12, 30);
    setLanguage('en');
    expect(formatDateTime(time)).toMatch(/Sep 26, 2026/);
    setLanguage('ru');
    expect(formatDateTime(time)).toMatch(/26 сент\. 2026/);
  });
});
