// Сообщения между страницей новой вкладки и service worker

export interface CaptureItem {
  id: string;
  url: string;
}

export type RuntimeMessage =
  /** Страница → service worker: сделать снимки страниц для миниатюр */
  | {type: 'capture-thumbnails'; items: CaptureItem[]}
  /** Страница → service worker: остановить создание миниатюр, включая очередь */
  | {type: 'cancel-capture'}
  /** Всем: миниатюры изменились; пустой ids — изменились все */
  | {type: 'thumbnails-changed'; ids: string[]}
  /** Service worker → страницам: ход создания миниатюр */
  | {type: 'capture-progress'; done: number; total: number};

export function sendMessage(message: RuntimeMessage): Promise<void> {
  // Если слушателей нет (например, открыта одна вкладка), браузер возвращает ошибку — это нормально
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

export function onMessage(callback: (message: RuntimeMessage) => void): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    callback(message);
  });
}
