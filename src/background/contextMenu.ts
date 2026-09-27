// SpeedDial in the context menu of pages and links: "Add to SpeedDial" (the default folder) and "Add to folder" —
// a submenu with the recently used folders, the bookmarks bar and its folders, and "Other folder…" (a small window)
import {addFromBrowser, loadRecentFolders, menuFolders, RECENT_FOLDERS_KEY} from '../lib/addToFolder';
import {existingFolder, fallbackFolder, findSystemFolder} from '../lib/folders';
import {setLanguage, t} from '../lib/i18n/index.svelte';
import {loadSettings} from '../lib/settings/storage';
import {captureThumbnails} from './capture';

const ADD_ID = 'add-to-speeddial';
const FOLDERS_ID = 'add-to-folder';
const OTHER_ID = 'add-to-other-folder';
// The same folder may be both recent and in the bar: the menu needs distinct ids
const RECENT_PREFIX = 'recent:';
const FOLDER_PREFIX = 'folder:';
const CONTEXTS = ['page', 'link'] as chrome.contextMenus.CreateProperties['contexts'];

const REBUILD_DELAY = 300; // Folder changes come in bursts (an import, a move of many)
let rebuildTimer: ReturnType<typeof setTimeout> | undefined;

/** The menu from scratch: shown or not by the setting, with the current folder names */
export async function syncContextMenu(): Promise<void> {
  const {browserContextMenu, language} = await loadSettings();
  setLanguage(language);
  await chrome.contextMenus.removeAll();
  if (!browserContextMenu) return;

  chrome.contextMenus.create({id: ADD_ID, title: t.menu.addToSpeedDial, contexts: CONTEXTS});
  chrome.contextMenus.create({id: FOLDERS_ID, title: t.menu.addToFolder, contexts: CONTEXTS});

  const [[root], barId, recentIds] = await Promise.all([
    chrome.bookmarks.getTree(),
    findSystemFolder('bookmarks-bar'),
    loadRecentFolders(),
  ]);
  const {recent, bar} = menuFolders(root, barId, recentIds);
  const item = (id: string, title: string) =>
    chrome.contextMenus.create({id, parentId: FOLDERS_ID, title: title || t.addToFolder.untitled, contexts: CONTEXTS});
  const separator = (id: string) =>
    chrome.contextMenus.create({id, parentId: FOLDERS_ID, type: 'separator', contexts: CONTEXTS});

  for (const folder of recent) item(RECENT_PREFIX + folder.id, folder.title);
  if (recent.length > 0 && bar.length > 0) separator('separator-recent');
  for (const folder of bar) item(FOLDER_PREFIX + folder.id, folder.title);
  separator('separator-other');
  item(OTHER_ID, t.menu.otherFolder);
}

function scheduleRebuild(): void {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    syncContextMenu().catch((error) => console.error('Failed to update context menu', error));
  }, REBUILD_DELAY);
}

/** The default folder if it still exists; otherwise the bookmarks bar (whatever its id is here) or another folder */
async function resolveFolder(folderId: string): Promise<string> {
  const folder = await existingFolder(folderId);
  if (folder) return folder.id;
  const fallback = await fallbackFolder();
  if (!fallback) throw new Error('No folder to add bookmarks to');
  return fallback;
}

/** "Other folder…": a small window to choose any folder and adjust the name; it adds the bookmark itself */
async function openFolderPicker(url: string, title: string, tabId: number | undefined, isLink: boolean): Promise<void> {
  const params = new URLSearchParams({url, title, link: isLink ? '1' : '0'});
  if (tabId !== undefined) params.set('tab', String(tabId));
  await chrome.windows.create({
    url: chrome.runtime.getURL(`add.html?${params}`),
    type: 'popup',
    width: 480,
    height: 520,
    focused: true,
  });
}

async function onMenuClick(info: chrome.contextMenus.OnClickData, tab?: chrome.tabs.Tab): Promise<void> {
  const id = String(info.menuItemId);
  const isLink = Boolean(info.linkUrl);
  const url = info.linkUrl ?? info.pageUrl ?? tab?.url;
  if (!url) return;
  // A link's text is its name; a page — its tab title
  const title = (isLink ? info.selectionText : tab?.title) ?? '';
  const capture = (bookmarkId: string, pageUrl: string) => captureThumbnails([{id: bookmarkId, url: pageUrl}]);

  if (id === OTHER_ID) {
    await openFolderPicker(url, title, tab?.id, isLink);
    return;
  }
  let folderId: string;
  let remember = true;
  if (id === ADD_ID) {
    folderId = await resolveFolder((await loadSettings()).defaultFolderId);
    remember = false;
  } else if (id.startsWith(RECENT_PREFIX) || id.startsWith(FOLDER_PREFIX)) {
    const chosen = id.slice(id.indexOf(':') + 1);
    // Removed since the menu was built — the bookmark still lands somewhere sensible
    folderId = (await existingFolder(chosen))?.id ?? await resolveFolder(chosen);
  } else {
    return;
  }
  await addFromBrowser({url, title, folderId, tabId: tab?.id, isLink, remember}, capture);
}

export function setupContextMenu(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    onMenuClick(info, tab).catch((error) => console.error('Failed to add bookmark', error));
  });
  // Folder names and the list change with the bookmarks; the recent folders — after each addition
  const onFolderChange = (node?: chrome.bookmarks.BookmarkTreeNode) => {
    if (!node || !node.url) scheduleRebuild();
  };
  chrome.bookmarks.onCreated.addListener((_id, node) => onFolderChange(node));
  chrome.bookmarks.onRemoved.addListener((_id, {node}) => onFolderChange(node));
  chrome.bookmarks.onChanged.addListener((_id, change) => {
    if (change.url === undefined) scheduleRebuild(); // A title change — maybe a folder's
  });
  chrome.bookmarks.onMoved.addListener(() => scheduleRebuild());
  chrome.bookmarks.onImportEnded?.addListener(() => scheduleRebuild());
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && RECENT_FOLDERS_KEY in changes) scheduleRebuild();
  });
}
