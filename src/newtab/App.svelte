<script lang="ts">
  import {readableTextColor} from '../lib/color';
  import {settings} from '../lib/settings.svelte';
  import {ui} from '../lib/ui.svelte';
  import BookmarkDialog from './components/BookmarkDialog.svelte';
  import BookmarkGrid from './components/BookmarkGrid.svelte';
  import Breadcrumbs from './components/Breadcrumbs.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import DeleteDialog from './components/DeleteDialog.svelte';
  import SettingsPanel from './components/SettingsPanel.svelte';
  import ThemeToggle from './components/ThemeToggle.svelte';

  // Свой цвет фона вместо цвета темы; текст на нём подбирается по контрасту
  function setCustomColor(style: CSSStyleDeclaration, name: 'tile' | 'folder', color: string) {
    if (color) {
      style.setProperty(`--${name}-bg`, color);
      style.setProperty(`--${name}-text`, readableTextColor(color));
    } else {
      style.removeProperty(`--${name}-bg`);
      style.removeProperty(`--${name}-text`);
    }
  }

  // Настройки оформления — через data-theme и CSS-переменные на <html>
  $effect(() => {
    const {theme, columns, tileColor, folderColor, fontFamily} = settings.current;
    const root = document.documentElement;

    if (theme === 'auto') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    root.style.setProperty('--columns', String(columns));
    root.style.setProperty('--font-family', fontFamily || 'system-ui');
    setCustomColor(root.style, 'tile', tileColor);
    setCustomColor(root.style, 'folder', folderColor);
  });

  const closeDialog = () => {
    ui.dialog = null;
  };
</script>

<main class="container">
  <header class="topbar">
    <Breadcrumbs/>
    <ThemeToggle/>
    <SettingsPanel/>
  </header>
  <BookmarkGrid/>
</main>

<ContextMenu/>

{#if ui.dialog}
  {@const dialog = ui.dialog}
  {#if dialog.kind === 'delete'}
    <DeleteDialog node={dialog.node} onclose={closeDialog}/>
  {:else}
    <BookmarkDialog node={dialog.kind === 'edit' ? dialog.node : null} onclose={closeDialog}/>
  {/if}
{/if}

<style>
  .container {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    max-width: 1200px;
    margin: 0 auto;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
  }
</style>
