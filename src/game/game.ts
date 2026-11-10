// Game controller: wraps the pure simulation with tool selection, inspection, feedback
// messages, persistence and change notifications. Shared by desktop and VR input.
import { PLOTS as LEGACY_PLOTS } from '../map/chelsea';
import type { GameMap, PlotDef } from '../map/types';
import { CHAPTERS, CHAPTER_COUNT, chapterGoals, chapterHint, type Goal } from '../sim/chapters';
import { BUILDINGS, type BuildingType } from '../sim/rules';
import { BACKUP_KEY, clearSave, defaultPreferences, loadGame, saveGame, type KeyValueStore, type MapContext, type Preferences } from '../sim/save';
import {
  Simulation, TickClock, createInitialState, formatMoney,
  type Estimate, type GameState, type Inspection, type Stats,
} from '../sim/simulation';

export type Tool = BuildingType | 'inspect';
export type MessageKind = 'info' | 'success' | 'error' | 'celebrate';

export interface Message {
  text: string;
  kind: MessageKind;
  at: number;
}

export interface Preview {
  plot: PlotDef;
  /** Building that would be placed, if any. */
  type: BuildingType | null;
  ok: boolean;
  /** Short line for the floating tooltip. */
  text: string;
  /** Effect lines (exact, from the simulation) for panels. */
  details: string[];
  estimate: Estimate | null;
}

const RESET_CONFIRM_MS = 5000;
const plus = (n: number) => (n >= 0 ? '+' : '−') + Math.abs(Math.round(n));

export class Game {
  readonly sim: Simulation;
  readonly clock = new TickClock();
  state: GameState;
  stats: Stats;
  prefs: Preferences;
  tool: Tool = 'townhouse';
  hoverPlot: string | null = null;
  inspected: string | null = null;
  message: Message;
  resetArmedUntil = 0;
  /** Bumped on any change that affects what is displayed. */
  version = 0;
  /** Bumped only when buildings change (so the 3D layer is rebuilt rarely). */
  buildingsVersion = 0;
  private listeners: Array<(g: Game) => void> = [];
  onChapterComplete: ((index: number) => void) | null = null;
  onBuildEffect: ((kind: 'place' | 'upgrade', plotId: string) => void) | null = null;
  readonly plotById: Map<string, PlotDef>;
  /** Set when a saved city could not be moved onto this map automatically; nothing is saved until resolved. */
  pendingChoice: { notice: string; unmapped: string[]; fromLegacy: boolean } | null = null;
  readonly mapInfo: { id: string; version: number };
  private previewCache: { key: string; value: Preview | null } = { key: '', value: null };

  constructor(readonly map: GameMap, private store: KeyValueStore | null, private now: () => number = () => performance.now(), prefersReducedMotion = false) {
    this.sim = new Simulation(map.plots);
    this.plotById = new Map(map.plots.map((p) => [p.id, p]));
    this.mapInfo = { id: map.id, version: map.version };
    const ctx: MapContext = {
      id: map.id,
      version: map.version,
      sim: this.sim,
      legacyPlotMap: map.legacyPlotMap,
      legacySim: map.legacyPlotMap ? new Simulation(LEGACY_PLOTS) : undefined,
      previousPlotMap: map.previousPlotMap,
    };
    const loaded = loadGame(store, ctx);
    if (loaded.status === 'needs-choice') this.pendingChoice = { notice: loaded.notice, unmapped: loaded.unmapped, fromLegacy: !!loaded.fromLegacy };
    this.state = loaded.state;
    this.prefs = loaded.prefs ?? { ...defaultPreferences(), reducedMotion: prefersReducedMotion };
    this.stats = this.sim.stats(this.state);
    const welcome = loaded.status === 'loaded' ? 'Welcome back! Your Chelsea has been restored.' : 'Choose a building, then point at an empty plot.';
    const notice = 'notice' in loaded && loaded.notice ? loaded.notice : null;
    this.message = { text: notice ?? welcome, kind: loaded.status === 'reset' ? 'error' : 'info', at: this.now() };
    if (loaded.status === 'loaded' && loaded.migratedFrom) this.persist(); // write the current format straight away
  }

  // ---- plumbing -------------------------------------------------------------------------------

  subscribe(fn: (g: Game) => void): () => void {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((l) => l !== fn));
  }

  private changed(buildings = false): void {
    this.stats = this.sim.stats(this.state);
    this.version++;
    if (buildings) this.buildingsVersion++;
    for (const l of this.listeners) l(this);
  }

  say(text: string, kind: MessageKind = 'info'): void {
    this.message = { text, kind, at: this.now() };
  }

  private persist(): void {
    if (this.pendingChoice) return; // never overwrite a save the player hasn't decided about
    saveGame(this.store, this.state, this.prefs, this.mapInfo);
  }

  /** Player chose to start fresh on this map; the original save stays in the backup slot. */
  startNewMapFromChoice(): void {
    this.pendingChoice = null;
    this.say(`Started a new city on the current map. Your previous save is kept as a backup (${BACKUP_KEY}).`);
    this.persist();
    this.changed(true);
  }

  /** Applies a new state, persisting it and announcing newly completed chapters (once each). */
  private commit(next: GameState, buildings: boolean): void {
    const before = this.state.chapter;
    this.state = next;
    this.persist();
    this.changed(buildings);
    for (let c = before; c < this.state.chapter; c++) {
      const last = c === CHAPTER_COUNT - 1;
      this.say(
        last
          ? `Chapter ${c + 1} complete: ${CHAPTERS[c].title}! Every chapter done. Carry on building freely.`
          : `Chapter ${c + 1} complete: ${CHAPTERS[c].title}! Next: ${CHAPTERS[c + 1].title}.`,
        'celebrate',
      );
      this.changed();
      this.onChapterComplete?.(c);
    }
  }

  plotName(id: string): string {
    return `plot ${this.plotById.get(id)?.number ?? id}`;
  }

  // ---- tools & hover --------------------------------------------------------------------------

  /** Free development sites, optionally only those a building type fits on (same rule as placement). */
  freeSites(type?: BuildingType): PlotDef[] {
    return this.map.plots.filter((p) => !this.state.buildings[p.id] && (!type || this.sim.fits(p.id, type)));
  }

  /** Short status line for the HUD / VR panel. */
  siteSummary(): string {
    const free = this.freeSites().length;
    if (this.tool === 'inspect') return `${free} of ${this.map.plots.length} sites free`;
    const fit = this.freeSites(this.tool).length;
    return fit === free ? `${free} free sites` : `${fit} of ${free} free sites fit a ${BUILDINGS[this.tool].label.toLowerCase()}`;
  }

  select(tool: Tool): void {
    if (this.tool === tool) return;
    this.tool = tool;
    if (tool === 'inspect') this.say('Inspect: point at a building to see what affects it.');
    else {
      const fit = this.freeSites(tool).length;
      if (fit === 0) {
        const free = this.freeSites().length;
        this.say(
          free === 0
            ? `Every site is built on. Upgrade a building (Inspect → Upgrade) or undo your last action to free a site.`
            : `No free site is big enough for a ${BUILDINGS[tool].label.toLowerCase()}. Try a ${tool === 'park' ? 'townhouse or shop' : 'park'}, or upgrade an existing building.`,
          'error',
        );
      } else this.say(`${BUILDINGS[tool].label} selected (${formatMoney(BUILDINGS[tool].cost)}). ${fit} highlighted site${fit === 1 ? '' : 's'} fit${fit === 1 ? 's' : ''}; point at one.`);
    }
    this.changed();
  }

  setHover(plotId: string | null): void {
    if (this.hoverPlot === plotId) return;
    this.hoverPlot = plotId;
    this.changed();
  }

  /** Hover preview for the current tool (cached per state version). */
  preview(plotId: string | null = this.hoverPlot): Preview | null {
    const key = `${plotId}|${this.tool}|${this.version}`;
    if (this.previewCache.key === key) return this.previewCache.value;
    const value = this.computePreview(plotId);
    this.previewCache = { key, value };
    return value;
  }

  private computePreview(plotId: string | null): Preview | null {
    if (!plotId) return null;
    const plot = this.plotById.get(plotId);
    if (!plot) return null;
    const n = plot.number;
    const existing = this.state.buildings[plotId];
    if (existing) {
      const label = `${BUILDINGS[existing.type].label} · Level ${existing.level}`;
      return { plot, type: null, ok: true, text: `Plot ${n}: ${label}. Select to inspect`, details: [], estimate: null };
    }
    if (this.tool === 'inspect') {
      return { plot, type: null, ok: true, text: `Plot ${n}: empty. Choose a building to build here`, details: [], estimate: null };
    }
    const type = this.tool;
    const spec = BUILDINGS[type];
    if (!this.sim.fits(plotId, type)) {
      const why = plot.restrictions?.[type] ?? `A ${spec.label.toLowerCase()} does not fit here.`;
      return { plot, type, ok: false, text: `Plot ${n}: ${why}`, details: [why, `Fits here: ${(plot.allowed ?? []).map((t) => BUILDINGS[t].label).join(', ')}`], estimate: null };
    }
    const est = this.sim.estimatePlacement(this.state, plotId, type)!;
    const details = describeEstimate(type, est);
    const fail = this.sim.checkPlacement(this.state, plotId, type);
    const short = shortEstimate(type, est);
    if (fail) return { plot, type, ok: false, text: `${spec.label} ${formatMoney(spec.cost)}: ${fail.message}`, details, estimate: est };
    return { plot, type, ok: true, text: `${spec.label} ${formatMoney(spec.cost)} · ${short}`, details, estimate: est };
  }

  // ---- actions (shared by desktop click and VR trigger) ----------------------------------------

  /** Primary action on a plot: build with a build tool, otherwise inspect. */
  activatePlot(plotId: string): void {
    const plot = this.plotById.get(plotId);
    if (!plot) return;
    const b = this.state.buildings[plotId];
    if (b) {
      this.inspect(plotId);
      if (this.tool !== 'inspect') this.say(`Plot ${plot.number} is already built on, so here are its details instead.`, 'info');
      this.changed();
      return;
    }
    if (this.tool === 'inspect') {
      this.inspected = null;
      this.say(`Plot ${plot.number} is empty. Choose a townhouse, shop or park to build here.`);
      this.changed();
      return;
    }
    this.place(plotId);
  }

  inspect(plotId: string | null): void {
    this.inspected = plotId && this.state.buildings[plotId] ? plotId : null;
    this.changed();
  }

  inspection(): Inspection | null {
    return this.inspected ? this.sim.inspect(this.state, this.inspected, this.stats) : null;
  }

  /** Builds the current build tool on a plot. Returns true on success. */
  place(plotId: string): boolean {
    const plot = this.plotById.get(plotId);
    if (!plot || this.tool === 'inspect') return false;
    const type = this.tool;
    const res = this.sim.place(this.state, plotId, type);
    if (!res.ok) {
      this.say(res.message, 'error');
      this.changed();
      return false;
    }
    this.say(`${BUILDINGS[type].label} built on plot ${plot.number} for ${formatMoney(BUILDINGS[type].cost)}.`, 'success');
    this.commit(res.state, true);
    this.onBuildEffect?.('place', plotId);
    return true;
  }

  upgradeInspected(): boolean {
    const id = this.inspected;
    if (!id) return false;
    const b = this.state.buildings[id];
    const res = this.sim.upgrade(this.state, id);
    if (!res.ok) {
      this.say(res.message, 'error');
      this.changed();
      return false;
    }
    this.say(`${BUILDINGS[b.type].label} on ${this.plotName(id)} upgraded to Level 2 for ${formatMoney(BUILDINGS[b.type].upgradeCost)}.`, 'success');
    this.commit(res.state, true);
    this.onBuildEffect?.('upgrade', id);
    return true;
  }

  undo(): boolean {
    const res = this.sim.undo(this.state);
    if (!res.ok) {
      this.say(res.message, 'error');
      this.changed();
      return false;
    }
    const u = res.undone;
    const what = u.kind === 'place' ? `${BUILDINGS[u.type].label} on ${this.plotName(u.plotId)}` : `upgrade of ${this.plotName(u.plotId)}`;
    this.say(`Undid ${what}; refunded ${formatMoney(u.cost)}.`);
    if (u.kind === 'place' && this.inspected === u.plotId) this.inspected = null;
    this.commit(res.state, true);
    return true;
  }

  /** Advance active play time. Call every frame with the real frame delta (seconds). */
  update(dtSeconds: number): void {
    const due = this.clock.advance(dtSeconds);
    if (due > 0) {
      let s = this.state;
      for (let i = 0; i < due; i++) s = this.sim.tick(s);
      this.commit(s, false);
    }
    if (this.resetArmedUntil && this.now() > this.resetArmedUntil) {
      this.resetArmedUntil = 0;
      this.changed();
    }
  }

  // ---- preferences & reset ---------------------------------------------------------------------

  setPref<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    this.prefs = { ...this.prefs, [key]: value };
    this.say(
      key === 'reducedMotion' ? `Reduced motion ${value ? 'on' : 'off'}.`
        : key === 'lowDetail' ? `Low detail ${value ? 'on: people and traffic hidden' : 'off'}.`
        : value ? `Showing ${this.freeSites().length} free development sites.` : 'Site highlights hidden (they still appear while a building is selected).',
    );
    this.persist();
    this.changed();
  }

  get resetArmed(): boolean {
    return this.resetArmedUntil > this.now();
  }

  /** Two-step reset: the first call arms it, a second call within 5 s resets. */
  requestReset(): 'armed' | 'reset' {
    if (!this.resetArmed) {
      this.resetArmedUntil = this.now() + RESET_CONFIRM_MS;
      this.say('Press "Confirm reset" within 5 seconds to erase your saved city.', 'error');
      this.changed();
      return 'armed';
    }
    this.resetNow();
    return 'reset';
  }

  resetNow(): void {
    this.resetArmedUntil = 0;
    clearSave(this.store);
    this.state = createInitialState();
    this.inspected = null;
    this.clock.elapsed = 0;
    this.persist();
    this.say('New game started. Choose a building to begin.', 'info');
    this.changed(true);
  }

  // ---- chapters -------------------------------------------------------------------------------

  chapterView(): { index: number; title: string; goals: Goal[]; hint: string; done: boolean } {
    const i = this.state.chapter;
    const done = i >= CHAPTER_COUNT;
    return {
      index: Math.min(i, CHAPTER_COUNT - 1),
      title: done ? 'Sandbox: all chapters complete' : CHAPTERS[i].title,
      goals: done ? [] : chapterGoals(i, this.stats),
      hint: chapterHint(i, this.stats),
      done,
    };
  }
}

/** Short tooltip summary of a placement estimate. */
function shortEstimate(type: BuildingType, e: Estimate): string {
  const parts: string[] = [];
  const dRes = e.residents[1] - e.residents[0];
  const dInc = e.income[1] - e.income[0];
  if (dRes) parts.push(`+${dRes} residents`);
  if (dInc) parts.push(`${dInc > 0 ? '+' : '−'}£${Math.abs(dInc)}/tick`);
  const raised = e.homeChanges.filter((h) => h.before !== null && h.after > h.before).length;
  if (type !== 'townhouse') parts.push(raised ? `${raised} home${raised > 1 ? 's' : ''} happier` : 'no homes in range');
  return parts.join(' · ');
}

/** Exact effect lines for panels. */
export function describeEstimate(type: BuildingType, e: Estimate): string[] {
  const lines: string[] = [];
  const dRes = e.residents[1] - e.residents[0];
  const dInc = e.income[1] - e.income[0];
  if (dRes) lines.push(`Residents ${e.residents[0]} → ${e.residents[1]}`);
  if (dInc || type === 'shop') lines.push(`Income ${formatMoney(e.income[0])} → ${formatMoney(e.income[1])} per tick${dInc ? ` (${plus(dInc)})` : ''}`);
  const [h0, h1] = e.happiness;
  if (h0 !== h1) lines.push(`Average happiness ${h0 === null ? '—' : Math.round(h0)} → ${h1 === null ? '—' : Math.round(h1)}`);
  const own = e.homeChanges.find((h) => h.before === null);
  if (own) lines.push(`This home's happiness: ${own.after}`);
  const raised = e.homeChanges.filter((h) => h.before !== null);
  if (raised.length) lines.push(`${raised.length} nearby home${raised.length > 1 ? 's' : ''} gain happiness`);
  else if (type === 'park') lines.push('No homes within 80 m yet');
  const activated = e.shopChanges.filter((s) => s.after && !s.before).length;
  if (activated) lines.push(`Activates ${activated} idle shop${activated > 1 ? 's' : ''}`);
  if (type === 'shop' && e.income[1] === e.income[0]) lines.push('Idle until a home is within 80 m');
  return lines;
}

export function safeLocalStorage(): KeyValueStore | null {
  try {
    const k = '__cmc_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return window.localStorage;
  } catch {
    return null;
  }
}
