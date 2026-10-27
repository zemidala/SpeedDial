import {describe, expect, it} from 'vitest';
import {sameSiteBookmarks} from './sameSite';

const node = (id: string, url?: string, children?: chrome.bookmarks.BookmarkTreeNode[]) =>
  ({id, title: id, url, children}) as chrome.bookmarks.BookmarkTreeNode;

describe('sameSiteBookmarks', () => {
  const tree = [node('0', undefined, [
    node('1', 'https://example.com/a'),
    node('2', 'https://www.example.com/b?x=1'),
    node('f', undefined, [
      node('3', 'http://example.com/'),
      node('4', 'https://docs.example.com/'),
    ]),
    node('5', 'https://other.org/'),
  ])];

  it('finds the other bookmarks of the host, with or without www, in subfolders too', () => {
    expect(sameSiteBookmarks(tree, 'https://example.com/a', '1')).toEqual(['2', '3']);
  });

  it('a subdomain is another site', () => {
    expect(sameSiteBookmarks(tree, 'https://docs.example.com/x', '9')).toEqual(['4']);
  });

  it('not a web address — nothing', () => {
    expect(sameSiteBookmarks(tree, 'chrome://settings', '1')).toEqual([]);
  });
});
