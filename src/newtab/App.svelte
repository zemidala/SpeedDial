<script lang="ts">
  import {MediaQuery} from 'svelte/reactivity';
  import {background} from '../lib/background.svelte';
  import {readableTextColor} from '../lib/color';
  import {dragDrop} from '../lib/dragDrop.svelte';
  import {FONT_SCALES, TITLE_FONT_SIZES, TITLE_JUSTIFY} from '../lib/fonts';
  import {currentLanguage, setLanguage, t} from '../lib/i18n/index.svelte';
  import {showNotice} from '../lib/notice.svelte';
  import {permissions} from '../lib/permissions.svelte';
  import {settings} from '../lib/settings/store.svelte';
  import {PALETTE_CACHE_KEY, PALETTE_STYLE_ID, resolvePreset} from '../lib/themes/current';
  import {paletteCss} from '../lib/themes/palette';
  import {modals, ui} from '../lib/ui.svelte';
  import BingCaption from './components/BingCaption.svelte';
  import ContextMenu from './components/ContextMenu.svelte';
  import VirtualShelves from './components/VirtualShelves.svelte';
  import BookmarkDialog from './components/dialogs/BookmarkDialog.svelte';
  import DuplicatesDialog from './components/dialogs/DuplicatesDialog.svelte';
  import IconDialog from './components/dialogs/IconDialog.svelte';
  import LinkCheckDialog from './components/dialogs/LinkCheckDialog.svelte';
  import MoveDialog from './components/dialogs/MoveDialog.svelte';
  import SortDialog from './components/dialogs/SortDialog.svelte';
  import BookmarkGrid from './components/grid/BookmarkGrid.svelte';
  import AppHeader from './components/header/AppHeader.svelte';
  import SettingsDialog from './components/settings/SettingsDialog.svelte';
  import ConfirmDialog from './components/ui/ConfirmDialog.svelte';
  import Notice from './components/ui/Notice.svelte';

  const CUSTOM_CSS_ID = 'custom-css'; // theme-init.js uses the same id

  const systemHighContrast = new MediaQuery('(prefers-contrast: more)');

  // A custom background colour instead of the theme's; the text on it is picked for contrast
  function setCustomColor(style: CSSStyleDeclaration, name: 'tile' | 'folder', color: string) {
    if (color) {
      style.setProperty(`--${name}-bg`, color);
      style.setProperty(`--${name}-text`, readableTextColor(color));
    } else {
      style.removeProperty(`--${name}-bg`);
      style.removeProperty(`--${name}-text`);
    }
  }

  // Appearance from the settings — via data-theme and CSS variables on the root element
  $effect(() => {
    const {theme, columns, containerWidth, iconScale, tileColor, folderColor, fontFamily} = settings.current;
    const root = document.documentElement;

    if (theme === 'auto') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    // High contrast — chosen explicitly or enabled in the system
    const {contrast} = settings.current;
    const high = contrast === 'high' || (contrast === 'auto' && systemHighContrast.current);
    if (high) root.dataset.contrast = 'high';
    else delete root.dataset.contrast;

    root.style.setProperty('--columns', String(columns));
    root.style.setProperty('--container-width', `${containerWidth}%`);
    root.style.setProperty('--icon-scale', String(iconScale));
    root.style.setProperty('--font-family', fontFamily || 'system-ui');
    // Text size of the whole page — on html: font sizes in the styles are in rem
    root.style.fontSize = `${FONT_SCALES[settings.current.fontSize] * 100}%`;
    root.style.setProperty('--title-font-size', TITLE_FONT_SIZES[settings.current.titleSize]);
    root.style.setProperty('--title-font-weight', settings.current.boldTitles ? '600' : '400');
    root.style.setProperty('--title-justify', TITLE_JUSTIFY[settings.current.titleAlign]);
    setCustomColor(root.style, 'tile', tileColor);
    setCustomColor(root.style, 'folder', folderColor);
  });

  // Interface language, document language and tab title
  $effect(() => {
    setLanguage(settings.current.language);
    document.documentElement.lang = currentLanguage();
    document.title = t.common.newTab;
  });

  // Theme: colours of both modes in one style (light-dark), plus a cache for theme-init.js
  // so the theme applies before the first paint next time the tab opens
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
      // Without the cache the theme simply applies a bit later on the next open
    }
  });

  // The Bing image of the day loads only when it's the chosen background and Bing access is granted
  $effect(() => {
    if (settings.current.background !== 'bing' || !permissions.bing) return;
    background.loadBing().catch((error) => {
      console.error('Failed to load Bing image', error);
      showNotice(t.notice.bingFailed(error instanceof Error ? error.message : String(error)));
    });
  });

  /** The picture for the chosen background type; null — none */
  function backgroundImage(): string | null {
    const {background: type, backgroundUrl} = settings.current;
    if (type === 'image') return background.imageUrl;
    if (type === 'bing') return background.bing?.url ?? null;
    // A quote would end the CSS url("…") early
    if (type === 'url' && backgroundUrl) return backgroundUrl.replaceAll('"', '%22');
    return null;
  }

  // Page background: a colour, a custom image, an image from a link or the Bing image of the day
  $effect(() => {
    const {background: type, backgroundColor, backgroundBlur, backgroundDim} = settings.current;
    const body = document.body;
    const image = backgroundImage();

    body.classList.toggle('page--background-color', type === 'color');
    body.classList.toggle('page--background-image', image !== null);
    body.style.setProperty('--page-background-color', backgroundColor);
    body.style.setProperty('--page-background-blur', `${backgroundBlur}px`);
    body.style.setProperty('--page-background-dim', String(backgroundDim / 100));
    if (image) body.style.setProperty('--page-background-image', `url("${image}")`);
    else body.style.removeProperty('--page-background-image');
  });

  // Custom CSS — a separate style element after all page styles so it overrides them.
  // theme-init.js creates it before the main styles load, so it's moved to the end of head
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

  // Changes from the settings dialog are saved right when it closes
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
  <VirtualShelves/>
</main>

<ContextMenu/>

{#if settings.current.background === 'bing' && background.bing}
  <BingCaption image={background.bing}/>
{/if}

{#if ui.dialog}
  {@const dialog = ui.dialog}
  {#if dialog.kind === 'settings'}
    <SettingsDialog initialTab={dialog.tab} onclose={closeSettings}/>
  {:else if dialog.kind === 'confirm'}
    <ConfirmDialog options={dialog} onclose={closeDialog}/>
  {:else if dialog.kind === 'icon'}
    <IconDialog node={dialog.node} onclose={closeDialog}/>
  {:else if dialog.kind === 'sort'}
    <SortDialog folder={dialog.folder} onclose={closeDialog}/>
  {:else if dialog.kind === 'move'}
    <MoveDialog nodes={dialog.nodes} onclose={closeDialog}/>
  {:else if dialog.kind === 'duplicates'}
    <DuplicatesDialog onclose={closeDialog}/>
  {:else if dialog.kind === 'linkCheck'}
    <LinkCheckDialog scope={dialog.scope} onclose={closeDialog}/>
  {:else}
    <BookmarkDialog {dialog} onclose={closeDialog}/>
  {/if}
{/if}

{#if modals.depth === 0}
  <Notice/>
{/if}

<style>
  /* An app-like layout: exactly the window height. The header stays at the top, the shelves at the bottom,
     and only the tiles scroll in between */
  .app {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    width: min(100%, var(--container-width));
    height: calc(100vh - 40px);
    margin: 0 auto;
  }

  /* The scrolling area. The padding (offset by the negative margin) keeps hover lifts, focus rings
     and selection outlines of the edge tiles from being clipped */
  .app__content {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    margin: -8px;
    padding: 8px;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklab, var(--text) 30%, transparent) transparent;
  }

  /* The grid is centred in the free space below the panel; "safe" keeps a tall grid from being cut at the top */
  .app--centered .app__content {
    justify-content: safe center;
  }
</style>
