// WebDAV client: Yandex Disk (app password), Nextcloud, ownCloud, Koofr and others.
// No DOMParser — the service worker doesn't have it, so PROPFIND responses are parsed with regular expressions
import {t} from '../i18n/index.svelte';
import {type CloudClient, type RemoteFile, sortBackups} from './provider';

export interface WebDavConfig {
  /** WebDAV server URL, e.g. https://webdav.yandex.ru */
  url: string;
  username: string;
  password: string;
}

/** Folder on the server that holds the backups */
export const REMOTE_FOLDER = 'SpeedDial';

/** Server URL with a trailing slash; throws if it isn't https (or http for localhost) */
export function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(t.cloudErrors.invalidServer);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error(t.cloudErrors.httpsRequired);
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** Permission to access the server for chrome.permissions */
export function serverOrigin(value: string): string {
  return `${new URL(normalizeServerUrl(value)).origin}/*`;
}

function basicAuth(username: string, password: string): string {
  // btoa accepts only Latin-1 — encode as UTF-8
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

// Response tags may have any namespace prefix: d:, D:, lp1: or none
const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i');

function decodeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Files from a PROPFIND (Depth: 1) response: only .json files, without the folder itself and subfolders */
export function parsePropfind(xml: string): RemoteFile[] {
  const responses = xml.split(/<(?:[\w-]+:)?response\b[^>]*>/i).slice(1);
  const files: RemoteFile[] = [];
  for (const response of responses) {
    const href = tag('href').exec(response)?.[1];
    if (!href) continue;
    if (/<(?:[\w-]+:)?collection\b/i.test(response)) continue;
    const path = decodeURIComponent(decodeXml(href.trim())).replace(/\/$/, '');
    const name = path.slice(path.lastIndexOf('/') + 1);
    if (!name.endsWith('.json')) continue;
    const modified = Date.parse(tag('getlastmodified').exec(response)?.[1] ?? '');
    const size = Number(tag('getcontentlength').exec(response)?.[1] ?? 0);
    files.push({name, modified: Number.isNaN(modified) ? 0 : modified, size: Number.isNaN(size) ? 0 : size});
  }
  return files;
}

export class WebDavClient implements CloudClient {
  readonly #folderUrl: string;
  readonly #auth: string;

  constructor(config: WebDavConfig) {
    this.#folderUrl = new URL(`${REMOTE_FOLDER}/`, normalizeServerUrl(config.url)).href;
    this.#auth = basicAuth(config.username, config.password);
  }

  async #request(method: string, url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        method,
        cache: 'no-store',
        credentials: 'omit',
        headers: {Authorization: this.#auth, ...init.headers},
      });
    } catch {
      throw new Error(t.cloudErrors.serverOffline);
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(t.cloudErrors.wrongPassword);
    }
    return response;
  }

  #fileUrl(name: string): string {
    return new URL(encodeURIComponent(name), this.#folderUrl).href;
  }

  /** Creates the SpeedDial folder if it doesn't exist yet */
  async ensureFolder(): Promise<void> {
    const response = await this.#request('MKCOL', this.#folderUrl);
    // 201 — created, 405 — already exists (that's how most servers answer)
    if (!response.ok && response.status !== 405) {
      throw new Error(t.cloudErrors.folderFailed(REMOTE_FOLDER, response.status));
    }
  }

  /** Backups on the server, newest first */
  async list(): Promise<RemoteFile[]> {
    const response = await this.#request('PROPFIND', this.#folderUrl, {
      headers: {Depth: '1', 'Content-Type': 'application/xml; charset=utf-8'},
      body: '<?xml version="1.0" encoding="utf-8"?>'
        + '<d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>',
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(t.cloudErrors.listFailed(response.status));
    return sortBackups(parsePropfind(await response.text()));
  }

  async read(name: string): Promise<string> {
    const response = await this.#request('GET', this.#fileUrl(name));
    if (!response.ok) throw new Error(t.cloudErrors.downloadFailed(response.status));
    return response.text();
  }

  async write(name: string, content: string): Promise<void> {
    const response = await this.#request('PUT', this.#fileUrl(name), {
      headers: {'Content-Type': 'application/json'},
      body: content,
    });
    if (!response.ok) throw new Error(t.cloudErrors.uploadFailed(response.status));
  }

  async remove(name: string): Promise<void> {
    const response = await this.#request('DELETE', this.#fileUrl(name));
    if (!response.ok && response.status !== 404) throw new Error(t.cloudErrors.removeFailed(response.status));
  }
}
