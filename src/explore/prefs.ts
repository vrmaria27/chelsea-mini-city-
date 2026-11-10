// Explorer preferences: a small versioned record under its own key. Only the viewpoint and the
// comfort, quality and label settings are stored; the scene itself is always the curated one.
// The old city-builder's keys (see legacy.ts) are never written.
import type { Viewpoint } from './landmarks';

export const PREFS_KEY = 'chelsea-explorer.prefs';
export const PREFS_VERSION = 1;

export interface KeyValueStore {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface ExplorerPrefs {
  version: typeof PREFS_VERSION;
  /** Last street-level position (validated on load); offered as the place to return to. */
  viewpoint: Viewpoint | null;
  /** Miniature rotation (radians) and scale. */
  miniature: { yaw: number; scale: number };
  labels: boolean;
  lowDetail: boolean;
  reducedMotion: boolean;
  /** VR snap-turn step in degrees. */
  snapTurnDeg: 30 | 45;
  /** VR: raise the street-level view to standing eye height while seated. */
  seated: boolean;
}

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.8;

export function defaultPrefs(reducedMotion = false): ExplorerPrefs {
  return { version: PREFS_VERSION, viewpoint: null, miniature: { yaw: 0, scale: 1 }, labels: true, lowDetail: false, reducedMotion, snapTurnDeg: 30, seated: false };
}

export interface LoadResult {
  prefs: ExplorerPrefs;
  /** What happened, for the console and tests: 'none' (first visit), 'ok', or why it was reset. */
  status: 'none' | 'ok' | 'malformed' | 'unsupported-version' | 'invalid-viewpoint';
}

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Reads the stored preferences. Anything malformed falls back to defaults field by field; a
 * restored viewpoint is kept only if `validViewpoint` accepts it (on a walkable surface, so never
 * inside a building or below the ground).
 */
export function loadPrefs(store: KeyValueStore, validViewpoint: (x: number, z: number) => boolean, reducedMotion = false): LoadResult {
  const d = defaultPrefs(reducedMotion);
  let raw: string | null = null;
  try {
    raw = store.getItem(PREFS_KEY);
  } catch {
    return { prefs: d, status: 'none' };
  }
  if (raw === null) return { prefs: d, status: 'none' };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw);
    if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('not an object');
  } catch {
    return { prefs: d, status: 'malformed' };
  }
  if (o.version !== PREFS_VERSION) return { prefs: d, status: 'unsupported-version' };
  const m = (o.miniature ?? {}) as Record<string, unknown>;
  const prefs: ExplorerPrefs = {
    version: PREFS_VERSION,
    viewpoint: null,
    miniature: {
      yaw: finite(m.yaw) ? m.yaw % (Math.PI * 2) : 0,
      scale: finite(m.scale) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, m.scale)) : 1,
    },
    labels: bool(o.labels, d.labels),
    lowDetail: bool(o.lowDetail, d.lowDetail),
    reducedMotion: bool(o.reducedMotion, d.reducedMotion),
    snapTurnDeg: o.snapTurnDeg === 45 ? 45 : 30,
    seated: bool(o.seated, d.seated),
  };
  let status: LoadResult['status'] = 'ok';
  const v = o.viewpoint as Record<string, unknown> | null | undefined;
  if (v && typeof v === 'object') {
    if (finite(v.x) && finite(v.z) && finite(v.yaw) && validViewpoint(v.x, v.z)) prefs.viewpoint = { x: v.x, z: v.z, yaw: v.yaw };
    else status = 'invalid-viewpoint';
  }
  return { prefs, status };
}

export function savePrefs(store: KeyValueStore, prefs: ExplorerPrefs): boolean {
  try {
    store.setItem(PREFS_KEY, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

export function clearPrefs(store: KeyValueStore): void {
  try {
    store.removeItem(PREFS_KEY);
  } catch { /* ignore */ }
}

/** localStorage when available, otherwise an in-memory store (private browsing, blocked storage). */
export function safeLocalStorage(): KeyValueStore {
  try {
    const k = '__chelsea_explorer_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  }
}
