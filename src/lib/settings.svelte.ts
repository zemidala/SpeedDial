export type Theme = 'auto' | 'light' | 'dark';

export interface Settings {
  theme: Theme;
  columns: number;
  /** Пустая строка — цвет из текущей темы */
  tileColor: string;
  folderColor: string;
  fontFamily: string;
  /** Подкрашивать плитку основным цветом иконки */
  iconTint: boolean;
  /** Загружать крупные иконки прямо с сайтов */
  hqIcons: boolean;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  theme: 'auto',
  columns: 6,
  tileColor: '',
  folderColor: '',
  fontFamily: 'Segoe UI, system-ui, sans-serif',
  iconTint: true,
  hqIcons: false,
};

// Цвета плиток по умолчанию для палитры в настройках; должны совпадать с global.css
export const THEME_COLORS = {
  light: {tileColor: '#ffffff', folderColor: '#e6f2ff'},
  dark: {tileColor: '#262a31', folderColor: '#1f2b3b'},
} as const;

export const COLUMNS_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const STORAGE_KEY = 'settings'; // chrome.storage.sync — синхронизируется между устройствами
const CACHE_KEY = 'settings-cache'; // localStorage — читается синхронно, без мигания при загрузке
const SAVE_DELAY = 500; // Мс; sync ограничивает частоту записи, а color picker шлёт событие на каждый сдвиг

// Дополняем значениями по умолчанию ключи, которых нет в сохранённых данных
function withDefaults(value: unknown): Settings {
  return {...DEFAULT_SETTINGS, ...(typeof value === 'object' && value !== null ? value : {})};
}

function readCache(): Settings {
  try {
    return withDefaults(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'));
  } catch {
    return {...DEFAULT_SETTINGS};
  }
}

class SettingsStore {
  current = $state<Settings>(readCache());

  #saveTimer: ReturnType<typeof setTimeout> | undefined;

  async start(): Promise<void> {
    chrome.storage.onChanged.addListener((changes, area) => {
      // Пока ждёт своя запись, чужое (более старое) значение не применяем
      if (area === 'sync' && STORAGE_KEY in changes && this.#saveTimer === undefined) {
        this.#replace(changes[STORAGE_KEY].newValue);
      }
    });

    const stored = await chrome.storage.sync.get(STORAGE_KEY);
    if (STORAGE_KEY in stored && this.#saveTimer === undefined) {
      this.#replace(stored[STORAGE_KEY]);
    }
  }

  update(patch: Partial<Settings>): void {
    Object.assign(this.current, patch);
    this.#writeCache();

    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => {
      this.#saveTimer = undefined;
      chrome.storage.sync.set({[STORAGE_KEY]: $state.snapshot(this.current)})
        .catch((error) => console.error('Failed to save settings', error));
    }, SAVE_DELAY);
  }

  #replace(value: unknown): void {
    this.current = withDefaults(value);
    this.#writeCache();
  }

  #writeCache(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.current));
    } catch (error) {
      console.error('Failed to cache settings', error);
    }
  }
}

export const settings = new SettingsStore();
