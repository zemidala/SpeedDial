// OneDrive: backups live in the app folder (Apps/SpeedDial). Sign-in via Microsoft with PKCE
import {t} from '../../i18n/index.svelte';
import {authorize, type OAuthTokens, pkcePair, redirectUrl, requestToken} from '../oauth';
import {apiFetch, type CloudClient, type RemoteFile, sortBackups} from '../provider';
import type {OAuthProvider} from './types';

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_URL = 'https://graph.microsoft.com/v1.0';
const APP_FOLDER = `${GRAPH_URL}/me/drive/special/approot`;
const SCOPE = 'Files.ReadWrite.AppFolder User.Read offline_access';

interface DriveItem {
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  file?: unknown;
}

export class OneDriveClient implements CloudClient {
  constructor(private readonly token: string) {}

  async ensureFolder(): Promise<void> {
    // The app folder is created on first access
  }

  #item(name: string): string {
    return `${APP_FOLDER}:/${encodeURIComponent(name)}:`;
  }

  async list(): Promise<RemoteFile[]> {
    const url = `${APP_FOLDER}/children?$select=name,size,lastModifiedDateTime,file&$top=1000`;
    const data = await (await apiFetch(url, this.token)).json() as {value?: DriveItem[]};
    return sortBackups((data.value ?? []).filter((item) => item.file).map((item) => ({
      name: item.name,
      modified: item.lastModifiedDateTime ? Date.parse(item.lastModifiedDateTime) : 0,
      size: item.size ?? 0,
    })));
  }

  /**
   * Contents come from a ready download link: /content answers with a redirect
   * to another domain, and the token must not be sent there
   */
  async read(name: string): Promise<string> {
    const item = await (await apiFetch(`${this.#item(name)}?$select=@microsoft.graph.downloadUrl`, this.token)).json() as
      Record<string, string | undefined>;
    const downloadUrl = item['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) throw new Error(t.cloudErrors.notFound);
    return (await apiFetch(downloadUrl, null)).text();
  }

  async write(name: string, content: string): Promise<void> {
    await apiFetch(`${this.#item(name)}/content`, this.token, {
      method: 'PUT',
      headers: {'Content-Type': 'application/json'},
      body: content,
    });
  }

  async remove(name: string): Promise<void> {
    await apiFetch(this.#item(name), this.token, {method: 'DELETE'}, [404]);
  }
}

async function codeFlow(clientId: string, interactive: boolean, account?: string): Promise<OAuthTokens> {
  const {verifier, challenge} = await pkcePair();
  const url = new URL(`${AUTHORITY}/authorize`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUrl());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('response_mode', 'query');
  url.searchParams.set('scope', SCOPE);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', interactive ? 'select_account' : 'none');
  if (account) url.searchParams.set('login_hint', account);
  const code = (await authorize(url, interactive)).get('code');
  if (!code) throw new Error(t.cloudErrors.noAccessGranted('Microsoft'));

  return requestToken(`${AUTHORITY}/token`, {
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUrl(),
    code_verifier: verifier,
    scope: SCOPE,
  });
}

export function oneDrive(clientId: string): OAuthProvider {
  return {
    id: 'onedrive',
    label: 'OneDrive',
    clientId,
    origins: ['https://graph.microsoft.com/*', 'https://login.microsoftonline.com/*'],
    async signIn() {
      const tokens = await codeFlow(clientId, true);
      const me = await (await apiFetch(`${GRAPH_URL}/me?$select=mail,userPrincipalName`, tokens.accessToken)).json() as
        {mail?: string; userPrincipalName?: string};
      return {tokens, account: me.mail ?? me.userPrincipalName ?? 'OneDrive'};
    },
    /** An in-browser app's refresh token lives for a day; once it expires — silent sign-in */
    async refresh(tokens, account) {
      if (tokens.refreshToken) {
        try {
          return await requestToken(`${AUTHORITY}/token`, {
            client_id: clientId,
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken,
            scope: SCOPE,
          }, tokens);
        } catch (error) {
          console.warn('OneDrive refresh failed, trying silent sign-in', error);
        }
      }
      return codeFlow(clientId, false, account);
    },
    client: (token) => new OneDriveClient(token),
  };
}
