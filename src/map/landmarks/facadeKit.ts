// Façade kit for the Sloane Square perimeter reconstruction. Each building is described in its own
// code (see squareBuildings.ts) using these primitives in a frontage's local frame:
//   u: metres along the frontage (0 at the left end, seen from the street), y: metres up,
//   v: metres outward from the wall plane (positive = toward the street).
// Depth comes from geometry (projecting bays, surrounds, cornices, balconies, gables); window glass sits
// just in front of the wall with projecting surrounds, which reads as a recess at tabletop scale without
// cutting the wall. All dimensions are map metres.
import { MeshBuilder, hex, shade, type RGB } from '../../engine/geometry';

export type Pt = [number, number];

export const K = {
  redBrick: hex('#a8472f'),
  redBrickDark: hex('#94402c'),
  terracotta: hex('#b5573c'),
  terracottaDeep: hex('#9c4430'),
  beigeTerracotta: hex('#dcc6a2'),
  portland: hex('#e4dfcf'),
  portlandShade: hex('#d2cbb8'),
  stoneBand: hex('#ece7dc'),
  cream: hex('#ece3cf'),
  paint: hex('#e8e1d1'),
  yellowStock: hex('#c8b387'),
  brownBrick: hex('#5d4536'),
  slate: hex('#5a5f67'),
  slateDark: hex('#494d54'),
  lead: hex('#7b8188'),
  copper: hex('#6f8f84'),
  glass: hex('#2c3642'),
  glassLight: hex('#43505d'),
  frameWhite: hex('#f0ece2'),
  black: hex('#24272b'),
  ironBlack: hex('#1f2226'),
  granitePink: hex('#8c4a45'),
  graniteGrey: hex('#6d6e70'),
  concrete: hex('#c9c7c0'),
  whitePaint: hex('#f2f0ea'),
  curtainFrame: hex('#d7d8d6'),
  curtainGlass: hex('#55636d'),
  navy: hex('#22305a'),
  maroon: hex('#6c1f2b'),
  green: hex('#1e6a55'),
  gold: hex('#c8a24b'),
  chimney: hex('#9c4a35'),
  roofTile: hex('#8b4a3a'),
};

export interface Front {
  /** Left end (seen from outside) and right end of the frontage, map x/z. */
  a: Pt;
  b: Pt;
  len: number;
  /** Unit vector along the frontage (left → right as seen from outside). */
  t: Pt;
  /** Outward unit normal. */
  n: Pt;
}

const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];

function pointInRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** All edges of a footprint ring as outward-facing fronts (in ring order). */
export function edgesOf(ring: number[]): Front[] {
  const n = ring.length / 2;
  const out: Front[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    let a: Pt = [ring[i * 2], ring[i * 2 + 1]], b: Pt = [ring[j * 2], ring[j * 2 + 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.05) continue;
    let nrm: Pt = [(b[1] - a[1]) / len, -(b[0] - a[0]) / len];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    if (pointInRing(mx + nrm[0] * 0.3, mz + nrm[1] * 0.3, ring)) nrm = [-nrm[0], -nrm[1]];
    // t must equal (nz, -nx) so quads face outward
    const t: Pt = [nrm[1], -nrm[0]];
    if ((b[0] - a[0]) * t[0] + (b[1] - a[1]) * t[1] < 0) [a, b] = [b, a];
    out.push({ a, b, len, t, n: nrm });
  }
  return out;
}

/** Merge consecutive nearly collinear edges (within maxTurn radians) into longer fronts. */
export function mergeFronts(fs: Front[], maxTurn = 0.12, maxDev = Infinity): Front[] {
  const out: Front[] = [];
  const verts: Pt[][] = []; // the original corner points inside each merged front
  for (const f of fs) {
    const last = out[out.length - 1];
    const dot = last ? last.n[0] * f.n[0] + last.n[1] * f.n[1] : 0;
    if (last && Math.acos(Math.min(1, dot)) < maxTurn && Math.hypot(last.b[0] - f.a[0], last.b[1] - f.a[1]) < 0.3) {
      const b = f.b, a = last.a;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const t: Pt = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      // a curved run of edges is not one flat front: keep every corner within maxDev of the chord
      const inner = [...verts[verts.length - 1], f.a];
      const dev = Math.max(...inner.map((p) => Math.abs((p[0] - a[0]) * t[1] - (p[1] - a[1]) * t[0])));
      if (dev <= maxDev) { out[out.length - 1] = { a, b, len, t, n: [-t[1], t[0]] }; verts[verts.length - 1] = inner; continue; }
    }
    out.push({ ...f }); verts.push([]);
  }
  return out;
}

/** Local-frame drawing helper for one frontage. */
export class F {
  constructor(readonly b: MeshBuilder, public f: Front) {}
  get len(): number { return this.f.len; }
  P(u: number, y: number, v = 0): number[] {
    const { a, t, n } = this.f;
    return [a[0] + t[0] * u + n[0] * v, y, a[1] + t[1] * u + n[1] * v];
  }
  /** Vertical rectangle on plane v, facing outward. */
  wall(u0: number, u1: number, y0: number, y1: number, col: RGB, v = 0): void {
    this.b.quad(this.P(u0, y0, v), this.P(u1, y0, v), this.P(u1, y1, v), this.P(u0, y1, v), col);
  }
  /** Oriented box (front, top, sides; bottom optional for overhangs). */
  box(u0: number, u1: number, y0: number, y1: number, v0: number, v1: number, col: RGB, bottom = false, sides = true): void {
    const P = this.P.bind(this);
    this.b.quad(P(u0, y0, v1), P(u1, y0, v1), P(u1, y1, v1), P(u0, y1, v1), col);
    this.b.quad(P(u0, y1, v1), P(u1, y1, v1), P(u1, y1, v0), P(u0, y1, v0), shade(col, 1.04));
    if (sides) {
      this.b.quad(P(u0, y0, v0), P(u0, y0, v1), P(u0, y1, v1), P(u0, y1, v0), shade(col, 0.9));
      this.b.quad(P(u1, y0, v1), P(u1, y0, v0), P(u1, y1, v0), P(u1, y1, v1), shade(col, 0.9));
    }
    if (bottom) this.b.quad(P(u0, y0, v0), P(u1, y0, v0), P(u1, y0, v1), P(u0, y0, v1), shade(col, 0.7));
  }
  /** Horizontal band/string course across [u0, u1]. */
  band(y0: number, y1: number, col: RGB, depth = 0.08, u0 = 0, u1 = this.len): void {
    this.box(u0, u1, y0, y1, 0, depth, col, depth > 0.15);
  }
  /** Cornice: stepped projecting moulding. */
  cornice(y: number, col: RGB, depth = 0.45, h = 0.5, u0 = -0.05, u1 = this.len + 0.05): void {
    this.box(u0, u1, y, y + h * 0.45, 0, depth * 0.55, shade(col, 0.95), true);
    this.box(u0 - 0.05, u1 + 0.05, y + h * 0.45, y + h, 0, depth, col, true);
  }
  /** Window: glass with projecting surround, sill and optional arched or segmental head. */
  window(uc: number, y0: number, w: number, h: number, o: { frame?: RGB; glass?: RGB; head?: 'flat' | 'round' | 'segment' | 'pediment' | 'pointed' | 'none'; depth?: number; bars?: number; sill?: boolean; keystone?: RGB; frameW?: number; base?: number } = {}): void {
    if (o.base) { const saved = this.f; this.f = { ...saved, a: [saved.a[0] + saved.n[0] * o.base, saved.a[1] + saved.n[1] * o.base] }; try { this.window(uc, y0, w, h, { ...o, base: 0 }); } finally { this.f = saved; } return; }
    const fr = o.frame ?? K.frameWhite, gl = o.glass ?? K.glass;
    const d = o.depth ?? 0.12, fw = o.frameW ?? 0.14;
    const u0 = uc - w / 2, u1 = uc + w / 2;
    const head = o.head ?? 'flat';
    const archH = head === 'round' ? w / 2 : head === 'pointed' ? w * 0.8 : head === 'segment' ? w * 0.18 : 0;
    const yr = y0 + h - archH; // spring line
    // glass (rectangular part) and arch fill
    this.wall(u0, u1, y0, yr, gl, 0.02);
    if (archH > 0) this.arch(uc, yr, w / 2, archH, gl, 0.02);
    // glazing bars (vertical mullion count) for sashes
    const bars = o.bars ?? 1;
    for (let k = 1; k <= bars; k++) {
      const u = u0 + (w * k) / (bars + 1);
      this.box(u - 0.03, u + 0.03, y0, yr, 0.02, 0.05, fr, false, false);
    }
    this.box(u0, u1, y0 + (yr - y0) * 0.55, y0 + (yr - y0) * 0.55 + 0.06, 0.02, 0.05, fr, false, false); // meeting rail
    // surround
    this.box(u0 - fw, u0, y0, yr, 0, d, fr);
    this.box(u1, u1 + fw, y0, yr, 0, d, fr);
    if (head === 'flat' || head === 'none') { if (head === 'flat') this.box(u0 - fw, u1 + fw, yr, yr + fw * 1.4, 0, d * 1.1, fr); }
    else if (head === 'pediment') { this.box(u0 - fw, u1 + fw, yr, yr + 0.18, 0, d * 1.2, fr); this.pediment(uc, yr + 0.18, w + fw * 2.6, 0.45, fr, d * 1.2); }
    else this.archRing(uc, yr, w / 2, archH, fw, d, fr);
    if (o.keystone) this.box(uc - 0.12, uc + 0.12, y0 + h - 0.1, y0 + h + 0.3, 0, d * 1.3, o.keystone);
    if (o.sill !== false) this.box(u0 - fw * 1.3, u1 + fw * 1.3, y0 - 0.12, y0, 0, d * 1.5, shade(fr, 0.95));
  }
  /** Filled half-ellipse (arch head) facing outward. */
  arch(uc: number, y: number, rx: number, ry: number, col: RGB, v = 0, seg = 8): void {
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI - (i / seg) * Math.PI, a1 = Math.PI - ((i + 1) / seg) * Math.PI;
      this.b.tri(this.P(uc, y, v), this.P(uc + Math.cos(a0) * rx, y + Math.sin(a0) * ry, v), this.P(uc + Math.cos(a1) * rx, y + Math.sin(a1) * ry, v), col);
    }
  }
  /** Projecting arch ring (voussoirs) around an arch head. */
  archRing(uc: number, y: number, rx: number, ry: number, w: number, d: number, col: RGB, seg = 8): void {
    for (let i = 0; i < seg; i++) {
      const a0 = Math.PI - (i / seg) * Math.PI, a1 = Math.PI - ((i + 1) / seg) * Math.PI;
      const p = (a: number, r: number, rr: number) => [uc + Math.cos(a) * r, y + Math.sin(a) * rr];
      const [x0, y0] = p(a0, rx, ry), [x1, y1] = p(a1, rx, ry), [X0, Y0] = p(a0, rx + w, ry + w), [X1, Y1] = p(a1, rx + w, ry + w);
      this.b.quad(this.P(x0, y0, d), this.P(x1, y1, d), this.P(X1, Y1, d), this.P(X0, Y0, d), col);
      this.b.quad(this.P(X0, Y0, d), this.P(X1, Y1, d), this.P(X1, Y1, 0), this.P(X0, Y0, 0), shade(col, 1.05));
    }
  }
  /** Triangular pediment (face + raking top) with base width w and height h. */
  pediment(uc: number, y: number, w: number, h: number, col: RGB, d = 0.25): void {
    const L = this.P(uc - w / 2, y, d), R = this.P(uc + w / 2, y, d), T = this.P(uc, y + h, d);
    this.b.tri(L, R, T, col);
    const L0 = this.P(uc - w / 2, y, 0), R0 = this.P(uc + w / 2, y, 0), T0 = this.P(uc, y + h, 0);
    this.b.quad(L, T, T0, L0, shade(col, 1.06));
    this.b.quad(T, R, R0, T0, shade(col, 1.0));
  }
  /** Segmental (cambered) pediment: a shallow arch-topped panel. */
  segPediment(uc: number, y: number, w: number, h: number, col: RGB, fill: RGB, d = 0.3): void {
    this.box(uc - w / 2, uc + w / 2, y, y + 0.15, 0, d, col);
    this.arch(uc, y + 0.15, w / 2 - 0.15, h - 0.3, fill, d * 0.6, 10);
    this.archRing(uc, y + 0.15, w / 2 - 0.2, h - 0.35, 0.2, d, col, 10);
  }
  /** Gable above the eaves: 'triangle', 'dutch' (curved stepped shoulders + pediment top) or 'segment'. */
  gable(uc: number, y: number, w: number, h: number, col: RGB, trim: RGB, style: 'triangle' | 'dutch' | 'segment' | 'stepped' = 'dutch', depth = 0.35, back = -0.6): void {
    const prof: Pt[] = [];
    if (style === 'triangle') prof.push([-w / 2, 0], [0, h], [w / 2, 0]);
    else if (style === 'segment') { for (let i = 0; i <= 10; i++) { const a = Math.PI - (i / 10) * Math.PI; prof.push([Math.cos(a) * w / 2, Math.sin(a) * h]); } }
    else if (style === 'stepped') prof.push([-w / 2, 0], [-w / 2, h * 0.45], [-w * 0.3, h * 0.45], [-w * 0.3, h * 0.8], [-w * 0.12, h * 0.8], [0, h], [w * 0.12, h * 0.8], [w * 0.3, h * 0.8], [w * 0.3, h * 0.45], [w / 2, h * 0.45], [w / 2, 0]);
    else {
      // Dutch: concave shoulders rising to a narrow upper stage with a small pediment
      const sw = w * 0.3;
      prof.push([-w / 2, 0]);
      for (let i = 1; i <= 4; i++) { const t = i / 4; prof.push([-w / 2 + (w / 2 - sw) * (1 - Math.cos(t * Math.PI / 2)), h * 0.62 * Math.sin(t * Math.PI / 2)]); }
      prof.push([-sw, h * 0.82], [0, h], [sw, h * 0.82]);
      for (let i = 4; i >= 1; i--) { const t = i / 4; prof.push([w / 2 - (w / 2 - sw) * (1 - Math.cos(t * Math.PI / 2)), h * 0.62 * Math.sin(t * Math.PI / 2)]); }
      prof.push([w / 2, 0]);
    }
    // fan from the base centre, front and back faces, coping along the profile
    for (let i = 0; i + 1 < prof.length; i++) {
      const p = prof[i], q = prof[i + 1];
      this.b.tri(this.P(uc, y, depth), this.P(uc + p[0], y + p[1], depth), this.P(uc + q[0], y + q[1], depth), col);
      this.b.tri(this.P(uc, y, back), this.P(uc + q[0], y + q[1], back), this.P(uc + p[0], y + p[1], back), shade(col, 0.85));
      this.b.quad(this.P(uc + p[0], y + p[1], depth + 0.06), this.P(uc + q[0], y + q[1], depth + 0.06), this.P(uc + q[0], y + q[1], back - 0.05), this.P(uc + p[0], y + p[1], back - 0.05), trim);
    }
  }
  /** Projecting bay: 'canted' (three faces), 'box' or 'bow' (curved), from y0 to y1 with windows. */
  bay(uc: number, w: number, y0: number, y1: number, depth: number, shape: 'canted' | 'box' | 'bow', col: RGB, storeys: number, winCol: RGB = K.frameWhite, roof: RGB | null = K.lead): void {
    const pts: Pt[] = [];
    if (shape === 'box') pts.push([uc - w / 2, 0], [uc - w / 2, depth], [uc + w / 2, depth], [uc + w / 2, 0]);
    else if (shape === 'canted') pts.push([uc - w / 2, 0], [uc - w * 0.32, depth], [uc + w * 0.32, depth], [uc + w / 2, 0]);
    else for (let i = 0; i <= 6; i++) { const a = Math.PI - (i / 6) * Math.PI; pts.push([uc + Math.cos(a) * w / 2, Math.sin(a) * depth]); }
    const sh = (y1 - y0) / storeys;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ua, va] = pts[i], [ub, vb] = pts[i + 1];
      const A = (y: number) => this.P(ua, y, va), B = (y: number) => this.P(ub, y, vb);
      this.b.quad(A(y0), B(y0), B(y1), A(y1), col);
      // windows on each face, per storey (glass panel slightly proud of the face)
      const fl = Math.hypot(ub - ua, vb - va);
      if (fl > 0.5) for (let s = 0; s < storeys; s++) {
        const ys = y0 + s * sh + sh * 0.18, ye = y0 + s * sh + sh * 0.82;
        const m = 0.14 / fl;
        const u0 = ua + (ub - ua) * m, u1 = ub - (ub - ua) * m, v0 = va + (vb - va) * m, v1 = vb - (vb - va) * m;
        // outward normal of this face in the (u, v) plane, for a glass panel just proud of it
        const nu = -(vb - va) / fl, nv = (ub - ua) / fl, off = 0.03;
        const Q = (u: number, v: number, y: number) => this.P(u + nu * off, y, v + nv * off);
        this.b.quad(Q(u0, v0, ys), Q(u1, v1, ys), Q(u1, v1, ye), Q(u0, v0, ye), K.glass);
        this.b.quad(Q(u0, v0, ys - 0.1), Q(u1, v1, ys - 0.1), Q(u1, v1, ys), Q(u0, v0, ys), winCol);
      }
    }
    // roof cap / floor plate
    if (roof) {
      const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0] as Pt);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ua, va] = pts[i], [ub, vb] = pts[i + 1];
        this.b.tri(this.P(c[0], y1 + 0.35, c[1] * 0.5), this.P(ub, y1, vb), this.P(ua, y1, va), roof);
      }
    }
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ua, va] = pts[i], [ub, vb] = pts[i + 1];
      this.b.quad(this.P(ua, y0, va), this.P(ua, y0, 0), this.P(ub, y0, 0), this.P(ub, y0, vb), shade(col, 0.7));
    }
  }
  /** Engaged column or pilaster from y0 to y1 with simple capital and base. */
  column(uc: number, y0: number, y1: number, w: number, col: RGB, d = 0.3, round = true): void {
    if (round) {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI, a1 = ((i + 1) / n) * Math.PI;
        const p = (a: number, y: number) => this.P(uc + Math.cos(a) * w / 2, y, Math.sin(a) * d);
        this.b.quad(p(a1, y0), p(a0, y0), p(a0, y1), p(a1, y1), col);
      }
    } else this.box(uc - w / 2, uc + w / 2, y0, y1, 0, d, col);
    this.box(uc - w * 0.75, uc + w * 0.75, y1 - 0.01, y1 + 0.3, 0, d + 0.12, shade(col, 1.03));
    this.box(uc - w * 0.7, uc + w * 0.7, y0, y0 + 0.25, 0, d + 0.1, shade(col, 0.96));
  }
  /** Balustrade (rail, plinth and balusters) along [u0, u1] at y. */
  balustrade(u0: number, u1: number, y: number, h: number, col: RGB, v0 = 0, v1 = 0.35): void {
    this.box(u0, u1, y, y + 0.12, v0, v1, col);
    this.box(u0, u1, y + h - 0.14, y + h, v0 - 0.02, v1 + 0.02, col);
    const n = Math.max(2, Math.floor((u1 - u0) / 0.32));
    for (let i = 0; i < n; i++) {
      const u = u0 + ((i + 0.5) * (u1 - u0)) / n;
      this.box(u - 0.06, u + 0.06, y + 0.12, y + h - 0.14, v0 + 0.08, v1 - 0.08, col, false, false);
    }
  }
  /** Iron balcony railing (flat face) with a floor slab. */
  railing(u0: number, u1: number, y: number, depth = 0.5, h = 0.9): void {
    this.box(u0, u1, y - 0.12, y, 0, depth, K.portlandShade, true);
    this.box(u0, u1, y + h - 0.05, y + h, depth - 0.05, depth, K.ironBlack, false);
    // balusters: a single front quad each (no sides) — they are 4 cm wide
    const n = Math.max(2, Math.floor((u1 - u0) / 0.4));
    for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n; this.wall(u - 0.025, u + 0.025, y, y + h, K.ironBlack, depth - 0.02); }
  }
  /** Fabric awning projecting from y, dropping `drop`, reaching `reach`. */
  awning(u0: number, u1: number, y: number, drop: number, reach: number, col: RGB, valance: RGB = col): void {
    const P = this.P.bind(this);
    this.b.quad(P(u0, y - drop, reach), P(u1, y - drop, reach), P(u1, y, 0.05), P(u0, y, 0.05), col);
    this.b.quad(P(u1, y - drop, reach), P(u0, y - drop, reach), P(u0, y, 0.05), P(u1, y, 0.05), shade(col, 0.6)); // underside
    this.box(u0, u1, y - drop - 0.35, y - drop, reach - 0.04, reach, valance, false, false);
    this.b.tri(P(u0, y, 0.05), P(u0, y - drop, reach), P(u0, y - drop - 0.35, reach), shade(col, 0.8));
    this.b.tri(P(u1, y - drop - 0.35, reach), P(u1, y - drop, reach), P(u1, y, 0.05), shade(col, 0.8));
  }
  /** Shopfront: glazing between pilasters with stall riser and fascia. */
  shopfront(u0: number, u1: number, h: number, o: { pilaster: RGB; fascia: RGB; riser?: RGB; glass?: RGB; bays?: number; pilW?: number; fasciaH?: number; door?: number; y?: number }): void {
    const y = o.y ?? 0;
    const pw = o.pilW ?? 0.45, fh = o.fasciaH ?? 0.75, bays = o.bays ?? 2;
    const gl = o.glass ?? K.glassLight;
    this.wall(u0, u1, y, y + h - fh, shade(gl, 0.9), 0.01);
    this.box(u0, u1, y, y + 0.55, 0, 0.12, o.riser ?? o.pilaster);
    const bw = (u1 - u0) / bays;
    for (let i = 0; i <= bays; i++) { const u = u0 + i * bw; this.box(u - pw / 2, u + pw / 2, y, y + h - fh, 0, 0.22, o.pilaster); }
    for (let i = 0; i < bays; i++) { const uc = u0 + (i + 0.5) * bw; this.box(uc - 0.04, uc + 0.04, y + 0.55, y + h - fh, 0.01, 0.06, K.black, false, false); this.box(u0 + i * bw, u0 + (i + 1) * bw, y + h - fh - 0.85, y + h - fh - 0.8, 0.01, 0.05, K.black, false, false); }
    if (o.door != null) this.wall(o.door - 0.55, o.door + 0.55, y, y + 2.6, K.black, 0.03);
    this.box(u0 - 0.1, u1 + 0.1, y + h - fh, y + h, 0, 0.3, o.fascia, true);
  }
}

// ---- world-space pieces (turrets, chimneys, domes) ------------------------------------------------

/** Regular n-gon prism centred at (x, z). */
export function prismAt(b: MeshBuilder, x: number, z: number, r: number, y0: number, y1: number, n: number, col: RGB, rot = 0, top = true): void {
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i / n) * Math.PI * 2, a1 = rot + ((i + 1) / n) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * r, z + Math.sin(a0) * r], p1 = [x + Math.cos(a1) * r, z + Math.sin(a1) * r];
    b.quad([p1[0], y0, p1[1]], [p0[0], y0, p0[1]], [p0[0], y1, p0[1]], [p1[0], y1, p1[1]], i % 2 ? col : shade(col, 0.94));
    if (top) b.tri([x, y1, z], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], shade(col, 1.05));
  }
}

/** Surface of revolution from [r, y] pairs (dome, cupola, finial). */
export function latheAt(b: MeshBuilder, x: number, z: number, prof: [number, number][], n: number, col: RGB | ((k: number) => RGB)): void {
  for (let k = 0; k + 1 < prof.length; k++) {
    const [r0, y0] = prof[k], [r1, y1] = prof[k + 1];
    const c = typeof col === 'function' ? col(k) : col;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p = (r: number, a: number, y: number) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
      b.quad(p(r0, a1, y0), p(r0, a0, y0), p(r1, a0, y1), p(r1, a1, y1), c);
    }
  }
}

/** Turret with banded shaft, open/glazed stage and lead cupola with finial. */
export function turret(b: MeshBuilder, x: number, z: number, r: number, y0: number, y1: number, o: { body: RGB; band?: RGB; bands?: number; cupola?: RGB; cupolaH?: number; sides?: number; lantern?: boolean; spire?: boolean }): void {
  const n = o.sides ?? 8;
  const bands = o.bands ?? 0;
  if (bands && o.band) {
    const h = (y1 - y0) / (bands * 2);
    for (let i = 0; i < bands * 2; i++) prismAt(b, x, z, r, y0 + i * h, y0 + (i + 1) * h, n, i % 2 ? o.band : o.body, Math.PI / n, false);
  } else prismAt(b, x, z, r, y0, y1, n, o.body, Math.PI / n, false);
  prismAt(b, x, z, r * 1.12, y1, y1 + 0.35, n, o.band ?? shade(o.body, 1.1), Math.PI / n); // cornice
  let y = y1 + 0.35;
  if (o.lantern) {
    // open stage: corner posts and a dark core
    prismAt(b, x, z, r * 0.62, y, y + 1.8, n, K.glass, Math.PI / n, false);
    for (let i = 0; i < n; i += 2) { const a = Math.PI / n + (i / n) * Math.PI * 2; prismAt(b, x + Math.cos(a) * r * 0.82, z + Math.sin(a) * r * 0.82, 0.12, y, y + 1.8, 4, o.band ?? o.body); }
    prismAt(b, x, z, r * 1.0, y + 1.8, y + 2.05, n, o.band ?? o.body, Math.PI / n);
    y += 2.05;
  }
  const ch = o.cupolaH ?? r * 1.6;
  if (o.spire) latheAt(b, x, z, [[r * 0.9, y], [r * 0.55, y + ch * 0.35], [r * 0.25, y + ch * 0.75], [0.04, y + ch], [0.0, y + ch + 0.6]], n, o.cupola ?? K.lead);
  else latheAt(b, x, z, [[r * 0.95, y], [r * 0.9, y + ch * 0.25], [r * 0.7, y + ch * 0.6], [r * 0.3, y + ch * 0.9], [0.06, y + ch], [0.08, y + ch + 0.5], [0.0, y + ch + 0.9]], n, o.cupola ?? K.lead);
}

/** Chimney stack with pots. */
export function chimney(b: MeshBuilder, x: number, z: number, w: number, d: number, y0: number, y1: number, col: RGB = K.chimney, yaw = 0, pots = 3): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const m = new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, 0, z, 1]);
  b.setTransform(m);
  b.box(-w / 2, y0, -d / 2, w / 2, y1, d / 2, col);
  b.box(-w / 2 - 0.12, y1 - 0.35, -d / 2 - 0.12, w / 2 + 0.12, y1 - 0.15, d / 2 + 0.12, shade(col, 1.1));
  for (let i = 0; i < pots; i++) { const px = -w / 2 + ((i + 0.5) * w) / pots; b.box(px - 0.14, y1, -0.14, px + 0.14, y1 + 0.55, 0.14, hex('#b0623f')); }
  b.setTransform(null);
}

export const toPts = (flat: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
export const ringCentroid = (flat: number[]): Pt => { const p = toPts(flat); return p.reduce((s, q) => [s[0] + q[0] / p.length, s[1] + q[1] / p.length], [0, 0] as Pt); };
export { sub };
