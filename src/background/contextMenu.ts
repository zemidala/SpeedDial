// "Add to SpeedDial" item in the context menu of pages and links
import {BOOKMARKS_BAR_ID} from '../lib/constants';
import {setLanguage, t} from '../lib/i18n/index.svelte';
import {SITE_ACCESS} from '../lib/permissionSets';
import {loadSettings} from '../lib/settings/storage';
import {getHostname} from '../lib/url';
import {captureThumbnails} from './capture';

const MENU_ITEM_ID = 'add-to-speeddial';

/** Shows or removes the menu item depending on the setting */
export async function syncContextMenu(): Promise<void> {
  const {browserContextMenu, language} = await loadSettings();
  setLanguage(language);
  await chrome.contextMenus.removeAll();
  if (browserContextMenu) {
    chrome.contextMenus.create({
      id: MENU_ITEM_ID,
      title: t.menu.addToSpeedDial,
      contexts: ['page', 'link'],
    });
  }
}

/** The default folder if it still exists; otherwise the bookmarks bar */
async function resolveFolder(folderId: string): Promise<string> {
  try {
    const [folder] = await chrome.bookmarks.get(folderId);
    return folder && !folder.url && folder.parentId !== undefined ? folder.id : BOOKMARKS_BAR_ID;
  } catch {
    return BOOKMARKS_BAR_ID;
  }
}

async function onMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  if (info.menuItemId !== MENU_ITEM_ID) return;

  const isLink = Boolean(info.linkUrl);
  const url = info.linkUrl ?? info.pageUrl ?? tab?.url;
  if (!url) return;

  const settings = await loadSettings();
  const title = (isLink ? info.selectionText : tab?.title) || getHostname(url) || url;
  const bookmark = await chrome.bookmarks.create({
    parentId: await resolveFolder(settings.defaultFolderId),
    index: settings.newBookmarksFirst ? 0 : undefined,
    title,
    url,
  });

  if (!isLink && settings.closeTabAfterAdd && tab?.id !== undefined) {
    await chrome.tabs.remove(tab.id).catch(() => undefined);
  }
  if (settings.captureOnCreate && await chrome.permissions.contains(SITE_ACCESS)) {
    await captureThumbnails([{id: bookmark.id, url}]);
  }
}

export function setupContextMenu(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    onMenuClick(info, tab).catch((error) => console.error('Failed to add bookmark', error));
  });
}
