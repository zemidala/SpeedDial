// Automatic thumbnails: when a bookmarked page is open in the active tab, its screenshot becomes the bookmark's
// thumbnail. No extra windows — the tab the user is looking at is captured
import {coverTop, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../lib/images';
import {sendMessage} from '../lib/messages';
import {SITE_ACCESS} from '../lib/permissionSets';
import {loadSettings} from '../lib/settings/storage';
import {indexBookmarks, needsScreenshot, pageKey} from '../lib/thumbnails/autoCapture';
import {getThumbnail, saveThumbnail} from '../lib/thumbnails/storage';
import {isCaptureWindow} from './capture';

/** The page gets at least this long to draw itself after loading */
const MIN_DELAY = 1000;
/** A bookmark whose page failed to capture isn't tried again sooner than this */
const RETRY_AFTER = 10 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Page key → bookmark ids; built on demand and dropped whenever bookmarks change
let index: Promise<Map<string, string[]>> | null = null;
const lastAttempt = new Map<string, number>();
const busy = new Set<string>();

function bookmarksFor(url: string): Promise<string[]> {
  const key = pageKey(url);
  if (!key) return Promise.resolve([]);
  index ??= chrome.bookmarks.getTree().then(indexBookmarks);
  return index.then((pages) => pages.get(key) ?? []);
}

export function forgetBookmarkIndex(): void {
  index = null;
}

/** The tab, if it's still the visible tab of a normal window showing the same page */
async function visibleTab(tabId: number, url?: string): Promise<chrome.tabs.Tab | null> {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (!tab?.active || tab.status !== 'complete' || tab.incognito || !tab.url || tab.discarded) return null;
  if (url !== undefined && tab.url !== url) return null;
  if (isCaptureWindow(tab.windowId)) return null;
  const window = await chrome.windows.get(tab.windowId).catch(() => undefined);
  return window && window.state !== 'minimized' ? tab : null;
}

/**
 * Screenshot of the tab if it's still in view — the user may have switched tabs or gone to another page meanwhile.
 * A busy browser sometimes fails a capture, so there's one more try
 */
async function captureTab(tabId: number, url: string, windowId: number): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    if (!await visibleTab(tabId, url)) return null;
    try {
      return await chrome.tabs.captureVisibleTab(windowId, {format: 'png'});
    } catch (error) {
      if (attempt > 0) throw error;
      await sleep(MIN_DELAY);
    }
  }
}

/** Takes a screenshot of the tab for its bookmarks that need one; true — a thumbnail was saved */
export async function autoCapture(tabId: number): Promise<boolean> {
  const tab = await visibleTab(tabId);
  if (!tab?.url) return false;
  const url = tab.url;
  // "Loaded" and "activated" may both fire for one page; another page in the same tab is a separate job
  const job = `${tabId} ${url}`;
  if (busy.has(job)) return false;
  busy.add(job);
  try {
    const settings = await loadSettings();
    if (settings.autoCapture === 'off' || !await chrome.permissions.contains(SITE_ACCESS)) return false;

    const now = Date.now();
    const due: string[] = [];
    for (const id of await bookmarksFor(url)) {
      if (now - (lastAttempt.get(id) ?? 0) < RETRY_AFTER) continue;
      const stored = await getThumbnail(id).catch(() => undefined);
      if (needsScreenshot(stored, settings.autoCapture, now)) due.push(id);
    }
    if (due.length === 0) return false;

    await sleep(Math.max(MIN_DELAY, settings.captureDelay * 1000));
    const dataUrl = await captureTab(tabId, url, tab.windowId).catch((error: unknown) => {
      // A page that can't be captured isn't retried on every tab switch
      due.forEach((id) => lastAttempt.set(id, Date.now()));
      throw error;
    });
    if (!dataUrl) return false;
    const screenshot = await coverTop(await (await fetch(dataUrl)).blob(), THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

    const saved: string[] = [];
    for (const id of due) {
      // A custom image chosen during the delay stays
      if ((await getThumbnail(id).catch(() => undefined))?.source === 'custom') continue;
      await saveThumbnail(id, screenshot, 'capture');
      saved.push(id);
    }
    if (saved.length === 0) return false;
    await sendMessage({type: 'thumbnails-changed', ids: saved});
    return true;
  } catch (error) {
    // Some pages can't be captured (the browser's store, error pages) — that's not a problem
    console.warn('Automatic thumbnail failed', error);
    return false;
  } finally {
    busy.delete(job);
  }
}
