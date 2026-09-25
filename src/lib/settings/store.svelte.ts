import {DEFAULT_SETTINGS, sanitizeSettings, type Settings} from './schema';
import {loadStoredSettings, onSettingsChanged, saveSettings} from './storage';

// localStorage: пишется синхронно, поэтому переживает закрытие вкладки сразу после изменения,
// и читается синхронно (в том числе theme-init.js) — без мигания при загрузке
const CACHE_KEY = 'settings-cache';
const SAVE_DELAY = 500; // Мс; sync ограничивает частоту записи, а ползунки шлют событие на каждый сдвиг

interface CachedSettings {
  settings: Settings;
  updatedAt: number;
}

function readCache(): CachedSettings {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return {
      settings: sanitizeSettings(cached?.settings),
      updatedAt: typeof cached?.updatedAt === 'number' ? cached.updatedAt : 0,
    };
  } catch {
    return {settings: {...DEFAULT_SETTINGS}, updatedAt: 0};
  }
}

const cache = readCache();

class SettingsStore {
  current = $state<Settings>(cache.settings);

  #updatedAt = cache.updatedAt; // Время последнего изменения текущих настроек
  #saveTimer: ReturnType<typeof setTimeout> | undefined;
  #pendingWrites = 0; // Записи в хранилище, которые ещё не завершились
  #reloadId = 0; // Номер последнего чтения, чтобы отбрасывать устаревшие

  /** Есть изменения, которых ещё нет в хранилище: читать оттуда сейчас — получить старые данные */
  get #hasUnsavedChanges(): boolean {
    return this.#saveTimer !== undefined || this.#pendingWrites > 0;
  }

  /** Загружает настройки из chrome.storage и следит за их изменением в других местах */
  start(): Promise<void> {
    onSettingsChanged(() => {
      this.#reload('change').catch((error) => console.error('Failed to reload settings', error));
    });
    // Попытка сохранить сразу; если вкладка закроется раньше, изменения останутся в кэше
    window.addEventListener('pagehide', () => this.flush());
    return this.#reload('startup');
  }

  /** Сохраняет отложенные изменения немедленно */
  flush(): void {
    if (this.#saveTimer === undefined) return;
    clearTimeout(this.#saveTimer);
    this.#save();
  }

  update(patch: Partial<Settings>): void {
    Object.assign(this.current, patch);
    this.#changed();
  }

  /** Заменяет все настройки (импорт, сброс); некорректные значения заменяются значениями по умолчанию */
  replace(value: unknown): void {
    this.current = sanitizeSettings(value);
    this.#changed();
  }

  /** Снимок текущих настроек без реактивности — для экспорта и передачи в API */
  snapshot(): Settings {
    return $state.snapshot(this.current) as Settings;
  }

  /**
   * startup — при открытии страницы: если в кэше изменения новее, прошлая вкладка закрылась,
   * не успев их сохранить, — досохраняем. change — хранилище изменили извне: применяем только
   * более новые данные (пустое хранилище после «Удалить синхронизированные данные» не трогает эту вкладку)
   */
  async #reload(reason: 'startup' | 'change'): Promise<void> {
    // Событие от собственной записи (она идёт в два хранилища по очереди) или здесь есть изменения новее
    if (this.#hasUnsavedChanges) return;

    const reloadId = ++this.#reloadId;
    const updatedAt = this.#updatedAt;
    const stored = await loadStoredSettings();
    // Применяем только самое свежее чтение и только если за время чтения здесь ничего не меняли
    if (reloadId !== this.#reloadId || updatedAt !== this.#updatedAt || this.#hasUnsavedChanges) return;

    if (stored.updatedAt < this.#updatedAt) {
      if (reason === 'startup') this.#save();
      return;
    }
    this.current = stored.settings;
    this.#updatedAt = stored.updatedAt;
    this.#writeCache();
  }

  #changed(): void {
    this.#updatedAt = Date.now();
    this.#writeCache();
    clearTimeout(this.#saveTimer);
    this.#saveTimer = setTimeout(() => this.#save(), SAVE_DELAY);
  }

  #save(): void {
    this.#saveTimer = undefined;
    this.#pendingWrites++;
    saveSettings(this.snapshot(), this.#updatedAt)
      .catch((error) => console.error('Failed to save settings', error))
      .finally(() => this.#pendingWrites--);
  }

  #writeCache(): void {
    try {
      const cached: CachedSettings = {settings: this.snapshot(), updatedAt: this.#updatedAt};
      localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    } catch (error) {
      console.error('Failed to cache settings', error);
    }
  }
}

export const settings = new SettingsStore();
