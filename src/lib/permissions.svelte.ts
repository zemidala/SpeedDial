// Необязательные разрешения: запрашиваются, только когда пользователь включает функцию
import {t} from './i18n/index.svelte';
import {hideNotice, showNotice} from './notice.svelte';
import {BING_ACCESS, CLIPBOARD_ACCESS, SITE_ACCESS} from './permissionSets';

/** Понятное объяснение ошибки запроса разрешения */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  // Страницы распакованного расширения браузер читает с диска сразу, а манифест — только при перезагрузке
  if (message.includes('Only permissions specified in the manifest')) {
    return t.notice.outdatedPermissions(t.notice.reloadHint);
  }
  return t.notice.permissionFailed(message);
}

class PermissionsStore {
  siteAccess = $state(false);
  clipboard = $state(false);
  /** Доступ к Bing — отдельно или в составе доступа ко всем сайтам */
  bing = $state(false);
  /** Состояние разрешений проверено */
  ready: Promise<void>;

  #resolveReady!: () => void;

  constructor() {
    this.ready = new Promise((resolve) => {
      this.#resolveReady = resolve;
    });
  }

  async start(): Promise<void> {
    try {
      await this.#refresh();
    } finally {
      this.#resolveReady();
    }
    // Разрешения могут выдать или отозвать на странице расширений
    const refresh = () => {
      this.#refresh().catch((error) => console.error('Failed to check permissions', error));
    };
    chrome.permissions.onAdded.addListener(refresh);
    chrome.permissions.onRemoved.addListener(refresh);
  }

  /**
   * Запрашивает разрешение. Вызывать прямо из обработчика клика, до любых await:
   * браузер показывает запрос только в ответ на действие пользователя.
   * Ошибку не бросает: показывает уведомление и возвращает false.
   */
  async request(permissions: chrome.permissions.Permissions): Promise<boolean> {
    let granted = false;
    try {
      granted = await chrome.permissions.request(permissions);
      hideNotice();
    } catch (error) {
      console.error('Failed to request permission', error);
      showNotice(describeError(error));
    }
    await this.#refresh();
    return granted;
  }

  async remove(permissions: chrome.permissions.Permissions): Promise<void> {
    await chrome.permissions.remove(permissions).catch(() => false);
    await this.#refresh();
  }

  async #refresh(): Promise<void> {
    [this.siteAccess, this.clipboard, this.bing] = await Promise.all([
      chrome.permissions.contains(SITE_ACCESS),
      chrome.permissions.contains(CLIPBOARD_ACCESS),
      chrome.permissions.contains(BING_ACCESS),
    ]);
  }
}

export const permissions = new PermissionsStore();
