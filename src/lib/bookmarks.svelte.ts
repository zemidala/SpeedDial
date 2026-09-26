import {BOOKMARKS_BAR_ID, FOLDER_PREVIEW_SIZE, ROOT_FOLDER_ID} from './constants';
import {settings} from './settings/store.svelte';

export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export interface Crumb {
  id: string;
  title: string;
}

const RELOAD_DELAY = 100; // Ms; collapse a burst of bookmark changes into one reload
const LAST_FOLDER_KEY = 'last-folder'; // localStorage: the last opened folder on this device

// The open folder is kept in the URL (#folder=5): Back and page reload work
export function folderHref(folderId: string): string {
  return `#folder=${folderId}`;
}

function folderFromHash(): string | null {
  return /^#folder=(\w+)$/.exec(location.hash)?.[1] ?? null;
}

/** Folder shown in a new tab: the last opened one or the default folder */
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
  /** First items of each folder in items — for the folder tile preview */
  previews = $state.raw<Record<string, BookmarkNode[]>>({});
  /** The first load is done */
  loaded = $state(false);

  #loadId = 0; // Number of the latest load, to drop stale ones
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;

  /** Folder for new bookmarks: the current one, but not the root — the API doesn't allow adding there */
  get targetFolderId(): string {
    return this.folderId === ROOT_FOLDER_ID ? BOOKMARKS_BAR_ID : this.folderId;
  }

  /** Parent of the open folder; null at the root */
  get parentFolderId(): string | null {
    if (this.folderId === ROOT_FOLDER_ID) return null;
    return this.path.at(-2)?.id ?? ROOT_FOLDER_ID;
  }

  /** settingsLoaded — loading of the settings: the default folder depends on it */
  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    window.addEventListener('hashchange', () => this.#load(folderFromHash() ?? startFolder()));

    // Reload on any bookmark change, including ones made in the browser itself
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
      // The folder may have been removed — go back to the bookmarks bar
      console.error('Failed to load folder', folderId, error);
      if (folderId !== BOOKMARKS_BAR_ID) {
        history.replaceState(null, '', location.pathname);
        await this.#load(BOOKMARKS_BAR_ID);
      }
      return;
    }

    // A newer load started while we were waiting for data
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
