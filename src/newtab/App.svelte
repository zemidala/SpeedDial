<script lang="ts">
  import {background} from '../lib/background.svelte';
  import {readableTextColor} from '../lib/color';
  import {dragDrop} from '../lib/dragDrop.svelte';
  import {currentLanguage, setLanguage, t} from '../lib/i18n/index.svelte';
  import {showNotice} from '../lib/notice.svelte';
  import {permissions} from '../lib/permissions.svelte';
  import {settings} from '../lib/settings/store.svelte';
  import {PALETTE_CACHE_KEY, PALETTE_STYLE_ID, resolvePreset} from '../lib/themes/current';
  import {paletteCss} from '../lib/themes/palette';
  import {modals, ui} from '../lib/ui.svelte';
  import BingCaption from './components/BingCaption.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import BookmarkDialog from './components/dialogs/BookmarkDialog.svelte';
  import IconDialog from './components/dialogs/IconDialog.svelte';
  import SortDialog from './components/dialogs/SortDialog.svelte';
  import BookmarkGrid from './components/grid/BookmarkGrid.svelte';
  import AppHeader from './components/header/AppHeader.svelte';
  import SettingsDialog from './components/settings/SettingsDialog.svelte';
  import ConfirmDialog from './components/ui/ConfirmDialog.svelte';
  import Notice from './components/ui/Notice.svelte';

  const CUSTOM_CSS_ID = 'custom-css'; // Тот же id использует theme-init.js

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

  // Оформление из настроек — через data-theme и CSS-переменные на корневом элементе
  $effect(() => {
    const {theme, columns, containerWidth, iconScale, tileColor, folderColor, fontFamily} = settings.current;
    const root = document.documentElement;

    if (theme === 'auto') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    root.style.setProperty('--columns', String(columns));
    root.style.setProperty('--container-width', `${containerWidth}%`);
    root.style.setProperty('--icon-scale', String(iconScale));
    root.style.setProperty('--font-family', fontFamily || 'system-ui');
    setCustomColor(root.style, 'tile', tileColor);
    setCustomColor(root.style, 'folder', folderColor);
  });

  // Язык интерфейса, язык документа и заголовок вкладки
  $effect(() => {
    setLanguage(settings.current.language);
    document.documentElement.lang = currentLanguage();
    document.title = t.common.newTab;
  });

  // Тема оформления: цвета обоих режимов в одном стиле (light-dark), плюс кэш для theme-init.js,
  // чтобы при следующем открытии вкладки тема применилась до первой отрисовки
  $effect(() => {
    const css = paletteCss(resolvePreset(settings.current));
    let style = document.getElementById(PALETTE_STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = PALETTE_STYLE_ID;
      document.head.append(style);
    }
    style.textContent = css;
    try {
      localStorage.setItem(PALETTE_CACHE_KEY, css);
    } catch {
      // Без кэша тема просто применится чуть позже при следующем открытии
    }
  });

  // Картинка дня Bing загружается, только когда выбрана как фон и доступ к Bing выдан
  $effect(() => {
    if (settings.current.background !== 'bing' || !permissions.bing) return;
    background.loadBing().catch((error) => {
      console.error('Failed to load Bing image', error);
      showNotice(t.notice.bingFailed(error instanceof Error ? error.message : String(error)));
    });
  });

  // Фон страницы: цвет, своё изображение или картинка дня Bing
  $effect(() => {
    const {background: type, backgroundColor, backgroundBlur, backgroundDim} = settings.current;
    const body = document.body;
    const image = type === 'image' ? background.imageUrl : type === 'bing' ? background.bing?.url ?? null : null;

    body.classList.toggle('page--background-color', type === 'color');
    body.classList.toggle('page--background-image', image !== null);
    body.style.setProperty('--page-background-color', backgroundColor);
    body.style.setProperty('--page-background-blur', `${backgroundBlur}px`);
    body.style.setProperty('--page-background-dim', String(backgroundDim / 100));
    if (image) body.style.setProperty('--page-background-image', `url("${image}")`);
    else body.style.removeProperty('--page-background-image');
  });

  // Пользовательский CSS — отдельным элементом style после всех стилей страницы, чтобы перекрывать их.
  // theme-init.js создаёт его раньше подключения основных стилей, поэтому переносим в конец head
  $effect(() => {
    let style = document.getElementById(CUSTOM_CSS_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = CUSTOM_CSS_ID;
    }
    document.head.append(style);
    style.textContent = settings.current.customCss;
  });

  const closeDialog = () => {
    ui.dialog = null;
  };

  // Изменения из окна настроек сохраняем сразу при его закрытии
  const closeSettings = () => {
    settings.flush();
    closeDialog();
  };
</script>

<svelte:window
  ondragstart={dragDrop.onDragStart}
  ondragover={dragDrop.onDragOver}
  ondrop={dragDrop.onDrop}
  ondragend={dragDrop.onDragEnd}
/>

<main class="app" class:app--centered={settings.current.verticalCenter}>
  <AppHeader/>
  <div class="app__content">
    <BookmarkGrid/>
  </div>
</main>

<ContextMenu/>

{#if settings.current.background === 'bing' && background.bing}
  <BingCaption image={background.bing}/>
{/if}

{#if ui.dialog}
  {@const dialog = ui.dialog}
  {#if dialog.kind === 'settings'}
    <SettingsDialog onclose={closeSettings}/>
  {:else if dialog.kind === 'confirm'}
    <ConfirmDialog options={dialog} onclose={closeDialog}/>
  {:else if dialog.kind === 'icon'}
    <IconDialog node={dialog.node} onclose={closeDialog}/>
  {:else if dialog.kind === 'sort'}
    <SortDialog folder={dialog.folder} onclose={closeDialog}/>
  {:else}
    <BookmarkDialog {dialog} onclose={closeDialog}/>
  {/if}
{/if}

{#if modals.depth === 0}
  <Notice/>
{/if}

<style>
  .app {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    width: min(100%, var(--container-width));
    min-height: calc(100vh - 40px);
    margin: 0 auto;
  }

  .app__content {
    display: flex;
    flex: 1;
    flex-direction: column;
  }

  /* Сетка по центру свободного места под панелью */
  .app--centered .app__content {
    justify-content: center;
  }
</style>
