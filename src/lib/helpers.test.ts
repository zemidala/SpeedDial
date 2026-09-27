import {describe, expect, it} from 'vitest';
import {collectBookmarks, flattenFolders} from './folders';
import {extractLargestIcoImage, isIco} from './ico';
import {buildSearchUrl} from './search';
import {formatServices, parseServices} from './services';
import {sortNodes} from './sorting';

describe('buildSearchUrl', () => {
  it('inserts the encoded query', () => {
    expect(buildSearchUrl('google', ' кот & пёс ')).toBe('https://www.google.com/search?q=%D0%BA%D0%BE%D1%82%20%26%20%D0%BF%D1%91%D1%81');
    expect(buildSearchUrl('duckduckgo', 'a')).toBe('https://duckduckgo.com/?q=a');
  });

  it('custom URL with %s; an invalid one falls back to Google', () => {
    expect(buildSearchUrl('custom', 'x', 'https://s.example/?q=%s')).toBe('https://s.example/?q=x');
    expect(buildSearchUrl('custom', 'x', 'https://s.example/')).toBe('https://www.google.com/search?q=x');
    expect(buildSearchUrl('custom', 'x', 'javascript:alert(%s)')).toBe('https://www.google.com/search?q=x');
  });
});

describe('services', () => {
  it('parses and formats "Name | URL" lines', () => {
    const services = parseServices('Почта | mail.example.com\n\n  wiki.example.org  \nбез адреса | \nA | B | https://x.example/');
    expect(services).toEqual([
      {title: 'Почта', url: 'https://mail.example.com/'},
      {title: 'wiki.example.org', url: 'https://wiki.example.org/'},
      {title: 'A | B', url: 'https://x.example/'},
    ]);
    expect(formatServices(services.slice(0, 1))).toBe('Почта | https://mail.example.com/');
  });
});

describe('sortNodes', () => {
  const nodes = [
    {title: 'б', url: 'https://b.example', dateAdded: 1},
    {title: 'Папка', dateAdded: 3},
    {title: 'А10', url: 'https://a.example', dateAdded: 2},
    {title: 'А9', url: 'https://c.example', dateAdded: 4},
  ];
  const titles = (list: typeof nodes) => list.map((node) => node.title);

  it('no sorting — the original array', () => {
    expect(sortNodes(nodes, 'none', 'none')).toBe(nodes);
  });

  it('by name with numeric order, by date, by type', () => {
    expect(titles(sortNodes(nodes, 'title', 'none'))).toEqual(['А9', 'А10', 'б', 'Папка']);
    expect(titles(sortNodes(nodes, 'dateAdded', 'none'))).toEqual(['А9', 'Папка', 'А10', 'б']);
    expect(titles(sortNodes(nodes, 'none', 'foldersFirst'))).toEqual(['Папка', 'б', 'А10', 'А9']);
    expect(titles(sortNodes(nodes, 'title', 'bookmarksFirst'))).toEqual(['А9', 'А10', 'б', 'Папка']);
  });
});

describe('folders', () => {
  const tree = {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'Панель',
        children: [
          {id: '10', title: 'a', url: 'https://a.example'},
          {id: '11', title: 'Вложенная', children: [{id: '20', title: 'b', url: 'https://b.example'}]},
        ],
      },
      {id: '2', title: 'Другое', children: []},
    ],
  };

  it('flat folder list with depth and bookmark counts', () => {
    expect(flattenFolders(tree)).toEqual([
      {id: '1', title: 'Панель', depth: 0, bookmarkCount: 1},
      {id: '11', title: 'Вложенная', depth: 1, bookmarkCount: 1},
      {id: '2', title: 'Другое', depth: 0, bookmarkCount: 0},
    ]);
  });

  it('folder bookmarks with and without subfolders', () => {
    const panel = tree.children[0];
    expect(collectBookmarks(panel, false).map((node) => node.id)).toEqual(['10']);
    expect(collectBookmarks(panel, true).map((node) => node.id)).toEqual(['10', '20']);
  });
});

describe('ICO', () => {
  // An .ico built from entries: [width, data]
  function makeIco(entries: Array<[number, Uint8Array]>): ArrayBuffer {
    const headerSize = 6 + entries.length * 16;
    const total = headerSize + entries.reduce((sum, [, data]) => sum + data.length, 0);
    const bytes = new Uint8Array(total);
    const view = new DataView(bytes.buffer);
    view.setUint16(2, 1, true);
    view.setUint16(4, entries.length, true);
    let offset = headerSize;
    entries.forEach(([size, data], i) => {
      const entry = 6 + i * 16;
      bytes[entry] = size >= 256 ? 0 : size;
      bytes[entry + 1] = size >= 256 ? 0 : size;
      view.setUint16(entry + 6, 32, true);
      view.setUint32(entry + 8, data.length, true);
      view.setUint32(entry + 12, offset, true);
      bytes.set(data, offset);
      offset += data.length;
    });
    return bytes.buffer;
  }

  // A minimal "PNG": the signature and an IHDR header with the size
  function fakePng(size: number): Uint8Array {
    const bytes = new Uint8Array(33);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, size);
    view.setUint32(20, size);
    return bytes;
  }

  it('picks the largest image and recognises PNG', () => {
    const ico = makeIco([[16, new Uint8Array(40)], [256, fakePng(512)], [48, new Uint8Array(60)]]);
    const image = extractLargestIcoImage(ico)!;
    expect(image.type).toBe('image/png');
    expect(image.size).toBe(512); // Real size from the PNG header
    expect(image.data).toEqual(fakePng(512));
  });

  it('rebuilds a BMP entry into a single-image .ico', () => {
    const bmp = new Uint8Array(64).fill(7);
    const image = extractLargestIcoImage(makeIco([[16, new Uint8Array(40)], [48, bmp]]))!;
    expect(image).toMatchObject({type: 'image/x-icon', size: 48});
    expect(isIco(image.data.buffer)).toBe(true);
    const view = new DataView(image.data.buffer);
    expect(view.getUint16(4, true)).toBe(1); // One entry
    expect(image.data.slice(22)).toEqual(bmp);
  });

  it('non-ICO and corrupted files', () => {
    expect(isIco(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]).buffer)).toBe(false);
    expect(extractLargestIcoImage(new ArrayBuffer(3))).toBeNull();
    // The entry points past the end of the file
    const broken = new Uint8Array(makeIco([[32, new Uint8Array(10)]]));
    new DataView(broken.buffer).setUint32(6 + 8, 9999, true);
    expect(extractLargestIcoImage(broken.buffer)).toBeNull();
  });
});
