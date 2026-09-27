import {describe, expect, it} from 'vitest';
import {bookmarkStats} from './stats';

describe('bookmarkStats', () => {
  const tree = {
    id: '0',
    children: [
      {
        id: '1',
        children: [
          {id: '10', url: 'https://a.example'},
          {id: '11', children: [{id: '12', url: 'https://b.example'}, {id: '13', children: []}]},
        ],
      },
      {id: '2', children: [{id: '20', url: 'https://c.example'}]},
    ],
  };

  it('counts sites and the user’s folders, not the root and the browser’s own folders', () => {
    expect(bookmarkStats(tree, new Set())).toEqual({sites: 3, folders: 2, broken: 0});
  });

  it('counts only marks of bookmarks that still exist', () => {
    expect(bookmarkStats(tree, new Set(['12', '20', '99']))).toEqual({sites: 3, folders: 2, broken: 2});
  });
});
