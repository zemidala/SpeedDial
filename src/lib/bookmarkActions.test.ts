import {describe, expect, it} from 'vitest';
import {groupOrder, moveSteps} from './bookmarkActions';

/** Like chrome.bookmarks.move: index is the position before the bookmark is removed from its old place */
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
    ['group forward', ['b', 'e', 'a', 'c', 'd', 'f'], ['b', 'e']],
    ['group backward', ['a', 'c', 'd', 'f', 'b', 'e'], ['b', 'e']],
    ['group into the middle', ['a', 'c', 'b', 'e', 'd', 'f'], ['b', 'e']],
    ['scattered to the end', ['b', 'd', 'f', 'a', 'c', 'e'], ['a', 'c', 'e']],
    ['scattered to the start', ['d', 'f', 'a', 'b', 'c', 'e'], ['d', 'f']],
    ['a single bookmark', ['a', 'b', 'd', 'e', 'c', 'f'], ['c']],
  ];

  for (const [name, final, moving] of cases) {
    it(name, () => {
      const steps = moveSteps(current, final, new Set(moving));
      expect(applyMoves(current, steps)).toEqual(final);
      // Only the chosen ones move
      expect(steps.every((step) => moving.includes(step.id))).toBe(true);
    });
  }

  it('nothing changes — no moves', () => {
    expect(moveSteps(current, current, new Set(['b', 'c']))).toEqual([]);
  });
});

describe('groupOrder', () => {
  it('the group lands as a block where the dragged tile is, in its own order', () => {
    // Dragged "d" to the start; b, d, e are selected
    expect(groupOrder(['d', 'a', 'b', 'c', 'e', 'f'], 'd', ['b', 'd', 'e'])).toEqual(['b', 'd', 'e', 'a', 'c', 'f']);
    // Dragged "b" to the end
    expect(groupOrder(['a', 'c', 'd', 'e', 'f', 'b'], 'b', ['b', 'd'])).toEqual(['a', 'c', 'e', 'f', 'b', 'd']);
  });
});
