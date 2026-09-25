import {describe, expect, it} from 'vitest';
import {analyzePixels, hashColor, meanDifference, parseHex, readableTextColor} from './color';

type Rgba = [number, number, number, number];

/** Картинка size×size, цвет каждого пикселя задаёт функция */
function image(size: number, pixel: (x: number, y: number) => Rgba): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data.set(pixel(x, y), (y * size + x) * 4);
  }
  return data;
}

describe('analyzePixels', () => {
  it('находит цвет сплошной иконки и считает её полноразмерной', () => {
    const result = analyzePixels(image(8, () => [220, 30, 40, 255]), 8, 8);
    expect(result).toEqual({color: '#dc1e28', edgeColor: '#dc1e28', fullBleed: true});
  });

  it('берёт цвет логотипа, а не белого фона; цвет краёв — фон', () => {
    // Белый фон, синий квадрат в центре занимает четверть площади
    const data = image(8, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [20, 90, 200, 255] : [255, 255, 255, 255]));
    expect(analyzePixels(data, 8, 8)).toMatchObject({color: '#145ac8', edgeColor: '#ffffff'});
  });

  it('прозрачные углы — иконка без своего фона', () => {
    const data = image(8, (x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [0, 150, 0, 255] : [0, 0, 0, 0]));
    expect(analyzePixels(data, 8, 8)).toEqual({color: '#009600', edgeColor: null, fullBleed: false});
  });

  it('монохромная чёрная иконка — чёрный цвет', () => {
    const data = image(8, (x) => (x < 4 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    expect(analyzePixels(data, 8, 8).color).toBe('#000000');
  });

  it('полностью прозрачная картинка — цвета нет', () => {
    expect(analyzePixels(image(4, () => [0, 0, 0, 0]), 4, 4).color).toBeNull();
  });
});

describe('meanDifference', () => {
  it('0 для одинаковых картинок и большое значение для разных', () => {
    const a = image(4, () => [10, 20, 30, 255]);
    expect(meanDifference(a, a.slice())).toBe(0);
    expect(meanDifference(a, image(4, () => [250, 20, 30, 255]))).toBe(60);
  });

  it('картинки разного размера считаются разными', () => {
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
  ])('на %s — %s', (background, expected) => {
    expect(readableTextColor(background)).toBe(expected);
  });
});

describe('parseHex', () => {
  it('разбирает #rrggbb и отклоняет остальное', () => {
    expect(parseHex('#0a0B0c')).toEqual([10, 11, 12]);
    expect(parseHex('red')).toBeNull();
    expect(parseHex('#fff')).toBeNull();
  });
});

describe('hashColor', () => {
  it('стабилен и различается для разных строк', () => {
    expect(hashColor('github.com')).toBe(hashColor('github.com'));
    expect(hashColor('github.com')).not.toBe(hashColor('youtube.com'));
    expect(hashColor('github.com')).toMatch(/^hsl\(\d+ 55% 48%\)$/);
  });
});
