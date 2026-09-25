// Экспорт и импорт настроек в файл. Закладки и картинки в файл не входят
import {LOCAL_KEYS, sanitizeSettings, type Settings, splitSettings} from './schema';

const FILE_FORMAT = 'speeddial-settings';
const FILE_VERSION = 1;

interface SettingsFile {
  format: typeof FILE_FORMAT;
  version: number;
  exportedAt: string;
  settings: Partial<Settings>;
}

/** Настройки для файла; локальные (папка по умолчанию, синхронизация) не выгружаются */
export function serializeSettings(settings: Settings, now = new Date()): string {
  const file: SettingsFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: now.toISOString(),
    settings: splitSettings(settings).shared,
  };
  return JSON.stringify(file, null, 2);
}

/** Настройки из файла поверх текущих локальных; бросает ошибку, если файл не подходит */
export function parseSettingsFile(text: string, current: Settings): Settings {
  let file: Partial<SettingsFile>;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('Файл повреждён: это не JSON');
  }
  if (file?.format !== FILE_FORMAT || typeof file.settings !== 'object' || file.settings === null) {
    throw new Error('Это не файл настроек SpeedDial');
  }

  const imported = {...file.settings} as Record<string, unknown>;
  for (const key of LOCAL_KEYS) imported[key] = current[key];
  return sanitizeSettings(imported);
}

export function settingsFileName(now = new Date()): string {
  return `speeddial-settings-${now.toISOString().slice(0, 10)}.json`;
}
