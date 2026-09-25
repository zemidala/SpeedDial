<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {collectBookmarks} from '../../../lib/folders';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {isWebUrl} from '../../../lib/url';
  import Icon from '../ui/Icon.svelte';

  // Делает снимки всех веб-закладок открытой папки (и вложенных, если включено в настройках)
  async function refresh() {
    // Запрос разрешения — первым делом, пока действует клик пользователя
    if (!permissions.siteAccess && !(await permissions.request(SITE_ACCESS))) return;

    const [folder] = await chrome.bookmarks.getSubTree(bookmarks.folderId);
    const items = collectBookmarks(folder, settings.current.refreshIncludesSubfolders)
      .filter((node) => node.url && isWebUrl(node.url))
      .map((node) => ({id: node.id, url: node.url!}));
    await thumbnails.capture(items);
  }
</script>

<button
  type="button"
  class="icon-button"
  aria-label="Обновить миниатюры"
  title="Обновить миниатюры"
  disabled={thumbnails.progress !== null}
  onclick={() => refresh().catch((error) => console.error('Failed to refresh thumbnails', error))}
>
  {#if thumbnails.progress}
    {thumbnails.progress.done}/{thumbnails.progress.total}
  {:else}
    <Icon name="refresh"/>
  {/if}
</button>
