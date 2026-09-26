import {describe, expect, it} from 'vitest';
import {dropIndex, gapAt, insertAt, moveId} from './dragDrop.svelte';

/** Что сделает chrome.bookmarks.move: индекс — место до того, как закладку уберут со старого */
function applyMove(list: string[], id: string, index: number): string[] {
  const oldIndex = list.indexOf(id);
  const result = list.filter((item) => item !== id);
  result.splice(index > oldIndex ? index - 1 : index, 0, id);
  return result;
}

describe('moveId', () => {
  it('переставляет элемент на место', () => {
    expect(moveId(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
    expect(moveId(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b']);
  });
});

describe('gapAt', () => {
  // Два ряда по три ячейки 100×80 с промежутками 20
  const cell = (column: number, row: number) => ({
    left: column * 120,
    right: column * 120 + 100,
    top: row * 100,
    bottom: row * 100 + 80,
  });
  const slots = [cell(0, 0), cell(1, 0), cell(2, 0), cell(0, 1), cell(1, 1)];

  it.each([
    [110, 40, {slot: 1, side: 'before'}], // Между первой и второй ячейкой первого ряда
    [230, 40, {slot: 2, side: 'before'}],
    [-10, 140, {slot: 3, side: 'before'}], // Слева от второго ряда
    [360, 40, {slot: 2, side: 'after'}], // Справа от последней ячейки ряда
    [240, 140, {slot: 4, side: 'after'}], // Второй ряд короче — справа от его последней ячейки
  ] as const)('курсор %i, %i → %j', (x, y, expected) => {
    expect(gapAt(slots, x, y)).toEqual(expected);
  });

  it('над ячейкой и между рядами — null', () => {
    expect(gapAt(slots, 50, 40)).toBeNull();
    expect(gapAt(slots, 50, 90)).toBeNull();
  });
});

describe('insertAt', () => {
  const ids = ['a', 'b', 'c', 'd'];

  it('вставляет перед или после соседа', () => {
    expect(insertAt(ids, 'a', 'c', 'before')).toEqual(['b', 'a', 'c', 'd']);
    expect(insertAt(ids, 'a', 'd', 'after')).toEqual(['b', 'c', 'd', 'a']);
    expect(insertAt(ids, 'd', 'a', 'before')).toEqual(['d', 'a', 'b', 'c']);
  });

  it('промежуток рядом с самой плиткой ничего не меняет — null', () => {
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
  ])('браузер получает показанный порядок %j', (preview, id) => {
    const index = dropIndex(current, preview, id)!;
    expect(applyMove(current, id, index)).toEqual(preview);
  });

  it('без перемещения — null', () => {
    expect(dropIndex(current, current, 'b')).toBeNull();
  });

  it('список обновился, пока тянули плитку: считается по актуальному', () => {
    // Во время перетаскивания закладку «b» перенесли в другую папку — её нет в актуальном списке
    const fresh = ['a', 'c', 'd'];
    const preview = ['a', 'b', 'd', 'c'];
    const index = dropIndex(fresh, preview, 'd')!;
    expect(applyMove(fresh, 'd', index)).toEqual(['a', 'd', 'c']);
  });
});
