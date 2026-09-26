// Действия, которые меняют закладки в самом браузере
import type {SortOrder, TypeOrder} from './settings/schema';
import {sortNodes} from './sorting';
import {getThumbnail, type StoredThumbnail} from './thumbnails/storage';

/** Удалённая закладка или папка со всем, что нужно, чтобы вернуть её на место */
export interface RemovedNode {
  tree: chrome.bookmarks.BookmarkTreeNode;
  /** Миниатюры закладок поддерева по старым id: после удаления service worker их стирает */
  thumbnails: Map<string, StoredThumbnail>;
}

function collectIds(node: chrome.bookmarks.BookmarkTreeNode, ids: string[] = []): string[] {
  ids.push(node.id);
  node.children?.forEach((child) => collectIds(child, ids));
  return ids;
}

/** Всё, что нужно для восстановления: свежее поддерево (место и содержимое) и миниатюры */
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
 * Удаляет несколько закладок и папок. Сначала запоминает все: после удаления первой индексы остальных
 * сдвинулись бы. Выделенное внутри выделенной папки (так бывает в результатах поиска) удаляется вместе с ней
 */
export async function removeNodes(nodes: chrome.bookmarks.BookmarkTreeNode[]): Promise<RemovedNode[]> {
  const snapshots = await Promise.all(nodes.map((node) => snapshot(node.id)));
  const nested = new Set(snapshots.flatMap(({tree}) => collectIds(tree).slice(1)));
  const removed = snapshots.filter(({tree}) => !nested.has(tree.id));
  for (const {tree} of removed) await remove(tree);
  return removed;
}

/**
 * Создаёт удалённое поддерево заново на прежнем месте. У восстановленных закладок новые id —
 * возвращается соответствие старый id → новый
 */
export async function restoreNode({tree}: RemovedNode): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  const create = async (node: chrome.bookmarks.BookmarkTreeNode, parentId: string, index?: number) => {
    const created = await chrome.bookmarks.create({parentId, index, title: node.title, url: node.url});
    ids.set(node.id, created.id);
    for (const child of node.children ?? []) await create(child, created.id);
  };
  // Папку, в которой лежала закладка, тоже могли удалить — тогда кладём в «Другие закладки»
  const parentExists = await chrome.bookmarks.get(tree.parentId!).then(() => true, () => false);
  await create(tree, parentExists ? tree.parentId! : '2', parentExists ? tree.index : undefined);
  return ids;
}

/**
 * Восстанавливает несколько удалённых на прежние места. По возрастанию индексов: каждая закладка
 * встаёт на своё место, когда стоявшие перед ней уже вернулись
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
 * Ходы chrome.bookmarks.move, после которых порядок в папке станет final. Двигаются только закладки
 * из moving, остальные сохраняют взаимный порядок. Каждая закладка встаёт сразу за своим соседом слева
 * в final — так порядок сходится, даже если группа сдвигается вправо через свои же закладки.
 * Индекс для браузера — место до того, как закладку уберут со старого места
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

/** Переносит закладки и папки в конец папки folderId, сохраняя их порядок */
export async function moveNodes(ids: string[], folderId: string): Promise<void> {
  for (const id of ids) await chrome.bookmarks.move(id, {parentId: folderId});
}

/** Порядок после группового перетаскивания: группа встаёт блоком на место перетаскиваемой плитки */
export function groupOrder(preview: string[], dragged: string, group: string[]): string[] {
  const others = new Set(group.filter((id) => id !== dragged));
  return preview.filter((id) => !others.has(id)).flatMap((id) => (id === dragged ? group : [id]));
}

/** Навсегда упорядочивает содержимое папки — в отличие от сортировки отображения в настройках */
export async function sortFolder(folderId: string, order: SortOrder, typeOrder: TypeOrder): Promise<void> {
  const children = await chrome.bookmarks.getChildren(folderId);
  const sorted = sortNodes(children, order, typeOrder);
  // Ставим по очереди на места 0, 1, 2…: перед i-м местом уже стоят отсортированные элементы
  for (const [index, node] of sorted.entries()) {
    await chrome.bookmarks.move(node.id, {parentId: folderId, index});
  }
}
