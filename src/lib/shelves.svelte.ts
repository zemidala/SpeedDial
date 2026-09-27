// Shelves: the most visited sites and recently closed tabs shown as compact rows below the tiles
// of the start pages (Home, the bookmarks bar, the default folder)
import {untrack} from 'svelte';
import {type BookmarkNode, enabledVirtualFolders} from './bookmarks.svelte';
import {
  hasHiddenItems,
  MOST_VISITED_ID,
  onHiddenShelvesChanged,
  RECENTLY_CLOSED_ID,
  type VirtualFolderId,
  virtualFolderItems,
} from './virtualFolders';

class ShelvesStore {
  lists = $state.raw<Partial<Record<VirtualFolderId, BookmarkNode[]>>>({});
  /** The list has hidden items the browser still lists — "Show hidden" is offered */
  hasHidden = $state.raw<Partial<Record<VirtualFolderId, boolean>>>({});

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

    // Items hidden or brought back — in this tab or another one
    onHiddenShelvesChanged(() => {
      for (const id of Object.keys(this.lists) as VirtualFolderId[]) this.#load(id);
    });

    // The most visited list changes as the user browses: refresh when the tab becomes visible again
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.lists[MOST_VISITED_ID]) this.#load(MOST_VISITED_ID);
    });
  }

  #load(id: VirtualFolderId): void {
    Promise.all([virtualFolderItems(id), hasHiddenItems(id)])
      .then(([items, hidden]) => {
        if (!enabledVirtualFolders().some((folder) => folder.id === id)) return;
        this.lists = {...this.lists, [id]: items};
        this.hasHidden = {...this.hasHidden, [id]: hidden};
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
