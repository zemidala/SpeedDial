<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {hashColor} from '../../../lib/color';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {openUrl} from '../../../lib/navigation';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {displayHost, isWebUrl} from '../../../lib/url';
  import SiteIcon from './SiteIcon.svelte';
  import Tile from './Tile.svelte';

  let {bookmark}: {bookmark: BookmarkNode} = $props();

  const url = $derived(bookmark.url ?? '');
  const icon = $derived(icons.get(url));
  const thumbnail = $derived(thumbnails.get(bookmark.id));
  const {iconStyle, iconTint, showTitleIcons, openInNewTab} = $derived(settings.current);

  const hasThumbnail = $derived(Boolean(thumbnail.url));
  const tint = $derived(iconTint && !hasThumbnail ? icon.info?.color : null);

  // В режиме «на весь блок» область заливается цветом краёв иконки — иконка сливается с плиткой
  const fillColor = $derived.by(() => {
    if (iconStyle !== 'fill' || hasThumbnail) return null;
    if (icon.info) return icon.info.edgeColor;
    return icon.loaded ? hashColor(displayHost(url)) : null;
  });

  // Веб-ссылки браузер открывает сам (включая Ctrl+клик и среднюю кнопку).
  // Адреса вроде edge:// и file:// ссылкой со страницы расширения не открыть — только через chrome.tabs.
  function open(event: MouseEvent, inNewTab: boolean) {
    if (isWebUrl(url)) return;
    event.preventDefault();
    openUrl(url, inNewTab ? 'background' : 'current').catch((error) => console.error('Failed to open', url, error));
  }
</script>

<Tile
  href={url}
  modifiers={{tinted: Boolean(tint), dragging: dragDrop.draggedId === bookmark.id}}
  visualBackground={fillColor}
  style={tint ? `--icon-color: ${tint}` : undefined}
  target={openInNewTab && isWebUrl(url) ? '_blank' : undefined}
  title={bookmark.title}
  data-bookmark-id={bookmark.id}
  onclick={(event: MouseEvent) => open(event, openInNewTab || event.ctrlKey || event.metaKey)}
  onauxclick={(event: MouseEvent) => event.button === 1 && open(event, true)}
>
  {#snippet visual()}
    {#if thumbnail.url}
      <img class="tile__thumbnail" src={thumbnail.url} alt="">
    {:else}
      <SiteIcon entry={icon} appearance={iconStyle}/>
    {/if}
  {/snippet}
  {#snippet label()}
    {#if showTitleIcons}
      <SiteIcon entry={icon} appearance="mini"/>
    {/if}
    <span class="tile__title-text">{bookmark.title || displayHost(url)}</span>
  {/snippet}
</Tile>
