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

  const REORDER_DURATION = 200; // Мс; плитки плавно расступаются при перетаскивании

  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');

  const items = $derived.by((): BookmarkNode[] => {
    if (search.active) return search.results;
    // Во время перетаскивания — порядок «вживую»
    const preview = dragDrop.previewIds;
    if (preview) {
      const byId = new Map(bookmarks.items.map((item) => [item.id, item]));
      const ordered = preview.map((id) => byId.get(id)).filter((item) => item !== undefined);
      if (ordered.length === bookmarks.items.length) return ordered;
    }
    return sortNodes(bookmarks.items, settings.current.sortOrder, settings.current.typeOrder);
  });

  // Пришёл обновлённый список из браузера — временный порядок перетаскивания больше не нужен
  $effect(() => {
    void bookmarks.items;
    dragDrop.settle();
  });

  // «Назад» — только во вложенных папках: из «Панели избранного» и других корневых папок ведут крошки
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

  // ===== Выделение =====
  const itemIds = $derived(items.map((item) => item.id));
  const selectedNodes = $derived(items.filter((item) => selection.has(item.id)));

  // Другая папка или другой поиск — выделение сбрасывается
  // (изменения выделения — в untrack: иначе эффект зависел бы от выделения, которое сам меняет)
  $effect(() => {
    void bookmarks.folderId;
    void search.query;
    untrack(() => selection.clear());
  });

  // Удалённые и перенесённые плитки из выделения убираем
  $effect(() => {
    const ids = itemIds;
    untrack(() => selection.retain(ids));
  });

  /**
   * Клик по плитке при выделении отмечает её, а не открывает: Shift — диапазон, обычный клик — одна плитка.
   * Ловим до обработчиков плиток. Ctrl+клик и средняя кнопка по-прежнему открывают в новой вкладке
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

  // Все плитки по порядку, включая «Назад» и «Добавить»
  const tileElements = () => [...section.querySelectorAll<HTMLElement>('.tile')];

  // После удаления с клавиатуры фокус переходит на плитку, вставшую на место удалённой, — можно удалять подряд.
  // Ждём, пока удалённая закладка пропадёт из списка: браузер сообщает об этом не сразу
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
    // С подтверждением фокусом управляет окно
    if (!deleting) return;
    await deleting;
    focusAfterDelete = {id: node.id, index};
  }

  // Стрелки, Home и End переводят фокус по плиткам; Delete удаляет, F2 — редактирует
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
      // Пробел отмечает плитку в фокусе
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

  // Alt+1…9 открывает первые девять плиток — закладки и папки
  function onWindowKeydown(event: KeyboardEvent) {
    if (modals.depth === 0 && !(event.target as Element).closest('input, textarea, select, [contenteditable]')) {
      // Ctrl+A — выделить все плитки, Esc — снять выделение
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
    // По коду клавиши, а не символу: работает в любой раскладке
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
    <!-- Ячейка сетки: по ячейкам определяется место при перетаскивании, в них же анимируется перестановка -->
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
      <!-- Галочка выделения: видна при наведении и пока что-то выделено. С клавиатуры — пробел на плитке -->
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
    /* Столько колонок, сколько задано в настройках, но на узком экране плитки не уже 120px */
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

  /* ===== Выделение ===== */
  /* Белое кольцо на тёмной полупрозрачной подложке с тенью — заметно на любой плитке и любом фоне */
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

  /* Название над плиткой — кружок на карточке, а не на строке названия */
  .bookmark-grid__cell:has(:global(.tile--title-top-outside)) .bookmark-grid__check {
    top: 30px;
  }

  .bookmark-grid__cell:hover .bookmark-grid__check,
  .bookmark-grid__cell:focus-within .bookmark-grid__check,
  .bookmark-grid--selecting .bookmark-grid__check {
    opacity: 1;
  }

  /* Наведение — подсказка галочкой */
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

  /* При выделении клик отмечает плитку — курсор это подсказывает */
  .bookmark-grid--selecting :global(.tile[data-bookmark-id]) {
    cursor: default;
  }

  /* Перетаскивают группу — остальные выделенные плитки полупрозрачны, как и перетаскиваемая */
  .bookmark-grid__cell--group-dragging {
    opacity: 0.4;
  }

  /* Линия-вставка в промежутке между плитками: сюда встанет перетаскиваемая плитка */
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

  /* У края папки линия «вырастает» за время ожидания: задержите курсор — плитка встанет рядом */
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
