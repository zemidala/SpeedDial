// Messages between the new tab page and the service worker
import type {LinkCheck} from './linkCheck';

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
  | {type: 'capture-progress'; done: number; total: number}
  /** Page → service worker: load a site's page or manifest (reply — PageResponse), see requestSitePage */
  | {type: 'fetch-page'; url: string}
  /** Page → service worker: does the link work (reply — LinkCheck) */
  | {type: 'check-link'; url: string; timeout?: number};

/** A site's answer as the service worker read it; text — only for HTML and JSON */
export type PageResponse =
  | {ok: boolean; status: number; url: string; contentType: string; text: string}
  | {error: string};

/**
 * Sites are requested by the service worker, not the page: a page follows a site's "Link: rel=preload" headers
 * and downloads its styles and scripts for nothing (with a console warning); the service worker ignores them
 */
export async function requestSitePage(url: string): Promise<PageResponse> {
  const reply: unknown = await chrome.runtime.sendMessage({type: 'fetch-page', url} satisfies RuntimeMessage);
  if (!reply || typeof reply !== 'object') throw new Error('The service worker didn\'t answer');
  return reply as PageResponse;
}

/** The link check, done by the service worker for the same reason as requestSitePage */
export async function requestLinkCheck(url: string, timeout?: number): Promise<LinkCheck> {
  const reply: unknown = await chrome.runtime.sendMessage({type: 'check-link', url, timeout} satisfies RuntimeMessage);
  if (!reply || typeof reply !== 'object' || !('problem' in reply)) throw new Error('The service worker didn\'t answer');
  return reply as LinkCheck;
}

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
