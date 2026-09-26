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

export async function removeNode(node: chrome.bookmarks.BookmarkTreeNode): Promise<RemovedNode> {
  // Свежее поддерево: у переданного узла могут быть устаревшие место и содержимое
  const [tree] = await chrome.bookmarks.getSubTree(node.id);
  const thumbnails = new Map<string, StoredThumbnail>();
  await Promise.all(collectIds(tree).map(async (id) => {
    const thumbnail = await getThumbnail(id).catch(() => undefined);
    if (thumbnail) thumbnails.set(id, thumbnail);
  }));

  if (tree.url) {
    await chrome.bookmarks.remove(tree.id);
  } else {
    await chrome.bookmarks.removeTree(tree.id);
  }
  return {tree, thumbnails};
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

/** Навсегда упорядочивает содержимое папки — в отличие от сортировки отображения в настройках */
export async function sortFolder(folderId: string, order: SortOrder, typeOrder: TypeOrder): Promise<void> {
  const children = await chrome.bookmarks.getChildren(folderId);
  const sorted = sortNodes(children, order, typeOrder);
  // Ставим по очереди на места 0, 1, 2…: перед i-м местом уже стоят отсортированные элементы
  for (const [index, node] of sorted.entries()) {
    await chrome.bookmarks.move(node.id, {parentId: folderId, index});
  }
}
