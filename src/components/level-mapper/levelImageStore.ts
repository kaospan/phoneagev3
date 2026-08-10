// Stores uploaded level screenshots in IndexedDB so mapper images persist across reloads.
// This is intentionally mapper-only; gameplay uses the grid JSON, not these screenshots.

type StoredLevelImage = {
  id: number;
  blob: Blob;
  name?: string;
  updatedAt: number;
};

const DB_NAME = 'phoneage_level_mapper_v1';
const STORE_NAME = 'level_images';
const DB_VERSION = 1;

const objectUrlById = new Map<number, string>();

const openDb = async (): Promise<IDBDatabase> => {
  return await new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
};

const withStore = async <T,>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const req = fn(store);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
    req.onsuccess = () => resolve(req.result);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
};

export const revokeLevelImageObjectUrl = (levelId: number) => {
  const existing = objectUrlById.get(levelId);
  if (existing) {
    try {
      URL.revokeObjectURL(existing);
    } catch {
      // ignore
    }
    objectUrlById.delete(levelId);
  }
};

export const hasLevelImage = async (levelId: number): Promise<boolean> => {
  if (typeof indexedDB === 'undefined') return false;
  const res = await withStore<StoredLevelImage | undefined>('readonly', (store) => store.get(levelId));
  return Boolean(res?.blob);
};

export const putLevelImage = async (levelId: number, blob: Blob, name?: string, overwrite = false) => {
  if (typeof indexedDB === 'undefined') return;
  if (!overwrite) {
    const exists = await hasLevelImage(levelId);
    if (exists) throw new Error(`Level ${levelId} already has an uploaded image (refusing to overwrite).`);
  }
  revokeLevelImageObjectUrl(levelId);
  const record: StoredLevelImage = { id: levelId, blob, name, updatedAt: Date.now() };
  await withStore('readwrite', (store) => store.put(record));
};

export const getLevelImageBlob = async (levelId: number): Promise<Blob | null> => {
  if (typeof indexedDB === 'undefined') return null;
  const res = await withStore<StoredLevelImage | undefined>('readonly', (store) => store.get(levelId));
  return res?.blob ?? null;
};

export const getLevelImageUrl = async (levelId: number): Promise<string | null> => {
  const cached = objectUrlById.get(levelId);
  if (cached) return cached;
  const blob = await getLevelImageBlob(levelId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrlById.set(levelId, url);
  return url;
};

