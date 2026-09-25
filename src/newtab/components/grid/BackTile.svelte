<script lang="ts">
  import {folderHref} from '../../../lib/bookmarks.svelte';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import Icon from '../ui/Icon.svelte';

  // На плитку «Назад» можно перетащить закладку — она переместится в родительскую папку
  let {folderId}: {folderId: string} = $props();
</script>

<a
  class="tile tile--action"
  class:tile--drop-into={dragDrop.target?.id === folderId}
  href={folderHref(folderId)}
  title="Назад"
  data-drop-folder-id={folderId}
>
  <span class="tile__visual">
    <Icon name="back" class="action-tile__icon"/>
  </span>
  {#if settings.current.showTitles}
    <span class="tile__title"><span class="tile__title-text">Назад</span></span>
  {/if}
</a>

<style>
  .tile__visual :global(.action-tile__icon) {
    width: auto;
    height: calc(var(--icon-scale) * 0.6%);
  }
</style>
