// Перетаскивание плиток: порядок внутри папки, перенос в папку, на плитку «Назад» или в хлебные крошки
import {bookmarks} from './bookmarks.svelte';
import {ROOT_FOLDER_ID} from './constants';
import {search} from './search.svelte';
import {settings} from './settings/store.svelte';

export type DropPosition = 'before' | 'after' | 'into';

export interface DropTarget {
  id: string;
  position: DropPosition;
}

const DRAG_TYPE = 'application/x-speeddial-bookmark';
const FOLDER_DROP_ZONE = 0.25; // Средняя половина плитки папки — «положить внутрь», края — «рядом»

class DragDropStore {
  draggedId = $state<string | null>(null);
  target = $state.raw<DropTarget | null>(null);

  /** Перетаскивание имеет смысл, только когда порядок плиток совпадает с порядком в браузере */
  get enabled(): boolean {
    const {dragAndDrop, sortOrder, typeOrder} = settings.current;
    return dragAndDrop && sortOrder === 'none' && typeOrder === 'none'
      && !search.active && bookmarks.folderId !== ROOT_FOLDER_ID;
  }

  onDragStart = (event: DragEvent): void => {
    const tile = (event.target as Element).closest?.<HTMLElement>('[data-bookmark-id]');
    if (!this.enabled || !tile || !event.dataTransfer) return;
    this.draggedId = tile.dataset.bookmarkId ?? null;
    event.dataTransfer.setData(DRAG_TYPE, this.draggedId ?? '');
    event.dataTransfer.effectAllowed = 'copyMove'; // Ссылку по-прежнему можно перетащить в другое приложение
  };

  onDragOver = (event: DragEvent): void => {
    if (!this.draggedId) return;
    this.target = this.#resolveTarget(event);
    if (this.target && event.dataTransfer) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    }
  };

  onDrop = (event: DragEvent): void => {
    const {draggedId, target} = this;
    this.#reset();
    if (!draggedId || !target) return;
    event.preventDefault();
    this.#move(draggedId, target).catch((error) => console.error('Failed to move bookmark', error));
  };

  onDragEnd = (): void => {
    this.#reset();
  };

  #resolveTarget(event: DragEvent): DropTarget | null {
    const element = event.target as Element;

    // Плитка «Назад» и ссылки хлебных крошек — перенос в папку
    const folderLink = element.closest?.<HTMLElement>('[data-drop-folder-id]');
    if (folderLink) {
      const id = folderLink.dataset.dropFolderId!;
      return id === this.draggedId || id === bookmarks.folderId ? null : {id, position: 'into'};
    }

    const tile = element.closest?.<HTMLElement>('[data-bookmark-id]');
    const id = tile?.dataset.bookmarkId;
    if (!tile || !id || id === this.draggedId) return null;

    const rect = tile.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    if (tile.dataset.folder !== undefined && x > FOLDER_DROP_ZONE && x < 1 - FOLDER_DROP_ZONE) {
      return {id, position: 'into'};
    }
    return {id, position: x < 0.5 ? 'before' : 'after'};
  }

  async #move(id: string, target: DropTarget): Promise<void> {
    if (target.position === 'into') {
      await chrome.bookmarks.move(id, {parentId: target.id});
      return;
    }
    const node = bookmarks.items.find((item) => item.id === target.id);
    if (!node) return;
    // Индекс в терминах исходного порядка: браузер сам учитывает, что элемент убирается со старого места
    const index = (node.index ?? 0) + (target.position === 'after' ? 1 : 0);
    await chrome.bookmarks.move(id, {parentId: bookmarks.folderId, index});
  }

  #reset(): void {
    this.draggedId = null;
    this.target = null;
  }
}

export const dragDrop = new DragDropStore();
