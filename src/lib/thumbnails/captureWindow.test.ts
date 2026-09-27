import {describe, expect, it} from 'vitest';
import {cornerBounds, isFlatImage} from './captureWindow';

describe('cornerBounds', () => {
  it('puts the window into the bottom-right corner of the browser window', () => {
    expect(cornerBounds({left: 100, top: 50, width: 1900, height: 1000}, 1280, 800))
      .toEqual({left: 720, top: 250, width: 1280, height: 800});
  });

  it('a browser window smaller than the screenshot: the window shrinks to fit inside it', () => {
    expect(cornerBounds({left: 10, top: 20, width: 800, height: 600}, 1280, 800))
      .toEqual({left: 10, top: 20, width: 800, height: 600});
    expect(cornerBounds({left: 0, top: 0, width: 1000, height: 600}, 1280, 800))
      .toEqual({left: 0, top: 0, width: 1000, height: 600});
  });

  it('without the browser window\'s bounds — the top-left of the screen', () => {
    expect(cornerBounds(undefined, 1280, 800)).toEqual({left: 0, top: 0, width: 1280, height: 800});
    expect(cornerBounds({left: 0, top: 0}, 1280, 800)).toEqual({left: 0, top: 0, width: 1280, height: 800});
  });
});

describe('isFlatImage', () => {
  const pixels = (...colors: number[][]) => new Uint8ClampedArray(colors.flatMap((rgb) => [...rgb, 255]));

  it('one colour (small noise allowed) — flat', () => {
    expect(isFlatImage(pixels([0, 0, 0], [0, 0, 0], [3, 2, 1]))).toBe(true);
    expect(isFlatImage(pixels([255, 255, 255]))).toBe(true);
  });

  it('anything drawn on it — not flat', () => {
    expect(isFlatImage(pixels([255, 255, 255], [255, 255, 255], [30, 30, 30]))).toBe(false);
  });
});
