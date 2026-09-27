<script lang="ts">
  import {t} from '../../../lib/i18n/index.svelte';
  import type {SettingsTab} from '../../../lib/ui.svelte';
  import Icon, {type IconName} from '../ui/Icon.svelte';
  import Modal from '../ui/Modal.svelte';
  import AboutSettings from './AboutSettings.svelte';
  import AdvancedSettings from './AdvancedSettings.svelte';
  import BackupSettings from './BackupSettings.svelte';
  import GeneralSettings from './GeneralSettings.svelte';
  import ViewSettings from './ViewSettings.svelte';

  let {initialTab = 'view', onclose}: {initialTab?: SettingsTab; onclose: () => void} = $props();

  const TABS = [
    {id: 'view', icon: 'palette'},
    {id: 'general', icon: 'settings'},
    {id: 'backup', icon: 'cloud'},
    {id: 'advanced', icon: 'sliders'},
    {id: 'about', icon: 'info'},
  ] as const satisfies ReadonlyArray<{id: SettingsTab; icon: IconName}>;

  type TabId = (typeof TABS)[number]['id'];

  const baseId = $props.id();
  // Only the tab the dialog opens on — later changes of the prop don't switch tabs
  // svelte-ignore state_referenced_locally
  let activeTab = $state<TabId>(initialTab);
  let tablist: HTMLElement;

  // Arrow keys, Home and End move between tabs, as in a native tab strip
  function onkeydown(event: KeyboardEvent) {
    const index = TABS.findIndex((tab) => tab.id === activeTab);
    const next = {
      ArrowRight: (index + 1) % TABS.length,
      ArrowLeft: (index - 1 + TABS.length) % TABS.length,
      Home: 0,
      End: TABS.length - 1,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    activeTab = TABS[next].id;
    tablist.querySelector<HTMLElement>(`#${CSS.escape(`${baseId}-${activeTab}-tab`)}`)?.focus();
  }
</script>

<Modal title={t.settings.title} size="large" {onclose}>
  <!-- Segmented tab strip, like the segmented controls in Edge's settings -->
  <div class="settings-tabs">
    <div bind:this={tablist} class="settings-tabs__list" role="tablist" aria-label={t.settings.sections} tabindex="-1" {onkeydown}>
      {#each TABS as tab (tab.id)}
        {@const active = activeTab === tab.id}
        <button
          id="{baseId}-{tab.id}-tab"
          type="button"
          role="tab"
          class="settings-tabs__tab"
          class:settings-tabs__tab--active={active}
          aria-selected={active}
          aria-controls="{baseId}-panel"
          tabindex={active ? 0 : -1}
          onclick={() => (activeTab = tab.id)}
        >
          <Icon name={tab.icon} size={16}/>
          <span class="settings-tabs__label">{t.settings.tabs[tab.id]}</span>
        </button>
      {/each}
    </div>
  </div>

  <div id="{baseId}-panel" class="settings-dialog__panel" role="tabpanel" aria-labelledby="{baseId}-{activeTab}-tab">
    {#if activeTab === 'view'}
      <ViewSettings/>
    {:else if activeTab === 'general'}
      <GeneralSettings/>
    {:else if activeTab === 'backup'}
      <BackupSettings/>
    {:else if activeTab === 'advanced'}
      <AdvancedSettings/>
    {:else}
      <AboutSettings/>
    {/if}
  </div>

  {#snippet footer()}
    <button type="button" class="button button--primary" onclick={onclose}>{t.common.done}</button>
  {/snippet}
</Modal>

<style>
  /* Stays on top while the settings scroll */
  .settings-tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0 -20px;
    padding: 4px 20px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  /* The track: one rounded strip holding all tabs */
  .settings-tabs__list {
    display: flex;
    gap: 4px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: light-dark(var(--surface-muted), color-mix(in oklab, var(--surface), #000 18%));
  }

  .settings-tabs__tab {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: var(--text-muted);
    font-weight: 600;
    cursor: pointer;
    transition: background-color 0.15s, color 0.15s, box-shadow 0.15s;
  }

  .settings-tabs__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-tabs__tab:hover {
    background: color-mix(in oklab, var(--text) 6%, transparent);
    color: var(--text);
  }

  /* The selected tab is a raised "pill" with the accent colour */
  .settings-tabs__tab--active,
  .settings-tabs__tab--active:hover {
    border-color: var(--border);
    background: light-dark(var(--surface), color-mix(in oklab, var(--surface), #fff 8%));
    color: var(--accent);
    box-shadow: 0 1px 3px var(--shadow-color);
  }

  .settings-tabs__tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 1px;
  }

  /* On a narrow window only icons remain; the name is still read by screen readers */
  @media (max-width: 560px) {
    .settings-tabs__label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  .settings-dialog__panel {
    padding-top: 4px;
  }
</style>
