<script lang="ts">
  import {flip} from 'svelte/animate';
  import {MediaQuery} from 'svelte/reactivity';
  import {type BookmarkNode, bookmarks} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {dragDrop, FOLDER_EDGE_DELAY} from '../../../lib/dragDrop.svelte';
  import {SEARCH_ENGINE_NAMES} from '../../../lib/search';
  import {search} from '../../../lib/search.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {sortNodes} from '../../../lib/sorting';
  import AddTile from './AddTile.svelte';
  import BackTile from './BackTile.svelte';
  import BookmarkTile from './BookmarkTile.svelte';
  import FolderTile from './FolderTile.svelte';

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
      return `Ничего не найдено. Нажмите Enter, чтобы искать в ${SEARCH_ENGINE_NAMES[settings.current.searchEngine]}.`;
    }
    if (bookmarks.loaded && !showAddTile) return 'Здесь пока пусто. Нажмите правой кнопкой мыши, чтобы добавить закладку.';
    return null;
  });
</script>

<section
  class="bookmark-grid"
  aria-label={search.active ? 'Результаты поиска' : 'Закладки'}
  style:--insert-delay="{FOLDER_EDGE_DELAY}ms"
>
  {#if parentFolderId !== null}
    <BackTile folderId={parentFolderId}/>
  {/if}

  {#each items as item, slot (item.id)}
    {@const indicator = dragDrop.indicator?.id === item.id ? dragDrop.indicator : null}
    <!-- Ячейка сетки: по ячейкам определяется место при перетаскивании, в них же анимируется перестановка -->
    <div
      class="bookmark-grid__cell"
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
    </div>
  {/each}

  {#if showAddTile}
    <AddTile/>
  {/if}

  {#if emptyMessage}
    <p class="bookmark-grid__empty">{emptyMessage}</p>
  {/if}
</section>

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
