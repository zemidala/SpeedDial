// Перетаскивание плиток. Пока плитку тянут, остальные расступаются — порядок меняется «вживую»,
// а при отпускании сохраняется в браузере. Над центром папки, на плитке «Назад» и в хлебных крошках
// закладка кладётся внутрь папки
import {groupOrder, moveNodes, moveSteps} from './bookmarkActions';
import {bookmarks} from './bookmarks.svelte';
import {ROOT_FOLDER_ID} from './constants';
import {search} from './search.svelte';
import {selection} from './selection.svelte';
import {settings} from './settings/store.svelte';

export interface DropTarget {
  /** Папка, в которую упадёт закладка */
  id: string;
}

/** Линия-вставка в промежутке между плитками: куда встанет перетаскиваемая плитка */
export interface InsertIndicator {
  /** Плитка, рядом с которой линия */
  id: string;
  side: 'before' | 'after';
  /** Курсор у края папки: плитки расступятся, если задержать его там на FOLDER_EDGE_DELAY */
  pending: boolean;
}

const DRAG_TYPE = 'application/x-speeddial-bookmark';
const FOLDER_DROP_ZONE = 0.2; // Средние 60% плитки папки — «положить внутрь», края — «встать рядом»
// Край папки переставляет плитки не сразу: иначе при движении сбоку папка уезжала бы из-под курсора
// раньше, чем курсор дойдёт до её середины
export const FOLDER_EDGE_DELAY = 350;

/** Промежуток в ряду плиток: перед ячейкой slot или после неё (в конце ряда) */
export interface GapPosition {
  slot: number;
  side: 'before' | 'after';
}

/**
 * Промежуток под курсором по ячейкам сетки: между двумя ячейками одного ряда, слева от первой
 * или справа от последней. null — курсор над ячейкой или между рядами
 */
export function gapAt(slots: Array<Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>>, x: number, y: number): GapPosition | null {
  const row = slots
    .map((rect, slot) => ({rect, slot}))
    .filter(({rect}) => y >= rect.top && y <= rect.bottom)
    .sort((a, b) => a.rect.left - b.rect.left);
  if (row.length === 0) return null;
  if (x < row[0].rect.left) return {slot: row[0].slot, side: 'before'};
  for (let i = 0; i < row.length - 1; i++) {
    if (x > row[i].rect.right && x < row[i + 1].rect.left) return {slot: row[i + 1].slot, side: 'before'};
  }
  const last = row.at(-1)!;
  return x > last.rect.right ? {slot: last.slot, side: 'after'} : null;
}

/**
 * Порядок после вставки id в промежуток рядом с anchor. null — ничего не меняется
 * (например, промежуток рядом с самой перетаскиваемой плиткой)
 */
export function insertAt(ids: string[], id: string, anchor: string, side: 'before' | 'after'): string[] | null {
  if (anchor === id) return null;
  const others = ids.filter((item) => item !== id);
  const position = others.indexOf(anchor) + (side === 'after' ? 1 : 0);
  const result = [...others.slice(0, position), id, ...others.slice(position)];
  return result.every((item, i) => item === ids[i]) ? null : result;
}

/** Переставляет id на место index */
export function moveId(ids: string[], id: string, index: number): string[] {
  const result = ids.filter((item) => item !== id);
  result.splice(index, 0, id);
  return result;
}

/**
 * Индекс для chrome.bookmarks.move по показанному порядку preview: закладка встаёт перед соседом,
 * который идёт за ней в preview. Считается по актуальному списку current — он мог обновиться, пока
 * тянули плитку. Браузер понимает индекс как место до того, как уберёт закладку со старого места.
 * null — закладка и так на своём месте
 */
export function dropIndex(current: string[], preview: string[], id: string): number | null {
  const position = preview.indexOf(id);
  const oldIndex = current.indexOf(id);
  if (position === -1 || oldIndex === -1) return null;
  const nextId = preview.slice(position + 1).find((item) => current.includes(item));
  const index = nextId === undefined ? current.length : current.indexOf(nextId);
  return index === oldIndex || index === oldIndex + 1 ? null : index;
}

/**
 * Ячейки сетки на экране. Положение берётся из раскладки (offsetLeft/Top), а не getBoundingClientRect:
 * если плитки ещё доигрывают анимацию перестановки, их текущий сдвиг не должен попасть в ячейки
 */
function measureSlots(): DOMRect[] {
  const cells = [...document.querySelectorAll<HTMLElement>('[data-grid-slot]')];
  const grid = cells[0]?.parentElement;
  if (!grid) return [];
  const gridRect = grid.getBoundingClientRect();
  return cells.map((cell) => new DOMRect(
    gridRect.left + cell.offsetLeft - grid.offsetLeft,
    gridRect.top + cell.offsetTop - grid.offsetTop,
    cell.offsetWidth,
    cell.offsetHeight,
  ));
}

class DragDropStore {
  /** Перетаскиваемая плитка — для её оформления */
  draggedId = $state<string | null>(null);
  /** Папка, в которую упадёт закладка; null — закладка встанет на место из previewIds */
  target = $state.raw<DropTarget | null>(null);
  /** Порядок плиток во время перетаскивания; null — как в браузере */
  previewIds = $state.raw<string[] | null>(null);
  /** Линия-вставка; null — её нет (например, закладка ляжет в папку) */
  indicator = $state.raw<InsertIndicator | null>(null);
  /** Тянут выделенную плитку — переносится вся группа выделенных (в порядке папки); null — одна плитка */
  group = $state.raw<string[] | null>(null);

  #dragging: string | null = null;
  #originalIds: string[] = [];
  /** Ячейки сетки на момент начала перетаскивания: место определяется по ним, а не по плитке под курсором —
   *  иначе расступающиеся плитки уезжали бы из-под курсора и порядок «дрожал» */
  #slots: DOMRect[] = [];
  /** Отложенная перестановка у края папки: рядом с какой папкой, с какой стороны, и таймер */
  #pendingMove: {folderId: string; side: 'before' | 'after'; timer: ReturnType<typeof setTimeout>} | null = null;
  /** Порядок, если отпустить в промежутке под курсором; плитки при этом не двигаются — видна только линия */
  #gapOrder: string[] | null = null;

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
    this.#slots = measureSlots();
    this.group = selection.has(id) && selection.ids.size > 1 ? selection.ordered(this.#originalIds) : null;

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

    this.#gapOrder = null;

    // Плитка «Назад» и хлебные крошки — перенос в папку, остальные плитки возвращаются на места
    const folderLink = (event.target as Element).closest?.<HTMLElement>('[data-drop-folder-id]');
    if (folderLink) {
      const folderId = folderLink.dataset.dropFolderId!;
      this.#cancelPendingMove();
      this.target = this.#isDragged(folderId) || folderId === bookmarks.folderId ? null : {id: folderId};
      this.previewIds = this.#originalIds;
      this.#setIndicator(null);
      return;
    }

    const ids = this.previewIds ?? this.#originalIds;
    const slot = this.#slotAt(event.clientX, event.clientY);
    if (slot === -1) {
      this.#cancelPendingMove();
      this.target = null;
      // В промежутке между плитками — линия-вставка; плитки не двигаются, закладка встанет туда при отпускании
      const gap = gapAt(this.#slots, event.clientX, event.clientY);
      const order = gap ? insertAt(ids, id, ids[gap.slot], gap.side) : null;
      this.#gapOrder = order;
      this.#setIndicator(gap && order ? {id: ids[gap.slot], side: gap.side, pending: false} : null);
      return;
    }

    const occupant = ids[slot];
    // В папку из перетаскиваемой группы положить нельзя — она сама переносится
    const isFolder = !this.#isDragged(occupant) && bookmarks.items.some((item) => item.id === occupant && !item.url);
    if (isFolder) {
      const rect = this.#slots[slot];
      const x = (event.clientX - rect.left) / rect.width;
      // Над серединой папки — положить внутрь; порядок не меняем, чтобы папка не уехала из-под курсора
      if (x > FOLDER_DROP_ZONE && x < 1 - FOLDER_DROP_ZONE) {
        this.#cancelPendingMove();
        this.target = {id: occupant};
        this.#setIndicator(null);
        return;
      }
      // У края папки — встать рядом с той стороны, где курсор, но только если он задержался: возможно,
      // курсор просто идёт к середине. Линия сразу показывает место и «вырастает» за время ожидания
      this.target = null;
      const side = x < 0.5 ? 'before' : 'after';
      if (!insertAt(ids, id, occupant, side)) {
        this.#cancelPendingMove(); // Плитка и так стоит с этой стороны папки
        this.#setIndicator(null);
        return;
      }
      this.#setIndicator({id: occupant, side, pending: true});
      this.#scheduleInsert(id, occupant, side);
      return;
    }

    this.#cancelPendingMove();
    this.target = null;
    this.#moveTo(id, slot);
  };

  onDrop = (event: DragEvent): void => {
    const id = this.#dragging;
    if (!id) return;
    event.preventDefault();

    this.#cancelPendingMove();
    const target = this.target;
    // Отпустили в промежутке — встаёт туда, где линия; показываем этот порядок до ответа браузера
    const preview = this.#gapOrder ?? this.previewIds;
    if (this.#gapOrder) this.previewIds = this.#gapOrder;
    this.#gapOrder = null;
    this.#dragging = null;
    this.draggedId = null;
    this.target = null;
    this.indicator = null;
    const group = this.group;
    this.group = null;

    if (target) {
      this.previewIds = null;
      moveNodes(group ?? [id], target.id).catch((error) => console.error('Failed to move bookmark', error));
      return;
    }

    if (group) {
      this.#dropGroup(group, id, preview ?? this.#originalIds);
      return;
    }

    const index = preview ? dropIndex(bookmarks.items.map((item) => item.id), preview, id) : null;
    if (index === null) {
      this.previewIds = null;
      return;
    }
    // Показанный порядок остаётся, пока браузер не пришлёт обновлённый список (см. settle)
    const node = bookmarks.items.find((item) => item.id === id);
    const parentId = node?.parentId ?? bookmarks.folderId;
    chrome.bookmarks.move(id, {parentId, index}).catch((error) => {
      console.error('Failed to move bookmark', error);
      this.previewIds = null;
    });
  };

  onDragEnd = (): void => {
    // Отпустили вне страницы или отменили Esc — плитки возвращаются на места
    if (!this.#dragging) return;
    this.#cancelPendingMove();
    this.#gapOrder = null;
    this.#dragging = null;
    this.draggedId = null;
    this.target = null;
    this.previewIds = null;
    this.indicator = null;
    this.group = null;
  };

  /** Перетаскиваемая плитка или одна из перетаскиваемой группы */
  #isDragged(id: string): boolean {
    return id === this.#dragging || (this.group?.includes(id) ?? false);
  }

  /** Группа встаёт блоком на место перетаскиваемой плитки; порядок показывается сразу, до ответа браузера */
  #dropGroup(group: string[], dragged: string, preview: string[]): void {
    const current = bookmarks.items.map((item) => item.id);
    const final = groupOrder(preview.filter((id) => current.includes(id)), dragged, group);
    const steps = moveSteps(current, final, new Set(group));
    if (steps.length === 0) {
      this.previewIds = null;
      return;
    }
    this.previewIds = final;
    const parentId = bookmarks.items.find((item) => item.id === dragged)?.parentId ?? bookmarks.folderId;
    (async () => {
      for (const {id, index} of steps) await chrome.bookmarks.move(id, {parentId, index});
    })().catch((error) => {
      console.error('Failed to move bookmarks', error);
      this.previewIds = null;
    });
  }

  /** Браузер прислал новый список закладок — временный порядок больше не нужен */
  settle(): void {
    if (!this.#dragging) this.previewIds = null;
  }

  /** Ставит плитку на место slot — остальные расступаются; место видно по следу, линия не нужна */
  #moveTo(id: string, slot: number): void {
    const ids = this.previewIds ?? this.#originalIds;
    if (ids.indexOf(id) !== slot) this.previewIds = moveId(ids, id, slot);
    this.#setIndicator(null);
  }

  /** Меняет индикатор, только если он действительно другой: иначе перезапускалась бы анимация «ожидания» */
  #setIndicator(next: InsertIndicator | null): void {
    const current = this.indicator;
    const same = current === next
      || (current && next && current.id === next.id && current.side === next.side && current.pending === next.pending);
    if (!same) this.indicator = next;
  }

  #scheduleInsert(id: string, folderId: string, side: 'before' | 'after'): void {
    const pending = this.#pendingMove;
    if (pending?.folderId === folderId && pending.side === side) return; // Уже ждём — dragover приходит много раз в секунду
    this.#cancelPendingMove();
    const timer = setTimeout(() => {
      this.#pendingMove = null;
      if (this.#dragging !== id) return;
      const order = insertAt(this.previewIds ?? this.#originalIds, id, folderId, side);
      if (order) this.previewIds = order;
      this.#setIndicator(null);
    }, FOLDER_EDGE_DELAY);
    this.#pendingMove = {folderId, side, timer};
  }

  #cancelPendingMove(): void {
    if (this.#pendingMove) clearTimeout(this.#pendingMove.timer);
    this.#pendingMove = null;
  }

  #slotAt(x: number, y: number): number {
    return this.#slots.findIndex((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  }
}

export const dragDrop = new DragDropStore();
