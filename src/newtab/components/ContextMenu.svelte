<script lang="ts">
  import {type BookmarkNode, bookmarks} from '../../lib/bookmarks.svelte';
  import {ROOT_FOLDER_ID} from '../../lib/constants';
  import {t} from '../../lib/i18n/index.svelte';
  import {folderPageUrl, type OpenMode, openUrl} from '../../lib/navigation';
  import {showNotice} from '../../lib/notice.svelte';
  import {search} from '../../lib/search.svelte';
  import {settings} from '../../lib/settings/store.svelte';
  import {openSettings, requestDelete, ui} from '../../lib/ui.svelte';
  import {isWebUrl} from '../../lib/url';
  import Icon, {type IconName} from './ui/Icon.svelte';

  interface MenuItem {
    label: string;
    icon?: IconName;
    disabled?: boolean;
    action: () => unknown;
  }

  type MenuEntry = MenuItem | 'separator';

  // Здесь остаётся стандартное меню браузера (копировать, вставить и т.п.)
  const NATIVE_MENU_SELECTOR = 'input, textarea, select, [contenteditable], dialog, .services-menu__popup';

  let menu = $state<{x: number; y: number; entries: MenuEntry[]} | null>(null);
  let element = $state<HTMLElement>();

  function openEntries(node: BookmarkNode): MenuEntry[] {
    const open = (mode: OpenMode) => () => {
      if (node.url) return openUrl(node.url, mode);
      // Папка открывается страницей SpeedDial
      if (mode === 'current') return bookmarks.navigate(node.id);
      return openUrl(folderPageUrl(node.id), mode);
    };
    const entries: MenuEntry[] = [
      {label: t.menu.open, action: open('current')},
      {label: t.menu.openInNewTab, action: open('tab')},
      {label: t.menu.openInBackground, action: open('background')},
      {label: t.menu.openInNewWindow, action: open('window')},
    ];
    // В режиме инкогнито открываются только веб-страницы: у страниц расширения нет доступа в инкогнито
    if (node.url && isWebUrl(node.url)) {
      entries.push({label: t.menu.openIncognito, action: open('incognito')});
    }
    return entries;
  }

  function historyEntries(): MenuEntry[] {
    // Navigation API знает, есть ли куда идти по истории папок этой вкладки
    const canGoBack = window.navigation?.canGoBack ?? true;
    const canGoForward = window.navigation?.canGoForward ?? true;
    return [
      {label: t.menu.back, icon: 'back', disabled: !canGoBack, action: () => history.back()},
      {label: t.menu.forward, icon: 'forward', disabled: !canGoForward, action: () => history.forward()},
    ];
  }

  function createEntries(anchor: BookmarkNode | null): MenuEntry[] {
    // Правый клик по папке — новое создаётся внутри неё, в конце
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
    // Правый клик по закладке — новый элемент встаёт сразу после неё (если порядок не переопределён сортировкой)
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
      // Системные папки в корне переставлять нельзя
      disabled: folder.id === ROOT_FOLDER_ID,
      action: () => (ui.dialog = {kind: 'sort', folder}),
    };
  }

  const currentFolder = () => ({id: bookmarks.folderId, title: bookmarks.path.at(-1)?.title ?? t.common.home});

  const refreshEntry = (): MenuItem => ({label: t.menu.refresh, icon: 'refresh', action: () => location.reload()});

  /** Меню плитки закладки или папки */
  function tileEntries(node: BookmarkNode): MenuEntry[] {
    const entries: MenuEntry[] = [...openEntries(node), 'separator', ...historyEntries(), 'separator'];
    if (node.url) {
      const url = node.url;
      entries.push(
        {
          label: t.menu.copyLink,
          icon: 'copy',
          action: async () => {
            await navigator.clipboard.writeText(url);
            showNotice(t.notice.linkCopied, 'info');
          },
        },
        'separator',
      );
    }
    entries.push(...createEntries(node), 'separator');
    entries.push({label: t.menu.edit, icon: 'pencil', action: () => (ui.dialog = {kind: 'edit', node})});
    if (node.url) {
      const bookmark = node as BookmarkNode & {url: string};
      entries.push({label: t.menu.icon, icon: 'image', action: () => (ui.dialog = {kind: 'icon', node: bookmark})});
    }
    // На папке «Сортировать» упорядочивает её саму, на закладке — открытую папку
    entries.push(
      sortEntry(node.url ? currentFolder() : {id: node.id, title: node.title}),
      'separator',
      {label: settings.current.confirmDelete ? t.menu.deleteConfirm : t.menu.delete, icon: 'trash', action: () => requestDelete(node)},
      'separator',
      refreshEntry(),
    );
    return entries;
  }

  /** Меню пустого места страницы */
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
    // Если кнопка настроек скрыта, настройки открываются отсюда
    if (!settings.current.showSettingsButton) {
      entries.push({label: t.common.settings, icon: 'settings', action: openSettings});
    }
    return entries;
  }

  // Элемент, на который вернётся фокус, если меню закрыть клавишей Esc
  let returnFocus: HTMLElement | null = null;

  function onContextMenu(event: MouseEvent) {
    menu = null;
    const target = event.target as Element;
    if (target.closest(NATIVE_MENU_SELECTOR)) return;
    event.preventDefault();

    let {clientX: x, clientY: y} = event;
    // Меню с клавиатуры (Shift+F10, клавиша меню) открывается у плитки в фокусе, а не там, где мышь
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
    const node = [...bookmarks.items, ...search.results].find((item) => item.id === id);
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

  // Стрелки переводят фокус по пунктам меню
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

  // После отрисовки: не даём меню выйти за край окна и ставим фокус на первый пункт
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
    font-size: 14px;
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
