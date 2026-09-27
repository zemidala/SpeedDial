import {describe, expect, it} from 'vitest';
import {
  closedTabs,
  hideKey,
  isHidden,
  isVirtualFolder,
  isVirtualNode,
  MOST_VISITED_ID,
  RECENTLY_CLOSED_ID,
  toNodes,
} from './virtualFolders';

describe('virtual folders', () => {
  it('recognises virtual folders and their items', () => {
    expect(isVirtualFolder(MOST_VISITED_ID)).toBe(true);
    expect(isVirtualFolder('1')).toBe(false);
    expect(isVirtualFolder(undefined)).toBe(false);
    expect(isVirtualNode({id: 'most-visited:0', parentId: MOST_VISITED_ID})).toBe(true);
    expect(isVirtualNode({id: RECENTLY_CLOSED_ID, parentId: '0'})).toBe(true);
    expect(isVirtualNode({id: '12', parentId: '1'})).toBe(false);
  });

  it('turns links into read-only nodes: web pages only, no duplicates, title falls back to the URL', () => {
    expect(toNodes(MOST_VISITED_ID, [
      {title: 'Alpha', url: 'https://alpha.example/'},
      {title: 'Settings', url: 'chrome://settings/'},
      {title: 'Alpha again', url: 'https://alpha.example/'},
      {title: '', url: 'https://beta.example/'},
    ])).toEqual([
      {id: 'most-visited:0', parentId: MOST_VISITED_ID, index: 0, title: 'Alpha', url: 'https://alpha.example/', syncing: false},
      {id: 'most-visited:1', parentId: MOST_VISITED_ID, index: 1, title: 'https://beta.example/', url: 'https://beta.example/', syncing: false},
    ]);
  });

  it('a closed window contributes its tabs', () => {
    const sessions = [
      {lastModified: 2, tab: {title: 'One', url: 'https://one.example/'}},
      {lastModified: 1, window: {tabs: [{title: 'Two', url: 'https://two.example/'}, {title: 'Three', url: 'https://three.example/'}]}},
    ] as chrome.sessions.Session[];
    expect(closedTabs(sessions).map((tab) => tab.title)).toEqual(['One', 'Two', 'Three']);
    // Closing time in ms — the browser gives seconds
    expect(closedTabs(sessions).map((tab) => tab.closedAt)).toEqual([2000, 1000, 1000]);
  });
});

describe('hidden shelf items', () => {
  const visited = toNodes(MOST_VISITED_ID, [{title: 'A', url: 'https://a.example/'}, {title: 'B', url: 'https://b.example/'}]);
  const closed = toNodes(RECENTLY_CLOSED_ID, [
    {title: 'A', url: 'https://a.example/', closedAt: 3000},
    {title: 'B', url: 'https://b.example/', closedAt: 1000},
  ]);

  it('a most visited site is hidden by its address', () => {
    expect(hideKey(visited[0])).toBe('https://a.example/');
    expect(visited.map((node) => isHidden(node, {keys: ['https://a.example/']}))).toEqual([true, false]);
  });

  it('a closed tab is hidden by address and closing time: the same page closed again shows up', () => {
    const hidden = {keys: [hideKey(closed[0])]};
    expect(isHidden(closed[0], hidden)).toBe(true);
    const closedAgain = toNodes(RECENTLY_CLOSED_ID, [{title: 'A', url: 'https://a.example/', closedAt: 9000}])[0];
    expect(isHidden(closedAgain, hidden)).toBe(false);
  });

  it('clearing recently closed hides everything closed up to that moment', () => {
    const hidden = {keys: [], clearedAt: 2000};
    expect(closed.map((node) => isHidden(node, hidden))).toEqual([false, true]);
    expect(isHidden(closed[0], undefined)).toBe(false);
  });
});
