// Схема настроек: типы, значения по умолчанию и проверка данных из хранилища и импорта

export const THEMES = ['auto', 'light', 'dark'] as const;
export const BACKGROUNDS = ['none', 'color', 'image', 'bing'] as const;
export const ICON_STYLES = ['plate', 'fill'] as const;
export const SEARCH_ENGINES = ['google', 'yandex', 'bing', 'duckduckgo', 'custom'] as const;
export const SORT_ORDERS = ['none', 'title', 'url', 'dateAdded'] as const;
export const TYPE_ORDERS = ['none', 'foldersFirst', 'bookmarksFirst'] as const;

export type Theme = (typeof THEMES)[number];
export type Background = (typeof BACKGROUNDS)[number];
export type IconStyle = (typeof ICON_STYLES)[number];
export type SearchEngine = (typeof SEARCH_ENGINES)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];
export type TypeOrder = (typeof TYPE_ORDERS)[number];

export interface ServiceLink {
  title: string;
  url: string;
}

export interface Settings {
  // ===== Вид =====
  columns: number;
  /** Ширина области закладок, % ширины окна */
  containerWidth: number;
  theme: Theme;
  verticalCenter: boolean;
  /** plate — иконка на подложке; fill — иконка заполняет область плитки */
  iconStyle: IconStyle;
  /** Размер иконки, % высоты области под иконку */
  iconScale: number;
  /** Подкрашивать плитку основным цветом иконки */
  iconTint: boolean;
  externalLogos: boolean;
  /** Шаблон адреса логотипа; {{website}} заменяется доменом сайта */
  externalLogoUrl: string;
  showToolbar: boolean;
  autofocusSearch: boolean;
  showSettingsButton: boolean;
  showBackTile: boolean;
  showAddTile: boolean;
  showTitles: boolean;
  showTitleIcons: boolean;
  background: Background;
  backgroundColor: string;
  /** Пустая строка — цвет из текущей темы */
  tileColor: string;
  folderColor: string;
  fontFamily: string;

  // ===== Общие =====
  /** Папка, которая открывается в новой вкладке. Не синхронизируется: у папок разные id на разных устройствах */
  defaultFolderId: string;
  rememberLastFolder: boolean;
  searchEngine: SearchEngine;
  /** Адрес поиска для searchEngine = custom; %s заменяется запросом */
  customSearchUrl: string;
  showServices: boolean;
  services: ServiceLink[];
  /** Миниатюры сайтов на плитке папки вместо значка папки */
  folderPreview: boolean;
  /** Загружать крупные иконки прямо с сайтов */
  siteIcons: boolean;
  showThumbnailRefresh: boolean;
  captureOnCreate: boolean;
  /** Задержка перед снимком страницы, секунды */
  captureDelay: number;
  refreshIncludesSubfolders: boolean;
  openInNewTab: boolean;
  newBookmarksFirst: boolean;
  dragAndDrop: boolean;
  sortOrder: SortOrder;
  typeOrder: TypeOrder;
  browserContextMenu: boolean;
  closeTabAfterAdd: boolean;
  /** Не синхронизируется: определяет, где хранятся остальные настройки */
  syncEnabled: boolean;

  // ===== Расширенные =====
  confirmDelete: boolean;
  customCss: string;
}

type KeysOfType<T, V> = {[K in keyof T]: T[K] extends V ? K : never}[keyof T];

export type BooleanSettingKey = KeysOfType<Settings, boolean>;
export type ColorSettingKey = 'tileColor' | 'folderColor' | 'backgroundColor';

/** Настройки, которые хранятся только на этом устройстве */
export const LOCAL_KEYS = ['defaultFolderId', 'syncEnabled'] as const satisfies ReadonlyArray<keyof Settings>;

export const MAX_CUSTOM_CSS_LENGTH = 5000; // chrome.storage.sync ограничивает запись 8 КБ

export const DEFAULT_SERVICES: ServiceLink[] = [
  {title: 'Gmail', url: 'https://mail.google.com/'},
  {title: 'Google Диск', url: 'https://drive.google.com/'},
  {title: 'YouTube', url: 'https://www.youtube.com/'},
  {title: 'Google Карты', url: 'https://maps.google.com/'},
  {title: 'Переводчик', url: 'https://translate.google.com/'},
  {title: 'Календарь', url: 'https://calendar.google.com/'},
  {title: 'Яндекс Почта', url: 'https://mail.yandex.ru/'},
  {title: 'Яндекс Диск', url: 'https://disk.yandex.ru/'},
  {title: 'Яндекс Карты', url: 'https://yandex.ru/maps/'},
];

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  columns: 6,
  containerWidth: 90,
  theme: 'auto',
  verticalCenter: false,
  iconStyle: 'plate',
  iconScale: 50,
  iconTint: true,
  externalLogos: false,
  externalLogoUrl: 'https://img.logo.dev/{{website}}?token=',
  showToolbar: true,
  autofocusSearch: false,
  showSettingsButton: true,
  showBackTile: true,
  showAddTile: true,
  showTitles: true,
  showTitleIcons: false,
  background: 'none',
  backgroundColor: '#1f2933',
  tileColor: '',
  folderColor: '',
  fontFamily: 'Segoe UI, system-ui, sans-serif',

  defaultFolderId: '1',
  rememberLastFolder: false,
  searchEngine: 'google',
  customSearchUrl: '',
  showServices: true,
  services: DEFAULT_SERVICES,
  folderPreview: true,
  siteIcons: false,
  showThumbnailRefresh: true,
  captureOnCreate: false,
  captureDelay: 0.5,
  refreshIncludesSubfolders: false,
  openInNewTab: false,
  newBookmarksFirst: false,
  dragAndDrop: true,
  sortOrder: 'none',
  typeOrder: 'none',
  browserContextMenu: true,
  closeTabAfterAdd: false,
  syncEnabled: true,

  confirmDelete: true,
  customCss: '',
};

// Допустимые значения: перечисления и диапазоны чисел
const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  theme: THEMES,
  background: BACKGROUNDS,
  iconStyle: ICON_STYLES,
  searchEngine: SEARCH_ENGINES,
  sortOrder: SORT_ORDERS,
  typeOrder: TYPE_ORDERS,
};

export const RANGES = {
  columns: {min: 1, max: 12, step: 1},
  containerWidth: {min: 40, max: 100, step: 1},
  iconScale: {min: 20, max: 100, step: 5},
  captureDelay: {min: 0, max: 10, step: 0.5},
} as const satisfies Partial<Record<keyof Settings, {min: number; max: number; step: number}>>;

export type RangeSettingKey = keyof typeof RANGES;

function isColor(value: string): boolean {
  return value === '' || /^#[0-9a-f]{6}$/i.test(value);
}

function sanitizeServices(value: unknown): ServiceLink[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is ServiceLink => typeof item?.title === 'string' && typeof item?.url === 'string')
    .map(({title, url}) => ({title, url}));
}

function sanitizeValue<K extends keyof Settings>(key: K, value: unknown): Settings[K] | undefined {
  const fallback = DEFAULT_SETTINGS[key];

  if (key === 'services') return sanitizeServices(value) as Settings[K] | undefined;
  if (typeof value !== typeof fallback) return undefined;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    const range = RANGES[key as keyof typeof RANGES];
    return (range ? Math.min(range.max, Math.max(range.min, value)) : value) as Settings[K];
  }
  if (typeof value === 'string') {
    const allowed = ENUMS[key];
    if (allowed && !allowed.includes(value)) return undefined;
    if ((key === 'tileColor' || key === 'folderColor') && !isColor(value)) return undefined;
    if (key === 'backgroundColor' && (value === '' || !isColor(value))) return undefined;
    if (key === 'customCss') return value.slice(0, MAX_CUSTOM_CSS_LENGTH) as Settings[K];
  }
  return value as Settings[K];
}

/** Полные корректные настройки из произвольных данных: неизвестное отбрасывается, недостающее — по умолчанию */
export function sanitizeSettings(raw: unknown): Settings {
  const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const result = {...DEFAULT_SETTINGS} as Settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = sanitizeValue(key, source[key]);
    if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
  }
  return result;
}

/** Разделяет настройки на общие (синхронизируемые) и локальные */
export function splitSettings(settings: Settings): {shared: Partial<Settings>; local: Partial<Settings>} {
  const shared: Partial<Settings> = {...settings};
  const local: Partial<Settings> = {};
  for (const key of LOCAL_KEYS) {
    (local as Record<string, unknown>)[key] = settings[key];
    delete shared[key];
  }
  return {shared, local};
}
