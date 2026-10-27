import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {isRecentMiss, MISS_TTL, pickPageImage, rememberMiss} from './pageImage';

describe('pickPageImage', () => {
  const base = 'https://example.com/news/article';

  it('prefers og:image:secure_url, then og:image, then twitter:image', () => {
    expect(pickPageImage([
      {key: 'twitter:image', content: 'https://example.com/t.png'},
      {key: 'og:image', content: 'https://example.com/og.png'},
      {key: 'og:image:secure_url', content: 'https://example.com/secure.png'},
    ], base)).toBe('https://example.com/secure.png');
    expect(pickPageImage([
      {key: 'twitter:image', content: 'https://example.com/t.png'},
      {key: 'OG:Image', content: 'https://example.com/og.png'},
    ], base)).toBe('https://example.com/og.png');
    expect(pickPageImage([{key: 'twitter:image:src', content: 'https://example.com/t.png'}], base))
      .toBe('https://example.com/t.png');
  });

  it('resolves relative addresses against the page', () => {
    expect(pickPageImage([{key: 'og:image', content: ' /img/cover.jpg '}], base)).toBe('https://example.com/img/cover.jpg');
    expect(pickPageImage([{key: 'og:image', content: '//cdn.example.com/a.jpg'}], base)).toBe('https://cdn.example.com/a.jpg');
  });

  it('skips empty and non-web addresses, other tags — none', () => {
    expect(pickPageImage([
      {key: 'og:image', content: '  '},
      {key: 'og:image', content: 'data:image/png;base64,AAAA'},
      {key: 'og:image', content: 'https://example.com/second.png'},
    ], base)).toBe('https://example.com/second.png');
    expect(pickPageImage([{key: 'description', content: 'https://example.com/x.png'}], base)).toBeNull();
    expect(pickPageImage([], base)).toBeNull();
  });
});

describe('page image misses', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('a page without a picture isn\'t asked again for a week', () => {
    const now = Date.now();
    rememberMiss('https://www.example.com/page/', now);
    expect(isRecentMiss('https://example.com/page', now + 1000)).toBe(true);
    expect(isRecentMiss('https://example.com/other', now + 1000)).toBe(false);
    expect(isRecentMiss('https://example.com/page', now + MISS_TTL)).toBe(false);
  });

  it('old entries are dropped when a new one is written', () => {
    const now = Date.now();
    rememberMiss('https://old.example/', now - MISS_TTL - 1);
    rememberMiss('https://new.example/', now);
    expect(JSON.parse(localStorage.getItem('pageImageMisses')!)).toEqual({'new.example': now});
  });

  it('without storage nothing breaks — the page is just asked again', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(() => rememberMiss('https://example.com/')).not.toThrow();
    expect(isRecentMiss('https://example.com/')).toBe(false);
  });
});
