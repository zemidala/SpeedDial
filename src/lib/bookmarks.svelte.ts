import {BOOKMARKS_BAR_ID, FOLDER_PREVIEW_SIZE, ROOT_FOLDER_ID} from './constants';
import {settings} from './settings/store.svelte';

export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export interface Crumb {
  id: string;
  title: string;
}

const RELOAD_DELAY = 100; // Мс; схлопываем пачку изменений закладок в одну перезагрузку
const LAST_FOLDER_KEY = 'last-folder'; // localStorage: последняя открытая папка на этом устройстве

// Открытая папка хранится в адресе (#folder=5): работают «Назад» и перезагрузка страницы
export function folderHref(folderId: string): string {
  return `#folder=${folderId}`;
}

function folderFromHash(): string | null {
  return /^#folder=(\w+)$/.exec(location.hash)?.[1] ?? null;
}

/** Папка при открытии новой вкладки: последняя открытая или папка по умолчанию */
function startFolder(): string {
  if (settings.current.rememberLastFolder) {
    const last = localStorage.getItem(LAST_FOLDER_KEY);
    if (last) return last;
  }
  return settings.current.defaultFolderId;
}

async function getFolderPath(folderId: string): Promise<Crumb[]> {
  const path: Crumb[] = [];
  let id: string | undefined = folderId;
  while (id && id !== ROOT_FOLDER_ID) {
    const [node]: BookmarkNode[] = await chrome.bookmarks.get(id);
    path.unshift({id: node.id, title: node.title});
    id = node.parentId;
  }
  return path;
}

class BookmarksStore {
  folderId = $state(BOOKMARKS_BAR_ID);
  items = $state.raw<BookmarkNode[]>([]);
  path = $state.raw<Crumb[]>([]);
  /** Первые элементы каждой папки из items — для миниатюр на плитке папки */
  previews = $state.raw<Record<string, BookmarkNode[]>>({});
  /** Первая загрузка завершена */
  loaded = $state(false);

  #loadId = 0; // Номер последней загрузки, чтобы отбрасывать устаревшие
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;

  /** Папка для новых закладок: текущая, но не корень — в него API добавлять не разрешает */
  get targetFolderId(): string {
    return this.folderId === ROOT_FOLDER_ID ? BOOKMARKS_BAR_ID : this.folderId;
  }

  /** Родительская папка открытой; null в корне */
  get parentFolderId(): string | null {
    if (this.folderId === ROOT_FOLDER_ID) return null;
    return this.path.at(-2)?.id ?? ROOT_FOLDER_ID;
  }

  /** settingsLoaded — загрузка настроек: от неё зависит папка по умолчанию */
  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    window.addEventListener('hashchange', () => this.#load(folderFromHash() ?? startFolder()));

    // Перезагружаем при любых изменениях закладок, в том числе сделанных в самом браузере
    const scheduleReload = () => {
      clearTimeout(this.#reloadTimer);
      this.#reloadTimer = setTimeout(() => this.#load(this.folderId), RELOAD_DELAY);
    };
    [
      chrome.bookmarks.onCreated,
      chrome.bookmarks.onRemoved,
      chrome.bookmarks.onChanged,
      chrome.bookmarks.onMoved,
      chrome.bookmarks.onChildrenReordered,
      chrome.bookmarks.onImportEnded,
    ].forEach((event) => event.addListener(scheduleReload));

    await settingsLoaded.catch(() => undefined);
    await this.#load(folderFromHash() ?? startFolder());
  }

  navigate(folderId: string): void {
    location.hash = folderHref(folderId);
  }

  async #load(folderId: string): Promise<void> {
    const loadId = ++this.#loadId;

    let items: BookmarkNode[];
    let path: Crumb[];
    let previews: Record<string, BookmarkNode[]>;
    try {
      [items, path] = await Promise.all([
        chrome.bookmarks.getChildren(folderId),
        getFolderPath(folderId),
      ]);
      const folders = items.filter((item) => !item.url);
      const children = await Promise.all(folders.map((folder) => chrome.bookmarks.getChildren(folder.id)));
      previews = Object.fromEntries(folders.map((folder, i) => [
        folder.id,
        children[i].slice(0, FOLDER_PREVIEW_SIZE),
      ]));
    } catch (error) {
      if (loadId !== this.#loadId) return;
      // Папку могли удалить — возвращаемся к «Панели избранного»
      console.error('Failed to load folder', folderId, error);
      if (folderId !== BOOKMARKS_BAR_ID) {
        history.replaceState(null, '', location.pathname);
        await this.#load(BOOKMARKS_BAR_ID);
      }
      return;
    }

    // Пока ждали данные, началась более новая загрузка
    if (loadId !== this.#loadId) return;

    this.folderId = folderId;
    this.items = items;
    this.path = path;
    this.previews = previews;
    this.loaded = true;
    localStorage.setItem(LAST_FOLDER_KEY, folderId);
  }
}

export const bookmarks = new BookmarksStore();
