<script lang="ts">
  import {type BookmarkNode, folderHref} from '../../../lib/bookmarks.svelte';
  import {FOLDER_PREVIEW_SIZE} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import Icon from '../ui/Icon.svelte';
  import SiteIcon from './SiteIcon.svelte';

  let {folder, preview}: {folder: BookmarkNode; preview: BookmarkNode[]} = $props();

  // Пустые ячейки дополняют сетку миниатюр до полного размера
  const emptyCells = $derived(Math.max(0, FOLDER_PREVIEW_SIZE - preview.length));
  const dropPosition = $derived(dragDrop.target?.id === folder.id ? dragDrop.target.position : null);
</script>

<a
  class="tile tile--folder"
  class:tile--dragging={dragDrop.draggedId === folder.id}
  class:tile--drop-before={dropPosition === 'before'}
  class:tile--drop-after={dropPosition === 'after'}
  class:tile--drop-into={dropPosition === 'into'}
  href={folderHref(folder.id)}
  title={folder.title}
  data-bookmark-id={folder.id}
  data-folder
>
  <span class="tile__visual">
    {#if settings.current.folderPreview}
      <span class="folder-preview" aria-hidden="true">
        {#each preview as item (item.id)}
          <span class="folder-preview__cell" title={item.title}>
            {#if item.url}
              <SiteIcon entry={icons.get(item.url)} appearance="mini"/>
            {:else}
              <Icon name="folder" size={14}/>
            {/if}
          </span>
        {/each}
        {#each {length: emptyCells}, i (i)}
          <span class="folder-preview__cell folder-preview__cell--empty"></span>
        {/each}
      </span>
    {:else}
      <Icon name="folder" class="folder-tile__icon"/>
    {/if}
  </span>
  {#if settings.current.showTitles}
    <span class="tile__title">
      <span class="tile__title-text">{folder.title}</span>
    </span>
  {/if}
</a>

<style>
  .folder-preview {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 4px;
    width: 100%;
    height: 100%;
    padding: 8px;
  }

  .folder-preview__cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    border-radius: var(--radius-small);
    background: var(--cell-bg);
    color: var(--text-muted);
  }

  .folder-preview__cell--empty {
    background: none;
  }

  .tile__visual :global(.folder-tile__icon) {
    width: auto;
    height: calc(var(--icon-scale) * 1%);
    color: var(--accent);
    stroke-width: 1.5;
  }
</style>
