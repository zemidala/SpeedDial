<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {FOLDER_PREVIEW_SIZE} from '../../../lib/constants';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {folderOpenHandlers} from '../../../lib/navigation';
  import {settings} from '../../../lib/settings/store.svelte';
  import Icon from '../ui/Icon.svelte';
  import SiteIcon from './SiteIcon.svelte';
  import Tile from './Tile.svelte';

  let {folder, preview}: {folder: BookmarkNode; preview: BookmarkNode[]} = $props();

  // Empty cells pad the preview grid to its full size
  const emptyCells = $derived(Math.max(0, FOLDER_PREVIEW_SIZE - preview.length));
  const dropInto = $derived(dragDrop.target?.id === folder.id);
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
    {#if settings.current.folderPreview}
      <span class="folder-preview" aria-hidden="true">
        {#each preview as item (item.id)}
          <span class="folder-preview__cell" class:folder-preview__cell--folder={!item.url} title={item.title}>
            {#if item.url}
              <SiteIcon entry={icons.get(item.url)} appearance="cell"/>
            {:else}
              <!-- A subfolder — the icon fills the cell so it stands out from sites right away -->
              <Icon name="folder" class="folder-preview__folder-icon"/>
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

  /* A subfolder — a dense accent fill and a border: clearly not a site */
  .folder-preview__cell--folder {
    background: color-mix(in oklab, var(--accent) 28%, var(--cell-bg));
    color: var(--accent);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 50%, transparent);
  }

  .folder-preview__cell :global(.folder-preview__folder-icon) {
    width: 72%;
    height: 72%;
    fill: color-mix(in oklab, var(--accent) 45%, transparent);
    stroke-width: 2;
  }

  /* High contrast: every cell has a border, a subfolder uses the full accent colour */
  :global(:root[data-contrast='high']) .folder-preview__cell:not(.folder-preview__cell--empty) {
    box-shadow: inset 0 0 0 1px var(--border);
  }

  :global(:root[data-contrast='high']) .folder-preview__cell--folder {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
</style>
