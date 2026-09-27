// Virtual folders: lists from the browser shown like bookmark folders — the most visited sites (topSites)
// and recently closed tabs (sessions). Read-only: they can be opened and added to bookmarks, not edited
import type {BookmarkNode} from './bookmarks.svelte';
import {isWebUrl} from './url';

export const MOST_VISITED_ID = 'most-visited';
export const RECENTLY_CLOSED_ID = 'recently-closed';
export const VIRTUAL_FOLDER_IDS = [MOST_VISITED_ID, RECENTLY_CLOSED_ID] as const;
export type VirtualFolderId = (typeof VIRTUAL_FOLDER_IDS)[number];

/**
 * Optional permissions each folder needs. Recently closed tabs also need "tabs":
 * without it the browser returns closed tabs without their URL and title
 */
export const VIRTUAL_FOLDER_PERMISSIONS: Record<VirtualFolderId, chrome.permissions.Permissions> = {
  [MOST_VISITED_ID]: {permissions: ['topSites']},
  [RECENTLY_CLOSED_ID]: {permissions: ['sessions', 'tabs']},
};

/** How many recently closed tabs to show (the browser keeps at most 25) */
const RECENTLY_CLOSED_LIMIT = 25;

export function isVirtualFolder(id: string | undefined): id is VirtualFolderId {
  return (VIRTUAL_FOLDER_IDS as readonly string[]).includes(id ?? '');
}

/** A virtual folder or an item inside one: such nodes can't be edited, moved or deleted */
export function isVirtualNode(node: Pick<BookmarkNode, 'id' | 'parentId'>): boolean {
  return isVirtualFolder(node.id) || isVirtualFolder(node.parentId);
}

/** All permissions for both folders — requested at once from the shelves invitation */
export const ALL_VIRTUAL_FOLDER_PERMISSIONS: chrome.permissions.Permissions = {
  permissions: VIRTUAL_FOLDER_IDS.flatMap((id) => VIRTUAL_FOLDER_PERMISSIONS[id].permissions ?? []),
};

interface Link {
  title: string;
  url: string;
  /** When the tab was closed, ms — only for recently closed tabs */
  closedAt?: number;
}

/**
 * Items as bookmark nodes: ids are unique within the folder, web pages only, no duplicate URLs.
 * dateAdded of a recently closed tab is when it was closed
 */
export function toNodes(folderId: VirtualFolderId, links: Link[]): BookmarkNode[] {
  const seen = new Set<string>();
  const nodes: BookmarkNode[] = [];
  for (const {title, url, closedAt} of links) {
    if (!isWebUrl(url) || seen.has(url)) continue;
    seen.add(url);
    nodes.push({
      id: `${folderId}:${nodes.length}`,
      parentId: folderId,
      index: nodes.length,
      title: title || url,
      url,
      syncing: false,
      ...(closedAt ? {dateAdded: closedAt} : {}),
    });
  }
  return nodes;
}

/** Tabs from recently closed sessions: a closed window contributes its tabs */
export function closedTabs(sessions: chrome.sessions.Session[]): Link[] {
  return sessions.flatMap((session) => {
    const tabs = session.tab ? [session.tab] : session.window?.tabs ?? [];
    // lastModified is in seconds
    return tabs.map((tab) => ({title: tab.title ?? '', url: tab.url ?? '', closedAt: session.lastModified * 1000}));
  });
}

/*
 * Hiding items: the browser doesn't let extensions remove sites from its most visited list or its recently closed
 * tabs, so the shelves hide them themselves. A most visited site is hidden by its address; a closed tab — by address
 * and closing time, so the same page closed again later shows up. "Clear" hides everything there is now: most visited
 * sites one by one, closed tabs by time — whatever gets closed afterwards shows up
 */
export interface HiddenItems {
  keys: string[];
  /** Recently closed: everything closed up to this moment (ms) is hidden */
  clearedAt?: number;
}

export type HiddenShelves = Partial<Record<VirtualFolderId, HiddenItems>>;

const HIDDEN_KEY = 'shelfHidden';

export function hideKey(node: Pick<BookmarkNode, 'url' | 'dateAdded' | 'parentId'>): string {
  return node.parentId === RECENTLY_CLOSED_ID ? `${node.url}@${node.dateAdded ?? 0}` : node.url ?? '';
}

export function isHidden(node: BookmarkNode, hidden: HiddenItems | undefined): boolean {
  if (!hidden) return false;
  if (hidden.clearedAt !== undefined && (node.dateAdded ?? 0) <= hidden.clearedAt) return true;
  return hidden.keys.includes(hideKey(node));
}

export async function loadHiddenShelves(): Promise<HiddenShelves> {
  const stored = (await chrome.storage.local.get(HIDDEN_KEY))[HIDDEN_KEY];
  return stored && typeof stored === 'object' ? stored as HiddenShelves : {};
}

async function updateHidden(id: VirtualFolderId, change: (items: HiddenItems) => HiddenItems | null): Promise<void> {
  const all = await loadHiddenShelves();
  const next = change(all[id] ?? {keys: []});
  if (next) all[id] = next;
  else delete all[id];
  await chrome.storage.local.set({[HIDDEN_KEY]: all});
}

/** Hides one item of a shelf */
export function hideItem(node: BookmarkNode & {parentId: VirtualFolderId}): Promise<void> {
  return updateHidden(node.parentId, (items) => ({...items, keys: [...new Set([...items.keys, hideKey(node)])]}));
}

/** Hides everything the shelf shows now */
export function clearShelf(id: VirtualFolderId, nodes: BookmarkNode[]): Promise<void> {
  if (id === RECENTLY_CLOSED_ID) {
    const latest = Math.max(Date.now(), ...nodes.map((node) => node.dateAdded ?? 0));
    return updateHidden(id, () => ({keys: [], clearedAt: latest}));
  }
  return updateHidden(id, (items) => ({keys: [...new Set([...items.keys, ...nodes.map(hideKey)])]}));
}

/** Shows everything hidden on the shelf again */
export function restoreShelf(id: VirtualFolderId): Promise<void> {
  return updateHidden(id, () => null);
}

export function onHiddenShelvesChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && HIDDEN_KEY in changes) callback();
  });
}

/** Everything in the browser's list, hidden items included — to know whether there's something to bring back */
async function allItems(id: VirtualFolderId): Promise<BookmarkNode[]> {
  if (id === MOST_VISITED_ID) return toNodes(id, await chrome.topSites.get());
  const sessions = await chrome.sessions.getRecentlyClosed({maxResults: RECENTLY_CLOSED_LIMIT});
  return toNodes(id, closedTabs(sessions));
}

/** Contents of a virtual folder without the hidden items; throws if the permission isn't granted on this device */
export async function virtualFolderItems(id: VirtualFolderId): Promise<BookmarkNode[]> {
  const [items, hidden] = await Promise.all([allItems(id), loadHiddenShelves()]);
  return items.filter((node) => !isHidden(node, hidden[id]));
}

/** Whether the shelf has hidden items the browser still lists — then "Show hidden" makes sense */
export async function hasHiddenItems(id: VirtualFolderId): Promise<boolean> {
  const [items, hidden] = await Promise.all([allItems(id), loadHiddenShelves()]);
  return items.some((node) => isHidden(node, hidden[id]));
}
