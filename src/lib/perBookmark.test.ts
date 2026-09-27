import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {perBookmarkStorage} from './perBookmark';

type Changes = Record<string, {newValue?: unknown; oldValue?: unknown}>;

/** A fake chrome.storage.local with change events, like the real one */
function fakeStorage(initial: Record<string, unknown> = {}) {
  const data = {...initial};
  const listeners: Array<(changes: Changes, area: string) => void> = [];
  const emit = (changes: Changes) => listeners.forEach((listener) => listener(changes, 'local'));
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string | null) => (key === null ? {...data} : key in data ? {[key]: data[key]} : {}),
        set: async (values: Record<string, unknown>) => {
          const changes: Changes = {};
          for (const [key, value] of Object.entries(values)) {
            changes[key] = {oldValue: data[key], newValue: value};
            data[key] = value;
          }
          emit(changes);
        },
        remove: async (keys: string | string[]) => {
          const changes: Changes = {};
          for (const key of [keys].flat()) {
            if (!(key in data)) continue;
            changes[key] = {oldValue: data[key]};
            delete data[key];
          }
          if (Object.keys(changes).length > 0) emit(changes);
        },
      },
      onChanged: {addListener: (listener: (changes: Changes, area: string) => void) => listeners.push(listener)},
    },
  });
  return data;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('perBookmarkStorage', () => {
  let data: Record<string, unknown>;
  beforeEach(() => {
    data = fakeStorage({other: 1, 'notes:5': 'not ours'});
  });

  it('keeps each bookmark under a key of its own', async () => {
    const storage = perBookmarkStorage<string>('descriptions');
    await storage.set({1: 'One', 2: 'Two'});
    expect(data).toMatchObject({'descriptions:1': 'One', 'descriptions:2': 'Two'});
    expect(await storage.load()).toEqual({1: 'One', 2: 'Two'});

    await storage.set({1: null, 3: 'Three'});
    await storage.forget(['2', '404']);
    expect(await storage.load()).toEqual({3: 'Three'});
    expect(data.other).toBe(1);
  });

  it('removing one bookmark\'s value can\'t bring back another one removed at the same time', async () => {
    const storage = perBookmarkStorage<string>('marks');
    await storage.set({1: 'a', 2: 'b'});
    // A tab and the service worker, each removing its own
    await Promise.all([storage.forget(['1']), storage.forget(['2'])]);
    expect(await storage.load()).toEqual({});
  });

  it('reports what changed, and only its own keys', async () => {
    const storage = perBookmarkStorage<string>('descriptions');
    const seen: Array<Record<string, string | null>> = [];
    storage.onChanged((changes) => seen.push(changes));
    await storage.set({7: 'Seven'});
    await storage.forget(['7']);
    await chrome.storage.local.set({unrelated: true});
    expect(seen).toEqual([{7: 'Seven'}, {7: null}]);
  });

  it('moves data of earlier versions (one shared object) to keys of their own', async () => {
    data = fakeStorage({brokenLinks: {4: {problem: 'notFound', checkedAt: 1}}});
    const storage = perBookmarkStorage<{problem: string}>('brokenLinks');
    expect(await storage.load()).toEqual({4: {problem: 'notFound', checkedAt: 1}});
    expect(data).not.toHaveProperty('brokenLinks');
    expect(data['brokenLinks:4']).toEqual({problem: 'notFound', checkedAt: 1});
  });
});
