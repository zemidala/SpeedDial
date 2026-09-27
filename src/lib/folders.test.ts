import {afterEach, describe, expect, it, vi} from 'vitest';
import {fallbackFolder, findSystemFolder} from './folders';

type Node = Partial<chrome.bookmarks.BookmarkTreeNode> & {id: string};

/** A fake chrome.bookmarks with the given top-level folders and their children counts */
function fakeBookmarks(roots: Node[], counts: Record<string, number> = {}) {
  vi.stubGlobal('chrome', {
    bookmarks: {
      getChildren: async (id: string) => (id === '0'
        ? roots.map((node) => ({title: '', syncing: false, ...node}))
        : Array.from({length: counts[id] ?? 0}, (_, i) => ({id: `${id}-${i}`, title: '', url: 'https://a.example/'}))),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('findSystemFolder', () => {
  it('finds the bar by its type, whatever its id', async () => {
    fakeBookmarks([{id: '7', folderType: 'other'}, {id: '12', folderType: 'bookmarks-bar'}]);
    expect(await findSystemFolder('bookmarks-bar')).toBe('12');
    expect(await findSystemFolder('other')).toBe('7');
  });

  it('with a local and an account bar, prefers the one with bookmarks, then the synced one', async () => {
    fakeBookmarks([
      {id: '1', folderType: 'bookmarks-bar', syncing: false},
      {id: '20', folderType: 'bookmarks-bar', syncing: true},
    ], {1: 3});
    expect(await findSystemFolder('bookmarks-bar')).toBe('1');

    fakeBookmarks([
      {id: '1', folderType: 'bookmarks-bar', syncing: false},
      {id: '20', folderType: 'bookmarks-bar', syncing: true},
    ]);
    expect(await findSystemFolder('bookmarks-bar')).toBe('20');
  });

  it('older browsers without folder types: the classic ids', async () => {
    fakeBookmarks([{id: '1'}, {id: '2'}]);
    expect(await findSystemFolder('bookmarks-bar')).toBe('1');
    expect(await findSystemFolder('other')).toBe('2');
  });

  it('no bar — null, not some other folder', async () => {
    fakeBookmarks([{id: '5', title: 'Speed Dial'}]);
    expect(await findSystemFolder('bookmarks-bar')).toBeNull();
    // Bookmarks still have somewhere to go
    expect(await fallbackFolder()).toBe('5');
  });
});
