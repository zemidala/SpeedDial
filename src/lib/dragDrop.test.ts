import {describe, expect, it} from 'vitest';
import {dropIndex, gapAt, insertAt, moveId} from './dragDrop.svelte';

/** What chrome.bookmarks.move does: the index is the position before the bookmark is removed from the old place */
function applyMove(list: string[], id: string, index: number): string[] {
  const oldIndex = list.indexOf(id);
  const result = list.filter((item) => item !== id);
  result.splice(index > oldIndex ? index - 1 : index, 0, id);
  return result;
}

describe('moveId', () => {
  it('moves an item into place', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('gapAt', () => {
  // Two rows of three 100×80 cells with 20 gaps
  const cell = (column: number, row: number) => ({
    left: column * 120,
    right: column * 120 + 100,
    top: row * 100,
    bottom: row * 100 + 80,
  });
  const slots = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1)];

  it.each([
    [110, 40, {slot: 1, side: 'before'}], // Between the first and second cell of the first row
    [230, 40, {slot: 2, side: 'before'}],
    [-10, 140, {slot: 3, side: 'before'}], // Left of the second row
    [360, 40, {slot: 2, side: 'after'}], // Right of the last cell of the row
    [240, 140, {slot: 4, side: 'after'}], // The second row is shorter — right of its last cell
  ] as const)('pointer %i, %i → %j', (x, y, expected) => {
    expect(gapAt(slots, x, y)).toEqual(expected);
  });

  it('over a cell and between rows — null', () => {
    expect(gapAt(slots, 50, 40)).toBeNull();
    expect(gapAt(slots, 50, 90)).toBeNull();
  });
});

describe('insertAt', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('inserts before or after the neighbour', () => {
    expect(insertAt(ids, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd']);
    expect(insertAt(ids, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
    expect(insertAt(ids, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c']);
  });

  it('the gap next to the tile itself changes nothing — null', () => {
    expect(insertAt(ids, 'b', 'b', 'before')).toBeNull();
    expect(insertAt(ids, 'b', 'c', 'before')).toBeNull();
    expect(insertAt(ids, 'b', 'a', 'after')).toBeNull();
  });
});

describe('dropIndex', () => {
  const current = ['a', 'b', 'c', 'd'];

  it.each([
    [['b', 'a', 'c', 'd'], 'a'],
    [['b', 'c', 'd', 'a'], 'a'],
    [['d', 'a', 'b', 'c'], 'd'],
    [['a', 'c', 'b', 'd'], 'c'],
  ])('the browser gets the shown order %j', (preview, id) => {
    const index = dropIndex(current, preview, id)!;
    expect(applyMove(current, id, index)).toEqual(preview);
  });

  it('without moving — null', () => {
    expect(dropIndex(current, current, 'b')).toBeNull();
  });

  it('the list changed while dragging: computed against the current one', () => {
    // While dragging, bookmark "b" was moved to another folder — it's not in the current list
    const fresh = ['a', 'c', 'd'];
    const preview = ['a', 'b', 'd', 'c'];
    const index = dropIndex(fresh, preview, 'd')!;
    expect(applyMove(fresh, 'd', index)).toEqual(['a', 'd', 'c']);
  });
});
