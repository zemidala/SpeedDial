<script lang="ts">
  import {onMount} from 'svelte';
  import {type Backup, backupFileName, createBackup, parseBackup} from '../../../lib/backup/backup';
  import {connectionLabel} from '../../../lib/backup/cloud';
  import {redirectUrl} from '../../../lib/backup/oauth';
  import {OAUTH_PROVIDERS, type OAuthProviderId} from '../../../lib/backup/providers';
  import {cloud, restoreBackup} from '../../../lib/backup/store.svelte';
  import {serverOrigin} from '../../../lib/backup/webdav';
  import {downloadBlob, pickFile} from '../../../lib/files';
  import {permissions} from '../../../lib/permissions.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import RestoreDialog from './RestoreDialog.svelte';
  import SettingRow from './SettingRow.svelte';
  import SwitchRow from './SwitchRow.svelte';

  type PresetId = 'yandex' | 'google' | 'dropbox' | 'onedrive' | 'nextcloud' | 'other';

  // Облака: вход через окно сервиса (oauth) или по WebDAV с готовым адресом
  const PRESETS: Record<PresetId, {label: string; hint: string; url?: string; oauth?: OAuthProviderId}> = {
    yandex: {
      label: 'Яндекс.Диск',
      url: 'https://webdav.yandex.ru',
      hint: 'Логин — ваш логин Яндекса. Пароль — пароль приложения: id.yandex.ru → Безопасность → '
        + 'Пароли приложений → «Файлы (WebDAV)». Обычный пароль Яндекс не примет',
    },
    google: {label: 'Google Диск', oauth: 'google', hint: 'Копии лежат в скрытой папке приложения — среди ваших файлов их не видно'},
    dropbox: {label: 'Dropbox', oauth: 'dropbox', hint: 'Копии лежат в папке «Приложения/SpeedDial»'},
    onedrive: {label: 'OneDrive', oauth: 'onedrive', hint: 'Копии лежат в папке «Приложения/SpeedDial»'},
    nextcloud: {
      label: 'Nextcloud / ownCloud',
      url: '',
      hint: 'Адрес вида https://cloud.example.com/remote.php/dav/files/ЛОГИН/. '
        + 'Лучше создать пароль приложения в настройках безопасности Nextcloud',
    },
    other: {label: 'Другой WebDAV', url: '', hint: 'Koofr, Box, свой сервер — любой сервер WebDAV по https'},
  };

  const formId = $props.id();
  let preset = $state<PresetId>('yandex');
  let url = $state(PRESETS.yandex.url ?? '');
  let username = $state('');
  let password = $state('');

  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  /** Копия, которую собираются восстановить: имя файла на сервере или прочитанная из файла */
  let restoring = $state<{title: string; load: () => Promise<Backup>} | null>(null);

  // Распакованное расширение (режим разработки) показывает и ненастроенные облака — с подсказкой, как их настроить.
  // Установленное из магазина — только те, для которых в сборке есть Client ID
  let developer = $state(false);

  const presets = $derived(Object.entries(PRESETS).filter(([, item]) =>
    !item.oauth || developer || OAUTH_PROVIDERS[item.oauth].clientId) as [PresetId, (typeof PRESETS)[PresetId]][]);

  onMount(() => {
    chrome.management.getSelf()
      .then((self) => (developer = self.installType === 'development'))
      .catch(() => undefined);
    cloud.start()
      .then(() => cloud.config && cloud.loadFiles())
      .catch((e) => (error = e instanceof Error ? e.message : String(e)));
  });

  const oauth = $derived.by(() => {
    const id = PRESETS[preset].oauth;
    return id ? OAUTH_PROVIDERS[id] : null;
  });

  function choosePreset(id: PresetId) {
    preset = id;
    url = PRESETS[id].url ?? '';
    error = '';
  }

  async function signIn() {
    if (!oauth) return;
    // Разрешение — первым делом, пока действует нажатие кнопки
    if (!await permissions.request({origins: oauth.origins})) {
      error = `Без доступа к ${oauth.label} копии сохранять нельзя`;
      return;
    }
    await run(() => cloud.signIn(oauth.id), 'Подключено. Копии будут сохраняться автоматически');
  }

  /** Выполняет действие, показывая ход и ошибку под разделом */
  async function run(action: () => Promise<unknown>, done: string) {
    busy = true;
    status = '';
    error = '';
    try {
      await action();
      status = done;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  async function connect(event: SubmitEvent) {
    event.preventDefault();
    let origin: string;
    try {
      origin = serverOrigin(url);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      return;
    }
    // Разрешение — первым делом, пока действует нажатие кнопки
    const granted = await permissions.request({origins: [origin]});
    if (!granted) {
      error = 'Без доступа к серверу копии сохранять нельзя';
      return;
    }
    await run(() => cloud.connectWebDav({url, username, password}), 'Подключено. Копии будут сохраняться автоматически');
    if (!error) password = '';
  }

  async function saveToFile() {
    await run(async () => {
      const backup = await createBackup({includeImages: true}, chrome.bookmarks, settings.snapshot());
      downloadBlob(backupFileName(), new Blob([JSON.stringify(backup)], {type: 'application/json'}));
    }, 'Копия сохранена в файл');
  }

  async function restoreFromFile() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    restoring = {title: `Восстановить «${file.name}»`, load: async () => parseBackup(await file.text())};
  }

  const formatDate = (time: number) => new Date(time).toLocaleString('ru-RU', {dateStyle: 'medium', timeStyle: 'short'});
  const formatSize = (bytes: number) => (bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} МБ`
    : `${Math.max(1, Math.round(bytes / 1024))} КБ`);
</script>

<SettingRow label="Копия в файле" hint="Закладки с порядком, настройки, миниатюры и фон — в одном файле">
  <button type="button" class="button" disabled={busy} onclick={saveToFile}>Сохранить в файл</button>
  <button type="button" class="button" disabled={busy} onclick={restoreFromFile}>Восстановить…</button>
</SettingRow>

<h3 class="backup-settings__heading">Копии в облаке</h3>

{#if !cloud.loaded}
  <p class="backup-settings__note">Загрузка…</p>
{:else if !cloud.config}
  <p class="backup-settings__note">
    Подключите облачный диск — копии будут сохраняться сами после изменений, а восстановить их можно
    на любом компьютере и в любом браузере: Chrome, Edge.
  </p>
  <SettingRow label="Сервис" hint={PRESETS[preset].hint}>
    {#snippet children(id)}
      <select {id} class="input" value={preset} onchange={(event) => choosePreset(event.currentTarget.value as PresetId)}>
        {#each presets as [id, item] (id)}
          <option value={id}>{item.label}</option>
        {/each}
      </select>
    {/snippet}
  </SettingRow>
  {#if oauth?.clientId}
    <div class="backup-settings__actions">
      <button type="button" class="button button--primary" disabled={busy} onclick={signIn}>Войти в {oauth.label}</button>
    </div>
  {:else if oauth}
    <p class="backup-settings__note">
      Режим разработки: вход в {oauth.label} не настроен в этой сборке расширения — нужен Client ID приложения
      (инструкция — docs/cloud-setup.md). Адрес возврата для регистрации приложения:
      <code class="backup-settings__code">{redirectUrl()}</code>
    </p>
  {:else}
  <form id={formId} class="backup-settings__form" onsubmit={connect}>
    <SettingRow label="Адрес сервера">
      {#snippet children(id)}
        <input {id} class="input" type="url" required placeholder="https://" bind:value={url}>
      {/snippet}
    </SettingRow>
    <SettingRow label="Логин">
      {#snippet children(id)}
        <input {id} class="input" type="text" required autocomplete="username" bind:value={username}>
      {/snippet}
    </SettingRow>
    <SettingRow label="Пароль" hint="Хранится только на этом устройстве">
      {#snippet children(id)}
        <input {id} class="input" type="password" required autocomplete="current-password" bind:value={password}>
      {/snippet}
    </SettingRow>
    <div class="backup-settings__actions">
      <button type="submit" class="button button--primary" disabled={busy}>Подключить</button>
    </div>
  </form>
  {/if}
{:else}
  {@const config = cloud.config}
  <SettingRow
    label="Подключено"
    hint="{config.provider === 'webdav' ? config.username : config.account} · {connectionLabel(config)}"
  >
    <button type="button" class="button" disabled={busy} onclick={() => run(() => cloud.disconnect(), 'Облако отключено')}>
      Отключить
    </button>
  </SettingRow>
  <SwitchRow
    label="Сохранять копию автоматически"
    hint="Через минуту после изменений; хранятся последние 10 копий"
    checked={config.auto}
    onchange={(auto) => cloud.update({auto})}
  />
  <SwitchRow
    label="Добавлять миниатюры и фон"
    hint="Копия станет больше, зато восстановится вместе с картинками"
    checked={config.includeImages}
    onchange={(includeImages) => cloud.update({includeImages})}
  />
  <SettingRow
    label="Последняя копия"
    hint={cloud.status.lastBackupAt ? formatDate(cloud.status.lastBackupAt) : 'Ещё не сохранялась'}
  >
    <button type="button" class="button" disabled={busy} onclick={() => run(() => cloud.backupNow(), 'Копия сохранена')}>
      Сохранить копию сейчас
    </button>
  </SettingRow>
  {#if cloud.status.lastError}
    <p class="backup-settings__error" role="alert">Последняя копия не сохранилась: {cloud.status.lastError}</p>
  {/if}

  {#if cloud.files && cloud.files.length > 0}
    <ul class="backup-settings__files" aria-label="Копии на сервере">
      {#each cloud.files as file (file.name)}
        <li class="backup-settings__file">
          <span class="backup-settings__file-name">{file.modified ? formatDate(file.modified) : file.name}</span>
          <span class="backup-settings__file-size">{formatSize(file.size)}</span>
          <button
            type="button"
            class="button"
            disabled={busy}
            onclick={() => (restoring = {
              title: `Восстановить копию от ${file.modified ? formatDate(file.modified) : file.name}`,
              load: async () => parseBackup(await cloud.readFile(file.name)),
            })}
          >Восстановить…</button>
        </li>
      {/each}
    </ul>
  {:else if cloud.files}
    <p class="backup-settings__note">На сервере пока нет копий</p>
  {/if}
{/if}

{#if status}
  <p class="backup-settings__status" role="status">{status}</p>
{/if}
{#if error}
  <p class="backup-settings__error" role="alert">{error}</p>
{/if}

{#if restoring}
  {@const {title, load} = restoring}
  <RestoreDialog
    {title}
    onrestore={async (mode) => restoreBackup(await load(), mode)}
    onclose={() => (restoring = null)}
  />
{/if}

<style>
  .backup-settings__heading {
    margin: 24px 0 4px;
    font-size: 15px;
  }

  .backup-settings__note {
    margin: 8px 0;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.45;
  }

  .backup-settings__actions {
    display: flex;
    justify-content: flex-end;
    padding: 8px 0;
  }

  .backup-settings__code {
    padding: 1px 4px;
    border-radius: 4px;
    background: var(--surface-hover);
    font-size: 12px;
    user-select: all;
  }

  .backup-settings__files {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .backup-settings__file {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 0;
    border-top: 1px solid var(--border);
  }

  .backup-settings__file-name {
    flex: 1;
  }

  .backup-settings__file-size {
    color: var(--text-muted);
    font-size: 13px;
  }

  .backup-settings__status {
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 13px;
  }

  .backup-settings__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 13px;
  }
</style>
