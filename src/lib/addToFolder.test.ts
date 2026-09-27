import {describe, expect, it} from 'vitest';
import {addRecentFolder, menuFolders} from './addToFolder';

const tree = {
  id: '0',
  title: '',
  children: [
    {
      id: '1',
      title: 'Bookmarks bar',
      children: [
        {id: '10', title: 'Games', children: [{id: '100', title: 'Old games', children: []}]},
        {id: '11', title: 'site', url: 'https://example.com/'},
        {id: '12', title: 'Work', children: []},
      ],
    },
    {id: '2', title: 'Other bookmarks', children: [{id: '20', title: 'Archive', children: []}]},
  ],
};

describe('menuFolders', () => {
  it('the bar itself, then the folders right in it (not the bookmarks, not deeper ones)', () => {
    expect(menuFolders(tree, '1', []).bar).toEqual([
      {id: '1', title: 'Bookmarks bar'},
      {id: '10', title: 'Games'},
      {id: '12', title: 'Work'},
    ]);
  });

  it('recent folders that still exist, from anywhere in the tree, with their current names', () => {
    expect(menuFolders(tree, '1', ['100', '999', '20']).recent).toEqual([
      {id: '100', title: 'Old games'},
      {id: '20', title: 'Archive'},
    ]);
  });

  it('limits the bar folders; no bar — nothing from it', () => {
    expect(menuFolders(tree, '1', [], 1).bar.map((folder) => folder.id)).toEqual(['1', '10']);
    expect(menuFolders(tree, null, []).bar).toEqual([]);
  });
});

describe('addRecentFolder', () => {
  it('puts the folder on top without repeats and keeps no more than the limit', () => {
    expect(addRecentFolder(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
    expect(addRecentFolder(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
    expect(addRecentFolder(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});
