import {untrack} from 'svelte';
import {BOOKMARKS_BAR_ID, FOLDER_PREVIEW_SIZE, ROOT_FOLDER_ID} from './constants';
import {fallbackFolder, findSystemFolder} from './folders';
import {t} from './i18n/index.svelte';
import {showNotice} from './notice.svelte';
import {openSettingsTab} from './ui.svelte';
import {permissions} from './permissions.svelte';
import {settings} from './settings/store.svelte';
import {
  isVirtualFolder,
  MOST_VISITED_ID,
  onHiddenShelvesChanged,
  RECENTLY_CLOSED_ID,
  type VirtualFolderId,
  virtualFolderItems,
} from './virtualFolders';

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
  return /^#folder=([\w-]+)$/.exec(location.hash)?.[1] ?? null;
}


/** Virtual folders turned on in the settings and allowed on this device, with their localized names */
export function enabledVirtualFolders(): Array<{id: VirtualFolderId; title: string}> {
  const folders: Array<{id: VirtualFolderId; title: string}> = [];
  if (settings.current.showMostVisited && permissions.topSites) folders.push({id: MOST_VISITED_ID, title: t.virtual.mostVisited});
  if (settings.current.showRecentlyClosed && permissions.sessions) {
    folders.push({id: RECENTLY_CLOSED_ID, title: t.virtual.recentlyClosed});
  }
  return folders;
}

async function getFolderPath(folderId: string): Promise<Crumb[]> {
  const virtual = enabledVirtualFolders().find((folder) => folder.id === folderId);
  if (virtual) return [virtual];
  const path: Crumb[] = [];
  let id: string | undefined = folderId;
  while (id && id !== ROOT_FOLDER_ID) {
    const [node]: BookmarkNode[] = await chrome.bookmarks.get(id);
    path.unshift({id: node.id, title: node.title});
    id = node.parentId;
  }
  return path;
}

/** Folder contents: bookmark children or a virtual folder's list (virtual folders are shown as shelves, see shelves.svelte.ts) */
async function getItems(folderId: string): Promise<BookmarkNode[]> {
  if (isVirtualFolder(folderId)) {
    if (!enabledVirtualFolders().some((folder) => folder.id === folderId)) throw new Error(`${folderId} is off`);
    return virtualFolderItems(folderId);
  }
  return chrome.bookmarks.getChildren(folderId);
}

async function getPreview(folder: BookmarkNode): Promise<BookmarkNode[]> {
  return (await chrome.bookmarks.getChildren(folder.id)).slice(0, FOLDER_PREVIEW_SIZE);
}

class BookmarksStore {
  folderId = $state(BOOKMARKS_BAR_ID);
  items = $state.raw<BookmarkNode[]>([]);
  path = $state.raw<Crumb[]>([]);
  /** First items of each folder in items — for the folder tile preview */
  previews = $state.raw<Record<string, BookmarkNode[]>>({});
  /** The first load is done */
  loaded = $state(false);
  /** The browser's bookmarks bar; its id differs between browsers and account bookmarks. null — there's none */
  barId = $state<string | null>(BOOKMARKS_BAR_ID);
  /** Where new bookmarks go when the open place can't hold them (Home, a virtual folder): the bar or another folder */
  #writableId = BOOKMARKS_BAR_ID;

  #loadId = 0; // Number of the latest load, to drop stale ones
  #reloadTimer: ReturnType<typeof setTimeout> | undefined;
  #watchingSessions = false;

  /** Folder for new bookmarks: the current one, but not the root or a virtual folder — bookmarks can't go there */
  get targetFolderId(): string {
    return this.folderId === ROOT_FOLDER_ID || isVirtualFolder(this.folderId) ? this.#writableId : this.folderId;
  }

  /** The open folder is a read-only list from the browser (most visited, recently closed) */
  get virtual(): boolean {
    return isVirtualFolder(this.folderId);
  }

  /** Parent of the open folder; null at the root */
  get parentFolderId(): string | null {
    if (this.folderId === ROOT_FOLDER_ID) return null;
    return this.path.at(-2)?.id ?? ROOT_FOLDER_ID;
  }

  /** settingsLoaded — loading of the settings: the default folder depends on it */
  async start(settingsLoaded: Promise<unknown>): Promise<void> {
    window.addEventListener('hashchange', () => this.#load(folderFromHash() ?? this.startFolder()));

    // Reload on any bookmark change, including ones made in the browser itself
    [
      chrome.bookmarks.onCreated,
      chrome.bookmarks.onRemoved,
      chrome.bookmarks.onChanged,
      chrome.bookmarks.onMoved,
      chrome.bookmarks.onChildrenReordered,
      chrome.bookmarks.onImportEnded,
    ].forEach((event) => event.addListener(this.#scheduleReload));
    // Items of an open virtual folder hidden or brought back
    onHiddenShelvesChanged(() => {
      if (this.virtual) this.#scheduleReload();
    });

    // Virtual folders appear, disappear and change with their settings, permissions and the interface language.
    // The effect also re-runs on unrelated settings changes, so reload only when the set of folders really changed
    let previousKey = '';
    $effect.root(() => {
      $effect(() => {
        const folders = enabledVirtualFolders();
        const key = folders.map(({id, title}) => `${id}:${title}`).join('|');
        untrack(() => {
          if (key === previousKey) return;
          previousKey = key;
          if (folders.some((folder) => folder.id === RECENTLY_CLOSED_ID)) this.#watchSessions();
          if (this.loaded) this.#scheduleReload();
        });
      });
    });

    const [barId, writableId] = await Promise.all([
      findSystemFolder('bookmarks-bar').catch(() => BOOKMARKS_BAR_ID),
      fallbackFolder().catch(() => BOOKMARKS_BAR_ID),
      settingsLoaded.catch(() => undefined),
      permissions.ready,
    ]);
    this.barId = barId;
    this.#writableId = writableId ?? BOOKMARKS_BAR_ID;
    await this.#load(folderFromHash() ?? this.startFolder());
  }

  /**
   * Folder shown in a new tab: the last opened one or the default folder. The default setting means
   * "the bookmarks bar" — whatever its id is in this browser; without a bar — Home, where the user picks a folder
   */
  startFolder(): string {
    if (settings.current.rememberLastFolder) {
      const last = localStorage.getItem(LAST_FOLDER_KEY);
      if (last) return last;
    }
    const preferred = settings.current.defaultFolderId;
    return preferred === BOOKMARKS_BAR_ID ? this.barId ?? ROOT_FOLDER_ID : preferred;
  }

  navigate(folderId: string): void {
    location.hash = folderHref(folderId);
  }

  #scheduleReload = (): void => {
    clearTimeout(this.#reloadTimer);
    this.#reloadTimer = setTimeout(() => this.#load(this.folderId), RELOAD_DELAY);
  };

  /** Recently closed tabs change whenever a tab is closed; the API exists only once the permission is granted */
  #watchSessions(): void {
    if (this.#watchingSessions || !chrome.sessions?.onChanged) return;
    this.#watchingSessions = true;
    chrome.sessions.onChanged.addListener(() => {
      if (this.folderId === RECENTLY_CLOSED_ID) this.#scheduleReload();
    });
  }

  async #load(folderId: string): Promise<void> {
    const loadId = ++this.#loadId;

    let items: BookmarkNode[];
    let path: Crumb[];
    let previews: Record<string, BookmarkNode[]>;
    try {
      [items, path] = await Promise.all([getItems(folderId), getFolderPath(folderId)]);
      const folders = items.filter((item) => !item.url);
      const children = await Promise.all(folders.map(getPreview));
      previews = Object.fromEntries(folders.map((folder, i) => [folder.id, children[i]]));
    } catch (error) {
      if (loadId !== this.#loadId) return;
      // The folder may have been removed (or a virtual folder turned off) — go to the bookmarks bar,
      // and if the browser has none — to Home, where every folder is shown
      console.warn('Failed to load folder', folderId, error);
      if (folderId === ROOT_FOLDER_ID) return;
      history.replaceState(null, '', location.pathname);
      await this.#load(this.barId && folderId !== this.barId ? this.barId : ROOT_FOLDER_ID);
      return;
    }

    // A newer load started while we were waiting for data
    if (loadId !== this.#loadId) return;

    // Remember the folder only when the user opened it: a background reload of an old tab
    // must not overwrite the folder just opened in another tab
    const opened = !this.loaded || folderId !== this.folderId;
    this.folderId = folderId;
    this.items = items;
    this.path = path;
    this.previews = previews;
    this.loaded = true;
    if (opened) localStorage.setItem(LAST_FOLDER_KEY, folderId);

    // Even Home has no folders the browser lets us show — the user picks the start folder by hand
    if (opened && folderId === ROOT_FOLDER_ID && !items.some((item) => !item.url)) {
      showNotice(t.notice.noStartFolder, 'info', {label: t.notice.chooseFolder, run: () => openSettingsTab('general')});
    }
  }
}

export const bookmarks = new BookmarksStore();
