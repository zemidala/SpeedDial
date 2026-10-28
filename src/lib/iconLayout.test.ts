import {describe, expect, it} from 'vitest';
import {apcaContrast} from './color';
import {analyzeLayout, cutOutBackground} from './iconLayout';

type Pixel = [number, number, number, number];
const SIZE = 64;

/** A 64×64 image; paint(x, y) gives each pixel */
function image(paint: (x: number, y: number) => Pixel): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) data.set(paint(x, y), (y * SIZE + x) * 4);
  }
  return data;
}

const CLEAR: Pixel = [0, 0, 0, 0];
const inCircle = (x: number, y: number, r = 30) => (x - 31.5) ** 2 + (y - 31.5) ** 2 <= r * r;
const inSquare = (x: number, y: number, from: number, to: number) => x >= from && x < to && y >= from && y < to;

describe('apcaContrast', () => {
  it('black on white and white on black — the extremes, with their signs', () => {
    expect(apcaContrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(106, 0);
    expect(apcaContrast([255, 255, 255], [0, 0, 0])).toBeCloseTo(-108, 0);
    expect(apcaContrast([128, 128, 128], [128, 128, 128])).toBe(0);
  });
});

describe('analyzeLayout', () => {
  it('a square of one colour with a drawing inside — seamless, the drawing is found', () => {
    // A red square with a white mark in the middle (like Yandex's)
    const layout = analyzeLayout(image((x, y) => (inSquare(x, y, 24, 40) ? [255, 255, 255, 255] : [252, 63, 29, 255])), SIZE)!;
    expect(layout.kind).toBe('seamless');
    expect(layout.edgeColor).toBe('#fc3f1d');
    expect(layout.lightEdge).toBe(false);
    expect(layout.box).toEqual({x: 0, y: 0, w: 1, h: 1});
    expect(layout.contentBox).toEqual({x: 24 / 64, y: 24 / 64, w: 16 / 64, h: 16 / 64});
  });

  it('a dark square lighter at the top (GitHub\'s app icon) — its top and bottom colours are kept', () => {
    const layout = analyzeLayout(image((x, y) => {
      if (inCircle(x, y, 22)) return [255, 255, 255, 255];
      const shade = Math.round(30 - y / 4);
      return [shade, shade + 2, shade + 4, 255];
    }), SIZE)!;
    expect(layout.kind).toBe('seamless');
    expect(layout.edgeGradient).toEqual(['#1e2022', '#0f1113']);
  });

  it('a flat edge has no gradient', () => {
    const layout = analyzeLayout(image((x, y) => (inSquare(x, y, 24, 40) ? [255, 255, 255, 255] : [252, 63, 29, 255])), SIZE)!;
    expect(layout.edgeGradient).toBeNull();
  });

  it('a circle on transparency with a drawing (Discord) — seamless too', () => {
    const layout = analyzeLayout(image((x, y) => {
      if (!inCircle(x, y)) return CLEAR;
      return inSquare(x, y, 22, 42) ? [255, 255, 255, 255] : [88, 101, 242, 255];
    }), SIZE)!;
    expect(layout.kind).toBe('seamless');
    expect(layout.edgeColor).toBe('#5865f2');
  });

  it('a white circle with a soft shadow (Google) — the shadow isn\'t part of the shape', () => {
    const layout = analyzeLayout(image((x, y) => {
      if (inCircle(x, y, 26)) return inSquare(x, y, 22, 42) ? [66, 133, 244, 255] : [255, 255, 255, 255];
      if (inCircle(x, y, 31)) return [0, 0, 0, 40];
      return CLEAR;
    }), SIZE)!;
    expect(layout.kind).toBe('seamless');
    expect(layout.lightEdge).toBe(true);
  });

  it('a one-colour shape with nothing drawn on it (YouTube\'s white button) is a silhouette — a logo', () => {
    const layout = analyzeLayout(image((x, y) => {
      if (!inSquare(x, y, 4, 60)) return CLEAR;
      return inSquare(x, y, 26, 38) ? CLEAR : [255, 255, 255, 255];
    }), SIZE)!;
    expect(layout.kind).toBe('logo');
    // White on a pale plate can't be seen — the dark one in both themes
    expect(layout.plateFor).toEqual({light: 'dark', dark: 'dark'});
  });

  it('a shape with a gradient background (Instagram) — app, shown whole', () => {
    const layout = analyzeLayout(image((x, y) => (inSquare(x, y, 2, 62) ? [200 + x, 40 + y * 2, 120 + x, 255] : CLEAR)), SIZE)!;
    expect(layout.kind).toBe('app');
  });

  it('a black logo on transparency (GitHub) — on a pale plate in both themes', () => {
    const cat = (x: number, y: number) => inCircle(x, y, 20) && !inSquare(x, y, 28, 36);
    const layout = analyzeLayout(image((x, y) => (cat(x, y) && (x + y) % 5 !== 0 ? [24, 23, 23, 255] : CLEAR)), SIZE)!;
    expect(layout.kind).toBe('logo');
    expect(layout.plateFor.light).toBe('light');
    // Black on a dark plate isn't seen: the pale plate is kept in the dark theme too
    expect(layout.plateFor.dark).toBe('light');
    // No colour of its own — its plates are grey
    expect(layout.tinted).toBe(false);
  });

  it('a small logo with wide margins: the visible part is found, the margins aren\'t', () => {
    const layout = analyzeLayout(image((x, y) => (inSquare(x, y, 20, 44) && (x * y) % 7 !== 0 ? [30, 160, 90, 255] : CLEAR)), SIZE)!;
    expect(layout.kind).toBe('logo');
    expect(layout.box).toEqual({x: 20 / 64, y: 20 / 64, w: 24 / 64, h: 24 / 64});
    expect(layout.tinted).toBe(true);
    // A green logo: its plates are shades of green
    const [, g] = [1, 3, 5].map((i) => parseInt(layout.plates.light.slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(parseInt(layout.plates.light.slice(1, 3), 16));
  });

  it('a picture with many colours, opaque all over — a photo', () => {
    const layout = analyzeLayout(image((x, y) => [(x * 37 + y * 11) % 256, (x * 13 + y * 41) % 256, (x * y) % 256, 255]), SIZE)!;
    expect(layout.kind).toBe('photo');
  });

  it('a white square with a drawing (VK) — seamless with a light edge', () => {
    const layout = analyzeLayout(image((x, y) => (inSquare(x, y, 16, 48) ? [0, 119, 255, 255] : [255, 255, 255, 255])), SIZE)!;
    expect(layout.kind).toBe('seamless');
    expect(layout.lightEdge).toBe(true);
  });

  it('a white square with a black drawing (Wikipedia) — the drawing is not seen on a dark tile', () => {
    const layout = analyzeLayout(image((x, y) => (inSquare(x, y, 16, 48) ? [20, 20, 20, 255] : [255, 255, 255, 255])), SIZE)!;
    expect(layout.kind).toBe('seamless');
    expect(layout.darkDrawing).toBe(true);
    const vk = analyzeLayout(image((x, y) => (inSquare(x, y, 16, 48) ? [0, 119, 255, 255] : [255, 255, 255, 255])), SIZE)!;
    expect(vk.darkDrawing).toBe(false);
  });

  it('nothing visible — no layout', () => {
    expect(analyzeLayout(image(() => CLEAR), SIZE)).toBeNull();
  });
});

describe('cutOutBackground', () => {
  const pixel = (data: Uint8ClampedArray, x: number, y: number) => [...data.slice((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 4)];

  it('the white background goes, the drawing and white inside it stay', () => {
    // A blue ring on white, white inside the ring
    const data = image((x, y) => {
      const r = Math.hypot(x - 31.5, y - 31.5);
      return r >= 12 && r <= 20 ? [0, 119, 255, 255] : [255, 255, 255, 255];
    });
    cutOutBackground(data, SIZE, SIZE, '#ffffff');
    expect(pixel(data, 2, 2)[3]).toBe(0);
    expect(pixel(data, 31, 15)).toEqual([0, 119, 255, 255]);
    expect(pixel(data, 31, 31)).toEqual([255, 255, 255, 255]);
  });

  it('a soft border becomes the drawing colour, partly transparent — no light fringe', () => {
    // Half blue, half white: what anti-aliasing leaves at a border
    const data = image((x) => (x < 32 ? [0, 119, 255, 255] : x === 32 ? [128, 187, 255, 255] : [255, 255, 255, 255]));
    cutOutBackground(data, SIZE, SIZE, '#ffffff');
    const [r, g, b, a] = pixel(data, 32, 10);
    expect(Math.max(Math.abs(r - 0), Math.abs(g - 119), Math.abs(b - 255))).toBeLessThanOrEqual(2);
    expect(a).toBeGreaterThan(110);
    expect(a).toBeLessThan(145);
  });
});
