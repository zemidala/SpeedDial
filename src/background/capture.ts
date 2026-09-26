// Page screenshots for thumbnails: the page opens in a separate window, gets captured, and the window closes
import {t} from '../lib/i18n/index.svelte';
import {resizeImage, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../lib/images';
import {type CaptureItem, type CaptureProgress, sendMessage} from '../lib/messages';
import {loadSettings} from '../lib/settings/storage';
import {saveThumbnail} from '../lib/thumbnails/storage';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;
const LOAD_TIMEOUT = 20_000; // A page that takes longer to load is captured as is

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function waitForLoad(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve();
    };
    const onUpdated = (id: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (id === tabId && change.status === 'complete') done();
    };
    const timer = setTimeout(done, LOAD_TIMEOUT);
    chrome.tabs.onUpdated.addListener(onUpdated);
    // The page may have finished loading before we subscribed
    chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && done(), done);
  });
}

// Capture "session" number: cancelling bumps it, and captures started earlier stop
let generation = 0;
let currentWindowId: number | undefined;
// Progress of the current batch; null — nothing is being captured
let progress: CaptureProgress | null = null;

/** The window opened for a screenshot — automatic thumbnails leave its tab alone */
export function isCaptureWindow(windowId: number): boolean {
  return windowId === currentWindowId;
}

export function captureStatus(): CaptureProgress | null {
  return progress;
}

/** Stops creating thumbnails: the current capture and the whole queue */
export function cancelCapture(): void {
  generation++;
  progress = null;
  if (currentWindowId !== undefined) chrome.windows.remove(currentWindowId).catch(() => undefined);
}

async function captureOne(url: string, delaySeconds: number): Promise<Blob> {
  const window = await chrome.windows.create({
    url,
    type: 'popup',
    focused: false,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
  const tabId = window?.tabs?.[0]?.id;
  if (!window?.id || tabId === undefined) throw new Error(t.errors.captureWindow);
  currentWindowId = window.id;

  try {
    await waitForLoad(tabId);
    await sleep(delaySeconds * 1000);
    const dataUrl = await chrome.tabs.captureVisibleTab(window.id, {format: 'png'});
    const screenshot = await (await fetch(dataUrl)).blob();
    return await resizeImage(screenshot, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, 'image/jpeg', 0.85);
  } finally {
    currentWindowId = undefined;
    await chrome.windows.remove(window.id).catch(() => undefined);
  }
}

// Captures run one at a time so their windows don't interfere with each other
let queue: Promise<void> = Promise.resolve();

export function captureThumbnails(items: CaptureItem[]): Promise<void> {
  const batchGeneration = generation;
  const isCancelled = () => batchGeneration !== generation;
  // Capturing counts as started right away, not when the batch reaches the queue: a tab opened meanwhile must know about it
  progress ??= {done: 0, total: items.length};

  queue = queue.then(async () => {
    const total = items.length;
    const {captureDelay} = await loadSettings();
    let done = 0;
    progress = {done, total};
    for (const {id, url} of items) {
      if (isCancelled()) break;
      try {
        const screenshot = await captureOne(url, captureDelay);
        // A capture that finished after cancelling isn't saved
        if (isCancelled()) break;
        await saveThumbnail(id, screenshot, 'capture');
        await sendMessage({type: 'thumbnails-changed', ids: [id]});
      } catch (error) {
        if (!isCancelled()) console.error('Failed to capture', url, error);
      }
      if (isCancelled()) break;
      progress = {done: ++done, total};
      await sendMessage({type: 'capture-progress', done, total});
    }
    progress = null;
    // After cancelling, report everything as done so the indicator on pages disappears
    if (isCancelled()) await sendMessage({type: 'capture-progress', done: total, total});
  });
  return queue;
}
