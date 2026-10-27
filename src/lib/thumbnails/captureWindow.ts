// Where the screenshot window goes and whether a screenshot came out. No Svelte, no chrome.* — the service worker's
// capture.ts uses these, and they're tested on their own

export interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * While the page loads, the window is pushed off the screen and made as small as it gets. The browser keeps a
 * window partly on a screen (it moves it to the corner, at its smallest size — a speck), but nothing more shows
 */
export const HIDDEN_BOUNDS: Bounds = {left: 100_000, top: 100_000, width: 1, height: 1};

/**
 * For the screenshot: the bottom-right corner of the browser window the user works in, like a notification.
 * Never bigger than that window and always inside it: the browser refuses bounds mostly off the screen
 */
export function cornerBounds(browser: Partial<Bounds> | undefined, width: number, height: number): Bounds {
  if (browser?.left === undefined || browser.top === undefined || !browser.width || !browser.height) {
    return {left: 0, top: 0, width, height};
  }
  const fitWidth = Math.min(width, browser.width);
  const fitHeight = Math.min(height, browser.height);
  return {
    left: browser.left + browser.width - fitWidth,
    top: browser.top + browser.height - fitHeight,
    width: fitWidth,
    height: fitHeight,
  };
}

/** Loading status of the tab being captured, as the browser reports it */
export interface TabStatusSource {
  /** The status now; undefined — the tab is gone */
  current(): Promise<string | undefined>;
  /** Status changes; returns a function that unsubscribes */
  subscribe(listener: (status: string) => void): () => void;
}

/**
 * Waits until the page has stayed loaded for `settle` ms in a row. "complete" alone isn't enough: redirects and
 * single-page sites start loading again right after it, and a screenshot then catches a blank or half-drawn page.
 * Gives up after `timeout` ms in total — such a page is captured as is
 */
export function waitForSettledLoad(source: TabStatusSource, {settle, timeout}: {settle: number; timeout: number}): Promise<void> {
  return new Promise((resolve) => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let changed = false; // A status came before current() answered — it's newer than that answer

    const done = () => {
      clearTimeout(settleTimer);
      clearTimeout(timeoutTimer);
      unsubscribe();
      resolve();
    };
    const apply = (status: string) => {
      clearTimeout(settleTimer);
      settleTimer = status === 'complete' ? setTimeout(done, settle) : undefined;
    };

    const timeoutTimer = setTimeout(done, timeout);
    const unsubscribe = source.subscribe((status) => {
      changed = true;
      apply(status);
    });
    source.current().then((status) => {
      if (status === undefined) done();
      else if (!changed) apply(status);
    }, done);
  });
}

/**
 * A screenshot that is one flat colour: the browser drew nothing (the window ended up behind another one).
 * pixels — RGBA of a small copy of the screenshot
 */
export function isFlatImage(pixels: Uint8ClampedArray, tolerance = 6): boolean {
  for (let i = 4; i < pixels.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) {
      if (Math.abs(pixels[i + channel] - pixels[channel]) > tolerance) return false;
    }
  }
  return true;
}
