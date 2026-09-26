<script lang="ts">
  import {bookmarks} from '../../../lib/bookmarks.svelte';
  import {collectBookmarks} from '../../../lib/folders';
  import {t} from '../../../lib/i18n/index.svelte';
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
      title: t.header.stopTitle,
      message: t.header.stopMessage,
      confirmLabel: t.header.stopConfirm,
      onConfirm: () => thumbnails.cancelCapture(),
    };
  }
</script>

<button
  type="button"
  class="icon-button refresh-button"
  class:icon-button--active={running}
  aria-label={running ? t.header.stopThumbnails : t.header.refreshThumbnails}
  title={thumbnails.progress
    ? t.header.thumbnailsProgress(thumbnails.progress.done, thumbnails.progress.total)
    : t.header.refreshThumbnails}
  {onclick}
>
  {#if thumbnails.progress}
    <!-- Кольцо заполняется по мере готовности снимков -->
    <svg class="refresh-button__ring" viewBox="0 0 40 40" aria-hidden="true">
      <circle class="refresh-button__track" cx="20" cy="20" r="18.5"/>
      <circle
        class="refresh-button__bar"
        cx="20"
        cy="20"
        r="18.5"
        pathLength="100"
        stroke-dasharray="{Math.max(4, (thumbnails.progress.done / thumbnails.progress.total) * 100)} 100"
      />
    </svg>
    <Icon name="stop" size={16} class="refresh-button__stop"/>
    <span class="refresh-button__count">{thumbnails.progress.done}/{thumbnails.progress.total}</span>
  {:else}
    <Icon name="refresh"/>
  {/if}
</button>

<style>
  .refresh-button {
    position: relative;
  }

  .refresh-button__ring {
    position: absolute;
    inset: -1px;
    width: calc(100% + 2px);
    height: calc(100% + 2px);
    transform: rotate(-90deg);
    pointer-events: none;
  }

  .refresh-button__track,
  .refresh-button__bar {
    fill: none;
    stroke-width: 3;
  }

  .refresh-button__track {
    stroke: transparent;
  }

  .refresh-button__bar {
    stroke: var(--accent);
    stroke-linecap: round;
    transition: stroke-dasharray 0.3s ease;
  }

  .refresh-button :global(.refresh-button__stop) {
    fill: currentColor;
  }

  .refresh-button:hover :global(.refresh-button__stop) {
    color: var(--danger);
  }

  .refresh-button__count {
    position: absolute;
    bottom: -6px;
    left: 50%;
    padding: 0 5px;
    border-radius: 8px;
    background: var(--accent);
    color: var(--accent-text);
    font-size: 10px;
    font-weight: 600;
    line-height: 15px;
    white-space: nowrap;
    transform: translateX(-50%);
  }
</style>
