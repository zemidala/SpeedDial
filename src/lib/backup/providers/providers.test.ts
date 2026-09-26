import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {authorize, isFresh, pkcePair, responseParams} from '../oauth';
import {AuthExpiredError} from '../provider';
import {dropbox, headerJson} from './dropbox';
import {googleDrive} from './googleDrive';
import {oneDrive} from './oneDrive';

const REDIRECT = 'https://abcdef.chromiumapp.org/';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** fetch stub: responses by URL prefix; every request is recorded */
function mockFetch(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const body = init.body instanceof Uint8Array ? new TextDecoder().decode(init.body) : String(init.body ?? '');
    const call = {url, method: init.method ?? 'GET', headers: {...init.headers as Record<string, string>}, body};
    calls.push(call);
    const key = Object.keys(routes).find((prefix) => `${call.method} ${url}`.startsWith(prefix));
    if (!key) throw new Error(`Unexpected request: ${call.method} ${url}`);
    return routes[key](call);
  }));
  return calls;
}

const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {...init, headers: {'Content-Type': 'application/json', ...init.headers}});

/** Sign-in window: immediately "returns" to the redirect URL with the needed parameters and the same state */
function mockIdentity(reply: (url: URL) => string, launches: URL[] = []) {
  vi.stubGlobal('chrome', {
    identity: {
      getRedirectURL: () => REDIRECT,
      launchWebAuthFlow: vi.fn(async ({url}: {url: string}) => {
        const parsed = new URL(url);
        launches.push(parsed);
        return reply(parsed);
      }),
    },
  });
  return launches;
}

beforeEach(() => {
  vi.useFakeTimers({toFake: ['Date']});
  vi.setSystemTime(new Date('2026-09-26T10:00:00Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('OAuth', () => {
  it('PKCE: challenge is SHA-256 of the verifier in base64url', async () => {
    const {verifier, challenge} = await pkcePair();
    expect(verifier).toMatch(/^[\w-]{43,128}$/);
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    expect(challenge).toBe(Buffer.from(digest).toString('base64url'));
  });

  it('response parameters from the query string and the fragment', () => {
    const params = responseParams(`${REDIRECT}?code=1&state=s#access_token=t&expires_in=60`);
    expect(Object.fromEntries(params)).toEqual({code: '1', state: 's', access_token: 't', expires_in: '60'});
  });

  it('rejects a foreign state and the user declining', async () => {
    mockIdentity(() => `${REDIRECT}?code=1&state=подмена`);
    await expect(authorize(new URL('https://auth.example/'), true)).rejects.toThrow('не прошёл проверку');

    mockIdentity((url) => `${REDIRECT}?error=access_denied&state=${url.searchParams.get('state')}`);
    await expect(authorize(new URL('https://auth.example/'), true)).rejects.toThrow('доступ не разрешён');

    vi.stubGlobal('chrome', {identity: {launchWebAuthFlow: async () => Promise.reject(new Error('closed'))}});
    await expect(authorize(new URL('https://auth.example/'), true)).rejects.toThrow('Вход отменён');
  });

  it('a token is fresh while more than a minute is left', () => {
    expect(isFresh({accessToken: 't', expiresAt: Date.now() + 120_000})).toBe(true);
    expect(isFresh({accessToken: 't', expiresAt: Date.now() + 30_000})).toBe(false);
  });
});

describe('Dropbox', () => {
  const provider = dropbox('dbx-id');
  const withCode = (url: URL) => `${REDIRECT}?code=the-code&state=${url.searchParams.get('state')}`;

  it('PKCE sign-in, refresh token and account email', async () => {
    const [launch] = [mockIdentity(withCode)];
    const calls = mockFetch({
      'POST https://api.dropboxapi.com/oauth2/token': () =>
        json({access_token: 'access', expires_in: 14400, refresh_token: 'refresh'}),
      'POST https://api.dropboxapi.com/2/users/get_current_account': () => json({email: 'me@example.com'}),
    });

    const {tokens, account} = await provider.signIn();
    expect(account).toBe('me@example.com');
    expect(tokens).toEqual({accessToken: 'access', expiresAt: Date.now() + 14_400_000, refreshToken: 'refresh'});

    const auth = launch[0].searchParams;
    expect(auth.get('client_id')).toBe('dbx-id');
    expect(auth.get('redirect_uri')).toBe(REDIRECT);
    expect(auth.get('token_access_type')).toBe('offline');
    expect(auth.get('code_challenge_method')).toBe('S256');
    const form = new URLSearchParams(calls[0].body);
    expect(form.get('code')).toBe('the-code');
    expect(form.get('grant_type')).toBe('authorization_code');
    // The verifier matches the challenge from the sign-in URL
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(form.get('code_verifier')!));
    expect(Buffer.from(digest).toString('base64url')).toBe(auth.get('code_challenge'));
    expect(calls[1].headers.Authorization).toBe('Bearer access');
  });

  it('refreshing keeps the refresh token if no new one is issued', async () => {
    const calls = mockFetch({'POST https://api.dropboxapi.com/oauth2/token': () => json({access_token: 'new', expires_in: 100})});
    const tokens = await provider.refresh({accessToken: 'old', expiresAt: 0, refreshToken: 'refresh'}, '');
    expect(tokens).toEqual({accessToken: 'new', expiresAt: Date.now() + 100_000, refreshToken: 'refresh'});
    expect(Object.fromEntries(new URLSearchParams(calls[0].body)))
      .toEqual({grant_type: 'refresh_token', refresh_token: 'refresh', client_id: 'dbx-id'});
  });

  it('files: list, upload, download, delete', async () => {
    const calls = mockFetch({
      'POST https://api.dropboxapi.com/2/files/list_folder': () => json({entries: [
        {'.tag': 'file', name: 'speeddial-2026-09-01_10-00-00.json', server_modified: '2026-09-01T10:00:00Z', size: 10},
        {'.tag': 'folder', name: 'old'},
        {'.tag': 'file', name: 'speeddial-2026-09-26_10-00-00.json', size: 20},
      ]}),
      'POST https://content.dropboxapi.com/2/files/upload': () => json({}),
      'POST https://content.dropboxapi.com/2/files/download': () => new Response('{"a":1}'),
      'POST https://api.dropboxapi.com/2/files/delete_v2': () => json({}),
    });
    const client = provider.client('token');

    expect((await client.list()).map((file) => file.name))
      .toEqual(['speeddial-2026-09-26_10-00-00.json', 'speeddial-2026-09-01_10-00-00.json']);
    await client.write('копия.json', '{"a":1}');
    expect(calls[1].headers['Dropbox-API-Arg']).toBe('{"path":"/\\u043a\\u043e\\u043f\\u0438\\u044f.json","mode":"overwrite","mute":true}');
    expect(calls[1].body).toBe('{"a":1}');
    expect(await client.read('a.json')).toBe('{"a":1}');
    await client.remove('a.json');
    expect(JSON.parse(calls[3].body)).toEqual({path: '/a.json'});
  });

  it('no folder yet — no backups; expired token — a clear error', async () => {
    mockFetch({'POST https://api.dropboxapi.com/2/files/list_folder': () => json({error: 'not_found'}, {status: 409})});
    expect(await provider.client('token').list()).toEqual([]);

    mockFetch({'POST https://api.dropboxapi.com/2/files/list_folder': () => new Response('', {status: 401})});
    await expect(provider.client('token').list()).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it('headerJson escapes everything except ASCII', () => {
    expect(headerJson({path: '/ё'})).toBe('{"path":"/\\u0451"}');
  });
});

describe('Google Drive', () => {
  const provider = googleDrive('google-id');

  it('sign-in without a secret (token in the fragment) and refresh via silent sign-in', async () => {
    const launches = mockIdentity((url) => `${REDIRECT}#access_token=g-token&expires_in=3599&state=${url.searchParams.get('state')}`);
    mockFetch({'GET https://www.googleapis.com/drive/v3/about': () => json({user: {emailAddress: 'me@gmail.com'}})});

    const {tokens, account} = await provider.signIn();
    expect(account).toBe('me@gmail.com');
    expect(tokens.accessToken).toBe('g-token');
    expect(launches[0].searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.appdata');
    expect(launches[0].searchParams.get('response_type')).toBe('token');

    await provider.refresh(tokens, 'me@gmail.com');
    expect(launches[1].searchParams.get('prompt')).toBe('none');
    expect(launches[1].searchParams.get('login_hint')).toBe('me@gmail.com');
  });

  it('files in the app folder; two-step upload', async () => {
    const files = {files: [
      {id: '1', name: 'speeddial-2026-09-01_10-00-00.json', modifiedTime: '2026-09-01T10:00:00Z', size: '10'},
      {id: '2', name: 'speeddial-2026-09-26_10-00-00.json', size: '20'},
    ]};
    const calls = mockFetch({
      'GET https://www.googleapis.com/drive/v3/files?': () => json(files),
      'GET https://www.googleapis.com/drive/v3/files/2?alt=media': () => new Response('{"b":2}'),
      'POST https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable': () =>
        new Response(null, {headers: {Location: 'https://www.googleapis.com/upload/session/42'}}),
      'PUT https://www.googleapis.com/upload/session/42': () => json({id: '3'}),
      'DELETE https://www.googleapis.com/drive/v3/files/1': () => new Response(null, {status: 204}),
    });
    const client = provider.client('token');

    expect((await client.list()).map((file) => [file.name, file.size]))
      .toEqual([['speeddial-2026-09-26_10-00-00.json', 20], ['speeddial-2026-09-01_10-00-00.json', 10]]);
    expect(calls[0].url).toContain('spaces=appDataFolder');
    expect(await client.read('speeddial-2026-09-26_10-00-00.json')).toBe('{"b":2}');

    await client.write('speeddial-new.json', '{"c":3}');
    const [start, upload] = calls.slice(-2);
    expect(JSON.parse(start.body)).toEqual({name: 'speeddial-new.json', parents: ['appDataFolder']});
    expect(upload.body).toBe('{"c":3}');

    await client.remove('speeddial-2026-09-01_10-00-00.json');
    expect(calls.at(-1)!.method).toBe('DELETE');
  });
});

describe('OneDrive', () => {
  const provider = oneDrive('ms-id');

  it('PKCE sign-in, email from the profile', async () => {
    const launches = mockIdentity((url) => `${REDIRECT}?code=ms-code&state=${url.searchParams.get('state')}`);
    const calls = mockFetch({
      'POST https://login.microsoftonline.com/common/oauth2/v2.0/token': () =>
        json({access_token: 'ms-access', expires_in: 3600, refresh_token: 'ms-refresh'}),
      'GET https://graph.microsoft.com/v1.0/me': () => json({userPrincipalName: 'me@outlook.com'}),
    });
    const {tokens, account} = await provider.signIn();
    expect(account).toBe('me@outlook.com');
    expect(tokens.refreshToken).toBe('ms-refresh');
    expect(launches[0].searchParams.get('scope')).toContain('Files.ReadWrite.AppFolder');
    expect(new URLSearchParams(calls[0].body).get('code')).toBe('ms-code');
  });

  it('expired refresh token — silent sign-in', async () => {
    const launches = mockIdentity((url) => `${REDIRECT}?code=again&state=${url.searchParams.get('state')}`);
    mockFetch({
      'POST https://login.microsoftonline.com/common/oauth2/v2.0/token': (call) =>
        (new URLSearchParams(call.body).get('grant_type') === 'refresh_token'
          ? json({error: 'invalid_grant'}, {status: 400})
          : json({access_token: 'fresh', expires_in: 3600})),
    });
    const tokens = await provider.refresh({accessToken: 'old', expiresAt: 0, refreshToken: 'expired'}, 'me@outlook.com');
    expect(tokens.accessToken).toBe('fresh');
    expect(launches[0].searchParams.get('prompt')).toBe('none');
    expect(launches[0].searchParams.get('login_hint')).toBe('me@outlook.com');
  });

  it('downloads via a ready link — without the token', async () => {
    const calls = mockFetch({
      'GET https://graph.microsoft.com/v1.0/me/drive/special/approot:/a.json:': () =>
        json({'@microsoft.graph.downloadUrl': 'https://files.example/download/a'}),
      'GET https://files.example/download/a': () => new Response('{"d":4}'),
      'PUT https://graph.microsoft.com/v1.0/me/drive/special/approot:/b.json:/content': () => json({}),
    });
    const client = provider.client('token');
    expect(await client.read('a.json')).toBe('{"d":4}');
    expect(calls[1].headers.Authorization).toBeUndefined();
    await client.write('b.json', '{}');
    expect(calls[2].headers.Authorization).toBe('Bearer token');
  });
});
