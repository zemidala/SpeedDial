// Снимки страниц для миниатюр: страница открывается в отдельном окне, снимается и окно закрывается
import {t} from '../lib/i18n/index.svelte';
import {resizeImage, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../lib/images';
import {type CaptureItem, type CaptureProgress, sendMessage} from '../lib/messages';
import {loadSettings} from '../lib/settings/storage';
import {saveThumbnail} from '../lib/thumbnails/storage';

const WINDOW_WIDTH = 1280;
const WINDOW_HEIGHT = 800;
const LOAD_TIMEOUT = 20_000; // Страница, которая грузится дольше, снимается как есть

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
    // Страница могла загрузиться раньше, чем мы подписались
    chrome.tabs.get(tabId).then((tab) => tab.status === 'complete' && done(), done);
  });
}

// Номер «сеанса» съёмки: отмена увеличивает его, и начатые раньше снимки прекращаются
let generation = 0;
let currentWindowId: number | undefined;
// Ход текущей партии снимков; null — съёмки нет
let progress: CaptureProgress | null = null;

export function captureStatus(): CaptureProgress | null {
  return progress;
}

/** Останавливает создание миниатюр: текущий снимок и всю очередь */
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

// Снимки делаются по одному: окна не должны мешать друг другу
let queue: Promise<void> = Promise.resolve();

export function captureThumbnails(items: CaptureItem[]): Promise<void> {
  const batchGeneration = generation;
  const isCancelled = () => batchGeneration !== generation;
  // Съёмка считается идущей сразу, а не когда партия дойдёт до очереди: вкладка, открытая в этот момент, должна знать о ней
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
        // Снимок, закончившийся уже после отмены, не сохраняем
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
    // После отмены сообщаем, что всё закончено, — индикатор на страницах исчезнет
    if (isCancelled()) await sendMessage({type: 'capture-progress', done: total, total});
  });
  return queue;
}
