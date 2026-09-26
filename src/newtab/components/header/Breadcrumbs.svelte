<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {folderOpenHandlers} from '../../../lib/navigation';

  // Путь к открытой папке. Папки пути — кнопки (не ссылки, чтобы браузер не показывал адрес
  // chrome-extension://… при наведении) и принимают перетаскиваемые закладки; текущая — просто текст
  const crumbs = $derived([{id: ROOT_FOLDER_ID, title: 'Главная'}, ...bookmarks.path]);
</script>

<nav class="breadcrumbs" aria-label="Путь к папке">
  {#each crumbs as crumb, i (crumb.id)}
    {#if i > 0}
      <span class="breadcrumbs__separator" aria-hidden="true">›</span>
    {/if}
    {#if i === crumbs.length - 1}
      <span class="breadcrumbs__item breadcrumbs__item--current" aria-current="page">{crumb.title}</span>
    {:else}
      <button
        type="button"
        class="breadcrumbs__item"
        class:breadcrumbs__item--drop-target={dragDrop.draggedId !== null && dragDrop.target?.id === crumb.id}
        data-drop-folder-id={crumb.id}
        {...folderOpenHandlers(crumb.id)}
      >{crumb.title}</button>
    {/if}
  {/each}
</nav>

<style>
  .breadcrumbs {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 12px 16px;
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .breadcrumbs__item {
    padding: 2px 4px;
    border: none;
    border-radius: 4px;
    background: none;
    color: var(--accent);
    font-weight: 500;
    cursor: pointer;
  }

  .breadcrumbs__item:hover {
    text-decoration: underline;
  }

  .breadcrumbs__item:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  .breadcrumbs__item--current {
    color: var(--text);
    cursor: default;
  }

  .breadcrumbs__item--current:hover {
    text-decoration: none;
  }

  .breadcrumbs__item--drop-target {
    outline: 2px dashed var(--accent);
  }

  .breadcrumbs__separator {
    color: var(--text-muted);
  }
</style>
