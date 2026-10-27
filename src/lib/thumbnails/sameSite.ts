// Bookmarks of the same site — to give them all the same thumbnail. No Svelte, no chrome.* — tested on its own
import {displayHost, isWebUrl} from '../url';

/** Ids of the other bookmarks whose host is the same as this address's (with or without "www.") */
export function sameSiteBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[], url: string, exceptId: string): string[] {
  const host = isWebUrl(url) ? displayHost(url) : '';
  if (!host) return [];
  const found: string[] = [];
  const visit = (node: chrome.bookmarks.BookmarkTreeNode) => {
    if (node.url && node.id !== exceptId && isWebUrl(node.url) && displayHost(node.url) === host) found.push(node.id);
    node.children?.forEach(visit);
  };
  nodes.forEach(visit);
  return found;
}
