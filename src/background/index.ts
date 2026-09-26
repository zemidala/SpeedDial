import {AUTO_BACKUP_ALARM, runCloudBackup, scheduleAutoBackup} from '../lib/backup/cloud';
import {setLanguage} from '../lib/i18n/index.svelte';
import {WELCOME_PAGE} from '../lib/links';
import {onMessage, type RuntimeMessage, sendMessage} from '../lib/messages';
import {loadSettings, onSettingsChanged} from '../lib/settings/storage';
import {deleteThumbnail} from '../lib/thumbnails/storage';
import {cancelCapture, captureStatus, captureThumbnails} from './capture';
import {setupContextMenu, syncContextMenu} from './contextMenu';

// Language of service worker messages (backup errors, the menu item) — from the settings
const applyLanguage = () => {
  loadSettings().then(({language}) => setLanguage(language)).catch((error) => console.error('Failed to load language', error));
};
applyLanguage();
onSettingsChanged(applyLanguage);

// Clicking the extension icon opens a new tab, i.e. SpeedDial
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({});
});

// Item in the browser's context menu: created on install and startup, updated when the setting changes
setupContextMenu();
const refreshContextMenu = () => {
  syncContextMenu().catch((error) => console.error('Failed to update context menu', error));
};
chrome.runtime.onInstalled.addListener(refreshContextMenu);

// "Thanks for installing" page — once, after installing from a store. Unpacked (development) installs skip it:
// it would pop up on every reload of the extension and in every test run; it's reachable from Settings → About
chrome.runtime.onInstalled.addListener(({reason}) => {
  if (reason !== chrome.runtime.OnInstalledReason.INSTALL) return;
  chrome.management.getSelf()
    .then((self) => {
      if (self.installType !== 'development') return chrome.tabs.create({url: WELCOME_PAGE});
    })
    .catch((error) => console.error('Failed to open the welcome page', error));
});
chrome.runtime.onStartup.addListener(refreshContextMenu);
onSettingsChanged(refreshContextMenu);

onMessage((message) => {
  if (message.type === 'capture-thumbnails') {
    captureThumbnails(message.items)
      .then(() => scheduleAutoBackup())
      .catch((error) => console.error('Failed to capture thumbnails', error));
  } else if (message.type === 'cancel-capture') {
    cancelCapture();
  }
});

// The capture-status request is answered right away; other messages don't expect a reply
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type !== 'capture-status') return false;
  sendResponse(captureStatus());
  return false;
});

// Thumbnails of removed bookmarks aren't needed anymore; for a folder, thumbnails of nested bookmarks go too
chrome.bookmarks.onRemoved.addListener((_id, {node}) => {
  const ids: string[] = [];
  const collect = (item: chrome.bookmarks.BookmarkTreeNode) => {
    ids.push(item.id);
    item.children?.forEach(collect);
  };
  collect(node);
  Promise.all(ids.map((id) => deleteThumbnail(id).catch(() => undefined)))
    .then(() => sendMessage({type: 'thumbnails-changed', ids}))
    .catch((error) => console.error('Failed to delete thumbnails', error));
});

// Automatic cloud backup: a minute after changes to bookmarks, settings or thumbnails
const onDataChanged = () => {
  scheduleAutoBackup().catch((error) => console.error('Failed to schedule backup', error));
};
chrome.bookmarks.onCreated.addListener(onDataChanged);
chrome.bookmarks.onRemoved.addListener(onDataChanged);
chrome.bookmarks.onChanged.addListener(onDataChanged);
chrome.bookmarks.onMoved.addListener(onDataChanged);
chrome.bookmarks.onChildrenReordered.addListener(onDataChanged);
onSettingsChanged(onDataChanged);
onMessage((message) => {
  if (message.type === 'thumbnails-changed') onDataChanged();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== AUTO_BACKUP_ALARM) return;
  runCloudBackup({force: false}).catch((error) => console.error('Automatic backup failed', error));
});
