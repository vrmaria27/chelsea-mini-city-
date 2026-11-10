// Versioned save format with migration and defensive parsing. Pure: storage access is injected.
//
// v1 (Milestone 1): { version: 1, state: { money, buildings: {plotId: type}, lastPlacement, objectiveReached, ticks } }
// v2 (Milestone 2): { version: 2, state: { money, buildings: {plotId: {type, level}}, lastAction, chapter, ticks }, prefs }
// v3 (real map):    { version: 3, map: { id, version }, state: {…as v2}, prefs }
// v1 and v2 saves belong to the legacy (approximate) map.
import { BUILDINGS, BUILDING_TYPES, type BuildingType, type Level } from './rules';
import { CHAPTER_COUNT, advanceChapters } from './chapters';
import { Simulation, createInitialState, type Building, type GameState, type LastAction } from './simulation';

export const SAVE_VERSION = 3;
export const SAVE_KEY = 'chelsea-mini-city.save';
export const BACKUP_KEY = 'chelsea-mini-city.save.backup';
export const LEGACY_MAP_ID = 'legacy';

export interface Preferences {
  reducedMotion: boolean;
  lowDetail: boolean;
  /** Highlight free development sites with outlines and beacons. */
  showSites: boolean;
}

export const defaultPreferences = (): Preferences => ({ reducedMotion: false, lowDetail: false, showSites: true });

/** What the loader needs to know about the map the game is running on. */
export interface MapContext {
  id: string;
  version: number;
  sim: Simulation;
  /** Present when this map can accept saves from the legacy map. */
  legacyPlotMap?: Record<string, string>;
  /** Simulation for the legacy map (to validate legacy saves before migrating). */
  legacySim?: Simulation;
  /** Previous version of this map: its plot ids, and their mapping onto this version's plot ids. */
  previousPlotMap?: Record<string, string>;
}

export type LoadResult =
  | { status: 'none'; state: GameState; prefs: Preferences | null }
  | { status: 'loaded'; state: GameState; prefs: Preferences | null; notice?: string; migratedFrom?: number; movedFromMap?: string }
  | { status: 'reset'; state: GameState; prefs: Preferences | null; notice: string; raw: string }
  | {
      status: 'needs-choice';
      /** Fresh state for the new map (used if the player starts over). */
      state: GameState;
      prefs: Preferences | null;
      notice: string;
      raw: string;
      unmapped: string[];
      /** True when the save came from the legacy approximate map (so "continue on it" is meaningful). */
      fromLegacy?: boolean;
    };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(state: GameState, prefs: Preferences = defaultPreferences(), map: { id: string; version: number } = { id: 'chelsea-osm', version: 1 }, now = new Date()): string {
  return JSON.stringify({ version: SAVE_VERSION, savedAt: now.toISOString(), map, state, prefs });
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isType = (v: unknown): v is BuildingType => typeof v === 'string' && (BUILDING_TYPES as readonly string[]).includes(v);
const finiteNonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function parsePrefs(v: unknown): Preferences | null {
  if (!isObj(v)) return null;
  return { reducedMotion: v.reducedMotion === true, lowDetail: v.lowDetail === true, showSites: v.showSites !== false };
}

/**
 * Deterministically moves buildings from old plot ids onto this map's plots. Each building takes its
 * table target if that site is free and fits the type; otherwise the nearest free site that fits.
 * Returns the moved buildings, the old→new id map used, and any building that found no site.
 */
function relocate(old: Record<string, Building>, table: Record<string, string>, sim: Simulation): { buildings: Record<string, Building>; used: Record<string, string>; unplaced: string[] } {
  const buildings: Record<string, Building> = {};
  const used: Record<string, string> = {};
  const unplaced: string[] = [];
  const ids = Object.keys(old).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const free = (id: string) => !buildings[id];
  for (const id of ids) {
    const b = old[id];
    const target = table[id];
    let dest: string | null = target && sim.hasPlot(target) && free(target) && sim.fits(target, b.type) ? target : null;
    if (!dest) {
      const anchor = target && sim.hasPlot(target) ? target : null;
      const options = sim.plots.map((p) => p.id).filter((pid) => free(pid) && sim.fits(pid, b.type));
      options.sort((x, y) => (anchor ? sim.distance(anchor, x) - sim.distance(anchor, y) : 0) || x.localeCompare(y, 'en', { numeric: true }));
      dest = options[0] ?? null;
    }
    if (dest) { buildings[dest] = b; used[id] = dest; } else unplaced.push(id);
  }
  return { buildings, used, unplaced };
}

/** Parses the state block of a v1/v2/v3 save against a given map's plots. */
function parseState(version: number, s: Record<string, unknown>, sim: Simulation): { state: GameState; dropped: number } {
  let dropped = 0;
  const buildings: Record<string, Building> = {};
  for (const [id, v] of Object.entries(s.buildings as Record<string, unknown>)) {
    const type = version === 1 ? v : isObj(v) ? v.type : undefined;
    const lvl = version === 1 ? 1 : isObj(v) ? v.level : undefined;
    if (sim.hasPlot(id) && isType(type)) {
      buildings[id] = { type, level: (lvl === 2 ? 2 : 1) as Level };
      if (version >= 2 && lvl !== 1 && lvl !== 2) dropped++; // repaired level
    } else dropped++;
  }
  // Undo history: always refund the canonical cost, never a value read from storage.
  let lastAction: LastAction | null = null;
  const la = version === 1 ? (isObj(s.lastPlacement) ? { ...s.lastPlacement, kind: 'place' } : null) : s.lastAction;
  if (isObj(la) && typeof la.plotId === 'string' && isType(la.type)) {
    const b = buildings[la.plotId];
    if (la.kind === 'place' && b?.type === la.type && b.level === 1) lastAction = { kind: 'place', plotId: la.plotId, type: la.type, cost: BUILDINGS[la.type].cost };
    else if (la.kind === 'upgrade' && b?.type === la.type && b.level === 2) lastAction = { kind: 'upgrade', plotId: la.plotId, type: la.type, cost: BUILDINGS[la.type].upgradeCost };
  }
  const stored = version === 1 ? (s.objectiveReached === true ? 1 : 0) : finiteNonNeg(s.chapter) ? Math.min(CHAPTER_COUNT, Math.floor(s.chapter)) : 0;
  const state: GameState = { money: s.money as number, buildings, lastAction, chapter: stored, ticks: finiteNonNeg(s.ticks) ? Math.floor(s.ticks) : 0 };
  return { state, dropped };
}

/**
 * Parses saved JSON for the map the game is running on, migrating older formats and moving
 * legacy-map saves onto the new map's plots where a deterministic mapping exists.
 */
export function deserialize(raw: string | null, map: MapContext): LoadResult {
  if (raw === null || raw === '') return { status: 'none', state: createInitialState(), prefs: null };
  const reset = (notice: string): LoadResult => ({ status: 'reset', state: createInitialState(), prefs: null, notice, raw });
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return reset('Saved game was unreadable, so a new game was started (a backup copy was kept).');
  }
  if (!isObj(data) || typeof data.version !== 'number') return reset('Saved game was unrecognised, so a new game was started (a backup copy was kept).');
  const version = data.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    return reset(`Saved game used an unsupported format (v${version}), so a new game was started (a backup copy was kept).`);
  }
  const s = data.state;
  if (!isObj(s) || !finiteNonNeg(s.money) || !isObj(s.buildings)) return reset('Saved game was damaged, so a new game was started (a backup copy was kept).');
  const prefs = version >= 2 ? parsePrefs(data.prefs) : null;
  const sourceMap = version === 3 && isObj(data.map) && typeof data.map.id === 'string' ? data.map.id : LEGACY_MAP_ID;
  const dropNote = (n: number) => (n ? `${n} unrecognised building entr${n === 1 ? 'y' : 'ies'} in the save were skipped or repaired.` : undefined);

  const sourceVersion = version === 3 && isObj(data.map) && typeof data.map.version === 'number' ? data.map.version : 1;

  // Same map, older version (e.g. new development sites): move buildings through the deterministic table.
  if (sourceMap === map.id && sourceVersion < map.version && map.previousPlotMap) {
    const table = map.previousPlotMap;
    const prevIds = new Set(Object.keys(table));
    const prevSim = { hasPlot: (id: string) => prevIds.has(id) } as unknown as Simulation;
    const { state: old, dropped } = parseState(version, s, prevSim);
    const { buildings, used, unplaced } = relocate(old.buildings, table, map.sim);
    if (unplaced.length) {
      return { status: 'needs-choice', state: createInitialState(), prefs, raw, unmapped: unplaced, notice: `${unplaced.length} building(s) could not be placed on the updated development sites.` };
    }
    const la = old.lastAction && used[old.lastAction.plotId] ? { ...old.lastAction, plotId: used[old.lastAction.plotId] } : null;
    const state: GameState = { ...old, buildings, lastAction: la };
    state.chapter = advanceChapters(old.chapter, map.sim.stats(state));
    const n = Object.keys(buildings).length;
    return {
      status: 'loaded', state, prefs, migratedFrom: version, movedFromMap: `${map.id}@${sourceVersion}`,
      notice: `The map now has new development sites. Your ${n} building${n === 1 ? '' : 's'}, money and chapters moved to the nearest new sites. A backup of your old save was kept.` + (dropped ? ' ' + dropNote(dropped) : ''),
    };
  }

  // Same map: parse directly.
  if (sourceMap === map.id) {
    const { state, dropped } = parseState(version, s, map.sim);
    state.chapter = advanceChapters(state.chapter, map.sim.stats(state));
    const formatNote = version < 3 && map.id === LEGACY_MAP_ID ? 'Your city was upgraded to the new save format.' : undefined;
    return { status: 'loaded', state, prefs, notice: [formatNote, dropNote(dropped)].filter(Boolean).join(' ') || undefined, migratedFrom: version < SAVE_VERSION ? version : undefined };
  }

  // Legacy map → this map, via the deterministic plot mapping.
  if (sourceMap === LEGACY_MAP_ID && map.legacyPlotMap && map.legacySim) {
    const { state: old, dropped } = parseState(version, s, map.legacySim);
    const { buildings, used, unplaced: unmapped } = relocate(old.buildings, map.legacyPlotMap, map.sim);
    if (unmapped.length) {
      return {
        status: 'needs-choice',
        state: createInitialState(),
        prefs,
        raw,
        unmapped,
        fromLegacy: true,
        notice: `${unmapped.length || 'Some'} building(s) from your saved city have no matching plot on the new map.`,
      };
    }
    const la = old.lastAction && used[old.lastAction.plotId] ? { ...old.lastAction, plotId: used[old.lastAction.plotId] } : null;
    const state: GameState = { ...old, buildings, lastAction: la };
    // Completed chapters are kept; anything newly met on the new layout is credited too.
    state.chapter = advanceChapters(old.chapter, map.sim.stats(state));
    const n = Object.keys(buildings).length;
    return {
      status: 'loaded',
      state,
      prefs,
      migratedFrom: version,
      movedFromMap: LEGACY_MAP_ID,
      notice:
        `Welcome to the real Chelsea map! Your ${n} building${n === 1 ? '' : 's'}, money and chapter progress moved to matching plots. ` +
        'Happiness may differ slightly because real distances changed. A backup of your old save was kept.' +
        (dropped ? ' ' + dropNote(dropped) : ''),
    };
  }

  // Unknown or newer map we cannot read: never discard it.
  return { status: 'needs-choice', state: createInitialState(), prefs, raw, unmapped: [], notice: `This save belongs to a different map (${sourceMap}).` };
}

export function loadGame(store: KeyValueStore | null, map: MapContext): LoadResult {
  let raw: string | null = null;
  try {
    raw = store ? store.getItem(SAVE_KEY) : null;
  } catch {
    raw = null;
  }
  const result = deserialize(raw, map);
  const keepBackup = result.status === 'reset' || result.status === 'needs-choice' || (result.status === 'loaded' && result.movedFromMap);
  if (keepBackup && store && raw) {
    // Never silently destroy data: keep the original text for recovery.
    try {
      store.setItem(BACKUP_KEY, raw);
    } catch {
      /* ignore */
    }
  }
  return result;
}

/** Returns false if storage is unavailable or full; the game keeps running either way. */
export function saveGame(store: KeyValueStore | null, state: GameState, prefs: Preferences = defaultPreferences(), map?: { id: string; version: number }): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serialize(state, prefs, map));
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
