import {describe, expect, it} from 'vitest';
import {type Box, isGridKey, neighbourIndex} from './gridKeyboard';

/** A grid of count 100×80 tiles with a 10 gap, columns per row */
function grid(count: number, columns: number): Box[] {
  return Array.from({length: count}, (_, i) => ({
    left: (i % columns) * 110,
    top: Math.floor(i / columns) * 90,
    width: 100,
    height: 80,
  }));
}

describe('neighbourIndex', () => {
  const boxes = grid(10, 4); // Rows: 0–3, 4–7, 8–9

  it('left and right — in order, wrapping between rows', () => {
    expect(neighbourIndex(boxes, 3, 'ArrowRight')).toBe(4);
    expect(neighbourIndex(boxes, 4, 'ArrowLeft')).toBe(3);
    expect(neighbourIndex(boxes, 0, 'ArrowLeft')).toBeNull();
    expect(neighbourIndex(boxes, 9, 'ArrowRight')).toBeNull();
  });

  it('up and down — the same column', () => {
    expect(neighbourIndex(boxes, 1, 'ArrowDown')).toBe(5);
    expect(neighbourIndex(boxes, 5, 'ArrowDown')).toBe(9);
    expect(neighbourIndex(boxes, 9, 'ArrowUp')).toBe(5);
    expect(neighbourIndex(boxes, 2, 'ArrowUp')).toBeNull();
    expect(neighbourIndex(boxes, 8, 'ArrowDown')).toBeNull();
  });

  it('into a partial last row — the nearest tile', () => {
    expect(neighbourIndex(boxes, 7, 'ArrowDown')).toBe(9);
    expect(neighbourIndex(boxes, 6, 'ArrowDown')).toBe(9);
  });

  it('Home and End', () => {
    expect(neighbourIndex(boxes, 5, 'Home')).toBe(0);
    expect(neighbourIndex(boxes, 5, 'End')).toBe(9);
    expect(neighbourIndex([], 0, 'End')).toBeNull();
  });

  it('tiles of different heights in one row count as one row', () => {
    const uneven = grid(8, 4).map((box, i) => (i === 1 ? {...box, top: box.top + 6, height: 70} : box));
    expect(neighbourIndex(uneven, 0, 'ArrowDown')).toBe(4);
    expect(neighbourIndex(uneven, 5, 'ArrowUp')).toBe(1);
  });

  it('isGridKey', () => {
    expect(isGridKey('ArrowUp')).toBe(true);
    expect(isGridKey('Enter')).toBe(false);
  });
});
