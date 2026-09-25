<script lang="ts">
  import {type BookmarkNode, folderHref} from '../../../lib/bookmarks.svelte';
  import {FOLDER_PREVIEW_SIZE} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import Icon from '../ui/Icon.svelte';
  import SiteIcon from './SiteIcon.svelte';
  import Tile from './Tile.svelte';

  let {folder, preview}: {folder: BookmarkNode; preview: BookmarkNode[]} = $props();

  // Пустые ячейки дополняют сетку миниатюр до полного размера
  const emptyCells = $derived(Math.max(0, FOLDER_PREVIEW_SIZE - preview.length));
  const dropInto = $derived(dragDrop.target?.id === folder.id);
</script>

<Tile
  href={folderHref(folder.id)}
  modifiers={{folder: true, dragging: dragDrop.draggedId === folder.id, 'drop-into': dropInto}}
  title={folder.title}
  data-bookmark-id={folder.id}
  data-folder
>
  {#snippet visual()}
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
  {/snippet}
  {#snippet label()}
    <span class="tile__title-text">{folder.title}</span>
  {/snippet}
</Tile>

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
</style>
