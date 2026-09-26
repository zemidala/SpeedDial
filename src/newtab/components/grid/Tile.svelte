<script lang="ts">
  import type {Snippet} from 'svelte';
  import type {HTMLAnchorAttributes} from 'svelte/elements';
  import {settings} from '../../../lib/settings/store.svelte';

  // Shared tile markup: a card with an image and a name — inside the card or outside, at the top or bottom.
  // A link if href is given, otherwise a button
  let {href, modifiers = {}, visualBackground = null, visual, label, ...rest}: {
    href?: string;
    /** Block modifiers: {folder: true} → class tile--folder */
    modifiers?: Record<string, boolean | null | undefined>;
    /** Fill of the area under the image ("fill" icon mode) */
    visualBackground?: string | null;
    visual: Snippet;
    label?: Snippet;
  } & Omit<HTMLAnchorAttributes, 'href'> = $props();

  const position = $derived(settings.current.titlePosition);
  const inside = $derived(position.endsWith('inside'));
  const showLabel = $derived(Boolean(label) && settings.current.showTitles);

  const classes = $derived([
    'tile',
    `tile--title-${position}`,
    ...Object.entries(modifiers).filter(([, enabled]) => enabled).map(([name]) => `tile--${name}`),
  ]);
</script>

{#snippet title()}
  <span class="tile__title">{@render label?.()}</span>
{/snippet}

<svelte:element
  this={href === undefined ? 'button' : 'a'}
  {href}
  type={href === undefined ? 'button' : undefined}
  class={classes}
  {...rest}
>
  <span class="tile__card">
    <span class="tile__visual" style:background={visualBackground}>
      {@render visual()}
    </span>
    {#if showLabel && inside}
      {@render title()}
    {/if}
  </span>
  {#if showLabel && !inside}
    {@render title()}
  {/if}
</svelte:element>
