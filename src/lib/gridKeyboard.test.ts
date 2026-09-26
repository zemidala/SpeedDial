import {describe, expect, it} from 'vitest';
import {type Box, isGridKey, neighbourIndex} from './gridKeyboard';

/** Сетка из count плиток 100×80 с промежутком 10 по columns в ряд */
function grid(count: number, columns: number): Box[] {
  return Array.from({length: count}, (_, i) => ({
    left: (i % columns) * 110,
    top: Math.floor(i / columns) * 90,
    width: 100,
    height: 80,
  }));
}

describe('neighbourIndex', () => {
  const boxes = grid(10, 4); // Ряды: 0–3, 4–7, 8–9

  it('влево и вправо — по порядку, с переходом между рядами', () => {
    expect(neighbourIndex(boxes, 3, 'ArrowRight')).toBe(4);
    expect(neighbourIndex(boxes, 4, 'ArrowLeft')).toBe(3);
    expect(neighbourIndex(boxes, 0, 'ArrowLeft')).toBeNull();
    expect(neighbourIndex(boxes, 9, 'ArrowRight')).toBeNull();
  });

  it('вверх и вниз — та же колонка', () => {
    expect(neighbourIndex(boxes, 1, 'ArrowDown')).toBe(5);
    expect(neighbourIndex(boxes, 5, 'ArrowDown')).toBe(9);
    expect(neighbourIndex(boxes, 9, 'ArrowUp')).toBe(5);
    expect(neighbourIndex(boxes, 2, 'ArrowUp')).toBeNull();
    expect(neighbourIndex(boxes, 8, 'ArrowDown')).toBeNull();
  });

  it('в неполный последний ряд — на ближайшую плитку', () => {
    expect(neighbourIndex(boxes, 7, 'ArrowDown')).toBe(9);
    expect(neighbourIndex(boxes, 6, 'ArrowDown')).toBe(9);
  });

  it('Home и End', () => {
    expect(neighbourIndex(boxes, 5, 'Home')).toBe(0);
    expect(neighbourIndex(boxes, 5, 'End')).toBe(9);
    expect(neighbourIndex([], 0, 'End')).toBeNull();
  });

  it('плитки разной высоты в одном ряду считаются одним рядом', () => {
    const uneven = grid(8, 4).map((box, i) => (i === 1 ? {...box, top: box.top + 6, height: 70} : box));
    expect(neighbourIndex(uneven, 0, 'ArrowDown')).toBe(4);
    expect(neighbourIndex(uneven, 5, 'ArrowUp')).toBe(1);
  });

  it('isGridKey', () => {
    expect(isGridKey('ArrowUp')).toBe(true);
    expect(isGridKey('Enter')).toBe(false);
  });
});
