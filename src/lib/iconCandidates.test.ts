import {describe, expect, it} from 'vitest';
import {candidatesFromLinks, candidatesFromManifest, parseSizes, rankCandidates, VECTOR_SIZE} from './iconCandidates';

const BASE = 'https://example.com/app/';

describe('parseSizes', () => {
  it.each([
    [null, 0],
    ['', 0],
    ['16x16', 16],
    ['16x16 32x32 192x192', 192],
    ['180X180', 180],
    ['64x32', 32],
    ['any', VECTOR_SIZE],
    ['garbage', 0],
  ])('%j → %d', (sizes, expected) => {
    expect(parseSizes(sizes)).toBe(expected);
  });
});

describe('candidatesFromLinks', () => {
  it('берёт иконки и apple-touch-icon, достраивая адреса и размеры', () => {
    const result = candidatesFromLinks([
      {rel: 'icon', href: '/favicon.ico'},
      {rel: 'shortcut icon', href: 'icon-32.png', sizes: '32x32'},
      {rel: 'apple-touch-icon', href: '/touch.png'},
      {rel: 'apple-touch-icon-precomposed', href: '/touch-152.png', sizes: '152x152'},
      {rel: 'icon', href: '/logo.svg', type: 'image/svg+xml'},
      {rel: 'stylesheet', href: '/style.css'},
      {rel: 'manifest', href: '/site.webmanifest'},
    ], BASE);

    expect(result).toEqual([
      {url: 'https://example.com/favicon.ico', size: 16},
      {url: 'https://example.com/app/icon-32.png', size: 32},
      {url: 'https://example.com/touch.png', size: 180},
      {url: 'https://example.com/touch-152.png', size: 152},
      {url: 'https://example.com/logo.svg', size: VECTOR_SIZE},
    ]);
  });
});

describe('candidatesFromManifest', () => {
  it('разбирает иконки манифеста и штрафует только-maskable', () => {
    const manifest = {
      icons: [
        {src: 'icons/192.png', sizes: '192x192'},
        {src: 'icons/512-mask.png', sizes: '512x512', purpose: 'maskable'},
        {src: 'icons/any.svg', type: 'image/svg+xml'},
        {src: 'icons/nosize.png'},
        {sizes: '64x64'},
      ],
    };
    expect(candidatesFromManifest(manifest, 'https://example.com/static/manifest.json')).toEqual([
      {url: 'https://example.com/static/icons/192.png', size: 192, penalty: 0},
      {url: 'https://example.com/static/icons/512-mask.png', size: 512, penalty: 1},
      {url: 'https://example.com/static/icons/any.svg', size: VECTOR_SIZE, penalty: 0},
    ]);
  });

  it('некорректный манифест — пустой список', () => {
    expect(candidatesFromManifest(null, BASE)).toEqual([]);
    expect(candidatesFromManifest({icons: 'nope'}, BASE)).toEqual([]);
  });
});

describe('rankCandidates', () => {
  it('отбрасывает мелкие, сортирует по штрафу и размеру, убирает повторы', () => {
    const ranked = rankCandidates([
      {url: 'a', size: 16},
      {url: 'b', size: 180},
      {url: 'c', size: 512, penalty: 1},
      {url: 'd', size: 192},
      {url: 'b', size: 180},
      {url: 'e', size: 180, penalty: 0.5},
    ]);
    expect(ranked.map(({url}) => url)).toEqual(['d', 'b', 'e', 'c']);
  });
});
