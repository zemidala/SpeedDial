// All bookmarks with their folders, and finding bookmarks of the same page scattered over folders. No Svelte
import {pageKey} from './url';

export interface BookmarkEntry {
  id: string;
  parentId: string;
  title: string;
  url: string;
  /** Folder names from the top: ["Bookmarks bar", "Work"] */
  path: string[];
}

export interface DuplicateGroup {
  key: string;
  /** In tree order: the bookmarks bar first, then "Other bookmarks"… */
  entries: BookmarkEntry[];
}

/** Every bookmark of the tree in order, with the path to its folder */
export function bookmarkEntries(root: chrome.bookmarks.BookmarkTreeNode): BookmarkEntry[] {
  const entries: BookmarkEntry[] = [];
  const visit = (node: chrome.bookmarks.BookmarkTreeNode, path: string[]) => {
    for (const child of node.children ?? []) {
      if (child.url) entries.push({id: child.id, parentId: node.id, title: child.title, url: child.url, path});
      else visit(child, [...path, child.title]);
    }
  };
  visit(root, []);
  return entries;
}

/** Groups of bookmarks leading to the same page (see pageKey); bookmarks without copies aren't included */
export function findDuplicates(root: chrome.bookmarks.BookmarkTreeNode): DuplicateGroup[] {
  const groups = new Map<string, BookmarkEntry[]>();
  for (const entry of bookmarkEntries(root)) {
    const key = pageKey(entry.url) ?? entry.url;
    groups.set(key, [...groups.get(key) ?? [], entry]);
  }
  return [...groups].filter(([, entries]) => entries.length > 1).map(([key, entries]) => ({key, entries}));
}

/** What to delete by default: every copy but the first one of each group */
export function defaultSelection(groups: DuplicateGroup[]): Set<string> {
  return new Set(groups.flatMap((group) => group.entries.slice(1).map((entry) => entry.id)));
}
