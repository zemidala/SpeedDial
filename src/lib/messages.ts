// Messages between the new tab page and the service worker

export interface CaptureItem {
  id: string;
  url: string;
}

export type RuntimeMessage =
  /** Page → service worker: take page screenshots for thumbnails */
  | {type: 'capture-thumbnails'; items: CaptureItem[]}
  /** Page → service worker: stop creating thumbnails, including the queue */
  | {type: 'cancel-capture'}
  /** Page → service worker: is a capture running (reply — CaptureProgress or null) */
  | {type: 'capture-status'}
  /** To everyone: thumbnails changed; empty ids — all changed */
  | {type: 'thumbnails-changed'; ids: string[]}
  /** Service worker → pages: thumbnail creation progress */
  | {type: 'capture-progress'; done: number; total: number};

export interface CaptureProgress {
  done: number;
  total: number;
}

/** Capture progress in the service worker — a page opened mid-capture learns about it right away */
export async function requestCaptureStatus(): Promise<CaptureProgress | null> {
  const status: unknown = await chrome.runtime.sendMessage({type: 'capture-status'} satisfies RuntimeMessage)
    .catch(() => null);
  return status && typeof status === 'object' && 'done' in status ? status as CaptureProgress : null;
}

export function sendMessage(message: RuntimeMessage): Promise<void> {
  // With no listeners (e.g. only one tab is open) the browser returns an error — that's fine
  return chrome.runtime.sendMessage(message).catch(() => undefined);
}

export function onMessage(callback: (message: RuntimeMessage) => void): void {
  chrome.runtime.onMessage.addListener((message: RuntimeMessage) => {
    callback(message);
  });
}
