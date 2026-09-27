// New tabs with SpeedDial open: when the extension is reloaded or updated, the browser turns them into its own
// new tab page (a tab opened by the extension's address is closed). The service worker keeps their ids and,
// after the reload, opens the new tab page in them again — SpeedDial comes back where it was. No Svelte.
//
// The ids are kept by the service worker alone (no two tabs writing the list at once): a page reports itself when
// it opens and when it's left, a closed tab is dropped by tabs.onRemoved. Ids are valid until the browser restarts
import {type RuntimeMessage, sendMessage} from './messages';

const KEY = 'openNewTabs'; // chrome.storage.local — survives the reload, unlike storage.session
const NEW_TAB_URL = 'chrome://newtab/'; // Edge takes chrome:// addresses too

let queue: Promise<unknown> = Promise.resolve();

/** Changes to the list one after another: messages from several tabs may come at once */
function change(update: (ids: number[]) => number[]): Promise<void> {
  const next = queue.then(async () => {
    const ids = ((await chrome.storage.local.get(KEY))[KEY] as number[] | undefined) ?? [];
    const updated = update(ids);
    if (updated.length > 0) await chrome.storage.local.set({[KEY]: updated});
    else await chrome.storage.local.remove(KEY);
  });
  queue = next.catch(() => undefined);
  return next;
}

/** Page: report this tab to the service worker, and leaving it (navigating away or closing) */
export function reportOpenTab(): void {
  void sendMessage({type: 'tab-opened'});
  addEventListener('pagehide', (event) => {
    if (!event.persisted) void sendMessage({type: 'tab-left'});
  });
}

/** Service worker: keep the list up to date */
export function trackOpenTabs(): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender) => {
    const id = sender.tab?.id;
    if (id === undefined) return false;
    if (message.type === 'tab-opened') {
      change((ids) => (ids.includes(id) ? ids : [...ids, id])).catch((error) => console.error('Failed to remember the tab', error));
    } else if (message.type === 'tab-left') {
      change((ids) => ids.filter((item) => item !== id)).catch((error) => console.error('Failed to forget the tab', error));
    }
    return false;
  });
  chrome.tabs.onRemoved.addListener((id) => {
    change((ids) => ids.filter((item) => item !== id)).catch((error) => console.error('Failed to forget the tab', error));
  });
  // After a browser restart the tab ids are new: the old list means nothing
  chrome.runtime.onStartup.addListener(() => {
    change(() => []).catch((error) => console.error('Failed to clear the tab list', error));
  });
}

/** Service worker, after a reload or an update: SpeedDial back into the tabs it was open in */
export async function restoreOpenTabs(): Promise<void> {
  let restore: number[] = [];
  await change((ids) => {
    restore = ids;
    return [];
  });
  await Promise.all(restore.map(async (id) => {
    // A tab that's gone (closed, or opened by the extension's address) is skipped
    const tab = await chrome.tabs.get(id).catch(() => null);
    if (tab) await chrome.tabs.update(id, {url: NEW_TAB_URL}).catch(() => undefined);
  }));
}
