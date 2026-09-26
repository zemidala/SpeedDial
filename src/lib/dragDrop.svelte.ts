// Dragging tiles. While a tile is dragged the others make room — the order changes "live",
// and is saved in the browser on drop. Over the centre of a folder, on the Back tile and in the breadcrumbs
// the bookmark goes into the folder
import {groupOrder, moveNodes, moveSteps} from './bookmarkActions';
import {bookmarks} from './bookmarks.svelte';
import {ROOT_FOLDER_ID} from './constants';
import {search} from './search.svelte';
import {selection} from './selection.svelte';
import {settings} from './settings/store.svelte';

export interface DropTarget {
  /** Folder the bookmark will drop into */
  id: string;
}

/** Insertion line in the gap between tiles: where the dragged tile will land */
export interface InsertIndicator {
  /** Tile next to which the line is */
  id: string;
  side: 'before' | 'after';
  /** Pointer at a folder's edge: tiles make room if it stays there for FOLDER_EDGE_DELAY */
  pending: boolean;
}

const DRAG_TYPE = 'application/x-speeddial-bookmark';
const FOLDER_DROP_ZONE = 0.2; // The middle 60% of a folder tile means "drop inside", the edges "place next to it"
// A folder's edge doesn't move tiles right away: otherwise, approaching from the side, the folder would slide away
// before the pointer reaches its middle
export const FOLDER_EDGE_DELAY = 350;

/** Gap in a row of tiles: before cell slot or after it (at the end of the row) */
export interface GapPosition {
  slot: number;
  side: 'before' | 'after';
}

/**
 * Gap under the pointer by grid cells: between two cells of one row, left of the first
 * or right of the last. null — the pointer is over a cell or between rows
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
 * Order after inserting id into the gap next to anchor. null — nothing changes
 * (e.g. the gap next to the dragged tile itself)
 */
export function insertAt(ids: string[], id: string, anchor: string, side: 'before' | 'after'): string[] | null {
  if (anchor === id) return null;
  const others = ids.filter((item) => item !== id);
  const position = others.indexOf(anchor) + (side === 'after' ? 1 : 0);
  const result = [...others.slice(0, position), id, ...others.slice(position)];
  return result.every((item, i) => item === ids[i]) ? null : result;
}

/** Moves id to position index */
export function moveId(ids: string[], id: string, index: number): string[] {
  const result = ids.filter((item) => item !== id);
  result.splice(index, 0, id);
  return result;
}

/**
 * Index for chrome.bookmarks.move from the shown preview order: the bookmark lands before the neighbour
 * that follows it in preview. Computed against the current list — it may have changed while
 * the tile was dragged. The browser treats the index as the position before removing the bookmark from its old place.
 * null — the bookmark is already in place
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
 * Grid cells on screen. Positions come from the layout (offsetLeft/Top), not getBoundingClientRect:
 * if tiles are still finishing the reorder animation, their current offset mustn't get into the cells
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
  /** The dragged tile — for its styling */
  draggedId = $state<string | null>(null);
  /** Folder the bookmark will drop into; null — the bookmark lands at its place in previewIds */
  target = $state.raw<DropTarget | null>(null);
  /** Tile order while dragging; null — as in the browser */
  previewIds = $state.raw<string[] | null>(null);
  /** Insertion line; null — none (e.g. the bookmark will drop into a folder) */
  indicator = $state.raw<InsertIndicator | null>(null);
  /** A selected tile is dragged — the whole selected group moves (in folder order); null — a single tile */
  group = $state.raw<string[] | null>(null);

  #dragging: string | null = null;
  #originalIds: string[] = [];
  /** Grid cells at drag start: the position is found by them, not by the tile under the pointer —
   *  otherwise tiles making room would slide away from the pointer and the order would "jitter" */
  #slots: DOMRect[] = [];
  /** Pending move at a folder's edge: next to which folder, on which side, and the timer */
  #pendingMove: {folderId: string; side: 'before' | 'after'; timer: ReturnType<typeof setTimeout>} | null = null;
  /** Order if dropped in the gap under the pointer; tiles don't move meanwhile — only the line is shown */
  #gapOrder: string[] | null = null;

  /** Dragging makes sense only when the tile order matches the order in the browser */
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
    event.dataTransfer.effectAllowed = 'copyMove'; // The link can still be dragged into another app
    // The card itself is under the pointer, not a small link icon
    const card = tile.querySelector<HTMLElement>('.tile__card');
    if (card) {
      const rect = card.getBoundingClientRect();
      event.dataTransfer.setDragImage(card, event.clientX - rect.left, event.clientY - rect.top);
    }

    // The "ghost" at the tile's place is turned on in the next frame: the browser snapshots the drag image
    // after the handler, and a translucent tile would end up in it
    requestAnimationFrame(() => {
      if (this.#dragging === id) this.draggedId = id;
    });
  };

  onDragOver = (event: DragEvent): void => {
    const id = this.#dragging;
    if (!id) return;
    event.preventDefault(); // Dropping works anywhere on the page — the bookmark lands at the shown position
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    this.#gapOrder = null;

    // The Back tile and breadcrumbs move into a folder; other tiles return to their places
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
      // In a gap between tiles — the insertion line; tiles don't move, the bookmark lands there on drop
      const gap = gapAt(this.#slots, event.clientX, event.clientY);
      const order = gap ? insertAt(ids, id, ids[gap.slot], gap.side) : null;
      this.#gapOrder = order;
      this.#setIndicator(gap && order ? {id: ids[gap.slot], side: gap.side, pending: false} : null);
      return;
    }

    const occupant = ids[slot];
    // Can't drop into a folder that is part of the dragged group — it's being moved itself
    const isFolder = !this.#isDragged(occupant) && bookmarks.items.some((item) => item.id === occupant && !item.url);
    if (isFolder) {
      const rect = this.#slots[slot];
      const x = (event.clientX - rect.left) / rect.width;
      // Over the middle of a folder — drop inside; the order stays so the folder doesn't slide away from the pointer
      if (x > FOLDER_DROP_ZONE && x < 1 - FOLDER_DROP_ZONE) {
        this.#cancelPendingMove();
        this.target = {id: occupant};
        this.#setIndicator(null);
        return;
      }
      // At a folder's edge — land next to it on the pointer's side, but only if the pointer lingers: it may
      // just be heading to the middle. The line shows the place right away and "grows" while waiting
      this.target = null;
      const side = x < 0.5 ? 'before' : 'after';
      if (!insertAt(ids, id, occupant, side)) {
        this.#cancelPendingMove(); // The tile is already on this side of the folder
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
    // Dropped in a gap — lands where the line is; this order is shown until the browser answers
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
    // The shown order stays until the browser sends the updated list (see settle)
    const node = bookmarks.items.find((item) => item.id === id);
    const parentId = node?.parentId ?? bookmarks.folderId;
    chrome.bookmarks.move(id, {parentId, index}).catch((error) => {
      console.error('Failed to move bookmark', error);
      this.previewIds = null;
    });
  };

  onDragEnd = (): void => {
    // Dropped outside the page or cancelled with Esc — tiles return to their places
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

  /** The dragged tile or one from the dragged group */
  #isDragged(id: string): boolean {
    return id === this.#dragging || (this.group?.includes(id) ?? false);
  }

  /** The group lands as a block where the dragged tile is; the order is shown right away, before the browser answers */
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

  /** The browser sent a new bookmark list — the temporary order isn't needed anymore */
  settle(): void {
    if (!this.#dragging) this.previewIds = null;
  }

  /** Puts the tile at position slot — the others make room; the place is shown by the ghost, no line needed */
  #moveTo(id: string, slot: number): void {
    const ids = this.previewIds ?? this.#originalIds;
    if (ids.indexOf(id) !== slot) this.previewIds = moveId(ids, id, slot);
    this.#setIndicator(null);
  }

  /** Changes the indicator only if it's really different: otherwise the "waiting" animation would restart */
  #setIndicator(next: InsertIndicator | null): void {
    const current = this.indicator;
    const same = current === next
      || (current && next && current.id === next.id && current.side === next.side && current.pending === next.pending);
    if (!same) this.indicator = next;
  }

  #scheduleInsert(id: string, folderId: string, side: 'before' | 'after'): void {
    const pending = this.#pendingMove;
    if (pending?.folderId === folderId && pending.side === side) return; // Already waiting — dragover fires many times a second
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
