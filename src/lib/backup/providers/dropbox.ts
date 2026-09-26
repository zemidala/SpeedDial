// Dropbox: an app that can only access its own folder (Apps/SpeedDial). Sign-in with PKCE, refresh via refresh token
import {t} from '../../i18n/index.svelte';
import {authorize, pkcePair, redirectUrl, requestToken} from '../oauth';
import {apiFetch, type CloudClient, type RemoteFile, sortBackups} from '../provider';
import type {OAuthProvider} from './types';

const AUTH_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API_URL = 'https://api.dropboxapi.com/2';
const CONTENT_URL = 'https://content.dropboxapi.com/2';

/** JSON for the Dropbox-API-Arg header: only ASCII is allowed in headers */
export function headerJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u007f-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

interface DropboxEntry {
  '.tag': string;
  name: string;
  server_modified?: string;
  size?: number;
}

export class DropboxClient implements CloudClient {
  constructor(private readonly token: string) {}

  async ensureFolder(): Promise<void> {
    // Dropbox creates the app folder itself on the first write
  }

  #rpc(path: string, body: unknown, allowedStatuses: number[] = []): Promise<Response> {
    return apiFetch(`${API_URL}${path}`, this.token, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    }, allowedStatuses);
  }

  async list(): Promise<RemoteFile[]> {
    const response = await this.#rpc('/files/list_folder', {path: ''}, [409]);
    // 409 — the app folder doesn't exist yet: there were no backups
    if (response.status === 409) return [];
    const data = await response.json() as {entries?: DropboxEntry[]};
    return sortBackups((data.entries ?? []).filter((entry) => entry['.tag'] === 'file').map((entry) => ({
      name: entry.name,
      modified: entry.server_modified ? Date.parse(entry.server_modified) : 0,
      size: entry.size ?? 0,
    })));
  }

  async read(name: string): Promise<string> {
    const response = await apiFetch(`${CONTENT_URL}/files/download`, this.token, {
      method: 'POST',
      headers: {'Dropbox-API-Arg': headerJson({path: `/${name}`})},
    });
    return response.text();
  }

  async write(name: string, content: string): Promise<void> {
    await apiFetch(`${CONTENT_URL}/files/upload`, this.token, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Dropbox-API-Arg': headerJson({path: `/${name}`, mode: 'overwrite', mute: true}),
      },
      body: new TextEncoder().encode(content),
    });
  }

  async remove(name: string): Promise<void> {
    await this.#rpc('/files/delete_v2', {path: `/${name}`}, [409]);
  }
}

export function dropbox(clientId: string): OAuthProvider {
  return {
    id: 'dropbox',
    label: 'Dropbox',
    clientId,
    origins: ['https://api.dropboxapi.com/*', 'https://content.dropboxapi.com/*'],
    async signIn() {
      const {verifier, challenge} = await pkcePair();
      const url = new URL(AUTH_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUrl());
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
      // offline — a refresh token for automatic backups without signing in again
      url.searchParams.set('token_access_type', 'offline');
      const code = (await authorize(url, true)).get('code');
      if (!code) throw new Error(t.cloudErrors.noAccessGranted('Dropbox'));

      const tokens = await requestToken(TOKEN_URL, {
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        redirect_uri: redirectUrl(),
        code_verifier: verifier,
      });
      const account = await (await apiFetch(`${API_URL}/users/get_current_account`, tokens.accessToken, {method: 'POST'}))
        .json() as {email?: string};
      return {tokens, account: account.email ?? 'Dropbox'};
    },
    async refresh(tokens) {
      if (!tokens.refreshToken) throw new Error(t.cloudErrors.signInAgain);
      return requestToken(TOKEN_URL, {grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: clientId}, tokens);
    },
    client: (token) => new DropboxClient(token),
  };
}
