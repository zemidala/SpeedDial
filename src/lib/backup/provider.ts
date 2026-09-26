// Shared by cloud backup storages: the client interface and requests to service APIs
import {t} from '../i18n/index.svelte';

export interface RemoteFile {
  name: string;
  /** Modification time, ms; 0 — the service didn't report it */
  modified: number;
  size: number;
}

/** Backup storage: one folder with files */
export interface CloudClient {
  /** Creates the backup folder if the service needs it */
  ensureFolder(): Promise<void>;
  /** SpeedDial backups (speeddial-*.json files), newest first */
  list(): Promise<RemoteFile[]>;
  read(name: string): Promise<string>;
  write(name: string, content: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Backup files, newest first: the time is in the name, so sorting by name is enough */
export function sortBackups(files: RemoteFile[]): RemoteFile[] {
  return files.filter((file) => file.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name));
}

/** Sign-in expired or was revoked — the user must reconnect */
export class AuthExpiredError extends Error {
  constructor(message = t.cloudErrors.authExpired) {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/** Request to a service API with a token; clear errors instead of HTTP codes */
export async function apiFetch(
  url: string,
  token: string | null,
  init: RequestInit = {},
  allowedStatuses: number[] = [],
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      headers: {...(token ? {Authorization: `Bearer ${token}`} : {}), ...init.headers},
    });
  } catch {
    throw new Error(t.cloudErrors.offline);
  }
  if (response.ok || allowedStatuses.includes(response.status)) return response;
  if (response.status === 401) throw new AuthExpiredError();
  const details = await response.text().catch(() => '');
  console.error('Cloud API error', response.status, url, details);
  throw new Error(t.cloudErrors.httpError(response.status));
}
