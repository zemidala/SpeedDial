// Перетаскивание плиток. Пока плитку тянут, остальные расступаются — порядок меняется «вживую»,
// а при отпускании сохраняется в браузере. Над центром папки, на плитке «Назад» и в хлебных крошках
// закладка кладётся внутрь папки
import {bookmarks} from './bookmarks.svelte';
import {ROOT_FOLDER_ID} from './constants';
import {search} from './search.svelte';
import {settings} from './settings/store.svelte';

export interface DropTarget {
  /** Папка, в которую упадёт закладка */
  id: string;
}

const DRAG_TYPE = 'application/x-speeddial-bookmark';
const FOLDER_DROP_ZONE = 0.25; // Средняя половина плитки папки — «положить внутрь», края — «встать рядом»

/** Переставляет id на место index */
export function moveId(ids: string[], id: string, index: number): string[] {
  const result = ids.filter((item) => item !== id);
  result.splice(index, 0, id);
  return result;
}

/**
 * Индекс для chrome.bookmarks.move, чтобы элемент со старого места oldIndex встал на newIndex.
 * При перемещении вниз браузер считает место до того, как уберёт элемент со старого
 */
export function moveIndex(oldIndex: number, newIndex: number): number {
  return newIndex > oldIndex ? newIndex + 1 : newIndex;
}

class DragDropStore {
  /** Перетаскиваемая плитка — для её оформления */
  draggedId = $state<string | null>(null);
  /** Папка, в которую упадёт закладка; null — закладка встанет на место из previewIds */
  target = $state.raw<DropTarget | null>(null);
  /** Порядок плиток во время перетаскивания; null — как в браузере */
  previewIds = $state.raw<string[] | null>(null);

  #dragging: string | null = null;
  #originalIds: string[] = [];
  /** Ячейки сетки на момент начала перетаскивания: место определяется по ним, а не по плитке под курсором —
   *  иначе расступающиеся плитки уезжали бы из-под курсора и порядок «дрожал» */
  #slots: DOMRect[] = [];

  /** Перетаскивание имеет смысл, только когда порядок плиток совпадает с порядком в браузере */
  get enabled(): boolean {
    const {dragAndDrop, sortOrder, typeOrder} = settings.current;
    return dragAndDrop && sortOrder === 'none' && typeOrder === 'none'
      && !search.active && bookmarks.folderId !== ROOT_FOLDER_ID;
  }

  onDragStart = (event: DragEvent): void => {
    const tile = (event.target as Element).closest?.<HTMLElement>('[data-bookmark-id]');
    const id = tile?.dataset.bookmarkId;
    if (!this.enabled || !tile || !id || !event.dataTransfer) return;

    this.#dragging = id;
    this.#originalIds = bookmarks.items.map((item) => item.id);
    this.#slots = [...document.querySelectorAll<HTMLElement>('[data-grid-slot]')]
      .map((cell) => cell.getBoundingClientRect());

    event.dataTransfer.setData(DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = 'copyMove'; // Ссылку по-прежнему можно перетащить в другое приложение
    // Под курсором — сама карточка, а не маленький значок ссылки
    const card = tile.querySelector<HTMLElement>('.tile__card');
    if (card) {
      const rect = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
    }

    // «След» на месте плитки включаем в следующем кадре: браузер снимает картинку для курсора
    // уже после обработчика, и полупрозрачная плитка попала бы в неё
    requestAnimationFrame(() => {
      if (this.#dragging === id) this.draggedId = id;
    });
  };

  onDragOver = (event: DragEvent): void => {
    const id = this.#dragging;
    if (!id) return;
    event.preventDefault(); // Сбросить можно в любом месте страницы — закладка встанет на показанное место
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    // Плитка «Назад» и хлебные крошки — перенос в папку, остальные плитки возвращаются на места
    const folderLink = (event.target as Element).closest?.<HTMLElement>('[data-drop-folder-id]');
    if (folderLink) {
      const folderId = folderLink.dataset.dropFolderId!;
      this.target = folderId === id || folderId === bookmarks.folderId ? null : {id: folderId};
      this.previewIds = this.#originalIds;
      return;
    }

    const ids = this.previewIds ?? this.#originalIds;
    const slot = this.#slotAt(event.clientX, event.clientY);    if (slot === -1) {
      this.target = null;
      return; // Между плитками — оставляем как есть
    }

    // Над серединой папки — положить внутрь; порядок при этом не меняем, чтобы папка не уехала из-под курсора
    const occupant = ids[slot];
    const rect = this.#slots[slot];
    const x = (event.clientX - rect.left) / rect.width;
    const isFolder = bookmarks.items.some((item) => item.id === occupant && !item.url);
    if (occupant !== id && isFolder && x > FOLDER_DROP_ZONE && x < 1 - FOLDER_DROP_ZONE) {
      this.target = {id: occupant};
      return;
    }

    this.target = null;
    if (ids.indexOf(id) !== slot) this.previewIds = moveId(ids, id, slot);
  };

  onDrop = (event: DragEvent): void => {
    const id = this.#dragging;
    if (!id) return;
    event.preventDefault();

    const target = this.target;
    const preview = this.previewIds;
    this.#dragging = null;
    this.draggedId = null;
    this.target = null;

    if (target) {
      this.previewIds = null;
      chrome.bookmarks.move(id, {parentId: target.id})
        .catch((error) => console.error('Failed to move bookmark', error));
      return;
    }

    const oldIndex = this.#originalIds.indexOf(id);
    const newIndex = preview?.indexOf(id) ?? oldIndex;
    if (newIndex === oldIndex) {
      this.previewIds = null;
      return;
    }
    // Показанный порядок остаётся, пока браузер не пришлёт обновлённый список (см. settle)
    const node = bookmarks.items.find((item) => item.id === id);
    const parentId = node?.parentId ?? bookmarks.folderId;
    chrome.bookmarks.move(id, {parentId, index: moveIndex(oldIndex, newIndex)}).catch((error) => {
      console.error('Failed to move bookmark', error);
      this.previewIds = null;
    });
  };

  onDragEnd = (): void => {
    // Отпустили вне страницы или отменили Esc — плитки возвращаются на места
    if (!this.#dragging) return;
    this.#dragging = null;
    this.draggedId = null;
    this.target = null;
    this.previewIds = null;
  };

  /** Браузер прислал новый список закладок — временный порядок больше не нужен */
  settle(): void {
    if (!this.#dragging) this.previewIds = null;
  }

  #slotAt(x: number, y: number): number {
    return this.#slots.findIndex((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  }
}

export const dragDrop = new DragDropStore();
