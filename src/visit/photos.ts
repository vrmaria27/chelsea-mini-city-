// Postcard images: one small JPEG per postcard (at most six, about 30–60 KB each), kept in IndexedDB.
// If IndexedDB is unavailable (private browsing, storage blocked or full), images are kept in memory
// for the session and the caller is told, so the visit carries on.

const DB = 'chelsea-explorer-postcards';
const STORE = 'images';

export class PhotoStore {
  private db: IDBDatabase | null = null;
  private memory = new Map<string, Blob>();
  /** Object URLs for display, revoked when replaced. */
  private urls = new Map<string, string>();
  /** False when images cannot be saved beyond this session. */
  persistent = false;
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.open().catch(() => { this.db = null; this.persistent = false; });
  }

  private open(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('no IndexedDB')); return; }
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE); };
      req.onsuccess = () => { this.db = req.result; this.persistent = true; resolve(); };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  }

  private tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.db) { reject(new Error('no database')); return; }
      const t = this.db.transaction(STORE, mode);
      const r = f(t.objectStore(STORE));
      t.oncomplete = () => resolve(r.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  /** Saves (or replaces) a postcard image. Resolves to whether it was stored persistently. */
  async put(id: string, blob: Blob): Promise<boolean> {
    this.memory.set(id, blob);
    this.setUrl(id, blob);
    await this.ready;
    if (!this.db) return false;
    try {
      await this.tx('readwrite', (s) => s.put(blob, id));
      return true;
    } catch {
      this.persistent = false;
      return false;
    }
  }

  /** Display URL for a postcard image (loads it from the database the first time). */
  async url(id: string): Promise<string | null> {
    const u = this.urls.get(id);
    if (u) return u;
    let blob = this.memory.get(id) ?? null;
    if (!blob) {
      await this.ready;
      if (this.db) {
        try { blob = ((await this.tx('readonly', (s) => s.get(id))) as Blob | undefined) ?? null; } catch { blob = null; }
      }
    }
    if (!blob) return null;
    this.memory.set(id, blob);
    return this.setUrl(id, blob);
  }

  private setUrl(id: string, blob: Blob): string {
    const old = this.urls.get(id);
    if (old) URL.revokeObjectURL(old);
    const u = URL.createObjectURL(blob);
    this.urls.set(id, u);
    return u;
  }
}
