// Backups on the page: cloud connection, list of backups, restoring
import {background} from '../background.svelte';
import {t} from '../i18n/index.svelte';
import {showNotice} from '../notice.svelte';
import {settings} from '../settings/store.svelte';
import {thumbnails} from '../thumbnails/store.svelte';
import {type Backup, createBackup, restoreBackground, restoreBookmarks, type RestoreMode,
  settingsFromBackup} from './backup';
import {type CloudConfig, cloudClient, type CloudConnection, type CloudStatus, loadCloudConfig, loadCloudStatus,
  onCloudChanged, runCloudBackup, saveCloudConfig} from './cloud';
import type {CloudClient, RemoteFile} from './provider';
import {OAUTH_PROVIDERS, type OAuthProviderId} from './providers';
import {normalizeServerUrl, type WebDavConfig} from './webdav';

/**
 * Applies a backup. merge — only adds missing bookmarks; replace — bookmarks, settings and background
 * as in the backup. Returns the notification text and, for a merge, what was added (to undo it)
 */
async function applyBackup(backup: Backup, mode: RestoreMode): Promise<{message: string; createdIds: string[]}> {
  const result = await restoreBookmarks(backup, mode);
  if (mode === 'replace') {
    settings.replace(settingsFromBackup(backup, settings.snapshot()));
    if (await restoreBackground(backup)) await background.load();
  }
  await thumbnails.reloadAll();
  if (mode === 'replace') return {message: t.backup.restored, createdIds: []};
  const message = result.created > 0 ? t.backup.added(result.created) : t.backup.nothingToAdd;
  return {message, createdIds: result.createdIds};
}

/**
 * Restores a backup with a notification that can undo it: before a full replace the current state is saved,
 * after a merge what was added is removed
 */
export async function restoreBackup(backup: Backup, mode: RestoreMode): Promise<void> {
  const previous = mode === 'replace' ? await createBackup({includeImages: true}, chrome.bookmarks, settings.snapshot()) : null;
  const {message, createdIds} = await applyBackup(backup, mode);
  const undo = previous
    ? async () => {
      await applyBackup(previous, 'replace');
      showNotice(t.backup.restoreUndone, 'info');
    }
    : createdIds.length > 0
      ? async () => {
        for (const id of createdIds) await chrome.bookmarks.removeTree(id).catch(() => undefined);
        showNotice(t.backup.restoreUndone, 'info');
      }
      : null;
  showNotice(message, 'info', undo && {label: t.common.undo, run: undo});
}

class CloudStore {
  config = $state<CloudConfig | null>(null);
  status = $state<CloudStatus>({lastBackupAt: 0, lastFingerprint: '', lastError: ''});
  /** Backups on the server; null — the list isn't loaded yet */
  files = $state<RemoteFile[] | null>(null);
  loaded = $state(false);

  #started = false;

  /** Loaded only when the backups tab of the settings is opened */
  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    await this.#refresh();
    onCloudChanged(() => {
      this.#refresh().catch((error) => console.error('Failed to load cloud state', error));
    });
  }

  async #refresh(): Promise<void> {
    [this.config, this.status] = await Promise.all([loadCloudConfig(), loadCloudStatus()]);
    this.loaded = true;
  }

  /** Connecting to a WebDAV server. The server permission is requested before the call */
  connectWebDav(connection: WebDavConfig): Promise<void> {
    return this.#connect({
      provider: 'webdav',
      url: normalizeServerUrl(connection.url),
      username: connection.username.trim(),
      password: connection.password,
    });
  }

  /** Signing in to a cloud via the service window. The API permission is requested before the call */
  async signIn(provider: OAuthProviderId): Promise<void> {
    const {tokens, account} = await OAUTH_PROVIDERS[provider].signIn();
    await this.#connect({provider, account, tokens});
  }

  /** Checks the connection (folder and backup list) and saves it */
  async #connect(connection: CloudConnection): Promise<void> {
    const config: CloudConfig = {...connection, auto: true, includeImages: true};
    const client = await cloudClient(config);
    await client.ensureFolder();
    this.files = await client.list();
    await saveCloudConfig(config);
    await this.#refresh();
  }

  async disconnect(): Promise<void> {
    await saveCloudConfig(null);
    this.files = null;
    await this.#refresh();
  }

  async update(changes: Partial<Pick<CloudConfig, 'auto' | 'includeImages'>>): Promise<void> {
    if (!this.config) return;
    await saveCloudConfig({...$state.snapshot(this.config), ...changes});
    await this.#refresh();
  }

  #client(): Promise<CloudClient> {
    if (!this.config) throw new Error(t.cloudErrors.notConnected);
    return cloudClient($state.snapshot(this.config));
  }

  async loadFiles(): Promise<void> {
    this.files = await (await this.#client()).list();
  }

  async backupNow(): Promise<void> {
    await runCloudBackup({force: true});
    await this.loadFiles();
  }

  /** Contents of a backup on the server */
  async readFile(name: string): Promise<string> {
    return (await this.#client()).read(name);
  }
}

export const cloud = new CloudStore();
