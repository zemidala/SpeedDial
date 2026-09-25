<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {collectBookmarks} from '../../../lib/folders';
  import {SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {ui} from '../../../lib/ui.svelte';
  import {isWebUrl} from '../../../lib/url';
  import Icon from '../ui/Icon.svelte';

  const running = $derived(thumbnails.progress !== null);

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

  // Повторное нажатие во время съёмки — остановить (с подтверждением)
  function onclick() {
    if (!running) {
      refresh().catch((error) => console.error('Failed to refresh thumbnails', error));
      return;
    }
    ui.dialog = {
      kind: 'confirm',
      title: 'Остановить создание миниатюр?',
      message: 'Уже готовые миниатюры сохранятся, остальные не будут созданы.',
      confirmLabel: 'Остановить',
      onConfirm: () => thumbnails.cancelCapture(),
    };
  }
</script>

<button
  type="button"
  class="icon-button"
  class:icon-button--active={running}
  aria-label={running ? 'Остановить создание миниатюр' : 'Обновить миниатюры'}
  title={running ? 'Остановить создание миниатюр' : 'Обновить миниатюры'}
  {onclick}
>
  {#if thumbnails.progress}
    {thumbnails.progress.done}/{thumbnails.progress.total}
  {:else}
    <Icon name="refresh"/>
  {/if}
</button>
