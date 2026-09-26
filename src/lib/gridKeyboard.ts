// Перемещение фокуса по сетке плиток стрелками. Без DOM: на вход — прямоугольники плиток по порядку

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type GridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

const GRID_KEYS = new Set<string>(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

export function isGridKey(key: string): key is GridKey {
  return GRID_KEYS.has(key);
}

const centerX = (box: Box) => box.left + box.width / 2;

/**
 * Индекс плитки, на которую перейдёт фокус, или null, если дальше некуда.
 * Влево и вправо — соседние по порядку (с переходом на следующий ряд). Вверх и вниз — ближайший ряд
 * в этом направлении и в нём плитка, ближайшая по горизонтали: последний ряд может быть неполным
 */
export function neighbourIndex(boxes: Box[], current: number, key: GridKey): number | null {
  if (boxes.length === 0) return null;
  switch (key) {
    case 'Home':
      return 0;
    case 'End':
      return boxes.length - 1;
    case 'ArrowLeft':
      return current > 0 ? current - 1 : null;
    case 'ArrowRight':
      return current < boxes.length - 1 ? current + 1 : null;
  }

  const from = boxes[current];
  const down = key === 'ArrowDown';
  // Плитки одного ряда могут отличаться по высоте, поэтому ряд определяется по верхнему краю с допуском
  const tolerance = from.height / 2;
  const candidates = boxes
    .map((box, index) => ({box, index}))
    .filter(({box}) => (down ? box.top > from.top + tolerance : box.top < from.top - tolerance));
  if (candidates.length === 0) return null;

  const rowTop = down
    ? Math.min(...candidates.map(({box}) => box.top))
    : Math.max(...candidates.map(({box}) => box.top));
  const row = candidates.filter(({box}) => Math.abs(box.top - rowTop) <= tolerance);
  const x = centerX(from);
  row.sort((a, b) => Math.abs(centerX(a.box) - x) - Math.abs(centerX(b.box) - x));
  return row[0].index;
}
