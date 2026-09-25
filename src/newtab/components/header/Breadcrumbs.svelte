<script lang="ts">
  import {bookmarks, folderHref} from '../../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';

  // Все папки пути, кроме текущей, принимают перетаскиваемые закладки
  const crumbs = $derived([{id: ROOT_FOLDER_ID, title: 'Главная'}, ...bookmarks.path]);
</script>

<nav class="breadcrumbs" aria-label="Путь к папке">
  {#each crumbs as crumb, i (crumb.id)}
    {@const current = i === crumbs.length - 1}
    {#if i > 0}
      <span class="breadcrumbs__separator" aria-hidden="true">›</span>
    {/if}
    <a
      class="breadcrumbs__link"
      class:breadcrumbs__link--drop-target={dragDrop.target?.id === crumb.id}
      href={folderHref(crumb.id)}
      aria-current={current ? 'page' : undefined}
      data-drop-folder-id={current ? undefined : crumb.id}
    >{crumb.title}</a>
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

  .breadcrumbs__link {
    padding: 2px 4px;
    border-radius: 4px;
    color: var(--accent);
    font-weight: 500;
    text-decoration: none;
  }

  .breadcrumbs__link:hover {
    text-decoration: underline;
  }

  .breadcrumbs__link[aria-current='page'] {
    color: var(--text);
  }

  .breadcrumbs__link--drop-target {
    outline: 2px dashed var(--accent);
  }

  .breadcrumbs__separator {
    color: var(--text-muted);
  }
</style>
