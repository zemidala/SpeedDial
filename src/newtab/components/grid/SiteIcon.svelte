<script lang="ts">
  import {hashColor} from '../../../lib/color';
  import {type IconEntry, icons} from '../../../lib/icons.svelte';
  import {siteName} from '../../../lib/url';

  // plate — icon on a plate; fill — no plate, large (the tile fills the area around it); smart — "by the logo":
  // the whole picture area takes after the icon (see iconLayout.ts); cell — fills a folder preview cell;
  // mini — small, next to the name
  let {entry, appearance = 'plate'}: {entry: IconEntry; appearance?: 'plate' | 'fill' | 'smart' | 'cell' | 'mini'} = $props();

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

  // ===== "By the logo" =====
  /** How far a seamless icon's fade reaches into it, at most — a share of its side */
  const MAX_FADE = 0.12;
  const layout = $derived(appearance === 'smart' ? info?.layout ?? null : null);
  /**
   * seamless — the area takes the icon's edge colour; logo — a plate of the logo's colour; app — on a blurred copy
   * of itself; photo — covers the area; shape — a light-edged icon in the dark theme (a light area would glare):
   * its own shape, stretched to the size of a plate, is the plate; plate — an icon whose pixels couldn't be read
   */
  const smartMode = $derived.by(() => {
    if (!layout) return 'plate';
    if (layout.kind === 'seamless') return layout.lightEdge && icons.dark ? 'shape' : 'seamless';
    return layout.kind;
  });
  const smartBackground = $derived.by(() => {
    if (!layout) return undefined;
    if (smartMode === 'seamless') {
      const gradient = layout.edgeGradient;
      return gradient ? `linear-gradient(${gradient[0]}, ${gradient[1]})` : layout.edgeColor;
    }
    if (smartMode !== 'logo') return undefined;
    const theme = icons.dark ? 'dark' : 'light';
    const plate = smartLighten ? 'dark' : layout.plateFor[theme];
    // A colourless logo that's seen on its own theme's plate needs no plate: a grey one is just a square a shade
    // off the tile. The other theme's plate stays — without it the logo isn't seen (white YouTube on a light tile)
    return plate === theme && !layout.tinted ? undefined : layout.plates[plate];
  });
  // A black logo in the dark theme: a pale plate would glare, so it's drawn light on the dark plate, as in "fill"
  const smartLighten = $derived(smartMode === 'logo' && icons.dark && Boolean(info?.darkMonochrome));
  /** What's sized and centred: the drawing inside a seamless icon, the visible part of a logo */
  const smartBox = $derived(layout ? (smartMode === 'seamless' ? layout.contentBox : layout.box) : null);
  /**
   * A seamless icon fades out over its margins (between its edge and the drawing, at most MAX_FADE of it): an edge
   * a shade off the tile — a gradient, a vignette — doesn't show as a square
   */
  const fadeMask = $derived.by(() => {
    if (smartMode !== 'seamless' || !layout) return undefined;
    const {box, contentBox: drawing} = layout;
    const width = (margin: number) => Math.max(0, Math.min(margin * 0.8, MAX_FADE));
    const percent = (value: number) => `${(value * 100).toFixed(2)}%`;
    const ramp = (direction: string, from: number, to: number, start: number, end: number) =>
      `linear-gradient(${direction}, transparent ${percent(from)}, #000 ${percent(from + width(start))}, ` +
      `#000 ${percent(to - width(end))}, transparent ${percent(to)})`;
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    return `${ramp('to right', box.x, right, drawing.x - box.x, right - drawing.x - drawing.w)}, ` +
      ramp('to bottom', box.y, bottom, drawing.y - box.y, bottom - drawing.y - drawing.h);
  });
</script>

{#if appearance === 'smart'}
  <!-- The image is a square: the layout's boxes are fractions of it. Sizes are worked out in CSS from the boxes -->
  <span
    aria-hidden="true"
    class="site-icon-smart site-icon-smart--{showLetter ? 'letter' : smartMode}"
    class:site-icon-smart--loading={!info && !entry.loaded}
    class:site-icon-smart--lighten={smartLighten}
    style:background={showLetter ? hashColor(host) : smartBackground}
    style:--icon-max={maxSize}
    style:--box-x={smartBox?.x}
    style:--box-y={smartBox?.y}
    style:--box-w={smartBox?.w}
    style:--box-h={smartBox?.h}
    style:--box-area={smartBox ? Math.sqrt(smartBox.w * smartBox.h) : undefined}
  >
    {#if info}
      {#if smartMode === 'app'}
        <img class="site-icon-smart__backdrop" src={info.src} alt="">
        <span class="site-icon-smart__app"><img class="site-icon-smart__image" src={info.src} alt=""></span>
      {:else if smartMode === 'shape'}
        <span class="site-icon-smart__shape"><img class="site-icon-smart__image" src={info.src} alt=""></span>
      {:else if smartMode === 'plate'}
        <span class="site-icon-smart__plate" class:site-icon-smart__plate--cover={info.fullBleed}>
          <img class="site-icon-smart__image" src={info.src} alt="">
        </span>
      {:else}
        <img class="site-icon-smart__image" src={info.src} alt="" style:mask-image={fadeMask}>
      {/if}
    {:else if showLetter}
      <span class="site-icon-smart__letter">{letter}</span>
    {/if}
  </span>
{:else}

<!-- The icon is decorative: the site name is always next to it -->
<span
  aria-hidden="true"
  class="site-icon site-icon--{appearance}"
  class:site-icon--cover={cover}
  class:site-icon--letter={showLetter}
  class:site-icon--loading={!info && !entry.loaded}
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
{/if}

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

  /* ===== By the logo: the whole picture area of the tile =====
     The drawing (or the visible part of a logo) is sized by its area — sqrt(w·h) is 0.88 × icon size % of the height
     (44% by default), so a small icon with wide margins and one without them weigh the same; within 80% of the width
     and 64% of the height, and not blown up past the image's real pixels */
  .site-icon-smart {
    position: absolute;
    inset: 0;
    overflow: hidden;
    container-type: size;
    --side: min(
      calc(var(--icon-scale) * 0.88cqh / var(--box-area, 1)),
      calc(80cqw / var(--box-w, 1)),
      calc(64cqh / var(--box-h, 1)),
      var(--icon-max, 100cqh)
    );
  }

  .site-icon-smart--seamless .site-icon-smart__image,
  .site-icon-smart--logo .site-icon-smart__image {
    position: absolute;
    left: calc(50cqw - (var(--box-x) + var(--box-w) / 2) * var(--side));
    top: calc(50cqh - (var(--box-y) + var(--box-h) / 2) * var(--side));
    width: var(--side);
    height: var(--side);
    object-fit: contain;
  }

  .site-icon-smart--seamless .site-icon-smart__image {
    mask-composite: intersect;
  }

  .site-icon-smart--lighten .site-icon-smart__image {
    filter: brightness(0) invert(0.9);
  }

  .site-icon-smart--photo .site-icon-smart__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* A busy background: the icon whole, as an app icon, on a blurred copy of itself — the colours always match */
  .site-icon-smart__backdrop {
    position: absolute;
    inset: -20%;
    width: 140%;
    height: 140%;
    object-fit: cover;
    filter: blur(14px) saturate(1.2);
    opacity: 0.9;
  }

  .site-icon-smart__app,
  .site-icon-smart__plate {
    position: absolute;
    left: 50%;
    top: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    height: min(calc(var(--icon-scale) * 1.2cqh), 72cqh);
    aspect-ratio: 1;
    overflow: hidden;
    transform: translate(-50%, -50%);
  }

  /* Whole, it's not blown up past the image's real pixels either — a small favicon would turn into squares */
  .site-icon-smart__app,
  .site-icon-smart__plate--cover {
    max-height: var(--icon-max, none);
  }

  .site-icon-smart__app {
    border-radius: 20%;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.25);
  }

  .site-icon-smart__app .site-icon-smart__image,
  .site-icon-smart__plate--cover .site-icon-smart__image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* The icon's own shape as the plate: its visible part fills a plate-sized square. Sharp corners get rounded
     like a plate; a rounded square or a circle keeps its own outline */
  .site-icon-smart__shape {
    position: absolute;
    left: 50%;
    top: 50%;
    height: min(calc(var(--icon-scale) * 1.16cqh), 70cqh, calc(var(--icon-max, 100cqh) * var(--box-area, 1)));
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 22%;
    transform: translate(-50%, -50%);
    container-type: size;
  }

  .site-icon-smart__shape .site-icon-smart__image {
    position: absolute;
    left: calc(-100cqw * var(--box-x) / var(--box-w));
    top: calc(-100cqh * var(--box-y) / var(--box-h));
    width: calc(100cqw / var(--box-w));
    height: calc(100cqh / var(--box-h));
    max-width: none;
  }

  .site-icon-smart__plate {
    height: min(calc(var(--icon-scale) * 1.16cqh), 70cqh);
    border-radius: 22%;
    background: var(--plate-bg);
    box-shadow: 0 1px 3px var(--shadow-color);
  }

  .site-icon-smart__plate:not(.site-icon-smart__plate--cover) .site-icon-smart__image {
    width: min(62%, var(--icon-max));
    object-fit: contain;
  }

  .site-icon-smart--letter {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .site-icon-smart__letter {
    color: #fff;
    font-size: clamp(16px, calc(var(--icon-scale) * 0.9cqh), 120px);
    font-weight: 600;
    line-height: 1;
    user-select: none;
  }

  .site-icon-smart--loading::after {
    position: absolute;
    inset: 0;
    background: color-mix(in oklab, var(--text) 8%, transparent);
    content: '';
    opacity: 0;
    animation: skeleton-pulse 1.4s ease-in-out 0.15s infinite;
  }

  /* ===== Fills a folder preview cell: the same size as the subfolder icon =====
     A square by the cell's shorter side (the cell is a size container) — not stretched in tall or wide cells */
  .site-icon--cell {
    width: min(72cqw, 72cqh);
    height: min(72cqw, 72cqh);
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

  /* ===== Still loading: a softly pulsing plate =====
     It fades in after a short delay (skeleton-pulse in tile.css): an icon from the cache appears without a flash */
  .site-icon--loading {
    position: relative;
  }

  /* Plates and cells are rounded already; without a plate the placeholder is an app-icon square */
  .site-icon--fill.site-icon--loading {
    border-radius: 18%;
  }

  .site-icon--mini.site-icon--loading {
    border-radius: 4px;
  }

  .site-icon--loading::after {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: color-mix(in oklab, var(--text) 12%, transparent);
    content: '';
    opacity: 0;
    animation: skeleton-pulse 1.4s ease-in-out 0.15s infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .site-icon--loading::after,
    .site-icon-smart--loading::after {
      opacity: 0.6;
      animation: none;
    }
  }

  .site-icon--mini .site-icon__letter {
    font-size: 0.625rem;
  }
</style>
