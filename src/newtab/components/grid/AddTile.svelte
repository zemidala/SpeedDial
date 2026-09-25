<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {ui} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';
  import Tile from './Tile.svelte';
</script>

<Tile
  modifiers={{action: true}}
  title="Добавить закладку"
  aria-label="Добавить закладку"
  onclick={() => (ui.dialog = {kind: 'create', type: 'bookmark', parentId: bookmarks.targetFolderId})}
>
  {#snippet visual()}
    <Icon name="plus" class="action-tile__icon"/>
  {/snippet}
  {#snippet label()}
    <span class="tile__title-text">Добавить</span>
  {/snippet}
</Tile>
