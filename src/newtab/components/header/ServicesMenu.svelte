<script lang="ts">
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import SiteIcon from '../grid/SiteIcon.svelte';
  import Icon from '../ui/Icon.svelte';

  let open = $state(false);
  let root: HTMLElement;

  function onWindowClick(event: MouseEvent) {
    if (open && !root.contains(event.target as Node)) open = false;
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false;
  }
</script>

<svelte:window onclick={onWindowClick} onkeydown={onWindowKeydown}/>

<div class="services-menu" bind:this={root}>
  <button
    type="button"
    class="icon-button"
    class:icon-button--active={open}
    aria-label={t.header.services}
    title={t.header.services}
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="apps"/>
  </button>

  {#if open}
    <nav class="services-menu__popup" aria-label={t.header.services}>
      {#each settings.current.services as service, i (i)}
        <a
          class="services-menu__item"
          href={service.url}
          target={settings.current.openInNewTab ? '_blank' : undefined}
        >
          <SiteIcon entry={icons.get(service.url)}/>
          <span class="services-menu__title">{service.title}</span>
        </a>
      {:else}
        <p class="services-menu__empty">{t.header.servicesEmpty}</p>
      {/each}
    </nav>
  {/if}
</div>

<style>
  .services-menu {
    position: relative;
    z-index: 800;
  }

  .services-menu__popup {
    position: absolute;
    top: 48px;
    right: 0;
    display: grid;
    grid-template-columns: repeat(3, 96px);
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow-raised);
    --site-icon-size: 40px;
  }

  .services-menu__item {
    /* Placeholder letter size follows the item width */
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border-radius: var(--radius-small);
    color: var(--text);
    font-size: 0.75rem;
    text-align: center;
    text-decoration: none;
  }

  .services-menu__item:hover,
  .services-menu__item:focus-visible {
    background: var(--surface-hover);
    outline: none;
  }

  .services-menu__title {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .services-menu__empty {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--text-muted);
  }
</style>
