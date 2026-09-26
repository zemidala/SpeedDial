// Общее для облачных хранилищ копий: интерфейс клиента и запросы к API сервисов

export interface RemoteFile {
  name: string;
  /** Время изменения, мс; 0 — сервис не сообщил */
  modified: number;
  size: number;
}

/** Хранилище копий: одна папка с файлами */
export interface CloudClient {
  /** Создаёт папку для копий, если сервису это нужно */
  ensureFolder(): Promise<void>;
  /** Копии SpeedDial (файлы speeddial-*.json), новые первыми */
  list(): Promise<RemoteFile[]>;
  read(name: string): Promise<string>;
  write(name: string, content: string): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Файлы копий, новые первыми: время зашито в имя, поэтому достаточно сортировки по имени */
export function sortBackups(files: RemoteFile[]): RemoteFile[] {
  return files.filter((file) => file.name.endsWith('.json')).sort((a, b) => b.name.localeCompare(a.name));
}

/** Вход устарел или отозван — нужно подключиться заново */
export class AuthExpiredError extends Error {
  constructor(message = 'Вход в облако устарел. Отключите облако и подключитесь заново') {
    super(message);
    this.name = 'AuthExpiredError';
  }
}

/** Запрос к API сервиса с токеном; понятные ошибки вместо кодов HTTP */
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
    throw new Error('Облако недоступно: проверьте подключение к интернету');
  }
  if (response.ok || allowedStatuses.includes(response.status)) return response;
  if (response.status === 401) throw new AuthExpiredError();
  const details = await response.text().catch(() => '');
  console.error('Cloud API error', response.status, url, details);
  throw new Error(`Облако вернуло ошибку ${response.status}`);
}
