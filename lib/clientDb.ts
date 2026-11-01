/**
 * BeatDrop — lib/clientDb.ts
 * Browser IndexedDB storage for offline instant-load of artists and game state.
 */
import { Artist, GuessHistoryItem } from '../shared/types';

const DB_NAME = 'beatdrop_browser_db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function getCachedArtists(): Promise<Artist[] | null> {
  return idbGet<Artist[]>('cached_artists');
}

export async function setCachedArtists(artists: Artist[]): Promise<void> {
  return idbSet('cached_artists', artists);
}

export async function getCachedHistory(): Promise<GuessHistoryItem[] | null> {
  return idbGet<GuessHistoryItem[]>('cached_history');
}

export async function setCachedHistory(history: GuessHistoryItem[]): Promise<void> {
  return idbSet('cached_history', history);
}

