// "Add to folder" from the browser's context menu: which folders the submenu offers, the recently used ones,
// and adding a page or link the same way from the menu and from the "Other folder…" window. No Svelte
import {SITE_ACCESS} from './permissionSets';
import {loadSettings} from './settings/storage';
import {getHostname} from './url';

export const RECENT_FOLDERS_KEY = 'recentFolders'; // chrome.storage.local
const MAX_RECENT = 5;
/** Folders right in the bookmarks bar listed in the submenu; the rest are reached through "Other folder…" */
export const MAX_BAR_FOLDERS = 15;

export interface MenuFolder {
  id: string;
  title: string;
}

interface TreeNode {
  id: string;
  title: string;
  url?: string;
  children?: TreeNode[];
}

/** Recently used folders with this one on top, no repeats */
export function addRecentFolder(recent: readonly string[], id: string, max = MAX_RECENT): string[] {
  return [id, ...recent.filter((item) => item !== id)].slice(0, max);
}

/**
 * What the submenu offers: the recently used folders that still exist, then the bookmarks bar itself and the folders
 * right in it. Names from the tree, so a renamed folder shows its new name
 */
export function menuFolders(
  root: TreeNode,
  barId: string | null,
  recentIds: readonly string[],
  maxBarFolders = MAX_BAR_FOLDERS,
): {recent: MenuFolder[]; bar: MenuFolder[]} {
  const folders = new Map<string, TreeNode>();
  const visit = (node: TreeNode) => {
    for (const child of node.children ?? []) {
      if (child.url) continue;
      folders.set(child.id, child);
      visit(child);
    }
  };
  visit(root);

  const recent = recentIds.flatMap((id) => {
    const folder = folders.get(id);
    return folder ? [{id, title: folder.title}] : [];
  });
  const barNode = barId ? folders.get(barId) : undefined;
  const bar = barNode
    ? [
      {id: barNode.id, title: barNode.title},
      ...(barNode.children ?? []).filter((child) => !child.url).slice(0, maxBarFolders)
        .map((child) => ({id: child.id, title: child.title})),
    ]
    : [];
  return {recent, bar};
}

export async function loadRecentFolders(): Promise<string[]> {
  const saved = (await chrome.storage.local.get(RECENT_FOLDERS_KEY))[RECENT_FOLDERS_KEY];
  return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : [];
}

export interface AddRequest {
  url: string;
  title?: string;
  folderId: string;
  /** The tab the page is open in: closed afterwards if the settings say so (not for a link) */
  tabId?: number;
  isLink: boolean;
  /** Remember the folder among the recently used */
  remember: boolean;
}

/**
 * Adds the bookmark as the settings say (first or last, close the tab, a screenshot). capture — how a screenshot is
 * made from here: the service worker captures itself, a page asks the service worker
 */
export async function addFromBrowser(
  request: AddRequest,
  capture: (id: string, url: string) => Promise<void>,
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  const settings = await loadSettings();
  const bookmark = await chrome.bookmarks.create({
    parentId: request.folderId,
    index: settings.newBookmarksFirst ? 0 : undefined,
    title: request.title?.trim() || getHostname(request.url) || request.url,
    url: request.url,
  });
  if (request.remember) {
    const recent = addRecentFolder(await loadRecentFolders(), request.folderId);
    await chrome.storage.local.set({[RECENT_FOLDERS_KEY]: recent});
  }
  if (!request.isLink && settings.closeTabAfterAdd && request.tabId !== undefined) {
    await chrome.tabs.remove(request.tabId).catch(() => undefined);
  }
  if (settings.captureOnCreate && await chrome.permissions.contains(SITE_ACCESS)) {
    await capture(bookmark.id, request.url);
  }
  return bookmark;
}
