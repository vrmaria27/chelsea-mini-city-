// Visitor experience state: the welcome, the optional "Discover Chelsea" route, the postcard collection
// and the sound settings. Pure logic (no DOM, rendering or audio), so the rules can be tested directly.
// Saved locally under its own versioned key; a missing, malformed or outdated save starts afresh, and a
// failing store never stops the visit (the state simply lives for the session).
import type { KeyValueStore, LightMode } from '../explore/prefs';
import { POSTCARDS, STOPS, VIEWPOINTS, type Postcard, type Stop, type Viewpoint } from './route';
import routePaths from './routePaths.json';

export const VISIT_KEY = 'chelsea-explorer-visit';
export const VISIT_VERSION = 1;

export interface VisitState {
  version: typeof VISIT_VERSION;
  welcomeSeen: boolean;
  /** 'discover': following the route (guidance shown); 'free': exploring freely (progress kept). */
  mode: 'free' | 'discover';
  /** Stops reached, in the order they were reached. */
  visited: string[];
  /** Stops skipped on purpose (still reachable later). */
  skipped: string[];
  completed: boolean;
  /** Postcards taken: id → capture time (ms). The images live in IndexedDB (photos.ts). */
  postcards: Record<string, number>;
  /**
   * Lighting each postcard was taken in (added with the golden-hour presets). Postcards saved before
   * then have no entry and were all taken in daylight, which is what they read as.
   */
  postcardLight: Record<string, LightMode>;
  sound: { muted: boolean; ambience: boolean; narration: boolean };
  /** Interface hidden (restored with the "Show interface" button or H). */
  uiHidden: boolean;
  /** Route guidance marker on the ground. */
  guide: boolean;
  /** VR: walk with the left thumbstick (off by default; teleport always works). */
  smooth: boolean;
}

export function defaultVisit(): VisitState {
  return { version: VISIT_VERSION, welcomeSeen: false, mode: 'free', visited: [], skipped: [], completed: false, postcards: {}, postcardLight: {}, sound: { muted: false, ambience: true, narration: true }, uiHidden: false, guide: true, smooth: false };
}

export function loadVisit(store: KeyValueStore): { state: VisitState; status: 'none' | 'ok' | 'malformed' | 'unsupported-version' } {
  let raw: string | null = null;
  try { raw = store.getItem(VISIT_KEY); } catch { raw = null; }
  if (!raw) return { state: defaultVisit(), status: 'none' };
  try {
    const v = JSON.parse(raw) as Partial<VisitState>;
    if (!v || typeof v !== 'object') return { state: defaultVisit(), status: 'malformed' };
    if (v.version !== VISIT_VERSION) return { state: defaultVisit(), status: 'unsupported-version' };
    const d = defaultVisit();
    const ids = new Set(STOPS.map((s) => s.id)), pids = new Set(POSTCARDS.map((p) => p.id));
    const list = (a: unknown) => (Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string' && ids.has(x)) : []);
    const cards: Record<string, number> = {};
    if (v.postcards && typeof v.postcards === 'object') for (const [k, t] of Object.entries(v.postcards)) if (pids.has(k) && typeof t === 'number') cards[k] = t;
    const lights: Record<string, LightMode> = {};
    if (v.postcardLight && typeof v.postcardLight === 'object') for (const [k, m] of Object.entries(v.postcardLight)) if (k in cards && (m === 'day' || m === 'golden')) lights[k] = m;
    const s = (v.sound ?? {}) as Partial<VisitState['sound']>;
    return {
      state: {
        version: VISIT_VERSION,
        welcomeSeen: !!v.welcomeSeen,
        mode: v.mode === 'discover' ? 'discover' : 'free',
        visited: [...new Set(list(v.visited))],
        skipped: [...new Set(list(v.skipped))],
        completed: !!v.completed,
        postcards: cards,
        postcardLight: lights,
        sound: { muted: typeof s.muted === 'boolean' ? s.muted : d.sound.muted, ambience: typeof s.ambience === 'boolean' ? s.ambience : d.sound.ambience, narration: typeof s.narration === 'boolean' ? s.narration : d.sound.narration },
        uiHidden: !!v.uiHidden,
        guide: typeof v.guide === 'boolean' ? v.guide : true,
        smooth: !!v.smooth,
      },
      status: 'ok',
    };
  } catch {
    return { state: defaultVisit(), status: 'malformed' };
  }
}

export interface Leg { from: string; to: string; length: number; points: [number, number][]; crossings: number[] }
export const LEGS = (routePaths as unknown as { legs: Leg[] }).legs;

/** Capture check result. */
export type CaptureCheck =
  | { ok: true; postcard: Postcard; retake: boolean }
  | { ok: false; reason: 'far'; nearest: Postcard; distance: number }
  | { ok: false; reason: 'direction'; postcard: Postcard; turn: number }
  | { ok: false; reason: 'blocked'; postcard: Postcard };

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Heading (yaw) from (x, z) towards (tx, tz): yaw 0 = north (−z), positive = west (−x). */
export const bearing = (x: number, z: number, tx: number, tz: number) => Math.atan2(-(tx - x), -(tz - z));

export interface Sight { lineBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignore?: string): boolean }

export class Visit {
  state: VisitState;
  readonly loadStatus: ReturnType<typeof loadVisit>['status'];
  /** Last save failed (storage full or unavailable): progress lasts for this session only. */
  saveFailed = false;
  /** The stop whose story card is open (null when none). */
  openStop: string | null = null;
  /** Just reached the final stop: show the completion message. */
  showCompletion = false;
  private listeners: (() => void)[] = [];

  constructor(private store: KeyValueStore) {
    const r = loadVisit(store);
    this.state = r.state;
    this.loadStatus = r.status;
  }

  subscribe(f: () => void): void { this.listeners.push(f); }

  private changed(save = true): void {
    if (save) {
      try {
        this.store.setItem(VISIT_KEY, JSON.stringify(this.state));
        this.saveFailed = false;
      } catch {
        this.saveFailed = true;
      }
    }
    for (const f of this.listeners) f();
  }

  // ---- welcome ----------------------------------------------------------------------------------

  get showWelcome(): boolean { return !this.state.welcomeSeen; }

  /** Closes the welcome with a choice (or just closes it). */
  chooseWelcome(choice: 'free' | 'discover' | null): void {
    this.state.welcomeSeen = true;
    if (choice) this.state.mode = choice;
    if (choice === 'discover') {
      // the visit starts at the first stop: show its story straight away
      const first = STOPS[0];
      if (!this.state.visited.includes(first.id)) this.state.visited.push(first.id);
      this.openStop = first.id;
    }
    this.changed();
  }

  reopenWelcome(): void {
    this.state.welcomeSeen = false;
    this.changed(false);
  }

  // ---- route ------------------------------------------------------------------------------------

  /** The next stop to walk to (first stop not yet reached), or null when all are reached. */
  get target(): Stop | null {
    return STOPS.find((s) => !this.state.visited.includes(s.id) && !this.state.skipped.includes(s.id))
      ?? STOPS.find((s) => !this.state.visited.includes(s.id)) ?? null;
  }

  stopIndex(id: string): number { return STOPS.findIndex((s) => s.id === id); }

  startRoute(): void {
    this.state.mode = 'discover';
    this.state.welcomeSeen = true;
    this.changed();
  }

  leaveRoute(): void {
    this.state.mode = 'free';
    this.openStop = null;
    this.changed();
  }

  /** Skips the current target stop (it stays reachable; arriving there still shows its story). */
  skipStop(): void {
    const t = this.target;
    if (!t) return;
    if (!this.state.skipped.includes(t.id)) this.state.skipped.push(t.id);
    this.openStop = null;
    this.changed();
  }

  /**
   * Closes the open story. The completion message waits behind the final story, so closing that story
   * reveals it; closing again (or closing the completion message itself) dismisses it.
   */
  closeStop(): void {
    if (this.openStop) this.openStop = null;
    else this.showCompletion = false;
    this.changed(false);
  }

  /** Dismisses the completion message (and any story). */
  closeCompletion(): void {
    this.openStop = null;
    this.showCompletion = false;
    this.changed(false);
  }

  openStory(id: string): void {
    this.openStop = id;
    this.changed(false);
  }

  /**
   * Called as the visitor moves (cheap; no save unless something changes). Arriving at any stop on the
   * route while following it opens that stop's story once; reaching the last stop completes the visit.
   */
  updatePosition(x: number, z: number): void {
    if (this.state.mode !== 'discover') return;
    for (const s of STOPS) {
      if (this.state.visited.includes(s.id)) continue;
      if (Math.hypot(x - s.at.x, z - s.at.z) > s.radius) continue;
      this.state.visited.push(s.id);
      this.state.skipped = this.state.skipped.filter((k) => k !== s.id);
      this.openStop = s.id;
      if (s.id === STOPS[STOPS.length - 1].id && !this.state.completed) {
        this.state.completed = true;
        this.showCompletion = true;
      }
      this.changed();
      return;
    }
  }

  /**
   * Route guidance from (x, z) to the target stop along the planned walkable path: the point about
   * `ahead` metres further along, and the remaining distance. Off the path, it first leads back to it.
   */
  guidance(x: number, z: number, ahead = 14): { x: number; z: number; remaining: number; target: Stop; crossing: boolean } | null {
    const t = this.target;
    if (!t) return null;
    const i = this.stopIndex(t.id);
    const leg = LEGS.find((l) => l.to === t.id);
    if (!leg || i === 0) return { x: t.at.x, z: t.at.z, remaining: Math.hypot(t.at.x - x, t.at.z - z), target: t, crossing: false };
    const P = leg.points;
    // nearest point on the path
    let best = { d: Infinity, seg: 0, s: 0 };
    const cum = [0];
    for (let k = 1; k < P.length; k++) cum.push(cum[k - 1] + Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]));
    for (let k = 0; k + 1 < P.length; k++) {
      const [ax, az] = P[k], [bx, bz] = P[k + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2));
      const d = Math.hypot(x - ax - dx * u, z - az - dz * u);
      if (d < best.d) best = { d, seg: k, s: cum[k] + u * Math.sqrt(L2) };
    }
    const total = cum[cum.length - 1];
    const s = Math.min(total, best.s + (best.d > 20 ? 0 : ahead));
    let k = 0;
    while (k + 2 < P.length && cum[k + 1] < s) k++;
    const f = (s - cum[k]) / ((cum[k + 1] - cum[k]) || 1);
    const gx = P[k][0] + (P[k + 1][0] - P[k][0]) * f, gz = P[k][1] + (P[k + 1][1] - P[k][1]) * f;
    return { x: gx, z: gz, remaining: total - best.s + best.d, target: t, crossing: leg.crossings.includes(k + 1) };
  }

  // ---- postcards --------------------------------------------------------------------------------

  get postcardCount(): number { return Object.keys(this.state.postcards).length; }

  /**
   * Whether a photograph taken from (x, z) looking along `yaw` earns a postcard. Forgiving: anywhere
   * within the viewpoint's radius, with the subject within `tolerance` of the view direction and not
   * hidden behind a building.
   */
  checkCapture(x: number, z: number, yaw: number, eyeY: number, sight: Sight): CaptureCheck {
    const near = POSTCARDS.map((p) => ({ p, d: Math.hypot(x - p.at.x, z - p.at.z) })).sort((a, b) => a.d - b.d);
    const inRange = near.filter((n) => n.d <= n.p.radius);
    if (!inRange.length) return { ok: false, reason: 'far', nearest: near[0].p, distance: near[0].d };
    // of the postcards in range, the one best aligned with the view
    const scored = inRange.map((n) => ({ ...n, turn: wrap(bearing(x, z, n.p.subject.x, n.p.subject.z) - yaw) })).sort((a, b) => Math.abs(a.turn) - Math.abs(b.turn));
    const c = scored[0];
    if (Math.abs(c.turn) > c.p.tolerance) return { ok: false, reason: 'direction', postcard: c.p, turn: c.turn };
    if (sight.lineBlocked(x, eyeY, z, c.p.subject.x, c.p.subject.y, c.p.subject.z, c.p.subjectBuilding)) return { ok: false, reason: 'blocked', postcard: c.p };
    return { ok: true, postcard: c.p, retake: c.p.id in this.state.postcards };
  }

  /** Records a postcard and the lighting it was taken in (its image is stored separately). */
  award(id: string, time = Date.now(), light: LightMode = 'day'): void {
    this.state.postcards[id] = time;
    this.state.postcardLight[id] = light;
    this.changed();
  }

  /** Lighting a collected postcard was taken in (older postcards: daylight). */
  postcardLightOf(id: string): LightMode | null {
    return id in this.state.postcards ? this.state.postcardLight[id] ?? 'day' : null;
  }

  // ---- peaceful viewpoints -----------------------------------------------------------------------

  /** "Pause here": interface and guidance hidden while the visitor enjoys the view (not saved). */
  paused = false;

  /** The viewpoint the visitor is standing at (within its radius), if any. */
  viewpointAt(x: number, z: number): Viewpoint | null {
    for (const v of VIEWPOINTS) if (Math.hypot(x - v.at.x, z - v.at.z) <= v.radius) return v;
    return null;
  }

  /** Enters or leaves the pause. Nothing about the visitor's position or view changes. */
  setPaused(v: boolean): void {
    if (this.paused === v) return;
    this.paused = v;
    this.changed(false);
  }

  // ---- settings -----------------------------------------------------------------------------------

  setSound(k: keyof VisitState['sound'], v: boolean): void {
    this.state.sound[k] = v;
    this.changed();
  }

  setHidden(v: boolean): void {
    this.state.uiHidden = v;
    this.changed();
  }

  setSmooth(v: boolean): void {
    this.state.smooth = v;
    this.changed();
  }

  setGuide(v: boolean): void {
    this.state.guide = v;
    this.changed();
  }
}

/** Friendly direction for a turn (radians, positive = to the left). */
export function turnWords(turn: number): string {
  const deg = Math.round(Math.abs(turn) * 180 / Math.PI / 5) * 5;
  if (deg < 20) return 'just ahead';
  if (deg > 150) return 'behind you';
  return `${deg}° to your ${turn > 0 ? 'left' : 'right'}`;
}
