// Versioned save format with defensive parsing. Pure: storage access is injected.
import { BUILDINGS, BUILDING_TYPES, type BuildingType } from './rules';
import { createInitialState, type GameState, type Placement } from './simulation';

export const SAVE_VERSION = 1;
export const SAVE_KEY = 'chelsea-mini-city.save';

interface SaveFileV1 {
  version: 1;
  savedAt: string;
  state: GameState;
}

export type LoadResult =
  | { status: 'none'; state: GameState }
  | { status: 'loaded'; state: GameState; notice?: string }
  | { status: 'reset'; state: GameState; notice: string };

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function serialize(state: GameState, now = new Date()): string {
  const file: SaveFileV1 = { version: SAVE_VERSION, savedAt: now.toISOString(), state };
  return JSON.stringify(file);
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isType = (v: unknown): v is BuildingType => typeof v === 'string' && (BUILDING_TYPES as readonly string[]).includes(v);
const finiteNonNeg = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Parses saved JSON. Unknown plots or building types are dropped (with a notice)
 * rather than discarding the whole save; unreadable or unsupported saves start fresh.
 */
export function deserialize(raw: string | null, validPlotIds: ReadonlySet<string>): LoadResult {
  if (raw === null || raw === '') return { status: 'none', state: createInitialState() };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { status: 'reset', state: createInitialState(), notice: 'Saved game was unreadable, so a new game was started.' };
  }
  if (!isObj(data) || typeof data.version !== 'number') {
    return { status: 'reset', state: createInitialState(), notice: 'Saved game was unrecognised, so a new game was started.' };
  }
  if (data.version !== SAVE_VERSION) {
    // Only one version exists so far; future migrations go here.
    return {
      status: 'reset',
      state: createInitialState(),
      notice: `Saved game used an unsupported format (v${data.version}), so a new game was started.`,
    };
  }
  const s = data.state;
  if (!isObj(s) || !finiteNonNeg(s.money) || !isObj(s.buildings)) {
    return { status: 'reset', state: createInitialState(), notice: 'Saved game was damaged, so a new game was started.' };
  }
  let dropped = 0;
  const buildings: Record<string, BuildingType> = {};
  for (const [id, type] of Object.entries(s.buildings)) {
    if (validPlotIds.has(id) && isType(type)) buildings[id] = type;
    else dropped++;
  }
  let lastPlacement: Placement | null = null;
  const lp = s.lastPlacement;
  if (isObj(lp) && typeof lp.plotId === 'string' && isType(lp.type) && buildings[lp.plotId] === lp.type) {
    // Always refund the canonical cost, never a value read from storage.
    lastPlacement = { plotId: lp.plotId, type: lp.type, cost: BUILDINGS[lp.type].cost };
  }
  const state: GameState = {
    money: s.money,
    buildings,
    lastPlacement,
    objectiveReached: s.objectiveReached === true,
    ticks: finiteNonNeg(s.ticks) ? Math.floor(s.ticks) : 0,
  };
  return dropped
    ? { status: 'loaded', state, notice: `${dropped} unrecognised building(s) in the save were skipped.` }
    : { status: 'loaded', state };
}

export function loadGame(store: KeyValueStore | null, validPlotIds: ReadonlySet<string>): LoadResult {
  let raw: string | null = null;
  try {
    raw = store ? store.getItem(SAVE_KEY) : null;
  } catch {
    raw = null;
  }
  return deserialize(raw, validPlotIds);
}

/** Returns false if storage is unavailable or full; the game keeps running either way. */
export function saveGame(store: KeyValueStore | null, state: GameState): boolean {
  if (!store) return false;
  try {
    store.setItem(SAVE_KEY, serialize(state));
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
