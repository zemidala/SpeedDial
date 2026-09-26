<script lang="ts">
  import {tick, untrack} from 'svelte';
  import {flip} from 'svelte/animate';
  import {MediaQuery} from 'svelte/reactivity';
  import {type BookmarkNode, bookmarks} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {dragDrop, FOLDER_EDGE_DELAY} from '../../../lib/dragDrop.svelte';
  import {isGridKey, neighbourIndex} from '../../../lib/gridKeyboard';
  import {t} from '../../../lib/i18n/index.svelte';
  import {showNotice} from '../../../lib/notice.svelte';
  import {searchEngineName} from '../../../lib/search';
  import {search} from '../../../lib/search.svelte';
  import {selection} from '../../../lib/selection.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {sortNodes} from '../../../lib/sorting';
  import {modals, requestDelete, requestDeleteMany, ui} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import AddTile from './AddTile.svelte';
  import BackTile from './BackTile.svelte';
  import BookmarkTile from './BookmarkTile.svelte';
  import FolderTile from './FolderTile.svelte';
  import SelectionBar from './SelectionBar.svelte';

  const REORDER_DURATION = 200; // Ms; tiles smoothly make room while dragging

  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

  const items = $derived.by((): BookmarkNode[] => {
    if (search.active) return search.results;
    // While dragging — the "live" order
    const preview = dragDrop.previewIds;
    if (preview) {
      const byId = new Map(bookmarks.items.map((item) => [item.id, item]));
      const ordered = preview.map((id) => byId.get(id)).filter((item) => item !== undefined);
      if (ordered.length === bookmarks.items.length) return ordered;
    }
    return sortNodes(bookmarks.items, settings.current.sortOrder, settings.current.typeOrder);
  });

  // An updated list arrived from the browser — the temporary drag order isn't needed anymore
  $effect(() => {
    void bookmarks.items;
    dragDrop.settle();
  });

  // Back only in nested folders: breadcrumbs lead out of the bookmarks bar and other root folders
  const parentFolderId = $derived.by(() => {
    const parent = bookmarks.parentFolderId;
    if (search.active || !settings.current.showBackTile || parent === ROOT_FOLDER_ID) return null;
    return parent;
  });
  const showAddTile = $derived(!search.active && settings.current.showAddTile && bookmarks.loaded);

  const emptyMessage = $derived.by(() => {
    if (items.length > 0) return null;
    if (search.active) {
      return t.grid.nothingFound(searchEngineName(settings.current.searchEngine));
    }
    if (bookmarks.loaded && !showAddTile) return t.grid.empty;
    return null;
  });

  // ===== Selection =====
  const itemIds = $derived(items.map((item) => item.id));
  const selectedNodes = $derived(items.filter((item) => selection.has(item.id)));

  // Another folder or another search — the selection resets
  // (selection changes are in untrack: otherwise the effect would depend on the selection it changes itself)
  $effect(() => {
    void bookmarks.folderId;
    void search.query;
    untrack(() => selection.clear());
  });

  // Removed and moved tiles are dropped from the selection
  $effect(() => {
    const ids = itemIds;
    untrack(() => selection.retain(ids));
  });

  /**
   * While selecting, a click on a tile marks it instead of opening: Shift — a range, a plain click — one tile.
   * Caught before the tiles' handlers. Ctrl+click and the middle button still open in a new tab
   */
  function onClickCapture(event: MouseEvent) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.button !== 0) return;
    const tile = (event.target as Element).closest<HTMLElement>('.tile[data-bookmark-id]');
    const id = tile?.dataset.bookmarkId;
    if (!id) return;
    if (event.shiftKey) selection.range(id, itemIds);
    else if (selection.active) selection.toggle(id);
    else return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onCheckClick(event: MouseEvent, id: string) {
    if (event.shiftKey) selection.range(id, itemIds);
    else selection.toggle(id);
  }

  let section: HTMLElement;

  // All tiles in order, including Back and Add
  const tileElements = () => [...section.querySelectorAll<HTMLElement>('.tile')];

  // After deleting with the keyboard, focus moves to the tile that took the deleted one's place — delete in a row.
  // Wait until the deleted bookmark leaves the list: the browser reports it with a delay
  let focusAfterDelete = $state<{id: string; index: number} | null>(null);

  $effect(() => {
    const pending = focusAfterDelete;
    const current = items;
    if (!pending || current.some((item) => item.id === pending.id)) return;
    focusAfterDelete = null;
    tick().then(() => {
      const tiles = tileElements();
      tiles[Math.min(pending.index, tiles.length - 1)]?.focus();
    }).catch(() => undefined);
  });

  async function deleteFocused(tile: HTMLElement, node: BookmarkNode) {
    const index = tileElements().indexOf(tile);
    const deleting = requestDelete(node);
    // With a confirmation the dialog manages focus
    if (!deleting) return;
    await deleting;
    focusAfterDelete = {id: node.id, index};
  }

  // Arrows, Home and End move focus across tiles; Delete deletes, F2 edits
  function onTileKeydown(event: KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const tile = (event.target as Element).closest<HTMLElement>('.tile');
    if (!tile || !section.contains(tile)) return;

    if (isGridKey(event.key)) {
      event.preventDefault();
      const tiles = tileElements();
      const next = neighbourIndex(tiles.map((element) => element.getBoundingClientRect()), tiles.indexOf(tile), event.key);
      if (next !== null) tiles[next].focus();
      return;
    }

    const node = items.find((item) => item.id === tile.dataset.bookmarkId);
    if (!node) return;
    if (event.key === ' ') {
      // Space marks the focused tile
      event.preventDefault();
      selection.toggle(node.id);
    } else if (event.key === 'Delete' && selection.has(node.id) && selectedNodes.length > 1) {
      event.preventDefault();
      Promise.resolve(requestDeleteMany(selectedNodes)).catch((error) => {
        showNotice(t.notice.deleteFailed(error instanceof Error ? error.message : String(error)));
      });
    } else if (event.key === 'Delete') {
      event.preventDefault();
      deleteFocused(tile, node).catch((error) => {
        console.error('Failed to delete', error);
        showNotice(t.notice.deleteFailed(error instanceof Error ? error.message : String(error)));
      });
    } else if (event.key === 'F2') {
      event.preventDefault();
      ui.dialog = {kind: 'edit', node};
    }
  }

  // Alt+1…9 opens the first nine tiles — bookmarks and folders
  function onWindowKeydown(event: KeyboardEvent) {
    if (modals.depth === 0 && !(event.target as Element).closest('input, textarea, select, [contenteditable]')) {
      // Ctrl+A — select all tiles, Esc — clear the selection
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.code === 'KeyA' && items.length > 0) {
        event.preventDefault();
        selection.selectAll(itemIds);
        return;
      }
      if (event.key === 'Escape' && selection.active && !document.querySelector('.context-menu')) {
        selection.clear();
        return;
      }
    }
    onTileKeydown(event);
    if (event.defaultPrevented || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || modals.depth > 0) return;
    // By key code, not character: works in any keyboard layout
    const digit = /^Digit([1-9])$/.exec(event.code);
    const tile = digit && section.querySelectorAll<HTMLElement>('.tile[data-bookmark-id]')[Number(digit[1]) - 1];
    if (!tile) return;
    event.preventDefault();
    tile.click();
  }
</script>

<svelte:window onkeydown={onWindowKeydown}/>

<section
  bind:this={section}
  class="bookmark-grid"
  class:bookmark-grid--selecting={selection.active}
  aria-label={search.active ? t.grid.searchResults : t.grid.bookmarks}
  style:--insert-delay="{FOLDER_EDGE_DELAY}ms"
  onclickcapture={onClickCapture}
>
  {#if parentFolderId !== null}
    <BackTile folderId={parentFolderId}/>
  {/if}

  {#each items as item, slot (item.id)}
    {@const indicator = dragDrop.indicator?.id === item.id ? dragDrop.indicator : null}
    {@const selected = selection.has(item.id)}
    <!-- Grid cell: cells define the position while dragging, and the reorder is animated in them -->
    <div
      class="bookmark-grid__cell"
      class:bookmark-grid__cell--selected={selected}
      class:bookmark-grid__cell--group-dragging={dragDrop.group?.includes(item.id) && dragDrop.draggedId !== item.id}
      class:bookmark-grid__cell--insert-before={indicator?.side === 'before'}
      class:bookmark-grid__cell--insert-after={indicator?.side === 'after'}
      class:bookmark-grid__cell--insert-pending={indicator?.pending}
      data-grid-slot={slot}
      animate:flip={{duration: reducedMotion.current ? 0 : REORDER_DURATION}}
    >
      {#if item.url}
        <BookmarkTile bookmark={item}/>
      {:else}
        <FolderTile folder={item} preview={bookmarks.previews[item.id] ?? []}/>
      {/if}
      <!-- Selection check mark: visible on hover and while something is selected. Keyboard — Space on the tile -->
      <button
        type="button"
        class="bookmark-grid__check"
        role="checkbox"
        aria-checked={selected}
        aria-label={t.selection.select(item.title)}
        tabindex="-1"
        onclick={(event) => onCheckClick(event, item.id)}
      >
        <Icon name="check" size={14}/>
      </button>
    </div>
  {/each}

  {#if showAddTile}
    <AddTile/>
  {/if}

  {#if emptyMessage}
    <p class="bookmark-grid__empty">{emptyMessage}</p>
  {/if}
</section>

{#if selectedNodes.length > 0}
  <SelectionBar nodes={selectedNodes}/>
{/if}

<style>
  .bookmark-grid {
    display: grid;
    /* As many columns as set in the settings, but tiles are no narrower than 120px on a narrow screen */
    grid-template-columns: repeat(
      auto-fill,
      minmax(max(120px, (100% - (var(--columns) - 1) * var(--gap)) / var(--columns)), 1fr)
    );
    gap: var(--gap);
  }

  .bookmark-grid__cell {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* ===== Selection ===== */
  /* A white ring on a dark translucent plate with a shadow — visible on any tile and any background */
  .bookmark-grid__check {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: 2px solid #fff;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.4);
    color: transparent;
    box-shadow: 0 0 0 1px rgb(0 0 0 / 0.35), 0 1px 4px rgb(0 0 0 / 0.45);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, background-color 0.15s;
  }

  /* Name above the tile — the circle sits on the card, not on the name line */
  .bookmark-grid__cell:has(:global(.tile--title-top-outside)) .bookmark-grid__check {
    top: 30px;
  }

  .bookmark-grid__cell:hover .bookmark-grid__check,
  .bookmark-grid__cell:focus-within .bookmark-grid__check,
  .bookmark-grid--selecting .bookmark-grid__check {
    opacity: 1;
  }

  /* Hover — a hint with the check mark */
  .bookmark-grid__check:hover {
    background: rgb(0 0 0 / 0.6);
    color: rgb(255 255 255 / 0.85);
  }

  .bookmark-grid__cell--selected .bookmark-grid__check,
  .bookmark-grid__cell--selected .bookmark-grid__check:hover {
    background: var(--accent);
    color: var(--accent-text);
  }

  .bookmark-grid__cell--selected :global(.tile__card) {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  /* While selecting, a click marks the tile — the cursor hints at it */
  .bookmark-grid--selecting :global(.tile[data-bookmark-id]) {
    cursor: default;
  }

  /* A group is dragged — the other selected tiles are translucent, like the dragged one */
  .bookmark-grid__cell--group-dragging {
    opacity: 0.4;
  }

  /* Insertion line in the gap between tiles: the dragged tile lands here */
  .bookmark-grid__cell--insert-before::before,
  .bookmark-grid__cell--insert-after::after {
    position: absolute;
    top: 4%;
    bottom: 4%;
    z-index: 2;
    width: 4px;
    border-radius: 2px;
    background: var(--accent);
    box-shadow: 0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent);
    content: '';
    pointer-events: none;
  }

  .bookmark-grid__cell--insert-before::before {
    left: calc(var(--gap) / -2 - 2px);
  }

  .bookmark-grid__cell--insert-after::after {
    right: calc(var(--gap) / -2 - 2px);
  }

  /* At a folder's edge the line "grows" while waiting: hold the pointer — the tile lands next to it */
  .bookmark-grid__cell--insert-pending::before,
  .bookmark-grid__cell--insert-pending::after {
    animation: insert-grow var(--insert-delay) ease-out both;
  }

  @keyframes insert-grow {
    from {
      opacity: 0.3;
      transform: scaleY(0.15);
    }

    to {
      opacity: 1;
      transform: scaleY(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bookmark-grid__cell--insert-pending::before,
    .bookmark-grid__cell--insert-pending::after {
      animation: none;
    }
  }

  .bookmark-grid__empty {
    grid-column: 1 / -1;
    margin: 40px 0;
    color: var(--text-muted);
    text-align: center;
  }
</style>
