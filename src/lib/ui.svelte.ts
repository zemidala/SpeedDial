import type {BookmarkNode} from './bookmarks.svelte';
import {removeNode, removeNodes, restoreNode, restoreNodes} from './bookmarkActions';
import {t} from './i18n/index.svelte';
import {openUrl} from './navigation';
import {showNotice} from './notice.svelte';
import {settings} from './settings/store.svelte';
import {thumbnails} from './thumbnails/store.svelte';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<unknown> | void;
}

export interface FolderRef {
  id: string;
  title: string;
}

export type Dialog =
  /**
   * Новая закладка или папка; index — место в папке (по умолчанию в конец);
   * parentTitle — если создаётся не в открытой папке, её название показывается в заголовке окна
   */
  | {kind: 'create'; type: 'bookmark' | 'folder'; parentId: string; parentTitle?: string; index?: number}
  | {kind: 'edit'; node: BookmarkNode}
  /** Иконка и миниатюра закладки */
  | {kind: 'icon'; node: BookmarkNode & {url: string}}
  /** Упорядочить содержимое папки в браузере */
  | {kind: 'sort'; folder: FolderRef}
  /** Перенести выделенные закладки и папки в другую папку */
  | {kind: 'move'; nodes: BookmarkNode[]}
  | {kind: 'settings'}
  | ({kind: 'confirm'} & ConfirmOptions);

// Открытый диалог; одновременно показывается не больше одного
export const ui = $state<{dialog: Dialog | null}>({dialog: null});

// Число открытых модальных окон (окно подтверждения может открыться поверх настроек).
// Пока модальное окно открыто, всё вне его недоступно для кликов — уведомления показываются в верхнем окне
export const modals = $state({depth: 0});

export function openSettings(): void {
  ui.dialog = {kind: 'settings'};
}

/** Удаляет закладку или папку и предлагает отменить удаление */
async function deleteWithUndo(node: BookmarkNode): Promise<void> {
  const removed = await removeNode(node);
  showNotice(t.bookmark.deleted(!removed.tree.url, removed.tree.title), 'info', {
    label: t.common.undo,
    run: async () => thumbnails.restore(removed.thumbnails, await restoreNode(removed)),
  });
}

/** Удаление закладки или папки; с подтверждением, если оно включено в настройках */
export function requestDelete(node: BookmarkNode): Promise<void> | void {
  if (!settings.current.confirmDelete) return deleteWithUndo(node);

  const isFolder = !node.url;
  ui.dialog = {
    kind: 'confirm',
    title: isFolder ? t.bookmark.deleteFolderTitle : t.bookmark.deleteBookmarkTitle,
    message: isFolder
      ? t.bookmark.deleteFolderMessage(node.title)
      : t.bookmark.deleteBookmarkMessage(node.title),
    confirmLabel: t.common.delete,
    danger: true,
    onConfirm: () => deleteWithUndo(node),
  };
}

/** Удаляет выделенные закладки и папки и предлагает отменить удаление */
async function deleteManyWithUndo(nodes: BookmarkNode[]): Promise<void> {
  const removed = await removeNodes(nodes);
  const saved = new Map(removed.flatMap((item) => [...item.thumbnails]));
  showNotice(t.selection.deletedMany(removed.length), 'info', {
    label: t.common.undo,
    run: async () => thumbnails.restore(saved, await restoreNodes(removed)),
  });
}

/** Удаление нескольких; с подтверждением, если оно включено в настройках */
export function requestDeleteMany(nodes: BookmarkNode[]): Promise<void> | void {
  if (nodes.length === 1) return requestDelete(nodes[0]);
  if (!settings.current.confirmDelete) return deleteManyWithUndo(nodes);
  ui.dialog = {
    kind: 'confirm',
    title: t.selection.deleteManyTitle(nodes.length),
    message: t.selection.deleteManyMessage,
    confirmLabel: t.common.delete,
    danger: true,
    onConfirm: () => deleteManyWithUndo(nodes),
  };
}

/** Больше стольких вкладок открываем только после подтверждения */
const OPEN_ALL_CONFIRM = 10;

/** Открывает закладки (папки пропускаются) в фоновых вкладках */
export function requestOpenAll(nodes: BookmarkNode[]): Promise<void> | void {
  const urls = nodes.flatMap((node) => (node.url ? [node.url] : []));
  const open = async () => {
    for (const url of urls) await openUrl(url, 'background');
  };
  if (urls.length <= OPEN_ALL_CONFIRM) return open();
  ui.dialog = {
    kind: 'confirm',
    title: t.selection.openManyTitle(urls.length),
    message: t.selection.openManyMessage,
    confirmLabel: t.selection.openConfirm,
    onConfirm: open,
  };
}
