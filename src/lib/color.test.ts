import {describe, expect, it} from 'vitest';
import {analyzePixels, effectiveResolution, hashColor, meanDifference, parseHex, readableTextColor} from './color';

type Rgba = [number, number, number, number];

/** A size×size image; a function gives the colour of each pixel */
function image(size: number, pixel: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data.set(pixel(x, y), (y * size + x) * 4);
  }
  return data;
}

describe('analyzePixels', () => {
  it('finds the colour of a solid icon and treats it as full size', () => {
    const result = analyzePixels(image(8, () => [220, 30, 40, 255]), 8, 8);
    expect(result).toEqual({color: '#dc1e28', edgeColor: '#dc1e28', fullBleed: true, darkMonochrome: false});
  });

  it('takes the logo colour, not the white background; the edge colour is the background', () => {
    // White background, a blue square in the centre covers a quarter of the area
    const data = image(8, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [20, 90, 200, 255] : [255, 255, 255, 255]));
    expect(analyzePixels(data, 8, 8)).toMatchObject({color: '#145ac8', edgeColor: '#ffffff'});
  });

  it('transparent corners — an icon without its own background', () => {
    const data = image(8, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [0, 150, 0, 255] : [0, 0, 0, 0]));
    expect(analyzePixels(data, 8, 8)).toEqual({color: '#009600', edgeColor: null, fullBleed: false, darkMonochrome: false});
  });

  it('monochrome black icon — black, and marked dark monochrome (GitHub-like)', () => {
    const data = image(8, (x) => (x < 4 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    expect(analyzePixels(data, 8, 8)).toMatchObject({color: '#000000', darkMonochrome: true});
  });

  it('a dark logo with its own background, or a coloured one, isn\'t dark monochrome', () => {
    expect(analyzePixels(image(8, () => [30, 30, 30, 255]), 8, 8).darkMonochrome).toBe(false);
    const navy = image(8, (x) => (x < 4 ? [10, 20, 90, 255] : [0, 0, 0, 0]));
    expect(analyzePixels(navy, 8, 8).darkMonochrome).toBe(false);
  });

  it('fully transparent image — no colour', () => {
    expect(analyzePixels(image(4, () => [0, 0, 0, 0]), 4, 4).color).toBeNull();
  });
});

describe('effectiveResolution', () => {
  // "Noise": neighbouring pixels have different colours, like a real detailed image
  const noise = (x: number, y: number): Rgba => [(x * 73 + y * 151) % 256, (x * 29 + y * 97) % 256, (x * y * 13) % 256, 255];

  /** A small×small image scaled up to size×size without smoothing */
  const upscaled = (small: number, size: number) => {
    const factor = size / small;
    return image(size, (x, y) => noise(Math.floor(x / factor), Math.floor(y / factor)));
  };

  it('a real image — full size', () => {
    expect(effectiveResolution(image(64, noise), 64)).toBe(64);
  });

  it('a 16×16 favicon scaled to 64×64 — 16', () => {
    expect(effectiveResolution(upscaled(16, 64), 64)).toBe(16);
  });

  it('32×32 scaled to 256×256 — 32', () => {
    expect(effectiveResolution(upscaled(32, 256), 256)).toBe(32);
  });

  it('stays above the minimum and handles non-power-of-two sizes', () => {
    expect(effectiveResolution(upscaled(8, 64), 64)).toBe(16);
    expect(effectiveResolution(image(180, noise), 180)).toBe(180);
  });

  it('a single-colour image and a flat logo — full size', () => {
    expect(effectiveResolution(image(64, () => [10, 20, 30, 255]), 64)).toBe(64);
    // A circle on a transparent background: almost all fill, but the outline doesn't match the square grid
    const circle = image(128, (x, y) => ((x - 64) ** 2 + (y - 64) ** 2 < 45 ** 2 ? [30, 90, 200, 255] : [0, 0, 0, 0]));
    expect(effectiveResolution(circle, 128)).toBe(128);
  });

  it('transparent areas don\'t get in the way', () => {
    const data = upscaled(16, 64);
    for (let i = 3; i < data.length; i += 4 * 7) data[i] = 0; // Some pixels are transparent
    expect(effectiveResolution(data, 64)).toBe(64); // The squares are no longer single-coloured
  });
});

describe('meanDifference', () => {
  it('0 for identical images and a large value for different ones', () => {
    const a = image(4, () => [10, 20, 30, 255]);
    expect(meanDifference(a, a.slice())).toBe(0);
    expect(meanDifference(a, image(4, () => [250, 20, 30, 255]))).toBe(60);
  });

  it('images of different sizes count as different', () => {
    expect(meanDifference(image(2, () => [0, 0, 0, 0]), image(4, () => [0, 0, 0, 0]))).toBe(255);
  });
});

describe('readableTextColor', () => {
  it.each([
    ['#ffffff', '#1f2328'],
    ['#e6f2ff', '#1f2328'],
    ['#ffd700', '#1f2328'],
    ['#000000', '#f0f2f4'],
    ['#262a31', '#f0f2f4'],
    ['#0066cc', '#f0f2f4'],
  ])('on %s — %s', (background, expected) => {
    expect(readableTextColor(background)).toBe(expected);
  });
});

describe('parseHex', () => {
  it('parses #rrggbb and rejects everything else', () => {
    expect(parseHex('#0a0B0c')).toEqual([10, 11, 12]);
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
  });
});

describe('hashColor', () => {
  it('is stable and differs for different strings', () => {
    expect(hashColor('github.com')).toBe(hashColor('github.com'));
    expect(hashColor('github.com')).not.toBe(hashColor('youtube.com'));
    expect(hashColor('github.com')).toMatch(/^hsl\(\d+ 55% 48%\)$/);
  });
});
