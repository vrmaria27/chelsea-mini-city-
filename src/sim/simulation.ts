// Pure simulation: state, placement, upgrades, undo, ticks, derived stats, estimates and inspection.
import { advanceChapters } from './chapters';
import { BUILDINGS, MAX_LEVEL, RULES, type BuildingType, type Level, type PlotPosition } from './rules';

export interface Building {
  type: BuildingType;
  level: Level;
}

export type LastAction =
  | { kind: 'place'; plotId: string; type: BuildingType; cost: number }
  | { kind: 'upgrade'; plotId: string; type: BuildingType; cost: number };

export interface GameState {
  money: number;
  /** Building on each occupied plot, keyed by plot id. Vacant plots are absent. */
  buildings: Record<string, Building>;
  /** Most recent placement or upgrade that can still be undone (single level). */
  lastAction: LastAction | null;
  /** Number of chapters completed (0..3). Never decreases. */
  chapter: number;
  ticks: number;
}

export interface HomeInfo {
  id: string;
  level: Level;
  residents: number;
  income: number;
  happiness: number;
  /** Happiness before the cap was applied. */
  uncapped: number;
  /** Shops within range (any one gives the +10 bonus). */
  shops: string[];
  /** Parks within range with the bonus each contributes. */
  parks: { id: string; bonus: number }[];
  /** Convenience: true when a shop is in range. */
  shop: boolean;
}

export interface Stats {
  residents: number;
  townhouses: number;
  shops: number;
  parks: number;
  /** Average happiness across occupied townhouses, or null when nobody lives here. */
  happiness: number | null;
  incomePerTick: number;
  activeShopCount: number;
  upgraded: Record<BuildingType, number>;
  homes: HomeInfo[];
  /** Happiness for each townhouse plot. */
  homeHappiness: Record<string, number>;
  /** Shops currently earning (a townhouse within range). */
  activeShops: Record<string, boolean>;
  /** Homes within range of each shop / park. */
  servedHomes: Record<string, string[]>;
  /** Income per tick for each building. */
  income: Record<string, number>;
}

export type Failure = { ok: false; reason: 'occupied' | 'unaffordable' | 'unknown-plot' | 'vacant' | 'max-level' | 'does-not-fit'; message: string };
export type PlaceResult = { ok: true; state: GameState } | Failure;
export type UndoResult = { ok: true; state: GameState; undone: LastAction } | { ok: false; message: string };

export interface HomeChange {
  id: string;
  before: number | null; // null = not a home before (the new townhouse itself)
  after: number;
}

export interface Estimate {
  residents: [number, number];
  income: [number, number];
  happiness: [number | null, number | null];
  homeChanges: HomeChange[];
  shopChanges: { id: string; before: boolean; after: boolean }[];
}

export interface Inspection {
  plotId: string;
  type: BuildingType;
  level: Level;
  residents: number;
  income: number;
  /** Townhouses only. */
  happiness: number | null;
  /** Contribution lines, e.g. ["Base", 50], ["Shop nearby (plot 14)", 10]. */
  contributions: { label: string; value: number }[];
  capped: boolean;
  nearbyShops: string[];
  nearbyParks: { id: string; bonus: number }[];
  /** For shops / parks: homes in range. */
  servedHomes: string[];
  active: boolean | null;
  hint: string;
  upgrade: {
    cost: number;
    available: boolean;
    affordable: boolean;
    reason: string | null;
    effects: string[];
  };
}

export function createInitialState(): GameState {
  return { money: RULES.startingMoney, buildings: {}, lastAction: null, chapter: 0, ticks: 0 };
}

const gbp = (n: number) => '£' + Math.round(n).toLocaleString('en-GB');

export class Simulation {
  private readonly byId: Map<string, PlotPosition>;
  private readonly dist = new Map<string, number>();

  constructor(readonly plots: readonly PlotPosition[]) {
    this.byId = new Map(plots.map((p) => [p.id, p]));
  }

  hasPlot(id: string): boolean {
    return this.byId.has(id);
  }

  name(id: string): string {
    const p = this.byId.get(id);
    return p?.number !== undefined ? `plot ${p.number}` : id;
  }

  distance(a: string, b: string): number {
    const key = a < b ? a + '|' + b : b + '|' + a;
    let d = this.dist.get(key);
    if (d === undefined) {
      const pa = this.byId.get(a), pb = this.byId.get(b);
      d = pa && pb ? Math.hypot(pa.x - pb.x, pa.z - pb.z) : Infinity;
      this.dist.set(key, d);
    }
    return d;
  }

  /** Whether a building type physically fits on a plot (same rule for preview, input and placement). */
  fits(plotId: string, type: BuildingType): boolean {
    const p = this.byId.get(plotId);
    return !!p && (!p.allowed || p.allowed.includes(type));
  }

  inRange(a: string, b: string): boolean {
    return this.distance(a, b) <= RULES.effectRadius;
  }

  // ---- Placement ------------------------------------------------------------------------------

  /** Why a placement would fail, or null if it is allowed. */
  checkPlacement(state: GameState, plotId: string, type: BuildingType): Failure | null {
    if (!this.byId.has(plotId)) return { ok: false, reason: 'unknown-plot', message: 'That is not a development plot.' };
    if (state.buildings[plotId]) return { ok: false, reason: 'occupied', message: 'That plot is already built on.' };
    if (!this.fits(plotId, type)) {
      const why = this.byId.get(plotId)!.restrictions?.[type];
      return { ok: false, reason: 'does-not-fit', message: why ?? `A ${BUILDINGS[type].label.toLowerCase()} does not fit on this site.` };
    }
    const cost = BUILDINGS[type].cost;
    if (state.money < cost) return { ok: false, reason: 'unaffordable', message: `Not enough money: need ${gbp(cost - state.money)} more.` };
    return null;
  }

  place(state: GameState, plotId: string, type: BuildingType): PlaceResult {
    const failure = this.checkPlacement(state, plotId, type);
    if (failure) return failure;
    const cost = BUILDINGS[type].cost;
    return {
      ok: true,
      state: this.withChapters({
        ...state,
        money: state.money - cost,
        buildings: { ...state.buildings, [plotId]: { type, level: 1 } },
        lastAction: { kind: 'place', plotId, type, cost },
      }),
    };
  }

  // ---- Upgrades -------------------------------------------------------------------------------

  checkUpgrade(state: GameState, plotId: string): Failure | null {
    const b = state.buildings[plotId];
    if (!b) return { ok: false, reason: 'vacant', message: 'There is no building to upgrade here.' };
    if (b.level >= MAX_LEVEL) return { ok: false, reason: 'max-level', message: 'Already upgraded to Level 2.' };
    const cost = BUILDINGS[b.type].upgradeCost;
    if (state.money < cost) return { ok: false, reason: 'unaffordable', message: `Not enough money: need ${gbp(cost - state.money)} more.` };
    return null;
  }

  upgrade(state: GameState, plotId: string): PlaceResult {
    const failure = this.checkUpgrade(state, plotId);
    if (failure) return failure;
    const b = state.buildings[plotId];
    const cost = BUILDINGS[b.type].upgradeCost;
    return {
      ok: true,
      state: this.withChapters({
        ...state,
        money: state.money - cost,
        buildings: { ...state.buildings, [plotId]: { type: b.type, level: 2 } },
        lastAction: { kind: 'upgrade', plotId, type: b.type, cost },
      }),
    };
  }

  // ---- Undo -----------------------------------------------------------------------------------

  /**
   * Reverses the most recent placement or upgrade and refunds exactly what it cost.
   * Income already earned from ticks is kept. Completed chapters are never revoked.
   */
  undo(state: GameState): UndoResult {
    const last = state.lastAction;
    const b = last ? state.buildings[last.plotId] : undefined;
    if (!last || !b || b.type !== last.type) return { ok: false, message: 'Nothing to undo.' };
    const buildings = { ...state.buildings };
    if (last.kind === 'place') {
      if (b.level !== 1) return { ok: false, message: 'Nothing to undo.' };
      delete buildings[last.plotId];
    } else {
      if (b.level !== 2) return { ok: false, message: 'Nothing to undo.' };
      buildings[last.plotId] = { type: b.type, level: 1 };
    }
    const next = this.withChapters({ ...state, money: state.money + last.cost, buildings, lastAction: null });
    return { ok: true, state: next, undone: last };
  }

  // ---- Ticks ----------------------------------------------------------------------------------

  /** Advances one simulation tick: collects income. */
  tick(state: GameState): GameState {
    const stats = this.stats(state);
    return this.withChapters({ ...state, money: state.money + stats.incomePerTick, ticks: state.ticks + 1 });
  }

  private withChapters(state: GameState): GameState {
    const c = advanceChapters(state.chapter, this.stats(state));
    return c === state.chapter ? state : { ...state, chapter: c };
  }

  // ---- Derived stats --------------------------------------------------------------------------

  stats(state: GameState): Stats {
    const homes: string[] = [], shops: string[] = [], parks: string[] = [];
    const upgraded: Record<BuildingType, number> = { townhouse: 0, shop: 0, park: 0 };
    for (const [id, b] of Object.entries(state.buildings)) {
      if (b.type === 'townhouse') homes.push(id);
      else if (b.type === 'shop') shops.push(id);
      else parks.push(id);
      if (b.level === 2) upgraded[b.type]++;
    }
    const servedHomes: Record<string, string[]> = {};
    for (const id of [...shops, ...parks]) servedHomes[id] = homes.filter((h) => this.inRange(h, id));
    const income: Record<string, number> = {};
    const homeInfos: HomeInfo[] = [];
    const homeHappiness: Record<string, number> = {};
    let residents = 0, total = 0, incomePerTick = 0;
    for (const h of homes) {
      const b = state.buildings[h];
      const spec = BUILDINGS.townhouse.levels[b.level];
      const nearShops = shops.filter((s) => this.inRange(h, s));
      const nearParks = parks
        .filter((p) => this.inRange(h, p))
        .map((p) => ({ id: p, bonus: BUILDINGS.park.levels[state.buildings[p].level].parkBonus }));
      const uncapped = RULES.baseHappiness + (nearShops.length ? RULES.shopHappinessBonus : 0) + nearParks.reduce((n, p) => n + p.bonus, 0);
      const happiness = Math.min(RULES.maxHappiness, uncapped);
      homeInfos.push({ id: h, level: b.level, residents: spec.residents, income: spec.income, happiness, uncapped, shops: nearShops, parks: nearParks, shop: nearShops.length > 0 });
      homeHappiness[h] = happiness;
      income[h] = spec.income;
      residents += spec.residents;
      incomePerTick += spec.income;
      total += happiness;
    }
    const activeShops: Record<string, boolean> = {};
    let activeShopCount = 0;
    for (const s of shops) {
      const active = servedHomes[s].length > 0;
      activeShops[s] = active;
      income[s] = active ? BUILDINGS.shop.levels[state.buildings[s].level].income : 0;
      incomePerTick += income[s];
      if (active) activeShopCount++;
    }
    for (const p of parks) income[p] = 0;
    return {
      residents,
      townhouses: homes.length,
      shops: shops.length,
      parks: parks.length,
      happiness: homes.length ? total / homes.length : null,
      incomePerTick,
      activeShopCount,
      upgraded,
      homes: homeInfos,
      homeHappiness,
      activeShops,
      servedHomes,
      income,
    };
  }

  // ---- Estimates (exact: computed by applying the real rules to a hypothetical state) ---------

  private diff(before: Stats, after: Stats): Estimate {
    const homeChanges: HomeChange[] = [];
    for (const h of after.homes) {
      const b = before.homeHappiness[h.id];
      if (b === undefined || b !== h.happiness) homeChanges.push({ id: h.id, before: b ?? null, after: h.happiness });
    }
    const shopChanges = Object.keys(after.activeShops)
      .filter((id) => before.activeShops[id] !== after.activeShops[id])
      .map((id) => ({ id, before: before.activeShops[id] ?? false, after: after.activeShops[id] }));
    return {
      residents: [before.residents, after.residents],
      income: [before.incomePerTick, after.incomePerTick],
      happiness: [before.happiness, after.happiness],
      homeChanges,
      shopChanges,
    };
  }

  /** Effects of placing `type` on a vacant plot, ignoring affordability. */
  estimatePlacement(state: GameState, plotId: string, type: BuildingType): Estimate | null {
    if (!this.byId.has(plotId) || state.buildings[plotId] || !this.fits(plotId, type)) return null;
    const after: GameState = { ...state, buildings: { ...state.buildings, [plotId]: { type, level: 1 } } };
    return this.diff(this.stats(state), this.stats(after));
  }

  /** Effects of upgrading the building on a plot, ignoring affordability. */
  estimateUpgrade(state: GameState, plotId: string): Estimate | null {
    const b = state.buildings[plotId];
    if (!b || b.level >= MAX_LEVEL) return null;
    const after: GameState = { ...state, buildings: { ...state.buildings, [plotId]: { type: b.type, level: 2 } } };
    return this.diff(this.stats(state), this.stats(after));
  }

  // ---- Inspection -----------------------------------------------------------------------------

  inspect(state: GameState, plotId: string, stats: Stats = this.stats(state)): Inspection | null {
    const b = state.buildings[plotId];
    if (!b) return null;
    const spec = BUILDINGS[b.type];
    const lvl = spec.levels[b.level];
    const contributions: Inspection['contributions'] = [];
    let happiness: number | null = null, capped = false, active: boolean | null = null;
    let nearbyShops: string[] = [], nearbyParks: { id: string; bonus: number }[] = [], served: string[] = [];
    let hint = '';

    if (b.type === 'townhouse') {
      const h = stats.homes.find((x) => x.id === plotId)!;
      happiness = h.happiness;
      capped = h.uncapped > h.happiness;
      nearbyShops = h.shops;
      nearbyParks = h.parks;
      contributions.push({ label: 'Base happiness', value: RULES.baseHappiness });
      if (h.shops.length) contributions.push({ label: `Shop nearby (${this.name(h.shops[0])})`, value: RULES.shopHappinessBonus });
      for (const p of h.parks) contributions.push({ label: `Park (${this.name(p.id)})`, value: p.bonus });
      if (capped) contributions.push({ label: 'Capped at maximum', value: RULES.maxHappiness - h.uncapped });
      if (happiness >= RULES.maxHappiness) hint = 'This home is as happy as it can be.';
      else if (!h.shops.length && !h.parks.length) hint = 'Add a nearby park or shop (within 80 m) to improve happiness.';
      else if (!h.shops.length) hint = 'Add a nearby shop for +10 happiness and extra income.';
      else if (!h.parks.length) hint = 'Add a nearby park for +10 happiness.';
      else if (b.level === 1) hint = 'Upgrade for 10 more residents and higher income.';
      else hint = 'Another nearby park, or upgrading one, would make this home happier.';
    } else if (b.type === 'shop') {
      served = stats.servedHomes[plotId] ?? [];
      active = stats.activeShops[plotId] ?? false;
      contributions.push({ label: active ? 'Earning (homes nearby)' : 'Idle: no homes within 80 m', value: stats.income[plotId] ?? 0 });
      hint = active
        ? `Serving ${served.length} home${served.length === 1 ? '' : 's'} (+10 happiness each).`
        : 'This shop needs a nearby home: build a townhouse within 80 m.';
    } else {
      served = stats.servedHomes[plotId] ?? [];
      contributions.push({ label: 'Happiness to each nearby home', value: lvl.parkBonus });
      hint = served.length
        ? `Making ${served.length} home${served.length === 1 ? '' : 's'} happier.`
        : 'No homes within 80 m yet: build townhouses nearby to benefit.';
    }

    // Upgrade offer with exact before/after effects
    const effects: string[] = [];
    const est = this.estimateUpgrade(state, plotId);
    const next = b.level < MAX_LEVEL ? spec.levels[2] : null;
    if (next && est) {
      if (b.type === 'townhouse') {
        effects.push(`Residents ${lvl.residents} → ${next.residents}`);
        effects.push(`Income ${gbp(lvl.income)} → ${gbp(next.income)} per tick`);
      } else if (b.type === 'shop') {
        effects.push(`Income when active ${gbp(lvl.income)} → ${gbp(next.income)} per tick`);
        if (!active) effects.push('Currently idle: needs a home within 80 m to earn');
      } else {
        effects.push(`Happiness bonus +${lvl.parkBonus} → +${next.parkBonus} for nearby homes`);
        const changed = est.homeChanges.length;
        effects.push(changed ? `${changed} home${changed === 1 ? '' : 's'} affected now` : 'No homes in range yet');
      }
      const [h0, h1] = est.happiness;
      if (h0 !== h1 && h0 !== null && h1 !== null) effects.push(`Average happiness ${Math.round(h0)} → ${Math.round(h1)}`);
    }
    const failure = this.checkUpgrade(state, plotId);
    return {
      plotId,
      type: b.type,
      level: b.level,
      residents: lvl.residents,
      income: stats.income[plotId] ?? 0,
      happiness,
      contributions,
      capped,
      nearbyShops,
      nearbyParks,
      servedHomes: served,
      active,
      hint,
      upgrade: {
        cost: spec.upgradeCost,
        available: b.level < MAX_LEVEL,
        affordable: state.money >= spec.upgradeCost,
        reason: failure ? failure.message : null,
        effects,
      },
    };
  }
}

/** Formats happiness for display: "—" when there are no residents. */
export function formatHappiness(h: number | null): string {
  return h === null ? '—' : String(Math.round(h));
}

export function formatMoney(n: number): string {
  return gbp(n);
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
