// Вход в облачные сервисы по OAuth 2.0 через chrome.identity.launchWebAuthFlow — работает в Chrome и Edge.
// Секретов у расширения нет: Dropbox и OneDrive — код с PKCE, Google — токен сразу (implicit flow)
import {t} from '../i18n/index.svelte';


export interface OAuthTokens {
  accessToken: string;
  /** Когда токен перестанет действовать, мс */
  expiresAt: number;
  /** Для продления без окна входа; есть не у всех сервисов */
  refreshToken?: string;
}

/** Адрес, на который сервис возвращает после входа; его нужно указать при регистрации приложения */
export function redirectUrl(): string {
  return chrome.identity.getRedirectURL();
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

export function randomString(bytes = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Пара PKCE: verifier остаётся у нас, challenge уходит в адрес входа */
export async function pkcePair(): Promise<{verifier: string; challenge: string}> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return {verifier, challenge: base64Url(new Uint8Array(digest))};
}

/** Параметры ответа: из строки запроса и из фрагмента после # */
export function responseParams(url: string): URLSearchParams {
  const parsed = new URL(url);
  const params = new URLSearchParams(parsed.search);
  new URLSearchParams(parsed.hash.slice(1)).forEach((value, key) => params.set(key, value));
  return params;
}

/**
 * Открывает окно входа сервиса (или пробует войти молча, interactive = false) и возвращает параметры ответа.
 * Проверяет state — защиту от подмены ответа
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

/** Обмен кода или refresh-токена на токен доступа */
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
    // Сервис может не выдать новый refresh-токен при продлении — тогда остаётся прежний
    refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : previous?.refreshToken,
  };
}

/** Токен ещё поработает хотя бы минуту */
export function isFresh(tokens: OAuthTokens, now = Date.now()): boolean {
  return tokens.expiresAt - 60_000 > now;
}
