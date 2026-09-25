// Минимальная обёртка над IndexedDB. Работает и на странице, и в service worker (общий origin).

const DB_NAME = 'speeddial';
const DB_VERSION = 2;

export type StoreName =
  | 'icons' // Иконки с сайтов: origin → {blob, size, fetchedAt}
  | 'thumbnails' // Миниатюры закладок: id закладки → {blob, source, updatedAt}
  | 'files'; // Прочие файлы, например фоновое изображение

const STORES: StoreName[] = ['icons', 'thumbnails', 'files'];

let dbPromise: Promise<IDBDatabase> | null = null;
let onOutdated: (() => void) | null = null;

/**
 * Что делать, когда обновлённое расширение меняет структуру базы. Открытое соединение со старой
 * версией не даёт её обновить — новая вкладка ждала бы бесконечно. Соединение закрывается всегда;
 * страница ещё и перезагружается, потому что её код рассчитан на старую структуру
 */
export function onDatabaseOutdated(callback: () => void): void {
  onOutdated = callback;
}

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        onOutdated?.();
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('IndexedDB upgrade is waiting for other tabs to close the database');
  });
  return dbPromise;
}

async function run<T>(
  storeName: StoreName,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(storeName, mode).objectStore(storeName));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export function idbGet<T>(storeName: StoreName, key: string): Promise<T | undefined> {
  return run(storeName, 'readonly', (store) => store.get(key));
}

export function idbSet(storeName: StoreName, key: string, value: unknown): Promise<void> {
  return run(storeName, 'readwrite', (store) => store.put(value, key));
}

export function idbDelete(storeName: StoreName, key: string): Promise<void> {
  return run(storeName, 'readwrite', (store) => store.delete(key));
}

export function idbClear(storeName: StoreName): Promise<void> {
  return run(storeName, 'readwrite', (store) => store.clear());
}

export function idbKeys(storeName: StoreName): Promise<string[]> {
  return run(storeName, 'readonly', (store) => store.getAllKeys());
}
