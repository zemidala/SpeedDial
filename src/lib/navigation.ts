// Opening links: in this tab, a new one, a background one, a new window, incognito
import {bookmarks} from './bookmarks.svelte';

export type OpenMode = 'current' | 'tab' | 'background' | 'window' | 'incognito';

export async function openUrl(url: string, mode: OpenMode): Promise<void> {
  switch (mode) {
    case 'current': {
      // Exactly the SpeedDial tab: another tab may be active in the window (e.g. if SpeedDial is open in the background)
      const tab = await chrome.tabs.getCurrent();
      await chrome.tabs.update(tab?.id as number, {url});
      break;
    }
    case 'tab':
      await chrome.tabs.create({url, active: true});
      break;
    case 'background':
      await chrome.tabs.create({url, active: false});
      break;
    case 'window':
      await chrome.windows.create({url});
      break;
    case 'incognito':
      await chrome.windows.create({url, incognito: true});
      break;
  }
}

/** URL of the SpeedDial page with a folder open — to open a folder in another tab or window */
export function folderPageUrl(folderId: string): string {
  return chrome.runtime.getURL(`newtab.html#folder=${folderId}`);
}

/**
 * Handlers for buttons that open a folder. Buttons, not links: otherwise the browser would show
 * chrome-extension://… at the bottom on hover; the link behaviour is reproduced here —
 * a click opens the folder here, Ctrl+click and the middle button — in a new tab
 */
export function folderOpenHandlers(folderId: string) {
  const openInNewTab = () => {
    openUrl(folderPageUrl(folderId), 'background').catch((error) => console.error('Failed to open folder', error));
  };
  return {
    onclick: (event: MouseEvent) => {
      if (event.ctrlKey || event.metaKey) openInNewTab();
      else bookmarks.navigate(folderId);
    },
    onauxclick: (event: MouseEvent) => {
      if (event.button === 1) openInNewTab();
    },
    // Without this the middle button turns on autoscroll
    onmousedown: (event: MouseEvent) => {
      if (event.button === 1) event.preventDefault();
    },
  };
}
