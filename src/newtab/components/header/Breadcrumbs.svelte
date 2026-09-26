<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {folderOpenHandlers} from '../../../lib/navigation';

  // Path to the open folder. Path folders are buttons (not links, so the browser doesn't show
  // chrome-extension://… on hover) and accept dragged bookmarks; the current one is plain text
  const crumbs = $derived([{id: ROOT_FOLDER_ID, title: t.common.home}, ...bookmarks.path]);
</script>

<nav class="breadcrumbs" aria-label={t.header.breadcrumbs}>
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
