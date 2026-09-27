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
