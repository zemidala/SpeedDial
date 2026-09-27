<script lang="ts">
  import {hashColor} from '../../../lib/color';
  import {type IconEntry, icons} from '../../../lib/icons.svelte';
  import {siteName} from '../../../lib/url';

  // plate — icon on a plate; fill — no plate, large (the tile fills the area around it);
  // cell — fills a folder preview cell; mini — small, next to the name
  let {entry, appearance = 'plate'}: {entry: IconEntry; appearance?: 'plate' | 'fill' | 'cell' | 'mini'} = $props();

  const info = $derived(entry.info);
  // Letter and colour come from the site name: for ru.wikipedia.org it's W, not R
  const host = $derived(siteName(entry.pageUrl));
  const letter = $derived((host.charAt(0) || '?').toUpperCase());
  const showLetter = $derived(!info && entry.loaded);

  // An icon with its own background (like apple-touch-icon) fills the whole plate; on a large tile — only a large one
  // Without a plate ("fill") such an icon is shown whole as a rounded square, like an app icon — its own colours,
  // the same in every browser
  const cover = $derived(Boolean(info?.fullBleed && (
    ((appearance === 'plate' || appearance === 'fill') && info.source !== 'browser' && info.size >= 96)
    || appearance === 'cell'
  )));

  // A black logo on a transparent background (GitHub's) vanishes on a dark tile: without a light plate under it
  // (large icons without a plate, small ones next to names) it's drawn light in the dark theme
  const lighten = $derived(Boolean(info?.darkMonochrome) && icons.dark && (appearance === 'fill' || appearance === 'mini'));

  // Don't stretch the image more than 1.5× beyond its real pixels — otherwise it gets blurry
  const maxSize = $derived(info ? `${Math.max(16, Math.round(info.size / window.devicePixelRatio * 1.5))}px` : undefined);
</script>

<!-- The icon is decorative: the site name is always next to it -->
<span
  aria-hidden="true"
  class="site-icon site-icon--{appearance}"
  class:site-icon--cover={cover}
  class:site-icon--letter={showLetter}
  class:site-icon--lighten={lighten}
  class:site-icon--own-background={info?.fullBleed}
  style:--letter-color={showLetter ? hashColor(host) : undefined}
  style:--icon-max={maxSize}
>
  {#if info}
    <img class="site-icon__image" src={info.src} alt="">
  {:else if showLetter}
    <span class="site-icon__letter">{letter}</span>
  {/if}
</span>

<style>
  .site-icon {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
  }

  .site-icon__image {
    display: block;
    aspect-ratio: 1;
    object-fit: contain;
  }

  /* The logo turns an even light grey: first all black, then inverted — no tint from its original dark shade */
  .site-icon--lighten .site-icon__image {
    filter: brightness(0) invert(0.9);
  }

  .site-icon__letter {
    color: #fff;
    font-weight: 600;
    line-height: 1;
    user-select: none;
  }

  /* ===== On a plate ===== */
  .site-icon--plate {
    /* Size comes from --site-icon-size (e.g. in the services menu), otherwise a share of the tile area height */
    height: var(--site-icon-size, calc(var(--icon-scale) * 1%));
    max-width: 90%;
    overflow: hidden;
    border-radius: 22%;
    background: var(--plate-bg);
    box-shadow: 0 1px 3px var(--shadow-color);
  }

  .site-icon--plate .site-icon__image {
    width: min(62%, var(--icon-max));
  }

  .site-icon--plate.site-icon--cover .site-icon__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .site-icon--plate.site-icon--letter {
    background: var(--letter-color);
  }

  .site-icon--plate .site-icon__letter {
    font-size: clamp(14px, calc(var(--icon-scale) * 0.3cqi), 52px);
  }

  /* ===== Fill ===== */
  .site-icon--fill {
    height: calc(var(--icon-scale) * 1%);
    max-width: 100%;
  }

  .site-icon--fill .site-icon__image {
    width: min(100%, var(--icon-max));
  }

  /* A logo without its own background (often an SVG with no margins, like GitHub's) gets breathing room —
     otherwise it runs into the tile's edges, while icons with their own background have margins drawn in */
  .site-icon--fill:not(.site-icon--own-background) .site-icon__image {
    width: min(78%, var(--icon-max));
  }

  /* An icon with its own background, whole, as an app icon: a rounded square on the tile's own background.
     Its colours come straight from the image — nothing is guessed around it, nothing is cut off */
  .site-icon--fill.site-icon--cover {
    overflow: hidden;
    border-radius: 18%;
  }

  .site-icon--fill.site-icon--cover .site-icon__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .site-icon--fill .site-icon__letter {
    font-size: clamp(16px, calc(var(--icon-scale) * 0.5cqi), 120px);
  }

  /* ===== Fills a folder preview cell: the same size as the subfolder icon ===== */
  .site-icon--cell {
    height: 72%;
    max-width: 72%;
    overflow: hidden;
    /* A light plate, as on large tiles: dark logos (GitHub, X) don't get lost in the dark theme */
    border-radius: 22%;
    background: var(--plate-bg);
    /* Letter size follows the icon size */
    container-type: size;
  }

  .site-icon--cell .site-icon__image {
    width: min(78%, var(--icon-max));
  }

  .site-icon--cell.site-icon--cover .site-icon__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .site-icon--cell.site-icon--letter {
    background: var(--letter-color);
  }

  .site-icon--cell .site-icon__letter {
    font-size: 60cqh;
  }

  /* ===== Small ===== */
  .site-icon--mini {
    width: 16px;
    height: 16px;
  }

  .site-icon--mini .site-icon__image {
    width: 100%;
  }

  .site-icon--mini.site-icon--letter {
    border-radius: 4px;
    background: var(--letter-color);
  }

  .site-icon--mini .site-icon__letter {
    font-size: 0.625rem;
  }
</style>
