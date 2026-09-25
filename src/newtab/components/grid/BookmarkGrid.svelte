<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {SEARCH_ENGINE_NAMES} from '../../../lib/search';
  import {search} from '../../../lib/search.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {sortNodes} from '../../../lib/sorting';
  import AddTile from './AddTile.svelte';
  import BackTile from './BackTile.svelte';
  import BookmarkTile from './BookmarkTile.svelte';
  import FolderTile from './FolderTile.svelte';

  const items = $derived(search.active
    ? search.results
    : sortNodes(bookmarks.items, settings.current.sortOrder, settings.current.typeOrder));

  // «Назад» — только во вложенных папках: из «Панели закладок» и других корневых папок ведут крошки
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

<section class="bookmark-grid" aria-label={search.active ? 'Результаты поиска' : 'Закладки'}>
  {#if parentFolderId !== null}
    <BackTile folderId={parentFolderId}/>
  {/if}

  {#each items as item (item.id)}
    {#if item.url}
      <BookmarkTile bookmark={item}/>
    {:else}
      <FolderTile folder={item} preview={bookmarks.previews[item.id] ?? []}/>
    {/if}
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

  .bookmark-grid__empty {
    grid-column: 1 / -1;
    margin: 40px 0;
    color: var(--text-muted);
    text-align: center;
  }
</style>
