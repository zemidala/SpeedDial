<script lang="ts">
  import Modal from '../ui/Modal.svelte';
  import AdvancedSettings from './AdvancedSettings.svelte';
  import BackupSettings from './BackupSettings.svelte';
  import GeneralSettings from './GeneralSettings.svelte';
  import ViewSettings from './ViewSettings.svelte';

  let {onclose}: {onclose: () => void} = $props();

  const TABS = [
    {id: 'view', label: 'Вид'},
    {id: 'general', label: 'Общие'},
    {id: 'backup', label: 'Копии'},
    {id: 'advanced', label: 'Расширенные'},
  ] as const;

  type TabId = (typeof TABS)[number]['id'];

  const baseId = $props.id();
  let activeTab = $state<TabId>('view');
</script>

<Modal title="Настройки" size="large" {onclose}>
  <div class="settings-tabs" role="tablist" aria-label="Разделы настроек">
    {#each TABS as tab (tab.id)}
      <button
        id="{baseId}-{tab.id}-tab"
        type="button"
        role="tab"
        class="settings-tabs__tab"
        class:settings-tabs__tab--active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        aria-controls="{baseId}-panel"
        onclick={() => (activeTab = tab.id)}
      >{tab.label}</button>
    {/each}
  </div>

  <div id="{baseId}-panel" class="settings-dialog__panel" role="tabpanel" aria-labelledby="{baseId}-{activeTab}-tab">
    {#if activeTab === 'view'}
      <ViewSettings/>
    {:else if activeTab === 'general'}
      <GeneralSettings/>
    {:else if activeTab === 'backup'}
      <BackupSettings/>
    {:else}
      <AdvancedSettings/>
    {/if}
  </div>

  {#snippet footer()}
    <button type="button" class="button button--primary" onclick={onclose}>Готово</button>
  {/snippet}
</Modal>

<style>
  .settings-tabs {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    margin: 0 -20px;
    padding: 0 20px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .settings-tabs__tab {
    flex: 1;
    padding: 12px;
    border: none;
    border-bottom: 3px solid transparent;
    background: none;
    color: var(--text-muted);
    font-weight: 600;
    cursor: pointer;
  }

  .settings-tabs__tab:hover {
    color: var(--text);
  }

  .settings-tabs__tab--active {
    border-bottom-color: var(--accent);
    color: var(--text);
  }

  .settings-tabs__tab:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .settings-dialog__panel {
    padding-top: 8px;
  }
</style>
