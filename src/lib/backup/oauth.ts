// Signing in to cloud services with OAuth 2.0 via chrome.identity.launchWebAuthFlow — works in Chrome and Edge.
// The extension has no secrets: Dropbox and OneDrive use a code with PKCE, Google returns the token directly (implicit flow)
import {t} from '../i18n/index.svelte';


export interface OAuthTokens {
  accessToken: string;
  /** When the token expires, ms */
  expiresAt: number;
  /** For refreshing without a sign-in window; not every service issues one */
  refreshToken?: string;
}

/** Where the service returns after sign-in; it must be registered with the app */
export function redirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function randomString(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE pair: the verifier stays with us, the challenge goes into the sign-in URL */
export async function pkcePair(): Promise<{verifier: string; challenge: string}> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {verifier, challenge: base64Url(new Uint8Array(digest))};
}

/** Response parameters: from the query string and from the fragment after # */
export function responseParams(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  return params;
}

/**
 * Opens the service's sign-in window (or tries a silent sign-in, interactive = false) and returns the response parameters.
 * Checks state — protection against a forged response
 */
export async function authorize(url: URL, interactive: boolean): Promise<URLSearchParams> {
  const state = randomString(16);
  url.searchParams.set('state', state);
  let redirect: string | undefined;
  try {
    redirect = await chrome.identity.launchWebAuthFlow({url: url.href, interactive});
  } catch (error) {
    throw new Error(interactive ? t.cloudErrors.signInCancelled : t.cloudErrors.signInAgain, {cause: error});
  }
  if (!redirect) throw new Error(t.cloudErrors.signInCancelled);

  const params = responseParams(redirect);
  const error = params.get('error');
  if (error) {
    if (error === 'access_denied') throw new Error(t.cloudErrors.accessDenied);
    throw new Error(t.cloudErrors.serviceRefused(params.get('error_description') ?? error));
  }
  if (params.get('state') !== state) throw new Error(t.cloudErrors.stateMismatch);
  return params;
}

/** Exchanges a code or a refresh token for an access token */
export async function requestToken(
  endpoint: string,
  form: Record<string, string>,
  previous?: OAuthTokens,
): Promise<OAuthTokens> {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams(form),
    });
  } catch {
    throw new Error(t.cloudErrors.offline);
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || typeof data.access_token !== 'string') {
    const reason = data.error_description ?? data.error ?? response.status;
    throw new Error(t.cloudErrors.signInFailed(String(reason)));
  }
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    // The service may not issue a new refresh token when refreshing — then the old one stays
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : previous?.refreshToken,
  };
}

/** The token is good for at least another minute */
export function isFresh(tokens: OAuthTokens, now = Date.now()): boolean {
  return tokens.expiresAt - 60_000 > now;
}
