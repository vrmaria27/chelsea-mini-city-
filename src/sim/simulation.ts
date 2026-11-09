// Pure simulation: state, placement, undo, ticks and derived stats.
import { BUILDINGS, RULES, type BuildingType, type PlotPosition } from './rules';

export interface Placement {
  plotId: string;
  type: BuildingType;
  cost: number;
}

export interface GameState {
  money: number;
  /** Building on each occupied plot, keyed by plot id. Vacant plots are absent. */
  buildings: Record<string, BuildingType>;
  /** Most recent placement that can still be undone (single-level undo). */
  lastPlacement: Placement | null;
  objectiveReached: boolean;
  ticks: number;
}

export interface Stats {
  residents: number;
  townhouses: number;
  /** Average happiness across occupied townhouses, or null when nobody lives here. */
  happiness: number | null;
  incomePerTick: number;
  /** Happiness for each townhouse plot. */
  homeHappiness: Record<string, number>;
  /** Shops currently earning (a townhouse within range). */
  activeShops: Record<string, boolean>;
}

export type PlaceResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: 'occupied' | 'unaffordable' | 'unknown-plot'; message: string };

export type UndoResult =
  | { ok: true; state: GameState; undone: Placement }
  | { ok: false; message: string };

export function createInitialState(): GameState {
  return {
    money: RULES.startingMoney,
    buildings: {},
    lastPlacement: null,
    objectiveReached: false,
    ticks: 0,
  };
}

export class Simulation {
  private readonly byId: Map<string, PlotPosition>;

  constructor(readonly plots: readonly PlotPosition[]) {
    this.byId = new Map(plots.map((p) => [p.id, p]));
  }

  hasPlot(id: string): boolean {
    return this.byId.has(id);
  }

  distance(a: string, b: string): number {
    const pa = this.byId.get(a);
    const pb = this.byId.get(b);
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa.x - pb.x, pa.z - pb.z);
  }

  /** Why a placement would fail, or null if it is allowed. */
  checkPlacement(state: GameState, plotId: string, type: BuildingType): PlaceResult | null {
    if (!this.byId.has(plotId)) {
      return { ok: false, reason: 'unknown-plot', message: 'That is not a development plot.' };
    }
    if (state.buildings[plotId]) {
      return { ok: false, reason: 'occupied', message: 'That plot is already built on.' };
    }
    const cost = BUILDINGS[type].cost;
    if (state.money < cost) {
      const short = cost - state.money;
      return {
        ok: false,
        reason: 'unaffordable',
        message: `Not enough money: need £${short.toLocaleString('en-GB')} more.`,
      };
    }
    return null;
  }

  place(state: GameState, plotId: string, type: BuildingType): PlaceResult {
    const failure = this.checkPlacement(state, plotId, type);
    if (failure) return failure;
    const cost = BUILDINGS[type].cost;
    const next: GameState = {
      ...state,
      money: state.money - cost,
      buildings: { ...state.buildings, [plotId]: type },
      lastPlacement: { plotId, type, cost },
    };
    return { ok: true, state: this.withObjective(next) };
  }

  /** Removes the most recent placement and refunds its purchase cost. Tick income is kept. */
  undo(state: GameState): UndoResult {
    const last = state.lastPlacement;
    if (!last || state.buildings[last.plotId] !== last.type) {
      return { ok: false, message: 'Nothing to undo.' };
    }
    const buildings = { ...state.buildings };
    delete buildings[last.plotId];
    // objectiveReached stays true once earned so the celebration is not repeated.
    const next: GameState = { ...state, money: state.money + last.cost, buildings, lastPlacement: null };
    return { ok: true, state: next, undone: last };
  }

  /** Advances one simulation tick: collects income. */
  tick(state: GameState): GameState {
    const stats = this.stats(state);
    return this.withObjective({ ...state, money: state.money + stats.incomePerTick, ticks: state.ticks + 1 });
  }

  stats(state: GameState): Stats {
    const homes: string[] = [];
    const shops: string[] = [];
    const parks: string[] = [];
    for (const [id, type] of Object.entries(state.buildings)) {
      if (type === 'townhouse') homes.push(id);
      else if (type === 'shop') shops.push(id);
      else parks.push(id);
    }
    const r = RULES.effectRadius;
    const homeHappiness: Record<string, number> = {};
    let total = 0;
    for (const h of homes) {
      let v: number = RULES.baseHappiness;
      if (shops.some((s) => this.distance(h, s) <= r)) v += RULES.shopHappinessBonus;
      v += parks.filter((p) => this.distance(h, p) <= r).length * RULES.parkHappinessBonus;
      v = Math.min(RULES.maxHappiness, v);
      homeHappiness[h] = v;
      total += v;
    }
    const activeShops: Record<string, boolean> = {};
    let activeShopCount = 0;
    for (const s of shops) {
      const active = homes.some((h) => this.distance(h, s) <= r);
      activeShops[s] = active;
      if (active) activeShopCount++;
    }
    return {
      residents: homes.length * RULES.residentsPerTownhouse,
      townhouses: homes.length,
      happiness: homes.length ? total / homes.length : null,
      incomePerTick: homes.length * RULES.townhouseIncome + activeShopCount * RULES.shopIncome,
      homeHappiness,
      activeShops,
    };
  }

  objectiveMet(state: GameState): boolean {
    const s = this.stats(state);
    return s.residents >= RULES.objective.residents && (s.happiness ?? 0) >= RULES.objective.happiness;
  }

  private withObjective(state: GameState): GameState {
    if (state.objectiveReached || !this.objectiveMet(state)) return state;
    return { ...state, objectiveReached: true };
  }
}

/** Formats happiness for display: "—" when there are no residents. */
export function formatHappiness(h: number | null): string {
  return h === null ? '—' : String(Math.round(h));
}

export function formatMoney(n: number): string {
  return '£' + Math.round(n).toLocaleString('en-GB');
}

/**
 * Active-play clock. Feed it frame deltas; it returns how many ticks are due.
 * Large gaps (tab hidden, headset removed, debugger pauses) are clamped so the
 * simulation never jumps ahead unexpectedly on resume.
 */
export class TickClock {
  elapsed = 0;
  constructor(
    readonly tickSeconds: number = RULES.tickSeconds,
    readonly maxFrameSeconds = 0.25,
  ) {}

  advance(dtSeconds: number): number {
    if (!(dtSeconds > 0)) return 0;
    this.elapsed += Math.min(dtSeconds, this.maxFrameSeconds);
    let due = 0;
    while (this.elapsed >= this.tickSeconds) {
      this.elapsed -= this.tickSeconds;
      due++;
    }
    return due;
  }

  /** 0..1 progress toward the next tick. */
  get progress(): number {
    return this.elapsed / this.tickSeconds;
  }
}
