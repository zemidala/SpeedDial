// Cloud backups: connection, running and status. No Svelte — automatic backups run in the service worker.
// Connection details stay on this device (chrome.storage.local) and never reach the browser's sync
import {t} from '../i18n/index.svelte';
import {type Backup, backupFileName, backupFingerprint, createBackup} from './backup';
import {isFresh, type OAuthTokens} from './oauth';
import {AuthExpiredError, type CloudClient} from './provider';
import {isOAuthProvider, OAUTH_PROVIDERS, type OAuthProviderId} from './providers';
import {serverOrigin, type WebDavConfig, WebDavClient} from './webdav';

const CONFIG_KEY = 'cloudBackup';
const STATUS_KEY = 'cloudBackupStatus';

/** How many latest backups to keep in the cloud */
export const KEEP_BACKUPS = 10;
/** Alarm for the automatic backup: a minute after the last change */
export const AUTO_BACKUP_ALARM = 'cloud-backup';
const AUTO_BACKUP_DELAY_MINUTES = 1;

interface CloudOptions {
  /** Back up automatically after changes */
  auto: boolean;
  /** Include thumbnails and the background image */
  includeImages: boolean;
}

export type CloudConnection =
  | ({provider: 'webdav'} & WebDavConfig)
  /** account — email or a display name */
  | {provider: OAuthProviderId; account: string; tokens: OAuthTokens};

export type CloudConfig = CloudConnection & CloudOptions;

export interface CloudStatus {
  /** Time of the last successful backup, ms; 0 — no backups yet */
  lastBackupAt: number;
  /** Fingerprint of the last uploaded backup: unchanged data isn't uploaded again */
  lastFingerprint: string;
  /** Text of the last error; empty — no errors */
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

/** Calls callback when the connection or backup status changes — in any tab or in the service worker */
export function onCloudChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (CONFIG_KEY in changes || STATUS_KEY in changes)) callback();
  });
}

/** Origins the connection needs access to */
export function connectionOrigins(connection: CloudConnection): string[] {
  return connection.provider === 'webdav' ? [serverOrigin(connection.url)] : OAUTH_PROVIDERS[connection.provider].origins;
}

/** Cloud name for display: "Google Drive", "dav.example.com" */
export function connectionLabel(connection: CloudConnection): string {
  return connection.provider === 'webdav' ? new URL(connection.url).host : OAUTH_PROVIDERS[connection.provider].label;
}

/**
 * Client for the connection. Checks access to the cloud origins and refreshes the token if needed
 * (the new token is saved). Throws a clear error if the user must reconnect
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

/** Removes old backups beyond KEEP_BACKUPS */
async function pruneBackups(client: CloudClient): Promise<void> {
  const files = (await client.list()).filter((file) => file.name.startsWith('speeddial-'));
  for (const file of files.slice(KEEP_BACKUPS)) await client.remove(file.name);
}

export type BackupOutcome = 'saved' | 'unchanged';

/**
 * Creates a backup and uploads it. If nothing changed since the last backup, it isn't uploaded
 * (unless force — "Back up now"). Errors are stored in the status and rethrown
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

/** Postpones the automatic backup: a burst of changes produces one backup */
export async function scheduleAutoBackup(): Promise<void> {
  const config = await loadCloudConfig();
  if (config?.auto) await chrome.alarms.create(AUTO_BACKUP_ALARM, {delayInMinutes: AUTO_BACKUP_DELAY_MINUTES});
}
