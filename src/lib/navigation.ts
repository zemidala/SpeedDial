// Открытие ссылок: в этой вкладке, в новой, в фоновой, в новом окне, в режиме инкогнито

export type OpenMode = 'current' | 'tab' | 'background' | 'window' | 'incognito';

export async function openUrl(url: string, mode: OpenMode): Promise<void> {
  switch (mode) {
    case 'current': {
      // Именно вкладка SpeedDial: активной в окне может быть другая (например, если SpeedDial открыт в фоне)
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

/** Адрес страницы SpeedDial с открытой папкой — чтобы открыть папку в другой вкладке или окне */
export function folderPageUrl(folderId: string): string {
  return chrome.runtime.getURL(`newtab.html#folder=${folderId}`);
}
