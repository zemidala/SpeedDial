import {AUTO_BACKUP_ALARM, runCloudBackup, scheduleAutoBackup} from '../lib/backup/cloud';
import {setLanguage} from '../lib/i18n/index.svelte';
import {onMessage, type RuntimeMessage, sendMessage} from '../lib/messages';
import {loadSettings, onSettingsChanged} from '../lib/settings/storage';
import {deleteThumbnail} from '../lib/thumbnails/storage';
import {cancelCapture, captureStatus, captureThumbnails} from './capture';
import {setupContextMenu, syncContextMenu} from './contextMenu';

// Язык сообщений service worker (ошибки копий, пункт меню) — из настроек
const applyLanguage = () => {
  loadSettings().then(({language}) => setLanguage(language)).catch((error) => console.error('Failed to load language', error));
};
applyLanguage();
onSettingsChanged(applyLanguage);

// Клик по значку расширения открывает новую вкладку, то есть SpeedDial
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({});
});

// Пункт в контекстном меню браузера: создаётся при установке и запуске, обновляется при смене настройки
setupContextMenu();
const refreshContextMenu = () => {
  syncContextMenu().catch((error) => console.error('Failed to update context menu', error));
};
chrome.runtime.onInstalled.addListener(refreshContextMenu);
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

// На запрос хода съёмки отвечаем сразу; остальные сообщения ответа не ждут
chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  if (message.type !== 'capture-status') return false;
  sendResponse(captureStatus());
  return false;
});

// Миниатюры удалённых закладок больше не нужны; у папки удаляются и миниатюры вложенных закладок
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

// Автоматическая копия в облако: через минуту после изменений закладок, настроек или миниатюр
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
