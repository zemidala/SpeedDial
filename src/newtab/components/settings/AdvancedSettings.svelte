<script lang="ts">
  import {downloadBlob, pickFile} from '../../../lib/files';
  import {t} from '../../../lib/i18n/index.svelte';
  import {icons} from '../../../lib/icons.svelte';
  import {CLIPBOARD_ACCESS, SITE_ACCESS} from '../../../lib/permissionSets';
  import {permissions} from '../../../lib/permissions.svelte';
  import {MAX_CUSTOM_CSS_LENGTH} from '../../../lib/settings/schema';
  import {clearSyncedData} from '../../../lib/settings/storage';
  import {settings} from '../../../lib/settings/store.svelte';
  import {parseSettingsFile, serializeSettings, settingsFileName} from '../../../lib/settings/transfer';
  import {thumbnails} from '../../../lib/thumbnails/store.svelte';
  import type {ConfirmOptions} from '../../../lib/ui.svelte';
  import ConfirmDialog from '../ui/ConfirmDialog.svelte';
  import SettingRow from './SettingRow.svelte';
  import SwitchRow from './SwitchRow.svelte';

  const current = $derived(settings.current);

  let confirmation = $state<ConfirmOptions | null>(null);
  let status = $state('');

  function done(message: string) {
    status = message;
  }

  async function togglePermission(permission: chrome.permissions.Permissions, enabled: boolean) {
    if (enabled) await permissions.request(permission);
    else await permissions.remove(permission);
  }

  function exportSettings() {
    const json = serializeSettings(settings.snapshot());
    downloadBlob(settingsFileName(), new Blob([json], {type: 'application/json'}));
  }

  async function importSettings() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    try {
      settings.replace(parseSettingsFile(await file.text(), settings.snapshot()));
      done(t.advanced.imported);
    } catch (error) {
      done(error instanceof Error ? error.message : String(error));
    }
  }
</script>

<SwitchRow
  label={t.advanced.confirmDelete}
  hint={t.advanced.confirmDeleteHint}
  checked={current.confirmDelete}
  onchange={(confirmDelete) => settings.update({confirmDelete})}
/>

<SettingRow label={t.advanced.clearThumbnails} hint={t.advanced.clearThumbnailsHint}>
  <button
    type="button"
    class="button"
    onclick={() => (confirmation = {
      title: t.advanced.clearThumbnailsTitle,
      message: t.advanced.clearThumbnailsMessage,
      confirmLabel: t.common.clear,
      danger: true,
      onConfirm: async () => {
        await thumbnails.clearAll();
        done(t.advanced.thumbnailsCleared);
      },
    })}
  >{t.common.clear}</button>
</SettingRow>

<SettingRow label={t.advanced.clearIcons} hint={t.advanced.clearIconsHint}>
  <button
    type="button"
    class="button"
    onclick={async () => {
      await icons.clearSiteIcons();
      done(t.advanced.iconsCleared);
    }}
  >{t.common.clear}</button>
</SettingRow>

<SettingRow label={t.advanced.resetSettings}>
  <button
    type="button"
    class="button"
    onclick={() => (confirmation = {
      title: t.advanced.resetTitle,
      message: t.advanced.resetMessage,
      confirmLabel: t.common.reset,
      danger: true,
      onConfirm: () => {
        settings.replace({syncEnabled: current.syncEnabled});
        done(t.advanced.settingsReset);
      },
    })}
  >{t.common.reset}</button>
</SettingRow>

<SettingRow
  label={t.advanced.clearSynced}
  hint={t.advanced.clearSyncedHint}
>
  <button
    type="button"
    class="button"
    onclick={() => (confirmation = {
      title: t.advanced.clearSyncedTitle,
      message: t.advanced.clearSyncedMessage,
      confirmLabel: t.common.delete,
      danger: true,
      onConfirm: async () => {
        await clearSyncedData();
        done(t.advanced.syncedCleared);
      },
    })}
  >{t.common.delete}</button>
</SettingRow>

<SettingRow label={t.advanced.customCss} hint={t.advanced.customCssHint(MAX_CUSTOM_CSS_LENGTH)} stacked>
  {#snippet children(id)}
    <textarea
      {id}
      class="textarea"
      rows="6"
      spellcheck="false"
      maxlength={MAX_CUSTOM_CSS_LENGTH}
      placeholder={'.tile__title {\n  font-weight: 600;\n}'}
      value={current.customCss}
      oninput={(event) => settings.update({customCss: event.currentTarget.value})}
    ></textarea>
  {/snippet}
</SettingRow>

<SettingRow label={t.advanced.transfer} hint={t.advanced.transferHint}>
  <button type="button" class="button" onclick={importSettings}>{t.advanced.import}</button>
  <button type="button" class="button" onclick={exportSettings}>{t.advanced.export}</button>
</SettingRow>

<SwitchRow
  label={t.advanced.clipboard}
  hint={t.advanced.clipboardHint}
  checked={permissions.clipboard}
  onchange={(enabled) => togglePermission(CLIPBOARD_ACCESS, enabled)}
/>
<SwitchRow
  label={t.advanced.siteAccess}
  hint={t.advanced.siteAccessHint}
  checked={permissions.siteAccess}
  onchange={(enabled) => togglePermission(SITE_ACCESS, enabled)}
/>

{#if status}
  <p class="settings-status" role="status">{status}</p>
{/if}

{#if confirmation}
  <ConfirmDialog options={confirmation} onclose={() => (confirmation = null)}/>
{/if}

<style>
  .settings-status {
    margin: 12px 0 0;
    padding: 8px 12px;
    border-radius: var(--radius-small);
    background: var(--surface-muted);
    color: var(--text-muted);
  }
</style>
