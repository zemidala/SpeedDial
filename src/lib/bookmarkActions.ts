// Действия, которые меняют закладки в самом браузере
import type {SortOrder, TypeOrder} from './settings/schema';
import {sortNodes} from './sorting';

export async function removeNode(node: chrome.bookmarks.BookmarkTreeNode): Promise<void> {
  if (node.url) {
    await chrome.bookmarks.remove(node.id);
  } else {
    await chrome.bookmarks.removeTree(node.id);
  }
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
