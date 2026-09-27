// Page screenshots for thumbnails: the page opens in a separate window, gets captured, and the window closes
import {t} from '../lib/i18n/index.svelte';
import {resizeImage, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../lib/images';
import {cornerBounds, HIDDEN_BOUNDS, isFlatImage} from '../lib/thumbnails/captureWindow';
import {type CaptureItem, type CaptureProgress, sendMessage} from '../lib/messages';
import {loadSettings} from '../lib/settings/storage';
import {saveThumbnail} from '../lib/thumbnails/storage';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;
const LOAD_TIMEOUT = 20_000; // A page that takes longer to load is captured as is
const MIN_SHOWN = 300; // Ms on the screen before the screenshot, even with no delay set: time to draw a frame

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

/** A screenshot that came out flat (see isFlatImage) — checked on a small copy */
async function isFlat(screenshot: Blob): Promise<boolean> {
  const bitmap = await createImageBitmap(screenshot, {resizeWidth: 16, resizeHeight: 16});
  const canvas = new OffscreenCanvas(16, 16);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return isFlatImage(context.getImageData(0, 0, 16, 16).data);
}

async function screenshotOf(windowId: number): Promise<Blob | null> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {format: 'png'}).catch(() => null);
  return dataUrl ? (await fetch(dataUrl)).blob() : null;
}

/**
 * The page loads in a window that isn't seen — a speck off the screen, without focus and muted. Only for the
 * screenshot itself it comes out into the corner of the user's browser window, still without focus: typing and
 * clicking go on undisturbed, and it's on the screen for the capture delay only.
 * A window without focus may land behind the others, and then the browser doesn't draw it: if the screenshot comes
 * out flat, the window takes focus for a moment, and focus goes back right after
 */
async function captureOne(url: string, delaySeconds: number): Promise<Blob> {
  const browserWindow = await chrome.windows.getLastFocused().catch(() => undefined);
  const window = await chrome.windows.create({url, type: 'popup', focused: false, ...HIDDEN_BOUNDS});
  const tabId = window?.tabs?.[0]?.id;
  if (!window?.id || tabId === undefined) throw new Error(t.errors.captureWindow);
  currentWindowId = window.id;
  let tookFocus = false;

  try {
    await chrome.tabs.update(tabId, {muted: true}).catch(() => undefined);
    await waitForLoad(tabId);
    // Shown at full size: the page lays out for it and draws what waits to be seen (lazy images)
    await chrome.windows.update(window.id, {...cornerBounds(browserWindow, WINDOW_WIDTH, WINDOW_HEIGHT), focused: false});
    await sleep(Math.max(MIN_SHOWN, delaySeconds * 1000));

    let screenshot = await screenshotOf(window.id);
    if (!screenshot || await isFlat(screenshot)) {
      tookFocus = true;
      await chrome.windows.update(window.id, {focused: true});
      await sleep(MIN_SHOWN);
      screenshot = await screenshotOf(window.id) ?? screenshot;
    }
    if (!screenshot) throw new Error(t.errors.captureWindow);
    return await resizeImage(screenshot, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, 'image/jpeg', 0.85);
  } finally {
    currentWindowId = undefined;
    await chrome.windows.remove(window.id).catch(() => undefined);
    if (tookFocus && browserWindow?.id !== undefined) {
      await chrome.windows.update(browserWindow.id, {focused: true}).catch(() => undefined);
    }
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
