<script lang="ts">
  import {type BookmarkNode, folderHref} from '../../lib/bookmarks.svelte';
  import {FOLDER_PREVIEW_SIZE} from '../../lib/constants';
  import {icons} from '../../lib/icons.svelte';
  import SiteIcon from './SiteIcon.svelte';

  let {folder, preview}: {folder: BookmarkNode; preview: BookmarkNode[]} = $props();

  // Пустые ячейки дополняют сетку миниатюр до полного размера
  const emptyCells = $derived(Math.max(0, FOLDER_PREVIEW_SIZE - preview.length));
</script>

<a class="tile folder-tile" href={folderHref(folder.id)} title={folder.title} data-bookmark-id={folder.id}>
  <span class="folder-grid" aria-hidden="true">
    {#each preview as item (item.id)}
      <span class="cell" title={item.title}>
        {#if item.url}
          <SiteIcon entry={icons.get(item.url)} variant="mini"/>
        {:else}
          📁
        {/if}
      </span>
    {/each}
    {#each {length: emptyCells}, i (i)}
      <span class="cell"></span>
    {/each}
  </span>
  <span class="tile-title">{folder.title}</span>
</a>

<style>
  .folder-tile {
    background: var(--folder-bg);
    color: var(--folder-text, var(--text));
  }

  .folder-grid {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 4px;
    min-height: 0;
    padding: 8px;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    border-radius: 6px;
    font-size: 14px;
    user-select: none;
  }

  .cell:not(:empty) {
    background: var(--cell-bg);
  }
</style>
