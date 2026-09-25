<script lang="ts">
  import {folderHref} from '../../../lib/bookmarks.svelte';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import Icon from '../ui/Icon.svelte';
  import Tile from './Tile.svelte';

  // На плитку «Назад» можно перетащить закладку — она переместится в родительскую папку
  let {folderId}: {folderId: string} = $props();
</script>

<Tile
  href={folderHref(folderId)}
  modifiers={{action: true, 'drop-into': dragDrop.target?.id === folderId}}
  title="Назад"
  data-drop-folder-id={folderId}
>
  {#snippet visual()}
    <Icon name="back" class="action-tile__icon"/>
  {/snippet}
  {#snippet label()}
    <span class="tile__title-text">Назад</span>
  {/snippet}
</Tile>
