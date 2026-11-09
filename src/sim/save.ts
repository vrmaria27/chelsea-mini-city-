// Versioned save format with migration and defensive parsing. Pure: storage access is injected.
//
// v1 (Milestone 1): { version: 1, savedAt, state: { money, buildings: {plotId: type}, lastPlacement, objectiveReached, ticks } }
// v2 (Milestone 2): { version: 2, savedAt, state: { money, buildings: {plotId: {type, level}}, lastAction, chapter, ticks }, prefs }
import { BUILDINGS, BUILDING_TYPES, type BuildingType, type Level } from './rules';
import { CHAPTER_COUNT, advanceChapters } from './chapters';
import { Simulation, createInitialState, type Building, type GameState, type LastAction } from './simulation';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'chelsea-mini-city.save';
export const BACKUP_KEY = 'chelsea-mini-city.save.backup';

export interface Preferences {
  reducedMotion: boolean;
  lowDetail: boolean;
}

export const defaultPreferences = (): Preferences => ({ reducedMotion: false, lowDetail: false });

export interface SaveData {
  state: GameState;
  prefs: Preferences;
}

export type LoadResult =
  | { status: 'none'; state: GameState; prefs: Preferences | null }
  | { status: 'loaded'; state: GameState; prefs: Preferences | null; notice?: string; migratedFrom?: number }
  | { status: 'reset'; state: GameState; prefs: Preferences | null; notice: string; raw: string };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(state: GameState, prefs: Preferences = defaultPreferences(), now = new Date()): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now.toISOString(), state, prefs });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isType = (v: unknown): v is BuildingType => typeof v === 'string' && (BUILDING_TYPES as readonly string[]).includes(v);
const finiteNonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parsePrefs(v: unknown): Preferences | null {
  if (!isObj(v)) return null;
  return { reducedMotion: v.reducedMotion === true, lowDetail: v.lowDetail === true };
}

/**
 * Parses saved JSON, migrating older versions. Unknown plots or building types are dropped
 * (with a notice) rather than discarding the whole save; unreadable or unsupported saves
 * start fresh, and the caller keeps the raw text as a backup.
 */
export function deserialize(raw: string | null, sim: Simulation): LoadResult {
  if (raw === null || raw === '') return { status: 'none', state: createInitialState(), prefs: null };
  const reset = (notice: string): LoadResult => ({ status: 'reset', state: createInitialState(), prefs: null, notice, raw });
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return reset('Saved game was unreadable, so a new game was started (a backup copy was kept).');
  }
  if (!isObj(data) || typeof data.version !== 'number') return reset('Saved game was unrecognised, so a new game was started (a backup copy was kept).');
  if (data.version !== 1 && data.version !== 2) {
    return reset(`Saved game used an unsupported format (v${data.version}), so a new game was started (a backup copy was kept).`);
  }
  const s = data.state;
  if (!isObj(s) || !finiteNonNeg(s.money) || !isObj(s.buildings)) {
    return reset('Saved game was damaged, so a new game was started (a backup copy was kept).');
  }

  let dropped = 0;
  const buildings: Record<string, Building> = {};
  for (const [id, v] of Object.entries(s.buildings)) {
    // v1: "townhouse"; v2: { type: "townhouse", level: 1 }
    const type = data.version === 1 ? v : isObj(v) ? v.type : undefined;
    const lvl = data.version === 1 ? 1 : isObj(v) ? v.level : undefined;
    if (sim.hasPlot(id) && isType(type)) {
      buildings[id] = { type, level: (lvl === 2 ? 2 : 1) as Level };
      if (data.version === 2 && lvl !== 1 && lvl !== 2) dropped++; // repaired level
    } else dropped++;
  }

  // Undo history: always refund the canonical cost, never a value read from storage.
  let lastAction: LastAction | null = null;
  const la = data.version === 1 ? (isObj(s.lastPlacement) ? { ...s.lastPlacement, kind: 'place' } : null) : s.lastAction;
  if (isObj(la) && typeof la.plotId === 'string' && isType(la.type)) {
    const b = buildings[la.plotId];
    if (la.kind === 'place' && b?.type === la.type && b.level === 1) {
      lastAction = { kind: 'place', plotId: la.plotId, type: la.type, cost: BUILDINGS[la.type].cost };
    } else if (la.kind === 'upgrade' && b?.type === la.type && b.level === 2) {
      lastAction = { kind: 'upgrade', plotId: la.plotId, type: la.type, cost: BUILDINGS[la.type].upgradeCost };
    }
  }

  const base: GameState = {
    money: s.money,
    buildings,
    lastAction,
    chapter: 0,
    ticks: finiteNonNeg(s.ticks) ? Math.floor(s.ticks) : 0,
  };
  // Chapter progress: v1's objective is chapter 1; then derive anything else the state already meets.
  const stored = data.version === 1 ? (s.objectiveReached === true ? 1 : 0) : finiteNonNeg(s.chapter) ? Math.min(CHAPTER_COUNT, Math.floor(s.chapter)) : 0;
  base.chapter = advanceChapters(stored, sim.stats(base));

  const notice = dropped ? `${dropped} unrecognised building entr${dropped === 1 ? 'y' : 'ies'} in the save were skipped or repaired.` : undefined;
  return {
    status: 'loaded',
    state: base,
    prefs: data.version === 2 ? parsePrefs(data.prefs) : null,
    notice: data.version === 1 ? 'Your Milestone 1 city was upgraded to the new save format.' + (notice ? ' ' + notice : '') : notice,
    migratedFrom: data.version === 1 ? 1 : undefined,
  };
}

export function loadGame(store: KeyValueStore | null, sim: Simulation): LoadResult {
  let raw: string | null = null;
  try {
    raw = store ? store.getItem(SAVE_KEY) : null;
  } catch {
    raw = null;
  }
  const result = deserialize(raw, sim);
  if (result.status === 'reset' && store) {
    // Never silently destroy data we could not read: keep it for manual recovery.
    try {
      store.setItem(BACKUP_KEY, result.raw);
    } catch {
      /* ignore */
    }
  }
  return result;
}

/** Returns false if storage is unavailable or full; the game keeps running either way. */
export function saveGame(store: KeyValueStore | null, state: GameState, prefs: Preferences = defaultPreferences()): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serialize(state, prefs));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(store: KeyValueStore | null): void {
  try {
    store?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
