<script lang="ts">
  import {type BookmarkNode, bookmarks} from '../../../lib/bookmarks.svelte';
  import {brokenLinks} from '../../../lib/brokenLinks.svelte';
  import {hashColor} from '../../../lib/color';
  import {icons} from '../../../lib/icons.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import Icon from '../ui/Icon.svelte';
  import SiteIcon from './SiteIcon.svelte';

  // One cell of a folder tile's preview: a site, or a subfolder in the style chosen in the settings.
  // What's set for the item itself shows here too: a subfolder's own picture, a "doesn't work" mark
  let {item}: {item: BookmarkNode} = $props();

  const style = $derived(settings.current.subfolderStyle);
  const picture = $derived(item.url ? null : thumbnails.get(item.id));
  const broken = $derived(item.url ? brokenLinks.get(item.id) : undefined);
  /** A subfolder without a picture of its own — drawn in the chosen style */
  const plainFolder = $derived(!item.url && !picture?.url);

  /** "Its contents": the subfolder's first sites, updated together with the bookmarks */
  const CONTENTS_SIZE = 4;
  let contents = $state.raw<BookmarkNode[]>([]);
  $effect(() => {
    if (item.url || style !== 'contents') return;
    void bookmarks.items; // Any change to bookmarks may change this subfolder too
    let cancelled = false;
    chrome.bookmarks.getChildren(item.id)
      .then((children) => {
        if (!cancelled) contents = children.filter((child) => child.url).slice(0, CONTENTS_SIZE);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  });
</script>

<span
  class={{
    'preview-cell': true,
    'preview-cell--folder': plainFolder,
    [`preview-cell--${style}`]: plainFolder,
    'preview-cell--broken': Boolean(broken),
  }}
  style:--letter-color={!item.url && style === 'letter' ? hashColor(item.title) : undefined}
  title={item.title}
>
  {#if item.url}
    {#if broken}
      <Icon name="linkOff" class="preview-cell__broken"/>
    {:else}
      <SiteIcon entry={icons.get(item.url)} appearance="cell"/>
    {/if}
  {:else if picture?.url}
    <img class="preview-cell__picture" src={picture.url} alt="">
  {:else if style === 'letter'}
    <!-- The letter sits in a folder shape: not to be taken for a site without an icon -->
    <span class="preview-cell__lettered">
      <Icon name="folder" class="preview-cell__folder-icon"/>
      <span class="preview-cell__letter">{(item.title.trim().charAt(0) || '?').toUpperCase()}</span>
    </span>
  {:else if style === 'contents' && contents.length > 0}
    <span class="preview-cell__contents">
      {#each contents as child (child.id)}
        <SiteIcon entry={icons.get(child.url!)} appearance="mini"/>
      {/each}
    </span>
  {:else}
    <!-- A subfolder — the icon fills the cell so it stands out from sites right away -->
    <Icon name="folder" class="preview-cell__folder-icon"/>
  {/if}
</span>

<style>
  .preview-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    overflow: hidden;
    border-radius: var(--radius-small);
    background: var(--cell-bg);
    color: var(--text-muted);
  }

  /* A subfolder — a dense accent fill and a border: clearly not a site */
  .preview-cell--folder {
    background: color-mix(in oklab, var(--accent) 28%, var(--cell-bg));
    color: var(--accent);
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--accent) 50%, transparent);
  }

  .preview-cell :global(.preview-cell__folder-icon) {
    width: 72%;
    height: 72%;
    fill: color-mix(in oklab, var(--accent) 45%, transparent);
    stroke-width: 2;
  }

  /* Filled: a solid folder */
  .preview-cell--filled :global(.preview-cell__folder-icon) {
    fill: var(--accent);
    stroke: var(--accent);
  }

  /* The first letter inside a folder of the subfolder's own colour */
  .preview-cell__lettered {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .preview-cell--letter :global(.preview-cell__folder-icon) {
    fill: var(--letter-color);
    stroke: var(--letter-color);
  }

  .preview-cell__letter {
    position: absolute;
    /* A little lower than the middle: the folder's tab takes the top */
    top: 55%;
    color: #fff;
    /* The tile card is the size container: the letter grows with the tile */
    font-size: clamp(8px, 5cqi, 22px);
    font-weight: 700;
    line-height: 1;
    transform: translateY(-50%);
  }

  /* Its contents: up to four small site icons in a 2×2 grid */
  .preview-cell__contents {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
    width: 72%;
    height: 72%;
    place-items: center;
  }

  .preview-cell__contents :global(.site-icon--mini) {
    width: 100%;
    height: 100%;
  }

  .preview-cell__picture {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview-cell--broken {
    color: var(--danger);
  }

  .preview-cell :global(.preview-cell__broken) {
    width: 55%;
    height: 55%;
  }

  /* High contrast: every cell has a border, a subfolder uses the full accent colour */
  :global(:root[data-contrast='high']) .preview-cell {
    box-shadow: inset 0 0 0 1px var(--border);
  }

  :global(:root[data-contrast='high']) .preview-cell--folder {
    box-shadow: inset 0 0 0 2px var(--accent);
  }
</style>
