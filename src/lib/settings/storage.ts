// Reading and writing settings in chrome.storage. No Svelte — also used in the service worker.
import {sanitizeSettings, type Settings, splitSettings} from './schema';

const SHARED_KEY = 'settings'; // Shared settings: in sync if sync is on, otherwise in local
const LOCAL_KEY = 'localSettings'; // Settings of this device only, always in local

export interface StoredSettings {
  settings: Settings;
  /** Time of the last change (ms); 0 — settings were never saved. The newer version wins */
  updatedAt: number;
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

export async function loadStoredSettings(): Promise<StoredSettings> {
  const local = await chrome.storage.local.get([SHARED_KEY, LOCAL_KEY]);
  const localOnly = asObject(local[LOCAL_KEY]);
  const syncEnabled = localOnly.syncEnabled !== false;
  const shared = asObject(syncEnabled ? (await chrome.storage.sync.get(SHARED_KEY))[SHARED_KEY] : local[SHARED_KEY]);
  return {
    settings: sanitizeSettings({...shared, ...localOnly}),
    updatedAt: typeof shared.updatedAt === 'number' ? shared.updatedAt : 0,
  };
}

export async function loadSettings(): Promise<Settings> {
  return (await loadStoredSettings()).settings;
}

export async function saveSettings(settings: Settings, updatedAt: number): Promise<void> {
  const {shared, local} = splitSettings(settings);
  await chrome.storage.local.set({[LOCAL_KEY]: local});
  const area = settings.syncEnabled ? chrome.storage.sync : chrome.storage.local;
  await area.set({[SHARED_KEY]: {...shared, updatedAt}});
}

/** Calls callback when settings change in another tab, on another device or in the service worker */
export function onSettingsChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'sync' || area === 'local') && (SHARED_KEY in changes || LOCAL_KEY in changes)) callback();
  });
}

/** Removes the extension's settings from the browser's sync */
export function clearSyncedData(): Promise<void> {
  return chrome.storage.sync.clear();
}
