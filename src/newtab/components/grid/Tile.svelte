<script lang="ts">
  import type {Snippet} from 'svelte';
  import type {HTMLAnchorAttributes} from 'svelte/elements';
  import {settings} from '../../../lib/settings/store.svelte';

  // Общая разметка плитки: карточка с картинкой и название — внутри карточки или снаружи, сверху или снизу.
  // Ссылка, если передан href, иначе кнопка
  let {href, modifiers = {}, visualBackground = null, visual, label, ...rest}: {
    href?: string;
    /** Модификаторы блока: {folder: true} → класс tile--folder */
    modifiers?: Record<string, boolean | null | undefined>;
    /** Заливка области под картинкой (режим «иконка на весь блок») */
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
