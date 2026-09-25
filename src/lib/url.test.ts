import {describe, expect, it} from 'vitest';
import {getHostname, isWebUrl, normalizeUrl, siteName} from './url';

describe('normalizeUrl', () => {
  it.each([
    ['example.com', 'https://example.com/'],
    ['  example.com/path  ', 'https://example.com/path'],
    ['http://example.com', 'http://example.com/'],
    ['localhost:3000', 'https://localhost:3000/'],
    ['example.com:8080/x', 'https://example.com:8080/x'],
    ['edge://settings', 'edge://settings'],
    ['mailto:me@example.com', 'mailto:me@example.com'],
    ['file:///C:/notes.txt', 'file:///C:/notes.txt'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it.each(['', '   ', 'exa mple.com', 'exa mple', 'https://exa\tmple.com', 'https://'])('отклоняет %j', (input) => {
    expect(normalizeUrl(input)).toBeNull();
  });
});

describe('getHostname', () => {
  it('возвращает домен', () => {
    expect(getHostname('https://sub.example.com/a?b')).toBe('sub.example.com');
  });

  it('возвращает пустую строку для некорректного URL', () => {
    expect(getHostname('not a url')).toBe('');
  });
});

describe('siteName', () => {
  it.each([
    ['https://ru.wikipedia.org/wiki/X', 'wikipedia'],
    ['https://www.github.com/', 'github'],
    ['https://mail.yandex.ru/', 'yandex'],
    ['https://www.bbc.co.uk/news', 'bbc'],
    ['https://ya.ru/', 'ya'],
    ['http://localhost:3000/', 'localhost'],
    ['edge://settings', 'settings'],
    ['not a url', ''],
  ])('%s → %s', (url, name) => {
    expect(siteName(url)).toBe(name);
  });
});

describe('isWebUrl', () => {
  it('различает веб-ссылки и остальные схемы', () => {
    expect(isWebUrl('https://example.com')).toBe(true);
    expect(isWebUrl('HTTP://example.com')).toBe(true);
    expect(isWebUrl('edge://settings')).toBe(false);
    expect(isWebUrl('javascript:void(0)')).toBe(false);
  });
});
