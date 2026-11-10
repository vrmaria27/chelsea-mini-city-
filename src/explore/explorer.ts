// Exploration state: which view is active, where the visitor stands at street level, the spot
// picked on the miniature, the selected landmark and the saved settings. No rendering or input
// code lives here, so the rules can be tested directly. Nothing runs on a timer.
import { DEFAULT_LANDMARK, LANDMARKS, landmarkById, type Landmark, type Viewpoint } from './landmarks';
import { NavField, type NavClass } from './nav';
import { SCALE_MAX, SCALE_MIN, loadPrefs, savePrefs, type ExplorerPrefs, type KeyValueStore, type LoadResult } from './prefs';

export type Mode = 'miniature' | 'street';

export interface Notice { text: string; kind: 'info' | 'warn' }

/** Result of a landmark selection: what the view layer should do. */
export type LandmarkResult =
  | { kind: 'street'; viewpoint: Viewpoint } // move to its validated viewpoint (fade)
  | { kind: 'highlight' } // show it on the miniature (outside the street-level area)
  | { kind: 'none' };

const REASONS: Record<Exclude<NavClass, 'ok'>, string> = {
  outside: 'Street level is limited to the area around Sloane Square.',
  building: 'That is inside a building. Choose the pavement or the square.',
  carriageway: 'That is the road. Choose the pavement or the square.',
  water: 'That is the fountain basin.',
  tree: 'A tree is in the way.',
  feature: 'Something is in the way there.',
  garden: 'Gardens are not part of the walkable area.',
  'not-public': 'That is not public pavement.',
};

export const ROT_STEP = Math.PI / 12; // 15° miniature rotation step
export const MAX_TELEPORT = 40; // metres per teleport (VR comfort; desktop clicks too)

export class Explorer {
  mode: Mode = 'miniature';
  /** Current street-level position and heading (yaw 0 = facing north). */
  street: Viewpoint;
  /** Spot chosen on the miniature for "Go to street level". */
  pick: Viewpoint;
  selected: Landmark | null = null;
  notice: Notice | null = null;
  readonly prefs: ExplorerPrefs;
  readonly loadStatus: LoadResult['status'];
  /** Increments on every change, for cheap redraw checks. */
  version = 0;
  private listeners: (() => void)[] = [];

  constructor(readonly nav: NavField, private store: KeyValueStore, reducedMotion = false) {
    const r = loadPrefs(store, (x, z) => nav.isWalkable(x, z), reducedMotion);
    this.prefs = r.prefs;
    this.loadStatus = r.status;
    const start = r.prefs.viewpoint ?? DEFAULT_LANDMARK.street!;
    this.street = { ...start };
    this.pick = { ...start };
  }

  subscribe(f: () => void): void {
    this.listeners.push(f);
  }

  private changed(save = false): void {
    this.version++;
    if (save) savePrefs(this.store, this.prefs);
    for (const f of this.listeners) f();
  }

  say(text: string, kind: Notice['kind'] = 'info'): void {
    this.notice = { text, kind };
    this.changed();
  }

  reason(x: number, z: number): string | null {
    const c = this.nav.classify(x, z);
    return c === 'ok' ? null : REASONS[c];
  }

  // ---- miniature --------------------------------------------------------------------------

  /** Chooses a street-level starting spot on the miniature. Keeps the previous one if invalid. */
  pickAt(x: number, z: number, yaw = this.pick.yaw): boolean {
    const why = this.reason(x, z);
    if (why) {
      this.say(why, 'warn');
      return false;
    }
    this.pick = { x, z, yaw };
    this.selected = null;
    this.say('Spot chosen. Choose “Go to street level” to stand there.');
    return true;
  }

  rotateMiniature(dir: 1 | -1): void {
    this.prefs.miniature.yaw = (this.prefs.miniature.yaw + dir * ROT_STEP) % (Math.PI * 2);
    this.changed(true);
  }

  scaleMiniature(up: boolean): void {
    const s = this.prefs.miniature.scale * (up ? 1.15 : 1 / 1.15);
    this.prefs.miniature.scale = +Math.min(SCALE_MAX, Math.max(SCALE_MIN, s)).toFixed(3);
    this.changed(true);
  }

  resetMiniature(): void {
    this.prefs.miniature = { yaw: 0, scale: 1 };
    this.changed(true);
  }

  // ---- street level -----------------------------------------------------------------------

  /** Enters street level at the picked spot (or a given validated viewpoint). */
  enterStreet(vp: Viewpoint = this.pick): boolean {
    if (!this.nav.isWalkable(vp.x, vp.z)) {
      this.say(this.reason(vp.x, vp.z) ?? 'That spot is not walkable.', 'warn');
      return false;
    }
    this.mode = 'street';
    this.street = { ...vp };
    this.prefs.viewpoint = { ...vp };
    this.notice = null;
    this.changed(true);
    return true;
  }

  toMiniature(): void {
    if (this.mode === 'miniature') return;
    this.mode = 'miniature';
    this.pick = { ...this.street };
    this.notice = null;
    this.changed(true);
  }

  /** Teleports to a target on a walkable surface within reach. */
  teleport(x: number, z: number, maxDist = MAX_TELEPORT): boolean {
    const why = this.reason(x, z);
    if (why) {
      this.say(why, 'warn');
      return false;
    }
    if (Math.hypot(x - this.street.x, z - this.street.z) > maxDist) {
      this.say('That is too far for one step. Choose somewhere closer.', 'warn');
      return false;
    }
    this.street = { ...this.street, x, z };
    this.prefs.viewpoint = { ...this.street };
    this.notice = null;
    this.changed(true);
    return true;
  }

  /** Snap turn (VR) or heading change (desktop). Positive turns left. */
  turn(rad: number, save = true): void {
    let y = (this.street.yaw + rad) % (Math.PI * 2);
    if (y > Math.PI) y -= Math.PI * 2;
    if (y < -Math.PI) y += Math.PI * 2;
    this.street = { ...this.street, yaw: y };
    this.prefs.viewpoint = { ...this.street };
    if (save) this.changed(true);
    else this.version++;
  }

  /**
   * Desktop walking: moves by (dx, dz) map metres, sliding along obstacles and never leaving a
   * walkable surface. Returns whether the position changed.
   */
  walk(dx: number, dz: number): boolean {
    const { x, z } = this.street;
    const tries: [number, number][] = [[dx, dz], [dx, 0], [0, dz]];
    for (const [ax, az] of tries) {
      if (ax === 0 && az === 0) continue;
      const nx = x + ax, nz = z + az;
      // keep a small clearance so the camera does not clip into façades
      if (this.nav.isWalkable(nx, nz) && this.nav.isWalkable(nx + Math.sign(ax) * 0.3, nz + Math.sign(az) * 0.3)) {
        this.street = { ...this.street, x: nx, z: nz };
        this.prefs.viewpoint = { ...this.street };
        this.version++;
        return true;
      }
    }
    return false;
  }

  /** Persists the current viewpoint (desktop walking saves when movement stops). */
  commit(): void {
    this.changed(true);
  }

  // ---- landmarks ----------------------------------------------------------------------------

  selectLandmark(id: string): LandmarkResult {
    const l = landmarkById(id);
    if (!l) return { kind: 'none' };
    this.selected = l;
    if (l.street && this.mode === 'street') {
      this.street = { ...l.street };
      this.prefs.viewpoint = { ...l.street };
      this.notice = null;
      this.changed(true);
      return { kind: 'street', viewpoint: l.street };
    }
    if (l.street) this.pick = { ...l.street };
    if (this.mode === 'street') {
      // outside the street-level area: show it on the miniature instead
      this.mode = 'miniature';
      this.notice = { text: `${l.name} is outside the street-level area, so it is shown on the miniature.`, kind: 'info' };
    } else this.notice = null;
    this.changed(this.mode === 'miniature');
    return { kind: 'highlight' };
  }

  clearSelection(): void {
    this.selected = null;
    this.changed();
  }

  // ---- settings -----------------------------------------------------------------------------

  setPref<K extends 'labels' | 'lowDetail' | 'reducedMotion' | 'seated'>(k: K, v: boolean): void {
    this.prefs[k] = v;
    this.changed(true);
  }

  setSnapTurn(deg: 30 | 45): void {
    this.prefs.snapTurnDeg = deg;
    this.changed(true);
  }

  static readonly landmarks = LANDMARKS;
}
