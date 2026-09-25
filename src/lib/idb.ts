// Минимальная обёртка над IndexedDB: одно хранилище ключ → значение

const DB_NAME = 'speeddial';
const STORE = 'icons';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T);
    request.onerror = () => reject(request.error);
  });
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run('readonly', (store) => store.get(key));
}

export function idbSet(key: string, value: unknown): Promise<void> {
  return run('readwrite', (store) => store.put(value, key));
}

export function idbDelete(key: string): Promise<void> {
  return run('readwrite', (store) => store.delete(key));
}

export function idbClear(): Promise<void> {
  return run('readwrite', (store) => store.clear());
}
