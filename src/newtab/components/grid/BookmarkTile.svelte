<script lang="ts">
  import type {BookmarkNode} from '../../../lib/bookmarks.svelte';
  import {brokenLinks, describeProblem} from '../../../lib/brokenLinks.svelte';
  import {hashColor} from '../../../lib/color';
  import {dragDrop} from '../../../lib/dragDrop.svelte';
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {openUrl} from '../../../lib/navigation';
  import {descriptions, iconOnly} from '../../../lib/perBookmark.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import {displayHost, isWebUrl, siteName} from '../../../lib/url';
  import Icon from '../ui/Icon.svelte';
  import SiteIcon from './SiteIcon.svelte';
  import Tile from './Tile.svelte';

  let {bookmark}: {bookmark: BookmarkNode} = $props();

  const url = $derived(bookmark.url ?? '');
  const icon = $derived(icons.get(url));
  const thumbnail = $derived(thumbnails.get(bookmark.id));
  const {iconStyle, iconTint, showTitleIcons, openInNewTab} = $derived(settings.current);

  const broken = $derived(brokenLinks.get(bookmark.id));
  // The name, the description (if there is one) and why the link doesn't work (if marked)
  const tooltip = $derived([
    bookmark.title,
    descriptions.get(bookmark.id),
    broken && t.linkCheck.tileHint(describeProblem(broken.problem, broken.status)),
  ].filter(Boolean).join('\n'));
  // The thumbnail can be switched off for this bookmark in the "Icon" dialog — then the site icon is shown
  const hasThumbnail = $derived(Boolean(thumbnail.url) && !broken && !iconOnly.get(bookmark.id));
  const tint = $derived(iconTint && !hasThumbnail ? icon.info?.color : null);

  // In "fill" mode the area is filled with the icon's edge colour — the icon blends into the tile
  const fillColor = $derived.by(() => {
    if (iconStyle !== 'fill' || hasThumbnail) return null;
    if (icon.info) return icon.info.edgeColor;
    return icon.loaded ? hashColor(siteName(url)) : null;
  });

  // The browser opens web links itself (including Ctrl+click and the middle button).
  // Addresses like edge:// and file:// can't be opened by a link from an extension page — only via chrome.tabs.
  function open(event: MouseEvent, inNewTab: boolean) {
    if (isWebUrl(url)) return;
    event.preventDefault();
    openUrl(url, inNewTab ? 'background' : 'current').catch((error) => console.error('Failed to open', url, error));
  }
</script>

<Tile
  href={url}
  modifiers={{tinted: Boolean(tint), dragging: dragDrop.draggedId === bookmark.id, broken: Boolean(broken)}}
  visualBackground={broken ? null : fillColor}
  style={tint ? `--icon-color: ${tint}` : undefined}
  target={openInNewTab && isWebUrl(url) ? '_blank' : undefined}
  title={tooltip}
  data-bookmark-id={bookmark.id}
  onclick={(event: MouseEvent) => open(event, openInNewTab || event.ctrlKey || event.metaKey)}
  onauxclick={(event: MouseEvent) => event.button === 1 && open(event, true)}
>
  {#snippet visual()}
    {#if broken}
      <!-- Marked by the link check: a placeholder instead of the site icon and the thumbnail -->
      <span class="tile__broken" aria-hidden="true"><Icon name="linkOff" size={24}/></span>
    {:else if hasThumbnail}
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
