// Клиент WebDAV: Яндекс.Диск (пароль приложения), Nextcloud, ownCloud, Koofr и другие.
// Без DOMParser — его нет в service worker, ответ PROPFIND разбирается регулярными выражениями
import {type CloudClient, type RemoteFile, sortBackups} from './provider';

export interface WebDavConfig {
  /** Адрес сервера WebDAV, например https://webdav.yandex.ru */
  url: string;
  username: string;
  password: string;
}

/** Папка на сервере, где лежат копии */
export const REMOTE_FOLDER = 'SpeedDial';

/** Адрес сервера с косой чертой на конце; бросает ошибку, если адрес не https (или http для localhost) */
export function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Неверный адрес сервера');
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('Адрес сервера должен начинаться с https://');
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

/** Разрешение на доступ к серверу для chrome.permissions */
export function serverOrigin(value: string): string {
  return `${new URL(normalizeServerUrl(value)).origin}/*`;
}

function basicAuth(username: string, password: string): string {
  // btoa принимает только латиницу — кодируем UTF-8
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

// Теги в ответе могут быть с любым префиксом пространства имён: d:, D:, lp1: или без него
const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i');

function decodeXml(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}

/** Файлы из ответа PROPFIND (Depth: 1): только файлы .json, без самой папки и подпапок */
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
      throw new Error('Сервер недоступен: проверьте адрес и подключение к интернету');
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error('Сервер отклонил логин или пароль. Для Яндекс.Диска нужен пароль приложения');
    }
    return response;
  }

  #fileUrl(name: string): string {
    return new URL(encodeURIComponent(name), this.#folderUrl).href;
  }

  /** Создаёт папку SpeedDial, если её ещё нет */
  async ensureFolder(): Promise<void> {
    const response = await this.#request('MKCOL', this.#folderUrl);
    // 201 — создана, 405 — уже существует (так отвечает большинство серверов)
    if (!response.ok && response.status !== 405) {
      throw new Error(`Не удалось создать папку ${REMOTE_FOLDER} на сервере (${response.status})`);
    }
  }

  /** Копии на сервере, новые первыми */
  async list(): Promise<RemoteFile[]> {
    const response = await this.#request('PROPFIND', this.#folderUrl, {
      headers: {Depth: '1', 'Content-Type': 'application/xml; charset=utf-8'},
      body: '<?xml version="1.0" encoding="utf-8"?>'
        + '<d:propfind xmlns:d="DAV:"><d:prop><d:getlastmodified/><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>',
    });
    if (response.status === 404) return [];
    if (!response.ok) throw new Error(`Не удалось получить список копий (${response.status})`);
    return sortBackups(parsePropfind(await response.text()));
  }

  async read(name: string): Promise<string> {
    const response = await this.#request('GET', this.#fileUrl(name));
    if (!response.ok) throw new Error(`Не удалось скачать копию (${response.status})`);
    return response.text();
  }

  async write(name: string, content: string): Promise<void> {
    const response = await this.#request('PUT', this.#fileUrl(name), {
      headers: {'Content-Type': 'application/json'},
      body: content,
    });
    if (!response.ok) throw new Error(`Не удалось сохранить копию на сервере (${response.status})`);
  }

  async remove(name: string): Promise<void> {
    const response = await this.#request('DELETE', this.#fileUrl(name));
    if (!response.ok && response.status !== 404) throw new Error(`Не удалось удалить копию (${response.status})`);
  }
}
