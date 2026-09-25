<script lang="ts">
  import {bookmarks} from '../../lib/bookmarks.svelte';
  import {icons} from '../../lib/icons.svelte';
  import {ui} from '../../lib/ui.svelte';

  interface MenuItem {
    label: string;
    action: () => void;
  }

  // Здесь остаётся стандартное меню браузера (копировать, вставить и т.п.)
  const NATIVE_MENU_SELECTOR = 'input, textarea, select, [contenteditable], dialog, .settings-panel';

  let menu = $state<{x: number; y: number; items: MenuItem[]} | null>(null);
  let element = $state<HTMLElement>();

  function onContextMenu(event: MouseEvent) {
    menu = null;
    const target = event.target as Element;
    if (target.closest(NATIVE_MENU_SELECTOR)) return;
    event.preventDefault();

    const items: MenuItem[] = [];

    // Правый клик по плитке — действия с ней
    const id = target.closest<HTMLElement>('[data-bookmark-id]')?.dataset.bookmarkId;
    const node = bookmarks.items.find((item) => item.id === id);
    if (node) {
      const {url} = node;
      if (url) {
        items.push({label: 'Открыть в новой вкладке', action: () => chrome.tabs.create({url, active: false})});
      }
      items.push({label: 'Изменить', action: () => (ui.dialog = {kind: 'edit', node})});
      if (url) {
        items.push({label: 'Обновить иконку', action: () => icons.refresh(url)});
      }
      items.push({label: 'Удалить', action: () => (ui.dialog = {kind: 'delete', node})});
    }
    items.push({label: 'Добавить закладку', action: () => (ui.dialog = {kind: 'create'})});

    menu = {x: event.clientX, y: event.clientY, items};
  }

  function close() {
    menu = null;
  }

  // После отрисовки: не даём меню выйти за край окна и ставим фокус на первый пункт
  $effect(() => {
    if (!menu || !element) return;
    element.style.left = `${Math.max(0, Math.min(menu.x, window.innerWidth - element.offsetWidth))}px`;
    element.style.top = `${Math.max(0, Math.min(menu.y, window.innerHeight - element.offsetHeight))}px`;
    element.querySelector('button')?.focus();
  });
</script>

<svelte:window
  oncontextmenu={onContextMenu}
  onclick={(event) => menu && !element?.contains(event.target as Node) && close()}
  onkeydown={(event) => event.key === 'Escape' && close()}
  onblur={close}
  onresize={close}
/>

{#if menu}
  <div class="context-menu" role="menu" bind:this={element}>
    {#each menu.items as item (item.label)}
      <button
        type="button"
        role="menuitem"
        onclick={() => {
          close();
          item.action();
        }}
      >{item.label}</button>
    {/each}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    min-width: 200px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-raised);
  }

  button {
    padding: 8px 12px;
    border: none;
    border-radius: 4px;
    background: none;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  button:hover,
  button:focus-visible {
    outline: none;
    background: var(--surface-hover);
  }
</style>
