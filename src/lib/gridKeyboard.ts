// Moving focus across the tile grid with arrow keys. No DOM: the input is the tiles' rectangles in order

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
 * Index of the tile focus moves to, or null if there's nowhere to go.
 * Left and right — neighbours in order (wrapping to the next row). Up and down — the nearest row
 * in that direction and the tile in it closest horizontally: the last row may be partial
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
  // Tiles in one row may differ in height, so a row is detected by the top edge with a tolerance
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
