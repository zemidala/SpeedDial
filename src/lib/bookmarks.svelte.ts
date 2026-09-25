import {BOOKMARKS_BAR_ID, FOLDER_PREVIEW_SIZE, ROOT_FOLDER_ID} from './constants';

export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export interface Crumb {
  id: string;
  title: string;
}

const RELOAD_DELAY = 100; // Мс; схлопываем пачку изменений закладок в одну перезагрузку

// Открытая папка хранится в адресе (#folder=5): работают «Назад» и перезагрузка страницы
export function folderHref(folderId: string): string {
  return `#folder=${folderId}`;
}

function folderFromHash(): string {
  return /^#folder=(\w+)$/.exec(location.hash)?.[1] ?? BOOKMARKS_BAR_ID;
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

  #loadId = 0; // Номер последней загрузки, чтобы отбрасывать устаревшие
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;

  /** Папка для новых закладок: текущая, но не корень — в него API добавлять не разрешает */
  get targetFolderId(): string {
    return this.folderId === ROOT_FOLDER_ID ? BOOKMARKS_BAR_ID : this.folderId;
  }

  start(): Promise<void> {
    window.addEventListener('hashchange', () => this.#load(folderFromHash()));

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

    return this.#load(folderFromHash());
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
      // Папку могли удалить — возвращаемся к папке по умолчанию
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
  }
}

export const bookmarks = new BookmarksStore();
