import {describe, expect, it} from 'vitest';
import {closedTabs, isVirtualFolder, isVirtualNode, MOST_VISITED_ID, RECENTLY_CLOSED_ID, toNodes} from './virtualFolders';

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
  });
});
