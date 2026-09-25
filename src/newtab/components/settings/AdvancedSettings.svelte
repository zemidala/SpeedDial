<script lang="ts">
  import {downloadBlob, pickFile} from '../../../lib/files';
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
      done('Настройки импортированы');
    } catch (error) {
      done(error instanceof Error ? error.message : String(error));
    }
  }
</script>

<SwitchRow
  label="Не спрашивать подтверждения при удалении"
  checked={!current.confirmDelete}
  onchange={(skip) => settings.update({confirmDelete: !skip})}
/>

<SettingRow label="Очистить локальные миниатюры" hint="Снимки страниц и выбранные картинки закладок">
  <button
    type="button"
    class="button"
    onclick={() => (confirmation = {
      title: 'Очистить миниатюры?',
      message: 'Все снимки страниц и выбранные картинки будут удалены с этого устройства.',
      confirmLabel: 'Очистить',
      danger: true,
      onConfirm: async () => {
        await thumbnails.clearAll();
        done('Миниатюры удалены');
      },
    })}
  >Очистить</button>
</SettingRow>

<SettingRow label="Очистить иконки сайтов" hint="Иконки высокого качества загрузятся заново">
  <button
    type="button"
    class="button"
    onclick={async () => {
      await icons.clearSiteIcons();
      done('Иконки сайтов удалены');
    }}
  >Очистить</button>
</SettingRow>

<SettingRow label="Сброс к настройкам по умолчанию">
  <button
    type="button"
    class="button"
    onclick={() => (confirmation = {
      title: 'Сбросить настройки?',
      message: 'Все настройки вернутся к значениям по умолчанию. Закладки и миниатюры не изменятся.',
      confirmLabel: 'Сбросить',
      danger: true,
      onConfirm: () => {
        settings.replace({syncEnabled: current.syncEnabled});
        done('Настройки сброшены');
      },
    })}
  >Сбросить</button>
</SettingRow>

<SettingRow
  label="Удалить синхронизированные данные"
  hint="Удаляет настройки SpeedDial из аккаунта браузера. На этом устройстве они останутся"
>
  <button
    type="button"
    class="button"
    onclick={() => (confirmation = {
      title: 'Удалить данные из аккаунта?',
      message: 'Настройки SpeedDial будут удалены из аккаунта браузера на всех устройствах.',
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        await clearSyncedData();
        done('Синхронизированные данные удалены');
      },
    })}
  >Удалить</button>
</SettingRow>

<SettingRow label="Пользовательский CSS" hint="Применяется ко всей странице. До {MAX_CUSTOM_CSS_LENGTH} символов" stacked>
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

<SettingRow label="Импорт и экспорт настроек" hint="Только настройки расширения, без закладок и картинок">
  <button type="button" class="button" onclick={importSettings}>Импорт…</button>
  <button type="button" class="button" onclick={exportSettings}>Экспорт</button>
</SettingRow>

<SwitchRow
  label="Чтение буфера обмена"
  hint="В контекстном меню закладки появится «Вставить картинку из буфера обмена». Если это разрешение вас беспокоит, не включайте его"
  checked={permissions.clipboard}
  onchange={(enabled) => togglePermission(CLIPBOARD_ACCESS, enabled)}
/>
<SwitchRow
  label="Доступ к сайтам"
  hint="Нужен для иконок высокого качества и снимков страниц. Браузер спросит разрешение при включении"
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
