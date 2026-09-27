// What was changed in the settings dialog since it opened: the changed rows and tabs are highlighted, so the user
// can go over their changes — there are many settings, and it's easy to lose track
import type {SettingsTab} from '../ui.svelte';
import type {Settings} from './schema';
import {settings} from './store.svelte';

export type SettingKey = keyof Settings;

/** The settings each tab shows; a tab gets a mark when any of them changed */
export const TAB_SETTINGS: Record<SettingsTab, SettingKey[]> = {
  view: [
    'language', 'theme', 'contrast', 'themePreset', 'lightDimming', 'customAccent', 'customTint', 'fontFamily',
    'fontSize', 'titleSize', 'boldTitles', 'columns', 'containerWidth', 'verticalCenter', 'tileColor', 'folderColor',
    'titlePosition', 'titleAlign', 'showTitles', 'showTitleIcons', 'iconStyle', 'iconScale', 'iconTint', 'siteIcons',
    'logoService', 'externalLogoUrl', 'logoDevToken', 'showToolbar', 'autofocusSearch', 'showSettingsButton',
    'showBackTile', 'showAddTile', 'background', 'backgroundColor', 'backgroundUrl', 'backgroundBlur', 'backgroundDim',
  ],
  general: [
    'defaultFolderId', 'rememberLastFolder', 'folderPreview', 'folderPreviewGrid', 'subfolderStyle', 'showMostVisited',
    'showRecentlyClosed', 'searchEngine', 'customSearchUrl', 'showServices', 'services', 'openInNewTab',
    'newBookmarksFirst', 'confirmDelete', 'dragAndDrop', 'sortOrder', 'typeOrder', 'autoCapture', 'showThumbnailRefresh',
    'captureOnCreate', 'captureDelay', 'refreshIncludesSubfolders', 'browserContextMenu', 'closeTabAfterAdd',
    'syncEnabled',
  ],
  backup: [],
  advanced: ['customCss'],
  about: [],
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

class SettingsChanges {
  #opened = $state.raw<Settings | null>(null);

  /** The settings dialog opened: changes are counted from here */
  start(): void {
    this.#opened = settings.snapshot();
  }

  stop(): void {
    this.#opened = null;
  }

  /** Any of these settings differs from what it was when the dialog opened */
  changed(keys: SettingKey | SettingKey[] | undefined): boolean {
    const opened = this.#opened;
    if (!opened || keys === undefined) return false;
    return [keys].flat().some((key) => !same(opened[key], settings.current[key]));
  }

  get any(): boolean {
    return this.#opened !== null && !same(this.#opened, settings.snapshot());
  }
}

export const settingsChanges = new SettingsChanges();
