// Game controller: wraps the pure simulation with selection, feedback messages,
// persistence and change notifications. Independent of rendering and input devices.
import { PLOTS, type PlotDef } from '../map/chelsea';
import { BUILDINGS, RULES, type BuildingType } from '../sim/rules';
import { clearSave, loadGame, saveGame, type KeyValueStore } from '../sim/save';
import { Simulation, TickClock, createInitialState, formatMoney, type GameState, type Stats } from '../sim/simulation';

export type MessageKind = 'info' | 'success' | 'error' | 'celebrate';

export interface Message {
  text: string;
  kind: MessageKind;
  at: number;
}

export interface Preview {
  plot: PlotDef;
  type: BuildingType | null;
  ok: boolean;
  text: string;
}

const RESET_CONFIRM_MS = 5000;

export class Game {
  readonly sim = new Simulation(PLOTS);
  readonly clock = new TickClock();
  state: GameState;
  stats: Stats;
  selected: BuildingType | null = 'townhouse';
  hoverPlot: string | null = null;
  message: Message;
  resetArmedUntil = 0;
  /** Bumped on any change that affects what is displayed. */
  version = 0;
  /** Bumped only when buildings change (so the 3D layer is rebuilt rarely). */
  buildingsVersion = 0;
  private listeners: Array<(g: Game) => void> = [];
  onCelebrate: (() => void) | null = null;
  readonly plotById = new Map(PLOTS.map((p) => [p.id, p]));

  constructor(private store: KeyValueStore | null, private now: () => number = () => performance.now()) {
    const loaded = loadGame(store, new Set(PLOTS.map((p) => p.id)));
    this.state = loaded.state;
    this.stats = this.sim.stats(this.state);
    const welcome =
      loaded.status === 'loaded' ? 'Welcome back! Your Chelsea has been restored.' : 'Choose a building, then point at an empty plot.';
    this.message = { text: 'notice' in loaded && loaded.notice ? loaded.notice : welcome, kind: loaded.status === 'reset' ? 'error' : 'info', at: this.now() };
  }

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

  private say(text: string, kind: MessageKind = 'info'): void {
    this.message = { text, kind, at: this.now() };
  }

  private persist(): void {
    saveGame(this.store, this.state);
  }

  select(type: BuildingType | null): void {
    if (this.selected === type) return;
    this.selected = type;
    if (type) this.say(`${BUILDINGS[type].label} selected (${formatMoney(BUILDINGS[type].cost)}). Point at an empty plot.`);
    this.changed();
  }

  setHover(plotId: string | null): void {
    if (this.hoverPlot === plotId) return;
    this.hoverPlot = plotId;
    this.changed();
  }

  preview(plotId: string | null = this.hoverPlot): Preview | null {
    if (!plotId) return null;
    const plot = this.plotById.get(plotId);
    if (!plot) return null;
    const existing = this.state.buildings[plotId];
    if (existing) {
      return { plot, type: null, ok: false, text: `Plot ${plot.number}: ${BUILDINGS[existing].label} (occupied)` };
    }
    if (!this.selected) return { plot, type: null, ok: false, text: `Plot ${plot.number}: choose a building first` };
    const spec = BUILDINGS[this.selected];
    const fail = this.sim.checkPlacement(this.state, plotId, this.selected);
    if (fail && !fail.ok) {
      return { plot, type: this.selected, ok: false, text: `${spec.label} ${formatMoney(spec.cost)} — ${fail.message}` };
    }
    return { plot, type: this.selected, ok: true, text: `Build ${spec.label} on plot ${plot.number} for ${formatMoney(spec.cost)}` };
  }

  /** Attempts to build the selected building on a plot. Returns true on success. */
  place(plotId: string): boolean {
    const plot = this.plotById.get(plotId);
    if (!plot) return false;
    if (!this.selected) {
      this.say('Choose a townhouse, shop or park first.', 'error');
      this.changed();
      return false;
    }
    const wasReached = this.state.objectiveReached;
    const res = this.sim.place(this.state, plotId, this.selected);
    if (!res.ok) {
      this.say(res.message, 'error');
      this.changed();
      return false;
    }
    this.state = res.state;
    const spec = BUILDINGS[this.selected];
    this.say(`${spec.label} built on plot ${plot.number} for ${formatMoney(spec.cost)}.`, 'success');
    this.persist();
    this.changed(true);
    if (!wasReached && this.state.objectiveReached) this.celebrate();
    return true;
  }

  undo(): boolean {
    const res = this.sim.undo(this.state);
    if (!res.ok) {
      this.say(res.message, 'error');
      this.changed();
      return false;
    }
    this.state = res.state;
    const plot = this.plotById.get(res.undone.plotId);
    this.say(`Undid ${BUILDINGS[res.undone.type].label} on plot ${plot?.number}; refunded ${formatMoney(res.undone.cost)}.`, 'info');
    this.persist();
    this.changed(true);
    return true;
  }

  /** Advance active play time. Call every frame with the real frame delta (seconds). */
  update(dtSeconds: number): void {
    const due = this.clock.advance(dtSeconds);
    if (due > 0) {
      const wasReached = this.state.objectiveReached;
      for (let i = 0; i < due; i++) this.state = this.sim.tick(this.state);
      this.persist();
      this.changed();
      if (!wasReached && this.state.objectiveReached) this.celebrate();
    }
    if (this.resetArmedUntil && this.now() > this.resetArmedUntil) {
      this.resetArmedUntil = 0;
      this.changed();
    }
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
    this.clock.elapsed = 0;
    this.say('New game started. Choose a building to begin.', 'info');
    this.changed(true);
  }

  private celebrate(): void {
    this.say(`Objective reached: ${RULES.objective.residents}+ residents and ${RULES.objective.happiness}+ happiness! Keep building.`, 'celebrate');
    this.changed();
    this.onCelebrate?.();
  }

  objectiveProgress(): { residents: number; happiness: number } {
    const o = RULES.objective;
    return {
      residents: Math.min(1, this.stats.residents / o.residents),
      happiness: Math.min(1, (this.stats.happiness ?? 0) / o.happiness),
    };
  }
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
