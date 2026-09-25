<script lang="ts">
  import type {BookmarkNode} from '../../lib/bookmarks.svelte';
  import {icons} from '../../lib/icons.svelte';
  import {settings} from '../../lib/settings.svelte';
  import {getHostname, isWebUrl} from '../../lib/url';
  import SiteIcon from './SiteIcon.svelte';

  let {bookmark}: {bookmark: BookmarkNode} = $props();

  const url = $derived(bookmark.url ?? '');
  const icon = $derived(icons.get(url));
  const tint = $derived(settings.current.iconTint ? icon.info?.color : null);

  // Веб-ссылки браузер открывает сам (включая Ctrl+клик и среднюю кнопку).
  // Адреса вроде edge:// и file:// ссылкой со страницы расширения не открыть — только через chrome.tabs.
  function open(event: MouseEvent, inNewTab: boolean) {
    if (isWebUrl(url)) return;
    event.preventDefault();
    if (inNewTab) {
      chrome.tabs.create({url, active: false});
    } else {
      chrome.tabs.update({url});
    }
  }
</script>

<a
  class="tile"
  class:tinted={tint}
  style:--icon-color={tint}
  href={url}
  title={bookmark.title}
  data-bookmark-id={bookmark.id}
  onclick={(event) => open(event, event.ctrlKey || event.metaKey)}
  onauxclick={(event) => event.button === 1 && open(event, true)}
>
  <span class="visual">
    <SiteIcon entry={icon}/>
  </span>
  <span class="tile-title">{bookmark.title || getHostname(url)}</span>
</a>

<style>
  /* Лёгкий оттенок основного цвета иконки поверх цвета плитки */
  .tinted {
    background: color-mix(in oklab, var(--icon-color) 14%, var(--tile-bg));
  }

  .visual {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }
</style>
