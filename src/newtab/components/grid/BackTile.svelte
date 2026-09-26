<script lang="ts">
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {folderOpenHandlers} from '../../../lib/navigation';
  import Icon from '../ui/Icon.svelte';
  import Tile from './Tile.svelte';

  // На плитку «Назад» можно перетащить закладку — она переместится в родительскую папку
  let {folderId}: {folderId: string} = $props();
</script>

<Tile
  modifiers={{action: true, 'drop-into': dragDrop.target?.id === folderId}}
  title={t.common.back}
  data-drop-folder-id={folderId}
  {...folderOpenHandlers(folderId)}
>
  {#snippet visual()}
    <Icon name="back" class="action-tile__icon"/>
  {/snippet}
  {#snippet label()}
    <span class="tile__title-text">{t.common.back}</span>
  {/snippet}
</Tile>
