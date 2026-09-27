import {describe, expect, it} from 'vitest';
import {DEFAULT_SETTINGS} from '../settings/schema';
import {type Backup, backupFileName, backupFingerprint, blobToImage, type BookmarksApi, createBackup, imageToBlob,
  parseBackup, restoreBookmarks, settingsFromBackup} from './backup';

type Node = chrome.bookmarks.BookmarkTreeNode;
interface Seed {
  title: string;
  url?: string;
  children?: Seed[];
}

/** In-memory bookmarks behaving like chrome.bookmarks in the parts we need */
function fakeBookmarks(bar: Seed[], other: Seed[] = []): BookmarksApi & {titles(id: string): unknown[]} {
  let nextId = 10;
  const nodes = new Map<string, Node>();
  const add = (seed: Seed, parentId: string, id = String(nextId++)): Node => {
    const node: Node = {id, parentId, title: seed.title, url: seed.url, syncing: false, children: seed.url ? undefined : []};
    nodes.set(id, node);
    nodes.get(parentId)?.children!.push(node);
    for (const child of seed.children ?? []) add(child, id);
    return node;
  };
  nodes.set('0', {id: '0', title: '', syncing: false, children: []});
  const barNode = add({title: 'Панель закладок'}, '0', '1');
  const otherNode = add({title: 'Другие закладки'}, '0', '2');
  bar.forEach((seed) => add(seed, barNode.id));
  other.forEach((seed) => add(seed, otherNode.id));

  const children = (id: string) => nodes.get(id)!.children!;
  const describe = (node: Node): unknown => (node.url ? node.title : {[node.title]: node.children!.map(describe)});

  return {
    getTree: async () => [nodes.get('0')!],
    getChildren: async (id) => [...children(id)],
    create: async ({parentId = '2', title = '', url, index}) => {
      const node = add({title, url}, parentId);
      if (index !== undefined) {
        const list = children(parentId);
        list.splice(list.indexOf(node), 1);
        list.splice(index, 0, node);
      }
      return node;
    },
    removeTree: async (id) => {
      const node = nodes.get(id)!;
      const siblings = children(node.parentId!);
      siblings.splice(siblings.indexOf(node), 1);
      nodes.delete(id);
    },
    titles: (id) => children(id).map(describe),
  };
}

const noImages = async () => false;

async function backupOf(api: BookmarksApi): Promise<Backup> {
  return createBackup({includeImages: false}, api, {...DEFAULT_SETTINGS, columns: 7}, new Date('2026-09-26T10:00:00Z'));
}

describe('backup', () => {
  it('saves the bookmark tree with its order and the shared settings', async () => {
    const api = fakeBookmarks([
      {title: 'Альфа', url: 'https://alpha.example/'},
      {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
    ], [{title: 'Прочее', url: 'https://other.example/'}]);
    const backup = await backupOf(api);

    expect(backup.roots).toEqual([
      {id: '1', title: 'Панель закладок', kind: 'bookmarks-bar', children: [
        {title: 'Альфа', url: 'https://alpha.example/'},
        {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
      ]},
      {id: '2', title: 'Другие закладки', kind: 'other', children: [{title: 'Прочее', url: 'https://other.example/'}]},
    ]);
    expect(backup.settings.columns).toBe(7);
    // Device-only settings aren't included in the backup
    expect(backup.settings).not.toHaveProperty('defaultFolderId');
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
  });

  it('fingerprint ignores the creation time', async () => {
    const api = fakeBookmarks([{title: 'Альфа', url: 'https://alpha.example/'}]);
    const first = await backupOf(api);
    const later = {...first, createdAt: '2030-01-01T00:00:00.000Z'};
    expect(await backupFingerprint(later)).toBe(await backupFingerprint(first));

    await api.create({parentId: '1', title: 'Бета', url: 'https://beta.example/'});
    expect(await backupFingerprint(await backupOf(api))).not.toBe(await backupFingerprint(first));
  });

  it('"add missing" deletes nothing and adds no duplicates', async () => {
    const source = fakeBookmarks([
      {title: 'Альфа', url: 'https://alpha.example/'},
      {title: 'Папка', children: [
        {title: 'Внутри', url: 'https://inside.example/'},
        {title: 'Новая внутри', url: 'https://new-inside.example/'},
      ]},
      {title: 'Бета', url: 'https://beta.example/'},
    ]);
    const backup = await backupOf(source);

    const target = fakeBookmarks([
      {title: 'Своя', url: 'https://own.example/'},
      {title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]},
      {title: 'Альфа (переименована)', url: 'https://alpha.example/'},
    ]);
    const result = await restoreBookmarks(backup, 'merge', target, noImages);

    expect(target.titles('1')).toEqual([
      'Своя',
      {'Папка': ['Внутри', 'Новая внутри']},
      'Альфа (переименована)',
      'Бета',
    ]);
    expect(result.created).toBe(2);
    // Merging again adds nothing
    expect((await restoreBookmarks(backup, 'merge', target, noImages)).created).toBe(0);
  });

  it('"restore everything" makes root folders exactly as in the backup', async () => {
    const backup = await backupOf(fakeBookmarks(
      [{title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]}, {title: 'Альфа', url: 'https://alpha.example/'}],
      [{title: 'Прочее', url: 'https://other.example/'}],
    ));
    const target = fakeBookmarks([{title: 'Лишняя', url: 'https://extra.example/'}], []);
    await restoreBookmarks(backup, 'replace', target, noImages);

    expect(target.titles('1')).toEqual([{'Папка': ['Внутри']}, 'Альфа']);
    expect(target.titles('2')).toEqual(['Прочее']);
  });

  it('thumbnails are restored for created and matched bookmarks', async () => {
    const thumbnail = {type: 'image/jpeg', data: 'AAEC', source: 'custom' as const};
    const backup: Backup = {
      ...await backupOf(fakeBookmarks([])),
      roots: [{id: '1', title: 'Панель закладок', children: [
        {title: 'Есть', url: 'https://exists.example/', thumbnail},
        {title: 'Нет', url: 'https://missing.example/', thumbnail},
      ]}],
    };
    const target = fakeBookmarks([{title: 'Есть', url: 'https://exists.example/'}]);
    const saved: string[] = [];
    const result = await restoreBookmarks(backup, 'merge', target, async (id) => {
      saved.push(id);
      return true;
    });
    expect(saved).toHaveLength(2);
    expect(result).toMatchObject({created: 1, thumbnails: 2});
    expect(result.createdIds).toHaveLength(1);
  });
  it('merging another browser\'s backup: roots by kind, not by id; folders by name without case', async () => {
    // A backup made in Edge with account bookmarks: its bar has another id
    const backup: Backup = {
      ...await backupOf(fakeBookmarks([])),
      roots: [{id: '7', title: 'Панель избранного', kind: 'bookmarks-bar', children: [
        {title: 'папка', children: [{title: 'Внутри', url: 'http://inside.example'}, {title: 'Новая', url: 'https://new.example/'}]},
      ]}],
    };
    const target = fakeBookmarks([{title: 'Папка', children: [{title: 'Внутри', url: 'https://inside.example/'}]}]);
    const result = await restoreBookmarks(backup, 'merge', target, noImages);
    expect(target.titles('1')).toEqual([{'Папка': ['Внутри', 'Новая']}]);
    expect(result.created).toBe(1);
  });


  it('images round-trip through base64 losslessly', async () => {
    const bytes = new Uint8Array(100_000).map((_, i) => (i * 7) % 256);
    const image = await blobToImage(new Blob([bytes], {type: 'image/png'}));
    const restored = imageToBlob(image);
    expect(restored.type).toBe('image/png');
    expect(new Uint8Array(await restored.arrayBuffer())).toEqual(bytes);
  });

  it('rejects foreign or corrupted files', () => {
    expect(() => parseBackup('не json')).toThrow('это не JSON');
    expect(() => parseBackup('{"format":"speeddial-settings"}')).toThrow('Это не резервная копия SpeedDial');
    expect(() => parseBackup('{"format":"speeddial-backup","version":99,"roots":[]}')).toThrow('более новой версией');
  });

  it('device settings stay unchanged on restore', async () => {
    const backup = await backupOf(fakeBookmarks([]));
    const current = {...DEFAULT_SETTINGS, defaultFolderId: '42', syncEnabled: false};
    const restored = settingsFromBackup(backup, current);
    expect(restored).toMatchObject({columns: 7, defaultFolderId: '42', syncEnabled: false});
  });

  it('backup file name', () => {
    expect(backupFileName(new Date('2026-09-26T12:30:05.123Z'))).toBe('speeddial-2026-09-26_12-30-05.json');
  });
});
