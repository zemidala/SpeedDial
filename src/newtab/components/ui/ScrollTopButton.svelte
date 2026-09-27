<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {t} from '../../../lib/i18n/index.svelte';
  import Icon from './Icon.svelte';

  // "Back to top" over the tile area: shows up once the tiles are scrolled down by half a screen
  let {scroller}: {scroller: HTMLElement | undefined} = $props();

  const reducedMotion = new MediaQuery('(prefers-reduced-motion: reduce)');
  let visible = $state(false);

  $effect(() => {
    const element = scroller;
    if (!element) return;
    const update = () => {
      visible = element.scrollTop > Math.max(200, element.clientHeight / 2);
    };
    update();
    element.addEventListener('scroll', update, {passive: true});
    // The area's height changes with the window, the scroll position with the folder's contents
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      element.removeEventListener('scroll', update);
      observer.disconnect();
    };
  });

  function scrollToTop() {
    if (!scroller) return;
    scroller.scrollTo({top: 0, behavior: reducedMotion.current ? 'instant' : 'smooth'});
    // The button hides at the top: the focus goes on to the first tile, not stays on a hidden button
    scroller.querySelector<HTMLElement>('.tile')?.focus({preventScroll: true});
  }
</script>

<button
  type="button"
  class="icon-button scroll-top"
  class:scroll-top--visible={visible}
  title={t.grid.scrollTop}
  aria-label={t.grid.scrollTop}
  tabindex={visible ? 0 : -1}
  aria-hidden={!visible}
  onclick={scrollToTop}
>
  <Icon name="arrowUp"/>
</button>

<style>
  .scroll-top {
    position: absolute;
    right: 16px;
    bottom: 16px;
    z-index: 10;
    opacity: 0;
    pointer-events: none;
    transform: translateY(8px);
    transition: opacity 0.15s, transform 0.15s;
  }

  .scroll-top--visible {
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .scroll-top {
      transition: none;
    }
  }
</style>
