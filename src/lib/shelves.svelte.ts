// Shelves: the most visited sites and recently closed tabs shown as compact rows below the tiles
// of the start pages (Home, the bookmarks bar, the default folder)
import {untrack} from 'svelte';
import {type BookmarkNode, enabledVirtualFolders} from './bookmarks.svelte';
import {MOST_VISITED_ID, RECENTLY_CLOSED_ID, type VirtualFolderId, virtualFolderItems} from './virtualFolders';

class ShelvesStore {
  lists = $state.raw<Partial<Record<VirtualFolderId, BookmarkNode[]>>>({});

  #watchingSessions = false;

  start(): void {
    // Load a shelf when its folder gets turned on; forget it when turned off
    $effect.root(() => {
      $effect(() => {
        const ids = enabledVirtualFolders().map((folder) => folder.id);
        untrack(() => {
          this.lists = Object.fromEntries(Object.entries(this.lists).filter(([id]) => ids.includes(id as VirtualFolderId)));
          for (const id of ids) this.#load(id);
          if (ids.includes(RECENTLY_CLOSED_ID)) this.#watchSessions();
        });
      });
    });

    // The most visited list changes as the user browses: refresh when the tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.lists[MOST_VISITED_ID]) this.#load(MOST_VISITED_ID);
    });
  }

  #load(id: VirtualFolderId): void {
    virtualFolderItems(id)
      .then((items) => {
        if (enabledVirtualFolders().some((folder) => folder.id === id)) this.lists = {...this.lists, [id]: items};
      })
      .catch((error) => console.error('Failed to load shelf', id, error));
  }

  /** Recently closed tabs change whenever a tab is closed; the API exists only once the permission is granted */
  #watchSessions(): void {
    if (this.#watchingSessions || !chrome.sessions?.onChanged) return;
    this.#watchingSessions = true;
    chrome.sessions.onChanged.addListener(() => {
      if (this.lists[RECENTLY_CLOSED_ID]) this.#load(RECENTLY_CLOSED_ID);
    });
  }
}

export const shelves = new ShelvesStore();
