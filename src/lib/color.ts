// Работа с цветом: основной цвет иконки, контрастный текст, цвет-заглушка по строке

export interface PixelAnalysis {
  /** Основной цвет картинки (#rrggbb) или null, если непрозрачных пикселей нет */
  color: string | null;
  /** Средний цвет по краям; null, если края прозрачные. Им заливают область вокруг иконки без шва */
  edgeColor: string | null;
  /** Углы непрозрачные — у иконки свой фон, её можно растянуть на всю подложку */
  fullBleed: boolean;
}

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

export function parseHex(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Анализ RGBA-пикселей (как в ImageData.data) */
export function analyzePixels(data: Uint8ClampedArray, width: number, height: number): PixelAnalysis {
  // Группируем похожие цвета (по 4 бита на канал) и берём самую «весомую» группу.
  // Насыщенные цвета весят больше: у логотипа важнее фирменный цвет, чем белый фон.
  const buckets = new Map<number, {weight: number; r: number; g: number; b: number; count: number}>();
  const neutral = {r: 0, g: 0, b: 0, count: 0};

  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 200) continue;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    // Почти белые и почти чёрные пиксели учитываем отдельно — на случай монохромной иконки
    if (min > 235 || max < 25) {
      neutral.r += r;
      neutral.g += g;
      neutral.b += b;
      neutral.count++;
      continue;
    }

    const saturation = max === 0 ? 0 : (max - min) / max;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? {weight: 0, r: 0, g: 0, b: 0, count: 0};
    bucket.weight += 1 + saturation * 2;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    bucket.count++;
    buckets.set(key, bucket);
  }

  let best: {r: number; g: number; b: number; count: number} | null = null;
  let bestWeight = 0;
  for (const bucket of buckets.values()) {
    if (bucket.weight > bestWeight) {
      best = bucket;
      bestWeight = bucket.weight;
    }
  }
  best ??= neutral.count > 0 ? neutral : null;

  const color = best ? toHex(best.r / best.count, best.g / best.count, best.b / best.count) : null;
  return {color, edgeColor: averageEdgeColor(data, width, height), fullBleed: hasOpaqueCorners(data, width, height)};
}

function averageEdgeColor(data: Uint8ClampedArray, width: number, height: number): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let opaque = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x !== 0 && y !== 0 && x !== width - 1 && y !== height - 1) continue;
      const i = (y * width + x) * 4;
      total++;
      if (data[i + 3] < 200) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      opaque++;
    }
  }
  // Если больше половины края прозрачно, единого фона у иконки нет
  return opaque > total / 2 ? toHex(r / opaque, g / opaque, b / opaque) : null;
}

function hasOpaqueCorners(data: Uint8ClampedArray, width: number, height: number): boolean {
  if (width < 2 || height < 2) return false;
  const corners: Array<[number, number]> = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  return corners.every(([x, y]) => data[(y * width + x) * 4 + 3] > 245);
}

/** Средняя разница между двумя картинками одинакового размера (0–255) */
export function meanDifference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length !== b.length || a.length === 0) return 255;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

/** Относительная яркость по WCAG */
function luminance([r, g, b]: [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** Цвет текста, читаемый на заданном фоне */
export function readableTextColor(background: string): string {
  const rgb = parseHex(background);
  if (!rgb) return '#1f2328';
  // Порог, при котором контраст с белым и чёрным текстом одинаков
  return luminance(rgb) > 0.179 ? '#1f2328' : '#f0f2f4';
}

/** Стабильный приятный цвет по строке — для заглушки с буквой */
export function hashColor(text: string): string {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.codePointAt(0)!) | 0;
  return `hsl(${Math.abs(hash) % 360} 55% 48%)`;
}
