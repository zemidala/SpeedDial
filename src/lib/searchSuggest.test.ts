import {describe, expect, it} from 'vitest';
import type {BookmarkNode} from './bookmarks.svelte';
import {addHistoryEntry, orderResults} from './search';
import {MAX_SUGGESTIONS, parseSuggestions, suggestUrl} from './searchSuggest';

describe('suggestUrl', () => {
  it('builds each engine\'s suggestion address with the encoded query', () => {
    expect(suggestUrl('google', ' кот ', 'ru')).toBe(
      'https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&hl=ru&q=%D0%BA%D0%BE%D1%82',
    );
    expect(suggestUrl('bing', 'a&b', 'en')).toBe('https://api.bing.com/osjson.aspx?query=a%26b');
    expect(suggestUrl('duckduckgo', 'cat', 'en')).toBe('https://duckduckgo.com/ac/?type=list&q=cat');
  });

  it('a custom search address has no suggestions', () => {
    expect(suggestUrl('custom', 'cat', 'en')).toBeNull();
  });
});

describe('parseSuggestions', () => {
  it('takes the text suggestions, without repeats and the query itself', () => {
    expect(parseSuggestions(['Cat', ['cat', 'cats', 'Cats', ' cat toys ', 42, '']], 'cat')).toEqual(['cats', 'cat toys']);
  });

  it('keeps no more than the limit', () => {
    const many = Array.from({length: 20}, (_, i) => `cat ${i}`);
    expect(parseSuggestions(['cat', many], 'cat')).toHaveLength(MAX_SUGGESTIONS);
  });

  it('an unexpected answer gives nothing', () => {
    expect(parseSuggestions(null, 'cat')).toEqual([]);
    expect(parseSuggestions({results: []}, 'cat')).toEqual([]);
    expect(parseSuggestions(['cat'], 'cat')).toEqual([]);
  });
});

describe('orderResults', () => {
  const node = (id: string, url?: string) => ({id, title: id, url}) as BookmarkNode;

  it('puts folders first, keeping the order within each kind, and limits the count', () => {
    const found = [node('a', 'https://a/'), node('F1'), node('b', 'https://b/'), node('F2')];
    expect(orderResults(found).map((item) => item.id)).toEqual(['F1', 'F2', 'a', 'b']);
    expect(orderResults(found, 3).map((item) => item.id)).toEqual(['F1', 'F2', 'a']);
  });
});

describe('addHistoryEntry', () => {
  it('puts the query on top; a repeat moves up, whatever its case', () => {
    expect(addHistoryEntry(['b', 'a'], ' c ')).toEqual(['c', 'b', 'a']);
    expect(addHistoryEntry(['b', 'Svelte', 'a'], 'svelte')).toEqual(['svelte', 'b', 'a']);
  });

  it('ignores an empty query and keeps no more than the limit', () => {
    expect(addHistoryEntry(['a'], '  ')).toEqual(['a']);
    expect(addHistoryEntry(['c', 'b', 'a'], 'd', 3)).toEqual(['d', 'c', 'b']);
  });
});
