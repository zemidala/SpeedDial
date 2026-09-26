// Копии в облаке: подключение, запуск и состояние. Без Svelte — автоматические копии делает service worker.
// Данные подключения хранятся только на этом устройстве (chrome.storage.local) и в облако браузера не попадают
import {t} from '../i18n/index.svelte';
import {type Backup, backupFileName, backupFingerprint, createBackup} from './backup';
import {isFresh, type OAuthTokens} from './oauth';
import {AuthExpiredError, type CloudClient} from './provider';
import {isOAuthProvider, OAUTH_PROVIDERS, type OAuthProviderId} from './providers';
import {serverOrigin, type WebDavConfig, WebDavClient} from './webdav';

const CONFIG_KEY = 'cloudBackup';
const STATUS_KEY = 'cloudBackupStatus';

/** Сколько последних копий хранить в облаке */
export const KEEP_BACKUPS = 10;
/** Будильник автоматической копии: через минуту после последнего изменения */
export const AUTO_BACKUP_ALARM = 'cloud-backup';
const AUTO_BACKUP_DELAY_MINUTES = 1;

interface CloudOptions {
  /** Сохранять копию автоматически после изменений */
  auto: boolean;
  /** Добавлять в копию миниатюры и фоновое изображение */
  includeImages: boolean;
}

export type CloudConnection =
  | ({provider: 'webdav'} & WebDavConfig)
  /** account — email или имя для показа */
  | {provider: OAuthProviderId; account: string; tokens: OAuthTokens};

export type CloudConfig = CloudConnection & CloudOptions;

export interface CloudStatus {
  /** Время последней успешной копии, мс; 0 — копий ещё не было */
  lastBackupAt: number;
  /** Отпечаток последней выгруженной копии: без изменений повторно не выгружаем */
  lastFingerprint: string;
  /** Текст последней ошибки; пустая строка — ошибок нет */
  lastError: string;
}

const EMPTY_STATUS: CloudStatus = {lastBackupAt: 0, lastFingerprint: '', lastError: ''};

export async function loadCloudConfig(): Promise<CloudConfig | null> {
  const {[CONFIG_KEY]: config} = await chrome.storage.local.get(CONFIG_KEY);
  if (!config || typeof config !== 'object') return null;
  const provider = (config as {provider?: unknown}).provider;
  return provider === 'webdav' || isOAuthProvider(provider) ? config as CloudConfig : null;
}

export async function saveCloudConfig(config: CloudConfig | null): Promise<void> {
  if (config) {
    await chrome.storage.local.set({[CONFIG_KEY]: config});
  } else {
    await chrome.storage.local.remove([CONFIG_KEY, STATUS_KEY]);
    await chrome.alarms.clear(AUTO_BACKUP_ALARM);
  }
}

export async function loadCloudStatus(): Promise<CloudStatus> {
  const {[STATUS_KEY]: status} = await chrome.storage.local.get(STATUS_KEY);
  return {...EMPTY_STATUS, ...(typeof status === 'object' ? status : {})};
}

async function updateStatus(changes: Partial<CloudStatus>): Promise<void> {
  await chrome.storage.local.set({[STATUS_KEY]: {...await loadCloudStatus(), ...changes}});
}

/** Вызывает callback, когда меняются подключение или состояние копий — в любой вкладке или в service worker */
export function onCloudChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (CONFIG_KEY in changes || STATUS_KEY in changes)) callback();
  });
}

/** Адреса, к которым нужен доступ для подключения */
export function connectionOrigins(connection: CloudConnection): string[] {
  return connection.provider === 'webdav' ? [serverOrigin(connection.url)] : OAUTH_PROVIDERS[connection.provider].origins;
}

/** Название облака для показа: «Google Диск», «dav.example.com» */
export function connectionLabel(connection: CloudConnection): string {
  return connection.provider === 'webdav' ? new URL(connection.url).host : OAUTH_PROVIDERS[connection.provider].label;
}

/**
 * Клиент для подключения. Проверяет доступ к адресам облака и при необходимости продлевает токен
 * (новый токен сохраняется). Бросает понятную ошибку, если нужно подключиться заново
 */
export async function cloudClient(config: CloudConfig): Promise<CloudClient> {
  if (!await chrome.permissions.contains({origins: connectionOrigins(config)})) {
    throw new Error(t.cloudErrors.noPermission);
  }
  if (config.provider === 'webdav') return new WebDavClient(config);

  const provider = OAUTH_PROVIDERS[config.provider];
  let {tokens} = config;
  if (!isFresh(tokens)) {
    try {
      tokens = await provider.refresh(tokens, config.account);
    } catch (error) {
      console.warn('Token refresh failed', error);
      throw new AuthExpiredError(t.cloudErrors.authExpiredFor(provider.label));
    }
    await saveCloudConfig({...config, tokens});
  }
  return provider.client(tokens.accessToken);
}

/** Удаляет старые копии сверх KEEP_BACKUPS */
async function pruneBackups(client: CloudClient): Promise<void> {
  const files = (await client.list()).filter((file) => file.name.startsWith('speeddial-'));
  for (const file of files.slice(KEEP_BACKUPS)) await client.remove(file.name);
}

export type BackupOutcome = 'saved' | 'unchanged';

/**
 * Делает копию и выгружает её в облако. Если с прошлой копии ничего не изменилось, не выгружает
 * (кроме force — «Сохранить копию сейчас»). Ошибку записывает в состояние и бросает дальше
 */
export async function runCloudBackup({force}: {force: boolean}): Promise<BackupOutcome> {
  const config = await loadCloudConfig();
  if (!config) throw new Error(t.cloudErrors.notConnected);
  try {
    const client = await cloudClient(config);
    const backup: Backup = await createBackup({includeImages: config.includeImages});
    const fingerprint = await backupFingerprint(backup);
    if (!force && fingerprint === (await loadCloudStatus()).lastFingerprint) return 'unchanged';

    await client.ensureFolder();
    await client.write(backupFileName(new Date(backup.createdAt)), JSON.stringify(backup));
    await pruneBackups(client);
    await updateStatus({lastBackupAt: Date.now(), lastFingerprint: fingerprint, lastError: ''});
    return 'saved';
  } catch (error) {
    await updateStatus({lastError: error instanceof Error ? error.message : String(error)});
    throw error;
  }
}

/** Откладывает автоматическую копию: частые изменения подряд дают одну копию */
export async function scheduleAutoBackup(): Promise<void> {
  const config = await loadCloudConfig();
  if (config?.auto) await chrome.alarms.create(AUTO_BACKUP_ALARM, {delayInMinutes: AUTO_BACKUP_DELAY_MINUTES});
}
