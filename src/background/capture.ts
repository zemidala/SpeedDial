// Снимки страниц для миниатюр: страница открывается в отдельном окне, снимается и окно закрывается
import {resizeImage, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH} from '../lib/images';
import {type CaptureItem, sendMessage} from '../lib/messages';
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

async function captureOne(url: string, delaySeconds: number): Promise<Blob> {
  const window = await chrome.windows.create({
    url,
    type: 'popup',
    focused: false,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
  });
  const tabId = window?.tabs?.[0]?.id;
  if (!window?.id || tabId === undefined) throw new Error('Не удалось открыть окно для снимка');

  try {
    await waitForLoad(tabId);
    await sleep(delaySeconds * 1000);
    const dataUrl = await chrome.tabs.captureVisibleTab(window.id, {format: 'png'});
    const screenshot = await (await fetch(dataUrl)).blob();
    return await resizeImage(screenshot, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, 'image/jpeg', 0.85);
  } finally {
    await chrome.windows.remove(window.id).catch(() => undefined);
  }
}

// Снимки делаются по одному: окна не должны мешать друг другу
let queue: Promise<void> = Promise.resolve();

export function captureThumbnails(items: CaptureItem[]): Promise<void> {
  queue = queue.then(async () => {
    const {captureDelay} = await loadSettings();
    let done = 0;
    for (const {id, url} of items) {
      try {
        await saveThumbnail(id, await captureOne(url, captureDelay), 'capture');
        await sendMessage({type: 'thumbnails-changed', ids: [id]});
      } catch (error) {
        console.error('Failed to capture', url, error);
      }
      await sendMessage({type: 'capture-progress', done: ++done, total: items.length});
    }
  });
  return queue;
}
