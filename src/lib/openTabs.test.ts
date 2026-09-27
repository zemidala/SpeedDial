import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {restoreOpenTabs, trackOpenTabs} from './openTabs';

type MessageListener = (message: unknown, sender: {tab?: {id: number}}) => boolean;

/** A fake browser: storage.local, existing tabs and the listeners the service worker adds */
function fakeBrowser(tabs: number[], stored?: number[]) {
  const data: Record<string, unknown> = stored ? {openNewTabs: stored} : {};
  const listeners = {
    message: [] as MessageListener[],
    removed: [] as Array<(id: number) => void>,
    startup: [] as Array<() => void>,
  };
  const update = vi.fn(async (id: number) => ({id}));
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in data ? {[key]: data[key]} : {}),
        set: async (values: Record<string, unknown>) => Object.assign(data, values),
        remove: async (key: string) => delete data[key],
      },
    },
    tabs: {
      get: async (id: number) => {
        if (!tabs.includes(id)) throw new Error(`No tab with id: ${id}`);
        return {id};
      },
      update,
      onRemoved: {addListener: (listener: (id: number) => void) => listeners.removed.push(listener)},
    },
    runtime: {
      onMessage: {addListener: (listener: MessageListener) => listeners.message.push(listener)},
      onStartup: {addListener: (listener: () => void) => listeners.startup.push(listener)},
    },
  });
  const send = (type: string, id: number) => listeners.message.forEach((listener) => listener({type}, {tab: {id}}));
  return {data, update, listeners, send};
}

/** The list changes one after another in the background — wait for them */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('restoreOpenTabs', () => {
  it('opens the new tab page again in the tabs that still exist and forgets the list', async () => {
    const browser = fakeBrowser([5, 7], [5, 6, 7]);
    await restoreOpenTabs();
    expect(browser.update.mock.calls.map(([id]) => id).sort()).toEqual([5, 7]); // 6 was closed
    expect(browser.update).toHaveBeenCalledWith(5, {url: 'chrome://newtab/'});
    expect(browser.data.openNewTabs).toBeUndefined();
  });

  it('with nothing remembered does nothing', async () => {
    const browser = fakeBrowser([1]);
    await restoreOpenTabs();
    expect(browser.update).not.toHaveBeenCalled();
  });
});

describe('trackOpenTabs', () => {
  let browser: ReturnType<typeof fakeBrowser>;
  beforeEach(() => {
    browser = fakeBrowser([1, 2, 3]);
    trackOpenTabs();
  });

  it('remembers the tabs that report themselves, once each, even when they report at the same time', async () => {
    browser.send('tab-opened', 1);
    browser.send('tab-opened', 2);
    browser.send('tab-opened', 2);
    browser.send('tab-opened', 3);
    await settle();
    await settle();
    expect(browser.data.openNewTabs).toEqual([1, 2, 3]);
  });

  it('forgets a tab that left SpeedDial or was closed; a browser restart forgets them all', async () => {
    for (const id of [1, 2, 3]) browser.send('tab-opened', id);
    browser.send('tab-left', 1);
    browser.listeners.removed.forEach((listener) => listener(2));
    await settle();
    await settle();
    expect(browser.data.openNewTabs).toEqual([3]);

    browser.listeners.startup.forEach((listener) => listener());
    await settle();
    await settle();
    expect(browser.data.openNewTabs).toBeUndefined();
  });

  it('ignores other messages and messages not from a tab', async () => {
    browser.send('capture-status', 1);
    browser.listeners.message.forEach((listener) => listener({type: 'tab-opened'}, {}));
    await settle();
    expect(browser.data.openNewTabs).toBeUndefined();
  });
});
