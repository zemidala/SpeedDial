<script lang="ts">
  import {hashColor} from '../../lib/color';
  import type {IconEntry} from '../../lib/icons.svelte';
  import {getHostname} from '../../lib/url';

  // tile — иконка на подложке, размер от ширины плитки; mini — маленькая, в миниатюрах папки
  let {entry, variant = 'tile'}: {entry: IconEntry; variant?: 'tile' | 'mini'} = $props();

  const info = $derived(entry.info);
  const host = $derived(getHostname(entry.pageUrl).replace(/^www\./, ''));
  const letter = $derived((host.charAt(0) || '?').toUpperCase());
  const showLetter = $derived(!info && entry.loaded);

  // Крупная иконка со своим фоном (как apple-touch-icon) заполняет всю подложку
  const fill = $derived(Boolean(info?.fromSite && info.fullBleed && info.size >= 96));

  // Не растягиваем исходник больше чем в 1,5 раза сверх его реальных пикселей — иначе он «мылится»
  const maxSize = $derived(info ? `${Math.max(16, Math.round(info.size / window.devicePixelRatio * 1.5))}px` : undefined);
</script>

{#if variant === 'mini'}
  {#if info}
    <img class="mini" src={info.src} alt="">
  {:else if showLetter}
    <span class="mini-letter" style:background={hashColor(host)}>{letter}</span>
  {/if}
{:else}
  <span
    class="plate"
    class:fill
    class:letter={showLetter}
    style:background={showLetter ? hashColor(host) : undefined}
  >
    {#if info}
      <img src={info.src} alt="" style:--icon-max={maxSize}>
    {:else if showLetter}
      {letter}
    {/if}
  </span>
{/if}

<style>
  .plate {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(28px, 32cqi, 112px);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 22%;
    background: var(--plate-bg);
    box-shadow: 0 1px 3px var(--shadow-color);
  }

  .plate img {
    width: min(62%, var(--icon-max));
    aspect-ratio: 1;
    object-fit: contain;
  }

  .plate.fill img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .plate.letter {
    color: #fff;
    font-size: clamp(14px, 15cqi, 52px);
    font-weight: 600;
    user-select: none;
  }

  .mini {
    width: 70%;
    max-width: 20px;
    aspect-ratio: 1;
    object-fit: contain;
  }

  .mini-letter {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 4px;
    color: #fff;
    font-size: 10px;
    font-weight: 600;
  }
</style>
