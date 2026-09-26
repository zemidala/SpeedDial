<script lang="ts">
  import {hashColor} from '../../../lib/color';
  import type {IconEntry} from '../../../lib/icons.svelte';
  import {siteName} from '../../../lib/url';

  // plate — иконка на подложке; fill — без подложки, крупно (область вокруг заливает плитка);
  // cell — на всю ячейку миниатюры папки; mini — маленькая, рядом с названием
  let {entry, appearance = 'plate'}: {entry: IconEntry; appearance?: 'plate' | 'fill' | 'cell' | 'mini'} = $props();

  const info = $derived(entry.info);
  // Буква и цвет — по названию сайта: у ru.wikipedia.org это W, а не R
  const host = $derived(siteName(entry.pageUrl));
  const letter = $derived((host.charAt(0) || '?').toUpperCase());
  const showLetter = $derived(!info && entry.loaded);

  // Иконка со своим фоном (как apple-touch-icon) заполняет подложку целиком; на большой плитке — только крупная
  const cover = $derived(Boolean(info?.fullBleed && (
    (appearance === 'plate' && info.source !== 'browser' && info.size >= 96) || appearance === 'cell'
  )));

  // Не растягиваем картинку больше чем в 1,5 раза сверх её реальных пикселей — иначе она «мылится»
  const maxSize = $derived(info ? `${Math.max(16, Math.round(info.size / window.devicePixelRatio * 1.5))}px` : undefined);
</script>

<!-- Иконка декоративная: название сайта всегда есть рядом -->
<span
  aria-hidden="true"
  class="site-icon site-icon--{appearance}"
  class:site-icon--cover={cover}
  class:site-icon--letter={showLetter}
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

  .site-icon__letter {
    color: #fff;
    font-weight: 600;
    line-height: 1;
    user-select: none;
  }

  /* ===== На подложке ===== */
  .site-icon--plate {
    /* Размер задаёт --site-icon-size (например, в меню сервисов), иначе доля высоты области плитки */
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

  /* ===== На весь блок ===== */
  .site-icon--fill {
    height: calc(var(--icon-scale) * 1%);
    max-width: 100%;
  }

  .site-icon--fill .site-icon__image {
    width: min(100%, var(--icon-max));
  }

  .site-icon--fill .site-icon__letter {
    font-size: clamp(16px, calc(var(--icon-scale) * 0.5cqi), 120px);
  }

  /* ===== На всю ячейку миниатюры папки: такого же размера, как значок подпапки ===== */
  .site-icon--cell {
    height: 72%;
    max-width: 72%;
    overflow: hidden;
    /* Светлая подложка, как у больших плиток: тёмные логотипы (GitHub, X) не теряются в тёмной теме */
    border-radius: 22%;
    background: var(--plate-bg);
    /* Размер буквы — от размера самой иконки */
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

  /* ===== Маленькая ===== */
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
