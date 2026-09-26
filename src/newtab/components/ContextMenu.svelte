<script lang="ts">
  import {type BookmarkNode, bookmarks} from '../../lib/bookmarks.svelte';
  import {BOOKMARKS_BAR_ID, ROOT_FOLDER_ID} from '../../lib/constants';
  import {t} from '../../lib/i18n/index.svelte';
  import {folderPageUrl, type OpenMode, openUrl} from '../../lib/navigation';
  import {showNotice} from '../../lib/notice.svelte';
  import {search} from '../../lib/search.svelte';
  import {settings} from '../../lib/settings/store.svelte';
  import {shelves} from '../../lib/shelves.svelte';
  import {openSettings, requestDelete, ui} from '../../lib/ui.svelte';
  import {isWebUrl} from '../../lib/url';
  import {isVirtualFolder, isVirtualNode} from '../../lib/virtualFolders';
  import Icon, {type IconName} from './ui/Icon.svelte';

  interface MenuItem {
    label: string;
    icon?: IconName;
    disabled?: boolean;
    action: () => unknown;
  }

  type MenuEntry = MenuItem | 'separator';

  // The browser's standard menu stays here (copy, paste, etc.)
  const NATIVE_MENU_SELECTOR = 'input, textarea, select, [contenteditable], dialog, .services-menu__popup';

  let menu = $state<{x: number; y: number; entries: MenuEntry[]} | null>(null);
  let element = $state<HTMLElement>();

  function openEntries(node: BookmarkNode): MenuEntry[] {
    const open = (mode: OpenMode) => () => {
      if (node.url) return openUrl(node.url, mode);
      // A folder opens as a SpeedDial page
      if (mode === 'current') return bookmarks.navigate(node.id);
      return openUrl(folderPageUrl(node.id), mode);
    };
    const entries: MenuEntry[] = [
      {label: t.menu.open, action: open('current')},
      {label: t.menu.openInNewTab, action: open('tab')},
      {label: t.menu.openInBackground, action: open('background')},
      {label: t.menu.openInNewWindow, action: open('window')},
    ];
    // Incognito opens only web pages: extension pages have no access in incognito
    if (node.url && isWebUrl(node.url)) {
      entries.push({label: t.menu.openIncognito, action: open('incognito')});
    }
    return entries;
  }

  function historyEntries(): MenuEntry[] {
    // The Navigation API knows whether there's history to go to in this tab's folders
    const canGoBack = window.navigation?.canGoBack ?? true;
    const canGoForward = window.navigation?.canGoForward ?? true;
    return [
      {label: t.menu.back, icon: 'back', disabled: !canGoBack, action: () => history.back()},
      {label: t.menu.forward, icon: 'forward', disabled: !canGoForward, action: () => history.forward()},
    ];
  }

  function createEntries(anchor: BookmarkNode | null): MenuEntry[] {
    // Right-click on a folder — new items are created inside it, at the end
    if (anchor && !anchor.url) {
      const parent = {parentId: anchor.id, parentTitle: anchor.title};
      return [
        {
          label: t.menu.newBookmarkHere,
          icon: 'bookmarkPlus',
          action: () => (ui.dialog = {kind: 'create', type: 'bookmark', ...parent}),
        },
        {
          label: t.menu.newFolderHere,
          icon: 'folderPlus',
          action: () => (ui.dialog = {kind: 'create', type: 'folder', ...parent}),
        },
      ];
    }

    const parentId = bookmarks.targetFolderId;
    // Right-click on a bookmark — the new item goes right after it (unless sorting overrides the order)
    const {sortOrder, typeOrder} = settings.current;
    const index = anchor && !search.active && sortOrder === 'none' && typeOrder === 'none' && anchor.parentId === parentId
      ? (anchor.index ?? 0) + 1
      : undefined;
    return [
      {label: t.menu.newBookmark, icon: 'bookmarkPlus', action: () => (ui.dialog = {kind: 'create', type: 'bookmark', parentId, index})},
      {label: t.menu.newFolder, icon: 'folderPlus', action: () => (ui.dialog = {kind: 'create', type: 'folder', parentId, index})},
    ];
  }

  function sortEntry(folder: {id: string; title: string}): MenuItem {
    return {
      label: t.menu.sort,
      icon: 'sort',
      // System folders at the root can't be reordered, virtual folders are ordered by the browser
      disabled: folder.id === ROOT_FOLDER_ID || isVirtualFolder(folder.id),
      action: () => (ui.dialog = {kind: 'sort', folder}),
    };
  }

  const currentFolder = () => ({id: bookmarks.folderId, title: bookmarks.path.at(-1)?.title ?? t.common.home});

  const refreshEntry = (): MenuItem => ({label: t.menu.refresh, icon: 'refresh', action: () => location.reload()});

  /** Menu of a bookmark or folder tile */
  function copyLinkEntry(url: string): MenuItem {
    return {
      label: t.menu.copyLink,
      icon: 'copy',
      action: async () => {
        await navigator.clipboard.writeText(url);
        showNotice(t.notice.linkCopied, 'info');
      },
    };
  }

  /** Saves a page from a virtual folder as a bookmark in the default folder (or the bookmarks bar) */
  function addToBookmarksEntry(node: BookmarkNode & {url: string}): MenuItem {
    return {
      label: t.virtual.addToBookmarks,
      icon: 'bookmarkPlus',
      action: async () => {
        const preferred = settings.current.defaultFolderId;
        const [folder] = await chrome.bookmarks.get(isVirtualFolder(preferred) ? BOOKMARKS_BAR_ID : preferred)
          .catch(() => chrome.bookmarks.get(BOOKMARKS_BAR_ID));
        await chrome.bookmarks.create({parentId: folder.id, title: node.title, url: node.url});
        showNotice(t.virtual.added(folder.title), 'info');
      },
    };
  }

  /** Menu of a virtual folder or an item in one: open, copy, add to bookmarks — nothing to edit */
  function virtualEntries(node: BookmarkNode): MenuEntry[] {
    const entries: MenuEntry[] = [...openEntries(node), 'separator', ...historyEntries()];
    if (node.url) entries.push('separator', copyLinkEntry(node.url), addToBookmarksEntry(node as BookmarkNode & {url: string}));
    entries.push('separator', refreshEntry());
    return entries;
  }

  function tileEntries(node: BookmarkNode): MenuEntry[] {
    if (isVirtualNode(node)) return virtualEntries(node);
    const entries: MenuEntry[] = [...openEntries(node), 'separator', ...historyEntries(), 'separator'];
    if (node.url) entries.push(copyLinkEntry(node.url), 'separator');
    entries.push(...createEntries(node), 'separator');
    entries.push({label: t.menu.edit, icon: 'pencil', action: () => (ui.dialog = {kind: 'edit', node})});
    if (node.url) {
      const bookmark = node as BookmarkNode & {url: string};
      entries.push({label: t.menu.icon, icon: 'image', action: () => (ui.dialog = {kind: 'icon', node: bookmark})});
    }
    // On a folder "Sort" sorts that folder, on a bookmark — the open folder
    entries.push(
      sortEntry(node.url ? currentFolder() : {id: node.id, title: node.title}),
      'separator',
      {label: settings.current.confirmDelete ? t.menu.deleteConfirm : t.menu.delete, icon: 'trash', action: () => requestDelete(node)},
      'separator',
      refreshEntry(),
    );
    return entries;
  }

  /** Menu of an empty area of the page */
  function pageEntries(): MenuEntry[] {
    const entries: MenuEntry[] = [
      ...historyEntries(),
      'separator',
      ...createEntries(null),
      'separator',
      sortEntry(currentFolder()),
      'separator',
      refreshEntry(),
    ];
    // If the settings button is hidden, the settings open from here
    if (!settings.current.showSettingsButton) {
      entries.push({label: t.common.settings, icon: 'settings', action: openSettings});
    }
    return entries;
  }

  // Element focus returns to when the menu is closed with Esc
  let returnFocus: HTMLElement | null = null;

  function onContextMenu(event: MouseEvent) {
    menu = null;
    const target = event.target as Element;
    if (target.closest(NATIVE_MENU_SELECTOR)) return;
    event.preventDefault();

    let {clientX: x, clientY: y} = event;
    // A keyboard-opened menu (Shift+F10, the menu key) opens at the focused tile, not where the mouse is
    const tile = target.closest<HTMLElement>('.tile');
    if (tile && tile === document.activeElement) {
      const box = tile.getBoundingClientRect();
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) {
        x = box.left + box.width / 2;
        y = box.top + box.height / 2;
      }
    }
    returnFocus = document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;

    const id = target.closest<HTMLElement>('[data-bookmark-id]')?.dataset.bookmarkId;
    // Tiles, search results and items on the shelves below the tiles
    const node = [...bookmarks.items, ...search.results, ...Object.values(shelves.lists).flat()].find((item) => item.id === id);
    menu = {x, y, entries: node ? tileEntries(node) : pageEntries()};
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !menu) return;
    close();
    returnFocus?.focus();
  }

  function run(item: MenuItem) {
    menu = null;
    Promise.resolve()
      .then(item.action)
      .catch((error) => {
        console.error(`${item.label}:`, error);
        showNotice(t.notice.actionFailed(item.label, error instanceof Error ? error.message : String(error)));
      });
  }

  function close() {
    menu = null;
  }

  // Arrow keys move focus across menu items
  function onMenuKeydown(event: KeyboardEvent) {
    if (!element || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...element.querySelectorAll<HTMLButtonElement>('.context-menu__item:not(:disabled)')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = {
      ArrowDown: (current + 1) % items.length,
      ArrowUp: (current - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1,
    }[event.key]!;
    items[next]?.focus();
  }

  // After rendering: keep the menu inside the window and focus the first item
  $effect(() => {
    if (!menu || !element) return;
    element.style.left = `${Math.max(0, Math.min(menu.x, window.innerWidth - element.offsetWidth))}px`;
    element.style.top = `${Math.max(0, Math.min(menu.y, window.innerHeight - element.offsetHeight))}px`;
    element.querySelector<HTMLButtonElement>('.context-menu__item:not(:disabled)')?.focus();
  });
</script>

<svelte:window
  oncontextmenu={onContextMenu}
  onclick={(event) => menu && !element?.contains(event.target as Node) && close()}
  onkeydown={onWindowKeydown}
  onblur={close}
  onresize={close}
/>

{#if menu}
  <div class="context-menu" role="menu" tabindex="-1" bind:this={element} onkeydown={onMenuKeydown}>
    {#each menu.entries as entry, i (i)}
      {#if entry === 'separator'}
        <hr class="context-menu__separator">
      {:else}
        <button
          type="button"
          class="context-menu__item"
          role="menuitem"
          disabled={entry.disabled}
          onclick={() => run(entry)}
        >
          <span class="context-menu__icon">
            {#if entry.icon}
              <Icon name={entry.icon} size={16}/>
            {/if}
          </span>
          {entry.label}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    min-width: 240px;
    max-height: calc(100vh - 16px);
    padding: 4px;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-raised);
  }

  .context-menu__item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 12px 7px 8px;
    border: none;
    border-radius: 4px;
    background: none;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
  }

  .context-menu__item:hover:not(:disabled),
  .context-menu__item:focus-visible {
    outline: none;
    background: var(--surface-hover);
  }

  .context-menu__item:disabled {
    color: var(--text-muted);
    opacity: 0.6;
    cursor: default;
  }

  .context-menu__icon {
    display: flex;
    flex-shrink: 0;
    width: 16px;
    color: var(--text-muted);
  }

  .context-menu__separator {
    width: 100%;
    margin: 4px 0;
    border: none;
    border-top: 1px solid var(--border);
  }
</style>
