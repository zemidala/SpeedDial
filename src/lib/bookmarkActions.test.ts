import {describe, expect, it} from 'vitest';
import {groupOrder, moveSteps} from './bookmarkActions';

/** Как chrome.bookmarks.move: index — место до того, как закладку уберут со старого места */
function applyMoves(ids: string[], steps: Array<{id: string; index: number}>): string[] {
  const order = [...ids];
  for (const {id, index} of steps) {
    const from = order.indexOf(id);
    order.splice(from, 1);
    order.splice(from < index ? index - 1 : index, 0, id);
  }
  return order;
}

describe('moveSteps', () => {
  const current = ['a', 'b', 'c', 'd', 'e', 'f'];
  const cases: Array<[string, string[], string[]]> = [
    ['группа вперёд', ['b', 'e', 'a', 'c', 'd', 'f'], ['b', 'e']],
    ['группа назад', ['a', 'c', 'd', 'f', 'b', 'e'], ['b', 'e']],
    ['группа в середину', ['a', 'c', 'b', 'e', 'd', 'f'], ['b', 'e']],
    ['разрозненные в конец', ['b', 'd', 'f', 'a', 'c', 'e'], ['a', 'c', 'e']],
    ['разрозненные в начало', ['d', 'f', 'a', 'b', 'c', 'e'], ['d', 'f']],
    ['одна закладка', ['a', 'b', 'd', 'e', 'c', 'f'], ['c']],
  ];

  for (const [name, final, moving] of cases) {
    it(name, () => {
      const steps = moveSteps(current, final, new Set(moving));
      expect(applyMoves(current, steps)).toEqual(final);
      // Двигаются только выбранные
      expect(steps.every((step) => moving.includes(step.id))).toBe(true);
    });
  }

  it('ничего не меняется — ходов нет', () => {
    expect(moveSteps(current, current, new Set(['b', 'c']))).toEqual([]);
  });
});

describe('groupOrder', () => {
  it('группа встаёт блоком на место перетаскиваемой, в своём порядке', () => {
    // Тянули «d» в начало; выделены b, d, e
    expect(groupOrder(['d', 'a', 'b', 'c', 'e', 'f'], 'd', ['b', 'd', 'e'])).toEqual(['b', 'd', 'e', 'a', 'c', 'f']);
    // Тянули «b» в конец
    expect(groupOrder(['a', 'c', 'd', 'e', 'f', 'b'], 'b', ['b', 'd'])).toEqual(['a', 'c', 'e', 'f', 'b', 'd']);
  });
});
