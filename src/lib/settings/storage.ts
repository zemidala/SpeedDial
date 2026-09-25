// Чтение и запись настроек в chrome.storage. Без Svelte — используется и в service worker.
import {sanitizeSettings, type Settings, splitSettings} from './schema';

const SHARED_KEY = 'settings'; // Общие настройки: в sync, если синхронизация включена, иначе в local
const LOCAL_KEY = 'localSettings'; // Настройки только этого устройства, всегда в local

export interface StoredSettings {
  settings: Settings;
  /** Время последнего изменения (мс); 0 — настройки ещё не сохранялись. Побеждает более свежая версия */
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

/** Вызывает callback, когда настройки изменили в другой вкладке, на другом устройстве или в service worker */
export function onSettingsChanged(callback: () => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if ((area === 'sync' || area === 'local') && (SHARED_KEY in changes || LOCAL_KEY in changes)) callback();
  });
}

/** Удаляет настройки расширения из облака браузера */
export function clearSyncedData(): Promise<void> {
  return chrome.storage.sync.clear();
}
