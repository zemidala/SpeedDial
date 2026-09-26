// Automatic thumbnails: which bookmarks a visited page belongs to and whether they need a new screenshot.
// No Svelte and no chrome.* — pure helpers for the service worker, covered by unit tests
import type {AutoCapture} from '../settings/schema';
import type {StoredThumbnail} from './storage';

/** A screenshot taken automatically is refreshed on a visit once it's older than this */
export const STALE_AFTER = 7 * 24 * 60 * 60 * 1000;

/**
 * Key for matching a visited page with bookmarks: the same page opened with or without "www.", over http or https,
 * with a trailing slash or an #anchor still counts as the bookmarked one. null — not a web page
 */
export function pageKey(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const host = parsed.host.replace(/^www\./, '');
  const path = parsed.pathname.replace(/\/+$/, '');
  return `${host}${path}${parsed.search}`;
}

/** Page key → ids of the bookmarks with that page */
export function indexBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const visit = (node: chrome.bookmarks.BookmarkTreeNode) => {
    const key = node.url ? pageKey(node.url) : null;
    if (key) index.set(key, [...index.get(key) ?? [], node.id]);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return index;
}

/** Whether a visit should take a screenshot for the bookmark. A custom image is never replaced */
export function needsScreenshot(stored: StoredThumbnail | undefined, mode: AutoCapture, now: number): boolean {
  if (mode === 'off') return false;
  if (!stored) return true;
  return mode === 'stale' && stored.source === 'capture' && now - stored.updatedAt > STALE_AFTER;
}
