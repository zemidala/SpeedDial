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
}

/** Items as bookmark nodes: ids are unique within the folder, web pages only, no duplicate URLs */
export function toNodes(folderId: VirtualFolderId, links: Link[]): BookmarkNode[] {
  const seen = new Set<string>();
  const nodes: BookmarkNode[] = [];
  for (const {title, url} of links) {
    if (!isWebUrl(url) || seen.has(url)) continue;
    seen.add(url);
    nodes.push({id: `${folderId}:${nodes.length}`, parentId: folderId, index: nodes.length, title: title || url, url, syncing: false});
  }
  return nodes;
}

/** Tabs from recently closed sessions: a closed window contributes its tabs */
export function closedTabs(sessions: chrome.sessions.Session[]): Link[] {
  return sessions
    .flatMap((session) => (session.tab ? [session.tab] : session.window?.tabs ?? []))
    .map((tab) => ({title: tab.title ?? '', url: tab.url ?? ''}));
}

/** Contents of a virtual folder; throws if the permission isn't granted on this device */
export async function virtualFolderItems(id: VirtualFolderId): Promise<BookmarkNode[]> {
  if (id === MOST_VISITED_ID) return toNodes(id, await chrome.topSites.get());
  const sessions = await chrome.sessions.getRecentlyClosed({maxResults: RECENTLY_CLOSED_LIMIT});
  return toNodes(id, closedTabs(sessions));
}
