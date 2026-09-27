<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {FOLDER_PREVIEW_SIZE} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {folderOpenHandlers} from '../../../lib/navigation';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import Icon from '../ui/Icon.svelte';
  import PreviewCell from './PreviewCell.svelte';
  import Tile from './Tile.svelte';

  let {folder, preview}: {folder: BookmarkNode; preview: BookmarkNode[]} = $props();

  // Empty cells pad the preview grid to its full size
  const emptyCells = $derived(Math.max(0, FOLDER_PREVIEW_SIZE - preview.length));
  const dropInto = $derived(dragDrop.target?.id === folder.id);
  const image = $derived(thumbnails.get(folder.id));
</script>

<Tile
  modifiers={{folder: true, dragging: dragDrop.draggedId === folder.id, 'drop-into': dropInto}}
  title={folder.title}
  draggable="true"
  data-bookmark-id={folder.id}
  data-folder
  {...folderOpenHandlers(folder.id)}
>
  {#snippet visual()}
    {#if image.url}
      <!-- A picture chosen for the folder in the "Image" dialog -->
      <img class="tile__thumbnail" src={image.url} alt="">
    {:else if settings.current.folderPreview}
      <span class="folder-preview" aria-hidden="true">
        {#each preview as item (item.id)}
          <PreviewCell {item}/>
        {/each}
        {#each {length: emptyCells}, i (i)}
          <span class="folder-preview__empty"></span>
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

  .folder-preview__empty {
    min-height: 0;
  }
</style>
