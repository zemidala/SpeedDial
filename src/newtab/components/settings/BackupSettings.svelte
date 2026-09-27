<script lang="ts">
  import {onMount} from 'svelte';
  import {type Backup, backupFileName, createBackup, parseBackup} from '../../../lib/backup/backup';
  import {connectionLabel} from '../../../lib/backup/cloud';
  import {redirectUrl} from '../../../lib/backup/oauth';
  import {OAUTH_IN_DEVELOPMENT, OAUTH_PROVIDERS, type OAuthProviderId} from '../../../lib/backup/providers';
  import {cloud, restoreBackup} from '../../../lib/backup/store.svelte';
  import {serverOrigin} from '../../../lib/backup/webdav';
  import {bookmarksToHtml, type HtmlBookmark, parseBookmarksHtml} from '../../../lib/bookmarksHtml';
  import {currentBrowserImport} from '../../../lib/browserImport';
  import {downloadBlob, pickFile} from '../../../lib/files';
  import {formatDateTime, t} from '../../../lib/i18n/index.svelte';
  import {permissions} from '../../../lib/permissions.svelte';
  import {settings} from '../../../lib/settings/store.svelte';
  import ImportDialog from './ImportDialog.svelte';
  import RestoreDialog from './RestoreDialog.svelte';
  import SettingRow from './SettingRow.svelte';
  import SettingsGroup from './SettingsGroup.svelte';
  import SwitchRow from './SwitchRow.svelte';

  const YANDEX_WEBDAV_URL = 'https://webdav.yandex.ru';

  type PresetId = 'yandex' | 'google' | 'dropbox' | 'onedrive' | 'nextcloud' | 'other';

  // Clouds: sign-in via the service window (oauth) or WebDAV with a preset URL
  const PRESETS: Record<PresetId, {label: string; hint: string; url?: string; oauth?: OAuthProviderId}> = $derived({
    yandex: {label: t.backup.yandex, url: YANDEX_WEBDAV_URL, hint: t.backup.yandexHint},
    google: {label: t.backup.google, oauth: 'google', hint: t.backup.googleHint},
    dropbox: {label: 'Dropbox', oauth: 'dropbox', hint: t.backup.appFolderHint},
    onedrive: {label: 'OneDrive', oauth: 'onedrive', hint: t.backup.appFolderHint},
    nextcloud: {label: 'Nextcloud / ownCloud', url: '', hint: t.backup.nextcloudHint},
    other: {label: t.backup.otherWebDav, url: '', hint: t.backup.otherWebDavHint},
  });

  const formId = $props.id();
  let preset = $state<PresetId>('yandex');
  let url = $state(YANDEX_WEBDAV_URL);
  let username = $state('');
  let password = $state('');

  let busy = $state(false);
  let status = $state('');
  let error = $state('');
  /** Backup about to be restored: a file name on the server or one read from a file */
  let restoring = $state<{title: string; load: () => Promise<Backup>} | null>(null);
  let importing = $state.raw<{fileName: string; nodes: HtmlBookmark[]} | null>(null);

  // An unpacked extension (development mode) also shows unconfigured clouds — with a hint on how to set them up.
  // A store install shows only those with a Client ID in the build
  let developer = $state(false);

  // While sign-in is in development, the OAuth clouds are listed in every build, but can't be chosen
  const presets = $derived(Object.entries(PRESETS).filter(([, item]) =>
    !item.oauth || OAUTH_IN_DEVELOPMENT || developer || OAUTH_PROVIDERS[item.oauth].clientId,
  ) as [PresetId, (typeof PRESETS)[PresetId]][]);
  const unavailable = (item: (typeof PRESETS)[PresetId]) => Boolean(item.oauth) && OAUTH_IN_DEVELOPMENT;

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
    // Permission first, while the button press still counts
    // The sign-in window (chrome.identity) is an optional permission too: asked only by those who sign in
    if (!await permissions.request({permissions: ['identity'], origins: oauth.origins})) {
      error = t.backup.noAccess(oauth.label);
      return;
    }
    await run(() => cloud.signIn(oauth.id), t.backup.connectedStatus);
  }

  /** Runs an action, showing progress and errors below the section */
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
    // Permission first, while the button press still counts
    const granted = await permissions.request({origins: [origin]});
    if (!granted) {
      error = t.backup.serverAccessDenied;
      return;
    }
    await run(() => cloud.connectWebDav({url, username, password}), t.backup.connectedStatus);
    if (!error) password = '';
  }

  async function saveToFile() {
    await run(async () => {
      const backup = await createBackup({includeImages: true}, chrome.bookmarks, settings.snapshot());
      downloadBlob(backupFileName(), new Blob([JSON.stringify(backup)], {type: 'application/json'}));
    }, t.backup.savedToFile);
  }

  async function restoreFromFile() {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    restoring = {title: t.backup.restoreFile(file.name), load: async () => parseBackup(await file.text())};
  }

  /** A bookmarks file from another browser — read here, what to do with it is chosen in the dialog */
  async function importHtml() {
    const file = await pickFile('text/html,.html,.htm');
    if (!file) return;
    status = '';
    error = '';
    try {
      importing = {fileName: file.name, nodes: parseBookmarksHtml(await file.text())};
    } catch {
      error = t.importHtml.notBookmarks(file.name);
    }
  }

  // The browser's own import brings bookmarks from other browsers on this computer; they show up here by themselves
  const browser = currentBrowserImport();

  function openBrowserImport() {
    chrome.tabs.create({url: browser.url}).catch((e) => (error = e instanceof Error ? e.message : String(e)));
  }

  async function exportHtml() {
    await run(async () => {
      const [root] = await chrome.bookmarks.getTree();
      const html = bookmarksToHtml(root.children ?? []);
      downloadBlob(`bookmarks-${new Date().toISOString().slice(0, 10)}.html`, new Blob([html], {type: 'text/html'}));
    }, t.importHtml.exported);
  }

  const formatDate = formatDateTime;
  const formatSize = (bytes: number) => (bytes >= 1024 * 1024
    ? t.common.megabytes((bytes / 1024 / 1024).toFixed(1))
    : t.common.kilobytes(Math.max(1, Math.round(bytes / 1024))));
</script>

<SettingsGroup title={t.backup.file}>
  <SettingRow label={t.backup.fileRow} hint={t.backup.fileHint}>
    <button type="button" class="button" disabled={busy} onclick={saveToFile}>{t.backup.saveToFile}</button>
    <button type="button" class="button" disabled={busy} onclick={restoreFromFile}>{t.backup.restoreEllipsis}</button>
  </SettingRow>
</SettingsGroup>

<SettingsGroup title={t.importHtml.group}>
  <SettingRow label={t.importHtml.browserRow} hint={t.importHtml.browserHint(browser.name)}>
    <button type="button" class="button" onclick={openBrowserImport}>{t.importHtml.browserButton}</button>
  </SettingRow>
  <SettingRow label={t.importHtml.importRow} hint={t.importHtml.importHint}>
    <button type="button" class="button" disabled={busy} onclick={importHtml}>{t.importHtml.importButton}</button>
  </SettingRow>
  <!-- Where each browser saves its bookmarks file -->
  <details class="backup-settings__howto">
    <summary>{t.importHtml.howToTitle}</summary>
    <ul>
      {#each t.importHtml.howTo as [browserName, steps] (browserName)}
        <li><strong>{browserName}:</strong> {steps}</li>
      {/each}
    </ul>
  </details>
  <SettingRow label={t.importHtml.exportRow} hint={t.importHtml.exportHint}>
    <button type="button" class="button" disabled={busy} onclick={exportHtml}>{t.importHtml.exportButton}</button>
  </SettingRow>
</SettingsGroup>

<SettingsGroup title={t.backup.cloud}>
{#if !cloud.loaded}
  <p class="backup-settings__note">{t.common.loading}</p>
{:else if !cloud.config}
  <p class="backup-settings__note">
    {t.backup.intro}
  </p>
  <SettingRow label={t.backup.service} hint={PRESETS[preset].hint}>
    {#snippet children(id)}
      <select {id} class="input" value={preset} onchange={(event) => choosePreset(event.currentTarget.value as PresetId)}>
        {#each presets as [id, item] (id)}
          <option value={id} disabled={unavailable(item)}>
            {unavailable(item) ? t.backup.inDevelopment(item.label) : item.label}
          </option>
        {/each}
      </select>
    {/snippet}
  </SettingRow>
  {#if OAUTH_IN_DEVELOPMENT}
    <p class="backup-settings__note">{t.backup.oauthInDevelopment}</p>
  {/if}
  {#if oauth?.clientId}
    <div class="backup-settings__actions">
      <button type="button" class="button button--primary" disabled={busy} onclick={signIn}>{t.backup.signIn(oauth.label)}</button>
    </div>
  {:else if oauth}
    <p class="backup-settings__note">
      {t.backup.notConfigured(oauth.label)}
      <code class="backup-settings__code">{redirectUrl()}</code>
    </p>
  {:else}
  <form id={formId} class="backup-settings__form" onsubmit={connect}>
    <SettingRow label={t.backup.serverUrl}>
      {#snippet children(id)}
        <input {id} class="input" type="url" required placeholder="https://" bind:value={url}>
      {/snippet}
    </SettingRow>
    <SettingRow label={t.backup.username}>
      {#snippet children(id)}
        <input {id} class="input" type="text" required autocomplete="username" bind:value={username}>
      {/snippet}
    </SettingRow>
    <SettingRow label={t.backup.password} hint={t.backup.passwordHint}>
      {#snippet children(id)}
        <input {id} class="input" type="password" required autocomplete="current-password" bind:value={password}>
      {/snippet}
    </SettingRow>
    <div class="backup-settings__actions">
      <button type="submit" class="button button--primary" disabled={busy}>{t.backup.connect}</button>
    </div>
  </form>
  {/if}
{:else}
  {@const config = cloud.config}
  <SettingRow
    label={t.backup.connected}
    hint="{config.provider === 'webdav' ? config.username : config.account} · {connectionLabel(config)}"
  >
    <button type="button" class="button" disabled={busy} onclick={() => run(() => cloud.disconnect(), t.backup.disconnected)}>
      {t.backup.disconnect}
    </button>
  </SettingRow>
  <SwitchRow
    label={t.backup.auto}
    hint={t.backup.autoHint}
    checked={config.auto}
    onchange={(auto) => cloud.update({auto})}
  />
  <SwitchRow
    label={t.backup.includeImages}
    hint={t.backup.includeImagesHint}
    checked={config.includeImages}
    onchange={(includeImages) => cloud.update({includeImages})}
  />
  <SettingRow
    label={t.backup.lastBackup}
    hint={cloud.status.lastBackupAt ? formatDate(cloud.status.lastBackupAt) : t.backup.neverSaved}
  >
    <button type="button" class="button" disabled={busy} onclick={() => run(() => cloud.backupNow(), t.backup.saved)}>
      {t.backup.backupNow}
    </button>
  </SettingRow>
  {#if cloud.status.lastError}
    <p class="backup-settings__error" role="alert">{t.backup.lastError(cloud.status.lastError)}</p>
  {/if}

  {#if cloud.files && cloud.files.length > 0}
    <ul class="backup-settings__files" aria-label={t.backup.files}>
      {#each cloud.files as file (file.name)}
        <li class="backup-settings__file">
          <span class="backup-settings__file-name">{file.modified ? formatDate(file.modified) : file.name}</span>
          <span class="backup-settings__file-size">{formatSize(file.size)}</span>
          <button
            type="button"
            class="button"
            disabled={busy}
            onclick={() => (restoring = {
              title: t.backup.restoreCopy(file.modified ? formatDate(file.modified) : file.name),
              load: async () => parseBackup(await cloud.readFile(file.name)),
            })}
          >{t.backup.restoreEllipsis}</button>
        </li>
      {/each}
    </ul>
  {:else if cloud.files}
    <p class="backup-settings__note">{t.backup.noFiles}</p>
  {/if}
{/if}
</SettingsGroup>

{#if status}
  <p class="backup-settings__status" role="status">{status}</p>
{/if}
{#if error}
  <p class="backup-settings__error" role="alert">{error}</p>
{/if}

{#if importing}
  <ImportDialog
    fileName={importing.fileName}
    nodes={importing.nodes}
    onimported={(message) => (status = message)}
    onclose={() => (importing = null)}
  />
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

  .backup-settings__howto {
    padding: 4px 0 10px;
    color: var(--text-muted);
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .backup-settings__howto summary {
    width: fit-content;
    color: var(--accent);
    cursor: pointer;
  }

  .backup-settings__howto ul {
    margin: 6px 0 0;
    padding-left: 18px;
  }

  .backup-settings__howto strong {
    color: var(--text);
    font-weight: 600;
  }

  .backup-settings__note {
    margin: 8px 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
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
    font-size: 0.75rem;
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
    font-size: 0.8125rem;
  }

  .backup-settings__status {
    margin: 12px 0 0;
    color: var(--text-muted);
    font-size: 0.8125rem;
  }

  .backup-settings__error {
    margin: 12px 0 0;
    color: var(--danger);
    font-size: 0.8125rem;
  }
</style>
