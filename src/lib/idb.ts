// A minimal IndexedDB wrapper. Works both on pages and in the service worker (same origin).

const DB_NAME = 'speeddial';
const DB_VERSION = 2;

export type StoreName =
  | 'icons' // Icons from sites: origin → {blob, size, fetchedAt}
  | 'thumbnails' // Bookmark thumbnails: bookmark id → {blob, source, updatedAt}
  | 'files'; // Other files, e.g. the background image

const STORES: StoreName[] = ['icons', 'thumbnails', 'files'];

let dbPromise: Promise<IDBDatabase> | null = null;
let onOutdated: (() => void) | null = null;

/**
 * What to do when an updated extension changes the database structure. An open connection to the old
 * version blocks the upgrade — a new tab would wait forever. The connection is always closed;
 * the page is also reloaded because its code expects the old structure
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
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    // A write is complete only when the transaction commits: a successful request can still be lost
    // if the page is closed or reloaded before the commit
    transaction.oncomplete = () => resolve(request.result as T);
    transaction.onerror = () => reject(transaction.error ?? request.error);
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'));
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
