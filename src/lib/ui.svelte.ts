import type {BookmarkNode} from './bookmarks.svelte';
import {removeNode, restoreNode} from './bookmarkActions';
import {t} from './i18n/index.svelte';
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
