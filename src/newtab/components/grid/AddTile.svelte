<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {ui} from '../../../lib/ui.svelte';
  import Icon from '../ui/Icon.svelte';
</script>

<button
  type="button"
  class="tile tile--action add-tile"
  title="Добавить закладку"
  aria-label="Добавить закладку"
  onclick={() => (ui.dialog = {kind: 'create', type: 'bookmark', parentId: bookmarks.targetFolderId})}
>
  <span class="tile__visual">
    <Icon name="plus" class="action-tile__icon"/>
  </span>
  {#if settings.current.showTitles}
    <span class="tile__title"><span class="tile__title-text">Добавить</span></span>
  {/if}
</button>

<style>
  .add-tile {
    width: 100%;
    padding: 0;
    font: inherit;
    cursor: pointer;
  }

  .tile__visual :global(.action-tile__icon) {
    width: auto;
    height: calc(var(--icon-scale) * 0.6%);
  }
</style>
