import {describe, expect, it} from 'vitest';
import {defaultSelection, findDuplicates} from './duplicates';

type Node = chrome.bookmarks.BookmarkTreeNode;
const bookmark = (id: string, url: string, title = id): Node => ({id, title, url, syncing: false});
const folder = (id: string, title: string, children: Node[]): Node => ({id, title, children, syncing: false});

const tree = folder('0', '', [
  folder('1', 'Bar', [
    bookmark('10', 'https://example.com/'),
    bookmark('11', 'https://unique.example/'),
    folder('12', 'Work', [
      bookmark('13', 'http://www.example.com'),
      bookmark('14', 'https://docs.example/a'),
    ]),
  ]),
  folder('2', 'Other', [
    bookmark('20', 'https://docs.example/a/#intro'),
    bookmark('21', 'https://example.com/?page=2'),
    bookmark('22', 'https://example.com'),
  ]),
]);

describe('findDuplicates', () => {
  it('groups bookmarks of the same page in tree order with their folder paths', () => {
    const groups = findDuplicates(tree);
    expect(groups.map((group) => group.entries.map((entry) => entry.id))).toEqual([
      ['10', '13', '22'],
      ['14', '20'],
    ]);
    expect(groups[0].entries.map((entry) => entry.path)).toEqual([['Bar'], ['Bar', 'Work'], ['Other']]);
    expect(groups[0].entries[1]).toMatchObject({parentId: '12', url: 'http://www.example.com'});
  });

  it('finds nothing without copies', () => {
    expect(findDuplicates(folder('0', '', [folder('1', 'Bar', [bookmark('10', 'https://a.example/')])]))).toEqual([]);
  });
});

describe('defaultSelection', () => {
  it('keeps the first bookmark of each group', () => {
    expect([...defaultSelection(findDuplicates(tree))]).toEqual(['13', '22', '20']);
  });
});
