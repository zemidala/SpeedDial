import {onMessage, sendMessage} from '../lib/messages';
import {onSettingsChanged} from '../lib/settings/storage';
import {deleteThumbnail} from '../lib/thumbnails/storage';
import {captureThumbnails} from './capture';
import {setupContextMenu, syncContextMenu} from './contextMenu';

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
    captureThumbnails(message.items).catch((error) => console.error('Failed to capture thumbnails', error));
  }
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
