<script lang="ts">
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
    aria-label="Сервисы"
    title="Сервисы"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    <Icon name="apps"/>
  </button>

  {#if open}
    <nav class="services-menu__popup" aria-label="Сервисы">
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
        <p class="services-menu__empty">Список сервисов пуст — его можно заполнить в настройках</p>
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
    /* Размер буквы-заглушки считается от ширины пункта */
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 10px 4px;
    border-radius: var(--radius-small);
    color: var(--text);
    font-size: 12px;
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
