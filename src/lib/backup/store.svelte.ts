// Резервные копии на странице: подключение к облаку, список копий, восстановление
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
 * Применяет копию. merge — только добавляет недостающие закладки; replace — закладки, настройки и фон
 * как в копии. Возвращает текст для уведомления
 */
async function applyBackup(backup: Backup, mode: RestoreMode): Promise<string> {
  const result = await restoreBookmarks(backup, mode);
  if (mode === 'replace') {
    settings.replace(settingsFromBackup(backup, settings.snapshot()));
    if (await restoreBackground(backup)) await background.load();
  }
  await thumbnails.reloadAll();
  if (mode === 'replace') return t.backup.restored;
  return result.created > 0 ? t.backup.added(result.created) : t.backup.nothingToAdd;
}

/**
 * Восстанавливает копию с уведомлением. Перед полной заменой запоминает текущее состояние —
 * в уведомлении можно отменить восстановление
 */
export async function restoreBackup(backup: Backup, mode: RestoreMode): Promise<void> {
  const previous = mode === 'replace' ? await createBackup({includeImages: true}, chrome.bookmarks, settings.snapshot()) : null;
  const message = await applyBackup(backup, mode);
  showNotice(message, 'info', previous && {
    label: t.common.undo,
    run: async () => showNotice(await applyBackup(previous, 'replace').then(() => t.backup.restoreUndone), 'info'),
  });
}

class CloudStore {
  config = $state<CloudConfig | null>(null);
  status = $state<CloudStatus>({lastBackupAt: 0, lastFingerprint: '', lastError: ''});
  /** Копии на сервере; null — список ещё не загружен */
  files = $state<RemoteFile[] | null>(null);
  loaded = $state(false);

  #started = false;

  /** Загружается, только когда открыт раздел настроек с копиями */
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

  /** Подключение к серверу WebDAV. Разрешение на доступ к серверу запрашивается до вызова */
  connectWebDav(connection: WebDavConfig): Promise<void> {
    return this.#connect({
      provider: 'webdav',
      url: normalizeServerUrl(connection.url),
      username: connection.username.trim(),
      password: connection.password,
    });
  }

  /** Вход в облако через окно сервиса. Разрешение на доступ к API запрашивается до вызова */
  async signIn(provider: OAuthProviderId): Promise<void> {
    const {tokens, account} = await OAUTH_PROVIDERS[provider].signIn();
    await this.#connect({provider, account, tokens});
  }

  /** Проверяет подключение (папка и список копий) и сохраняет его */
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

  /** Содержимое копии на сервере */
  async readFile(name: string): Promise<string> {
    return (await this.#client()).read(name);
  }
}

export const cloud = new CloudStore();
