import {describe, expect, it} from 'vitest';
import {charsetOf, decodePage, pageDescription, pageTitle} from './pageText';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('charsetOf', () => {
  it('takes the header first, then the meta tag, UTF-8 by default', () => {
    expect(charsetOf('text/html; charset=Windows-1251', ascii('<meta charset="koi8-r">'))).toBe('windows-1251');
    expect(charsetOf('text/html', ascii('<head><meta charset="koi8-r"></head>'))).toBe('koi8-r');
    expect(charsetOf('text/html', ascii('<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">')))
      .toBe('windows-1251');
    expect(charsetOf('text/html', ascii('<html></html>'))).toBe('utf-8');
  });
});

describe('decodePage', () => {
  it('reads a page in windows-1251 — typical for older Russian sites', () => {
    // "<title>Привет</title>" in windows-1251
    const bytes = new Uint8Array([
      ...ascii('<meta charset="windows-1251"><title>'),
      0xcf, 0xf0, 0xe8, 0xe2, 0xe5, 0xf2,
      ...ascii('</title>'),
    ]);
    expect(pageTitle(decodePage(bytes.buffer, 'text/html'))).toBe('Привет');
  });

  it('an unknown charset falls back to UTF-8', () => {
    expect(decodePage(ascii('Привет').buffer as ArrayBuffer, 'text/html; charset=no-such-charset')).toBe('Привет');
  });
});

describe('pageTitle', () => {
  it('takes <title> with entities decoded and spaces collapsed', () => {
    expect(pageTitle('<head><title>\n  Tom &amp; Jerry &#8212;\n  cartoons </title></head>')).toBe('Tom & Jerry — cartoons');
  });

  it('without a title — the name for sharing', () => {
    expect(pageTitle('<title> </title><meta property="og:title" content="Shared name">')).toBe('Shared name');
    expect(pageTitle('<meta content=\'Tweet name\' name="twitter:title">')).toBe('Tweet name');
    expect(pageTitle('<html><body>No name</body></html>')).toBeNull();
  });
});

describe('pageDescription', () => {
  it('takes the description for search engines first, then the one for sharing', () => {
    const html = '<meta property="og:description" content="Shared"><meta name="Description" content="  Search &amp; find ">';
    expect(pageDescription(html)).toBe('Search & find');
    expect(pageDescription('<meta property="og:description" content="Shared">')).toBe('Shared');
    expect(pageDescription('<meta name="description" content="">')).toBeNull();
  });

  it('a very long description is cut', () => {
    expect(pageDescription(`<meta name="description" content="${'a'.repeat(900)}">`)).toHaveLength(500);
  });
});
