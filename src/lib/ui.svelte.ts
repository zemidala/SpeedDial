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
   * New bookmark or folder; index — position in the folder (the end by default);
   * parentTitle — if it's created outside the open folder, that folder's name is shown in the dialog title
   */
  | {kind: 'create'; type: 'bookmark' | 'folder'; parentId: string; parentTitle?: string; index?: number}
  | {kind: 'edit'; node: BookmarkNode}
  /** Bookmark icon and thumbnail */
  | {kind: 'icon'; node: BookmarkNode & {url: string}}
  /** Sort the folder's contents in the browser */
  | {kind: 'sort'; folder: FolderRef}
  /** Move the selected bookmarks and folders to another folder */
  | {kind: 'move'; nodes: BookmarkNode[]}
  | {kind: 'settings'}
  /** Bookmarks of the same page in different folders */
  | {kind: 'duplicates'}
  /** Bookmarks whose site doesn't respond or whose page is gone */
  | {kind: 'linkCheck'}
  | ({kind: 'confirm'} & ConfirmOptions);

// The open dialog; at most one is shown at a time
export const ui = $state<{dialog: Dialog | null}>({dialog: null});

// Number of open modal dialogs (a confirmation may open over the settings).
// While a modal is open, everything outside it is inert — notifications are shown in the topmost dialog
export const modals = $state({depth: 0});

export function openSettings(): void {
  ui.dialog = {kind: 'settings'};
}

/** Also from the settings: they're replaced by this dialog, so their changes are saved first */
export function openDuplicates(): void {
  settings.flush();
  ui.dialog = {kind: 'duplicates'};
}

/** Also from the settings — like openDuplicates */
export function openLinkCheck(): void {
  settings.flush();
  ui.dialog = {kind: 'linkCheck'};
}

/** Deletes a bookmark or folder and offers to undo */
async function deleteWithUndo(node: BookmarkNode): Promise<void> {
  const removed = await removeNode(node);
  showNotice(t.bookmark.deleted(!removed.tree.url, removed.tree.title), 'info', {
    label: t.common.undo,
    run: async () => thumbnails.restore(removed.thumbnails, await restoreNode(removed)),
  });
}

/** Deleting a bookmark or folder; with a confirmation if it's enabled in the settings */
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

/** Deletes the selected bookmarks and folders and offers to undo */
async function deleteManyWithUndo(nodes: BookmarkNode[]): Promise<void> {
  const removed = await removeNodes(nodes);
  const saved = new Map(removed.flatMap((item) => [...item.thumbnails]));
  showNotice(t.selection.deletedMany(removed.length), 'info', {
    label: t.common.undo,
    run: async () => thumbnails.restore(saved, await restoreNodes(removed)),
  });
}

/** Deleting several items; with a confirmation if it's enabled in the settings */
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

/** Opening more tabs than this needs a confirmation */
const OPEN_ALL_CONFIRM = 10;

/** Opens bookmarks (folders are skipped) in background tabs */
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
