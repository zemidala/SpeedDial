// Actions that change bookmarks in the browser itself
import type {SortOrder, TypeOrder} from './settings/schema';
import {sortNodes} from './sorting';
import {getThumbnail, type StoredThumbnail} from './thumbnails/storage';

/** A removed bookmark or folder with everything needed to put it back */
export interface RemovedNode {
  tree: chrome.bookmarks.BookmarkTreeNode;
  /** Thumbnails of the subtree's bookmarks by old id: after removal the service worker deletes them */
  thumbnails: Map<string, StoredThumbnail>;
}

function collectIds(node: chrome.bookmarks.BookmarkTreeNode, ids: string[] = []): string[] {
  ids.push(node.id);
  node.children?.forEach((child) => collectIds(child, ids));
  return ids;
}

/** Everything needed to restore: a fresh subtree (position and contents) and thumbnails */
async function snapshot(id: string): Promise<RemovedNode> {
  const [tree] = await chrome.bookmarks.getSubTree(id);
  const thumbnails = new Map<string, StoredThumbnail>();
  await Promise.all(collectIds(tree).map(async (nodeId) => {
    const thumbnail = await getThumbnail(nodeId).catch(() => undefined);
    if (thumbnail) thumbnails.set(nodeId, thumbnail);
  }));
  return {tree, thumbnails};
}

async function remove(tree: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
  if (tree.url) {
    await chrome.bookmarks.remove(tree.id);
  } else {
    await chrome.bookmarks.removeTree(tree.id);
  }
}

export async function removeNode(node: chrome.bookmarks.BookmarkTreeNode): Promise<RemovedNode> {
  const removed = await snapshot(node.id);
  await remove(removed.tree);
  return removed;
}

/**
 * Removes several bookmarks and folders. Remembers all of them first: after removing the first one the indexes
 * of the rest would shift. A selected item inside a selected folder (possible in search results) goes with the folder
 */
export async function removeNodes(nodes: Pick<chrome.bookmarks.BookmarkTreeNode, 'id'>[]): Promise<RemovedNode[]> {
  const snapshots = await Promise.all(nodes.map((node) => snapshot(node.id)));
  const nested = new Set(snapshots.flatMap(({tree}) => collectIds(tree).slice(1)));
  const removed = snapshots.filter(({tree}) => !nested.has(tree.id));
  for (const {tree} of removed) await remove(tree);
  return removed;
}

/**
 * Recreates a removed subtree at its old position. Restored bookmarks get new ids —
 * returns the old id → new id mapping
 */
export async function restoreNode({tree}: RemovedNode): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const create = async (node: chrome.bookmarks.BookmarkTreeNode, parentId: string, index?: number) => {
    const created = await chrome.bookmarks.create({parentId, index, title: node.title, url: node.url});
    ids.set(node.id, created.id);
    for (const child of node.children ?? []) await create(child, created.id);
  };
  // The bookmark's folder may have been removed too — then put it into "Other bookmarks"
  const parentExists = await chrome.bookmarks.get(tree.parentId!).then(() => true, () => false);
  await create(tree, parentExists ? tree.parentId! : '2', parentExists ? tree.index : undefined);
  return ids;
}

/**
 * Restores several removed items to their old positions. In ascending index order: each bookmark
 * lands in place once the ones before it are back
 */
export async function restoreNodes(removed: RemovedNode[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const ordered = [...removed].sort((a, b) => (a.tree.index ?? 0) - (b.tree.index ?? 0));
  for (const item of ordered) {
    for (const [oldId, newId] of await restoreNode(item)) ids.set(oldId, newId);
  }
  return ids;
}

/**
 * chrome.bookmarks.move steps that turn the folder order into final. Only bookmarks from moving move;
 * the rest keep their relative order. Each bookmark lands right after its left neighbour
 * in final — so the order converges even when the group moves right past its own bookmarks.
 * The index for the browser is the position before the bookmark is removed from its old place
 */
export function moveSteps(current: string[], final: string[], moving: Set<string>): Array<{id: string; index: number}> {
  const order = [...current];
  const steps: Array<{id: string; index: number}> = [];
  final.forEach((id, position) => {
    if (!moving.has(id)) return;
    const from = order.indexOf(id);
    if (from === -1) return;
    order.splice(from, 1);
    const target = position === 0 ? 0 : order.indexOf(final[position - 1]) + 1;
    order.splice(target, 0, id);
    if (target !== from) steps.push({id, index: from < target ? target + 1 : target});
  });
  return steps;
}

/** Moves bookmarks and folders to the end of folder folderId, keeping their order */
export async function moveNodes(ids: string[], folderId: string): Promise<void> {
  for (const id of ids) await chrome.bookmarks.move(id, {parentId: folderId});
}

/** Order after a group drag: the group lands as a block where the dragged tile is */
export function groupOrder(preview: string[], dragged: string, group: string[]): string[] {
  const others = new Set(group.filter((id) => id !== dragged));
  return preview.filter((id) => !others.has(id)).flatMap((id) => (id === dragged ? group : [id]));
}

/** Permanently sorts a folder's contents — unlike the display sorting in the settings */
export async function sortFolder(folderId: string, order: SortOrder, typeOrder: TypeOrder): Promise<void> {
  const children = await chrome.bookmarks.getChildren(folderId);
  const sorted = sortNodes(children, order, typeOrder);
  // Place items at positions 0, 1, 2…: the sorted items already stand before the i-th position
  for (const [index, node] of sorted.entries()) {
    await chrome.bookmarks.move(node.id, {parentId: folderId, index});
  }
}
