// Exporting and importing settings to a file. Bookmarks and images aren't included
import {t} from '../i18n/index.svelte';
import {LOCAL_KEYS, sanitizeSettings, type Settings, splitSettings} from './schema';

const FILE_FORMAT = 'speeddial-settings';
const FILE_VERSION = 1;

interface SettingsFile {
  format: typeof FILE_FORMAT;
  version: number;
  exportedAt: string;
  settings: Partial<Settings>;
}

/** Settings for the file; local ones (default folder, sync) aren't exported */
export function serializeSettings(settings: Settings, now = new Date()): string {
  const file: SettingsFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: now.toISOString(),
    settings: splitSettings(settings).shared,
  };
  return JSON.stringify(file, null, 2);
}

/** Settings from the file over the current local ones; throws if the file doesn't fit */
export function parseSettingsFile(text: string, current: Settings): Settings {
  let file: Partial<SettingsFile>;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error(t.advanced.fileNotJson);
  }
  if (file?.format !== FILE_FORMAT || typeof file.settings !== 'object' || file.settings === null) {
    throw new Error(t.advanced.notSettingsFile);
  }

  const imported = {...file.settings} as Record<string, unknown>;
  for (const key of LOCAL_KEYS) imported[key] = current[key];
  return sanitizeSettings(imported);
}

export function settingsFileName(now = new Date()): string {
  return `speeddial-settings-${now.toISOString().slice(0, 10)}.json`;
}
