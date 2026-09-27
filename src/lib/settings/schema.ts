// Settings schema: types, defaults and validation of data from storage and imports
import {en} from '../i18n/en';
import {ru} from '../i18n/ru';
import {DEFAULT_THEME_PRESET, THEME_PRESET_IDS} from '../themes/presets';

/** auto — the browser language if there's a translation for it, otherwise English */
export const LANGUAGE_SETTINGS = ['auto', 'en', 'ru'] as const;
export const THEMES = ['auto', 'light', 'dark'] as const;
/** auto — high if the system has high contrast enabled (prefers-contrast: more) */
export const CONTRASTS = ['auto', 'normal', 'high'] as const;
/** Text size of the whole page — like "Font size" in the browser settings */
export const FONT_SIZES = ['xs', 's', 'm', 'l', 'xl'] as const;
/** Tile name size */
export const TITLE_SIZES = ['s', 'm', 'l'] as const;
export const BACKGROUNDS = ['none', 'color', 'image', 'bing'] as const;
export const ICON_STYLES = ['plate', 'fill'] as const;
export const TITLE_POSITIONS = ['bottom-inside', 'top-inside', 'bottom-outside', 'top-outside'] as const;
export const LOGO_SERVICE_IDS = ['none', 'google', 'duckduckgo', 'iconhorse', 'logodev', 'custom'] as const;
export const SEARCH_ENGINES = ['google', 'yandex', 'bing', 'duckduckgo', 'custom'] as const;
export const SORT_ORDERS = ['none', 'title', 'url', 'dateAdded'] as const;
export const TYPE_ORDERS = ['none', 'foldersFirst', 'bookmarksFirst'] as const;
/** Screenshots of bookmarked pages while browsing: none, only for bookmarks without a thumbnail, or also refreshing old ones */
export const AUTO_CAPTURES = ['off', 'missing', 'stale'] as const;

export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number];
export type Theme = (typeof THEMES)[number];
export type Contrast = (typeof CONTRASTS)[number];
export type FontSize = (typeof FONT_SIZES)[number];
export type TitleSize = (typeof TITLE_SIZES)[number];
export type Background = (typeof BACKGROUNDS)[number];
export type IconStyle = (typeof ICON_STYLES)[number];
export type TitlePosition = (typeof TITLE_POSITIONS)[number];
export type LogoService = (typeof LOGO_SERVICE_IDS)[number];
export type SearchEngine = (typeof SEARCH_ENGINES)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];
export type TypeOrder = (typeof TYPE_ORDERS)[number];
export type AutoCapture = (typeof AUTO_CAPTURES)[number];

export interface ServiceLink {
  title: string;
  url: string;
}

export interface Settings {
  // ===== Appearance =====
  language: LanguageSetting;
  columns: number;
  /** Width of the bookmarks area, % of the window width */
  containerWidth: number;
  /** Light or dark mode */
  theme: Theme;
  /** Contrast of borders, cells and secondary text */
  contrast: Contrast;
  /** Theme (set of colours); custom — a palette from customAccent and customTint */
  themePreset: string;
  customAccent: string;
  /** Background tint for the custom palette */
  customTint: string;
  /** How much to soften light backgrounds, % (0 — as in the theme) */
  lightDimming: number;
  verticalCenter: boolean;
  /** plate — icon on a plate; fill — the icon fills the tile area */
  iconStyle: IconStyle;
  /** Icon size, % of the icon area height */
  iconScale: number;
  /** Tint the tile with the icon's main colour */
  iconTint: boolean;
  /** Third-party icon service — a fallback when the site itself has no large icon */
  logoService: LogoService;
  /** Custom URL template for logoService = custom; {{website}} is replaced with the site domain */
  externalLogoUrl: string;
  /** logo.dev access key */
  logoDevToken: string;
  showToolbar: boolean;
  autofocusSearch: boolean;
  showSettingsButton: boolean;
  showBackTile: boolean;
  showAddTile: boolean;
  showTitles: boolean;
  /** Where the name goes: top or bottom, inside the tile or below/above it */
  titlePosition: TitlePosition;
  showTitleIcons: boolean;
  background: Background;
  backgroundColor: string;
  /** Background image blur, px */
  backgroundBlur: number;
  /** Background image dimming, % */
  backgroundDim: number;
  /** Empty string — colour from the current theme */
  tileColor: string;
  folderColor: string;
  fontFamily: string;
  fontSize: FontSize;
  titleSize: TitleSize;
  boldTitles: boolean;

  // ===== General =====
  /** Folder opened in a new tab. Not synced: folders have different ids on different devices */
  defaultFolderId: string;
  rememberLastFolder: boolean;
  /** Virtual folders; each also needs its permission on this device */
  showMostVisited: boolean;
  showRecentlyClosed: boolean;
  /** "Not now" was pressed on the invitation to show these shelves */
  shelfInviteDismissed: boolean;
  /** The shelves are tucked away at the bottom: only their tab shows */
  shelvesCollapsed: boolean;
  searchEngine: SearchEngine;
  /** Search URL for searchEngine = custom; %s is replaced with the query */
  customSearchUrl: string;
  showServices: boolean;
  services: ServiceLink[];
  /** Site previews on a folder tile instead of a folder icon */
  folderPreview: boolean;
  /** Load large icons directly from sites */
  siteIcons: boolean;
  showThumbnailRefresh: boolean;
  captureOnCreate: boolean;
  autoCapture: AutoCapture;
  /** Delay before a page screenshot, seconds */
  captureDelay: number;
  refreshIncludesSubfolders: boolean;
  openInNewTab: boolean;
  newBookmarksFirst: boolean;
  dragAndDrop: boolean;
  sortOrder: SortOrder;
  typeOrder: TypeOrder;
  browserContextMenu: boolean;
  closeTabAfterAdd: boolean;
  /** Not synced: decides where the other settings are stored */
  syncEnabled: boolean;

  // ===== Advanced =====
  confirmDelete: boolean;
  customCss: string;
}

type KeysOfType<T, V> = {[K in keyof T]: T[K] extends V ? K : never}[keyof T];

export type BooleanSettingKey = KeysOfType<Settings, boolean>;
export type ColorSettingKey = 'tileColor' | 'folderColor' | 'backgroundColor' | 'customAccent' | 'customTint';

/** Settings stored only on this device */
export const LOCAL_KEYS = ['defaultFolderId', 'syncEnabled'] as const satisfies ReadonlyArray<keyof Settings>;

export const MAX_CUSTOM_CSS_LENGTH = 5000; // chrome.storage.sync limits an item to 8 KB

/** Default services for the browser language: Yandex for Russian users, Outlook and Wikipedia for others */
function defaultServices(): ServiceLink[] {
  const ui = globalThis.chrome?.i18n?.getUILanguage?.() ?? globalThis.navigator?.language ?? 'en';
  return (ui.toLowerCase().startsWith('ru') ? ru : en).general.defaultServices;
}

export const DEFAULT_SERVICES: ServiceLink[] = defaultServices();

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  language: 'auto',
  columns: 6,
  containerWidth: 90,
  theme: 'auto',
  contrast: 'auto',
  themePreset: DEFAULT_THEME_PRESET,
  customAccent: '#6750a4',
  customTint: '#6750a4',
  lightDimming: 10,
  verticalCenter: false,
  iconStyle: 'plate',
  iconScale: 50,
  iconTint: true,
  logoService: 'none',
  externalLogoUrl: '',
  logoDevToken: '',
  showToolbar: true,
  autofocusSearch: false,
  showSettingsButton: true,
  showBackTile: true,
  showAddTile: true,
  showTitles: true,
  titlePosition: 'bottom-inside',
  showTitleIcons: false,
  background: 'none',
  backgroundColor: '#1f2933',
  backgroundBlur: 0,
  backgroundDim: 0,
  tileColor: '',
  folderColor: '',
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  fontSize: 'm',
  titleSize: 'm',
  boldTitles: false,

  defaultFolderId: '1',
  rememberLastFolder: false,
  showMostVisited: false,
  showRecentlyClosed: false,
  shelfInviteDismissed: false,
  shelvesCollapsed: false,
  searchEngine: 'google',
  customSearchUrl: '',
  showServices: true,
  services: DEFAULT_SERVICES,
  folderPreview: true,
  siteIcons: false,
  showThumbnailRefresh: true,
  captureOnCreate: false,
  autoCapture: 'missing',
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

  // Deletion can be undone from the notification, so there's no extra question by default
  confirmDelete: false,
  customCss: '',
};

// Allowed values: enums and number ranges
const ENUMS: Partial<Record<keyof Settings, readonly string[]>> = {
  language: LANGUAGE_SETTINGS,
  theme: THEMES,
  contrast: CONTRASTS,
  fontSize: FONT_SIZES,
  titleSize: TITLE_SIZES,
  themePreset: THEME_PRESET_IDS,
  background: BACKGROUNDS,
  iconStyle: ICON_STYLES,
  titlePosition: TITLE_POSITIONS,
  logoService: LOGO_SERVICE_IDS,
  searchEngine: SEARCH_ENGINES,
  sortOrder: SORT_ORDERS,
  typeOrder: TYPE_ORDERS,
  autoCapture: AUTO_CAPTURES,
};

export const RANGES = {
  columns: {min: 1, max: 12, step: 1},
  containerWidth: {min: 40, max: 100, step: 1},
  lightDimming: {min: 0, max: 30, step: 5},
  backgroundBlur: {min: 0, max: 20, step: 1},
  backgroundDim: {min: 0, max: 70, step: 5},
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
    const requiredColor = key === 'backgroundColor' || key === 'customAccent' || key === 'customTint';
    if (requiredColor && (value === '' || !isColor(value))) return undefined;
    if (key === 'customCss') return value.slice(0, MAX_CUSTOM_CSS_LENGTH) as Settings[K];
  }
  return value as Settings[K];
}

/** Complete valid settings from arbitrary data: unknown values are dropped, missing ones take defaults */
export function sanitizeSettings(raw: unknown): Settings {
  const source = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {};
  const result = {...DEFAULT_SETTINGS} as Settings;
  for (const key of Object.keys(DEFAULT_SETTINGS) as Array<keyof Settings>) {
    const value = sanitizeValue(key, source[key]);
    if (value !== undefined) (result as unknown as Record<string, unknown>)[key] = value;
  }
  // There used to be only an "External logos" switch with its own URL
  if (source.logoService === undefined && source.externalLogos === true) result.logoService = 'custom';
  return result;
}

/** Splits settings into shared (synced) and local ones */
export function splitSettings(settings: Settings): {shared: Partial<Settings>; local: Partial<Settings>} {
  const shared: Partial<Settings> = {...settings};
  const local: Partial<Settings> = {};
  for (const key of LOCAL_KEYS) {
    (local as Record<string, unknown>)[key] = settings[key];
    delete shared[key];
  }
  return {shared, local};
}
