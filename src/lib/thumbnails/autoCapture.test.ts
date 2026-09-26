import {describe, expect, it} from 'vitest';
import {indexBookmarks, needsScreenshot, pageKey, STALE_AFTER} from './autoCapture';
import type {StoredThumbnail} from './storage';

describe('pageKey', () => {
  it('ignores the scheme, "www.", trailing slashes and anchors', () => {
    const key = pageKey('https://example.com/');
    expect(pageKey('http://www.example.com')).toBe(key);
    expect(pageKey('https://example.com/#top')).toBe(key);
    expect(pageKey('https://example.com/docs/')).toBe(pageKey('https://example.com/docs'));
  });

  it('keeps the query, the port and the path', () => {
    expect(pageKey('https://example.com/?q=1')).not.toBe(pageKey('https://example.com/'));
    expect(pageKey('https://example.com:8080/')).not.toBe(pageKey('https://example.com/'));
    expect(pageKey('https://example.com/a')).not.toBe(pageKey('https://example.com/b'));
  });

  it('is null for anything but web pages', () => {
    expect(pageKey('chrome://settings/')).toBeNull();
    expect(pageKey('javascript:void(0)')).toBeNull();
    expect(pageKey('not a url')).toBeNull();
  });
});

describe('indexBookmarks', () => {
  it('collects bookmarks of the same page from all folders', () => {
    const index = indexBookmarks([{
      id: '0',
      title: '',
      syncing: false,
      children: [
        {id: '1', title: 'A', url: 'https://example.com/', syncing: false},
        {id: '2', title: 'Folder', syncing: false, children: [
          {id: '3', title: 'B', url: 'http://www.example.com', syncing: false},
          {id: '4', title: 'C', url: 'https://other.example/', syncing: false},
        ]},
        {id: '5', title: 'Script', url: 'javascript:alert(1)', syncing: false},
      ],
    }]);
    expect(index.get(pageKey('https://example.com/')!)).toEqual(['1', '3']);
    expect(index.get(pageKey('https://other.example/')!)).toEqual(['4']);
    expect(index.size).toBe(2);
  });
});

describe('needsScreenshot', () => {
  const now = Date.now();
  const thumbnail = (source: StoredThumbnail['source'], age: number): StoredThumbnail =>
    ({blob: new Blob(), source, updatedAt: now - age});

  it('takes one only for a bookmark without a thumbnail in the "missing" mode', () => {
    expect(needsScreenshot(undefined, 'missing', now)).toBe(true);
    expect(needsScreenshot(thumbnail('capture', STALE_AFTER * 2), 'missing', now)).toBe(false);
  });

  it('refreshes old screenshots in the "stale" mode, but never custom images', () => {
    expect(needsScreenshot(thumbnail('capture', STALE_AFTER + 1), 'stale', now)).toBe(true);
    expect(needsScreenshot(thumbnail('capture', STALE_AFTER - 1000), 'stale', now)).toBe(false);
    expect(needsScreenshot(thumbnail('custom', STALE_AFTER * 10), 'stale', now)).toBe(false);
  });

  it('does nothing when turned off', () => {
    expect(needsScreenshot(undefined, 'off', now)).toBe(false);
  });
});
