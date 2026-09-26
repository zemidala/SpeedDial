// Google Диск: копии в скрытой папке приложения (appDataFolder) — среди файлов пользователя их не видно,
// а приложение не видит ничего, кроме своих файлов
import {t} from '../../i18n/index.svelte';
import {authorize, type OAuthTokens, redirectUrl} from '../oauth';
import {apiFetch, type CloudClient, type RemoteFile, sortBackups} from '../provider';
import type {OAuthProvider} from './types';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const ABOUT_URL = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

interface DriveFile {
  id: string;
  name: string;
  modifiedTime?: string;
  size?: string;
}

export class GoogleDriveClient implements CloudClient {
  constructor(private readonly token: string) {}

  async ensureFolder(): Promise<void> {
    // Папка приложения есть всегда
  }

  async #files(): Promise<DriveFile[]> {
    const url = `${FILES_URL}?spaces=appDataFolder&pageSize=1000&fields=${encodeURIComponent('files(id,name,modifiedTime,size)')}`;
    const data = await (await apiFetch(url, this.token)).json() as {files?: DriveFile[]};
    return data.files ?? [];
  }

  async #id(name: string): Promise<string | null> {
    return (await this.#files()).find((file) => file.name === name)?.id ?? null;
  }

  async list(): Promise<RemoteFile[]> {
    return sortBackups((await this.#files()).map((file) => ({
      name: file.name,
      modified: file.modifiedTime ? Date.parse(file.modifiedTime) : 0,
      size: Number(file.size ?? 0),
    })));
  }

  async read(name: string): Promise<string> {
    const id = await this.#id(name);
    if (!id) throw new Error(t.cloudErrors.notFound);
    return (await apiFetch(`${FILES_URL}/${id}?alt=media`, this.token)).text();
  }

  /** Загрузка в два шага (resumable): у простой загрузки с описанием файла ограничение 5 МБ */
  async write(name: string, content: string): Promise<void> {
    const start = await apiFetch(`${UPLOAD_URL}?uploadType=resumable`, this.token, {
      method: 'POST',
      headers: {'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'application/json'},
      body: JSON.stringify({name, parents: ['appDataFolder']}),
    });
    const location = start.headers.get('Location');
    if (!location) throw new Error(t.cloudErrors.uploadRejected);
    await apiFetch(location, this.token, {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: content});
  }

  async remove(name: string): Promise<void> {
    const id = await this.#id(name);
    if (id) await apiFetch(`${FILES_URL}/${id}`, this.token, {method: 'DELETE'}, [404]);
  }
}

/** У Google нет продления без секрета приложения, поэтому новый токен берём молчаливым входом (prompt=none) */
async function requestAccess(clientId: string, interactive: boolean, account?: string): Promise<OAuthTokens> {
  const url = new URL(AUTH_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUrl());
  url.searchParams.set('response_type', 'token');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('prompt', interactive ? 'select_account' : 'none');
  if (account) url.searchParams.set('login_hint', account);

  const params = await authorize(url, interactive);
  const accessToken = params.get('access_token');
  if (!accessToken) throw new Error(t.cloudErrors.noAccessGranted('Google'));
  return {accessToken, expiresAt: Date.now() + Number(params.get('expires_in') ?? 3600) * 1000};
}

export function googleDrive(clientId: string): OAuthProvider {
  return {
    id: 'google',
    get label() {
      return t.backup.google;
    },
    clientId,
    origins: ['https://www.googleapis.com/*'],
    async signIn() {
      const tokens = await requestAccess(clientId, true);
      const about = await (await apiFetch(ABOUT_URL, tokens.accessToken)).json() as {user?: {emailAddress?: string}};
      return {tokens, account: about.user?.emailAddress ?? 'Google'};
    },
    refresh: (_tokens, account) => requestAccess(clientId, false, account),
    client: (token) => new GoogleDriveClient(token),
  };
}
