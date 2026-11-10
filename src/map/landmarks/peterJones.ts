// Custom landmark model: Peter Jones department store, Sloane Square (Grade II*, 1936–39,
// W. Crabtree with Slater & Moberly and C. H. Reilly). Built in map metres on the real OSM
// footprint (way 28682626) and upper part (way 532097395). See README "Peter Jones model" for
// the references used and which details are observed vs approximated.
import { MeshBuilder, hex, type RGB } from '../../engine/geometry';
import { UI_FONT } from '../../engine/text';

export interface LandmarkModelData {
  id: string;
  ring: number[];
  ringTris: number[];
  facade: number[]; // King's Road → curved corner → Sloane Square, outline order
  recessRing: number[];
  recessTris: number[];
  upperRing: number[];
  upperTris: number[];
}

// ---- Dimensions (metres) -------------------------------------------------------------------
// Panel 965 × 1245 mm (supplied); one storey = 3 panels high (spandrel + 2 glazed), as seen in photos.
const PANEL_W = 0.965;
const PANEL_H = 1.245;
const ROW_H = PANEL_H * 3;
const ROWS = 5; // window rows visible above the canopy in all four reference photos
const SHOP_TOP = 4.6;
const CANOPY_TOP = 5.8;
export const CW_TOP = CANOPY_TOP + ROWS * ROW_H; // ≈ 24.5 m
const SLAB_LOW = CW_TOP + 1.0; // slab underside over King's Road (narrow glazing beneath)
const SLAB_HIGH = CW_TOP + 3.7; // slab underside over the corner and Sloane Square (full recessed storey)
const SLAB_T = 1.0; // thick white "eyebrow" (photo 1)
const RECESS_TOP = SLAB_HIGH + SLAB_T;
export const UPPER_TOP = RECESS_TOP + 3.6; // white upper storey with the rounded drum
const TOWER_TOP = UPPER_TOP - 1.2;

// Positions along the facade (arc length from the King's Road end, metres). The curve itself
// starts at s≈74.5 and ends at s≈97 in the OSM outline.
const TOWER = [38.5, 44.5]; // white stair tower dividing the 1930s corner block from the extension (approx.)
const SLAB_RISE = [60, 80]; // the S-shaped sweep of the top slab (photos 1, 3, 4)
const SIGN_SPAN = [74, 98]; // "PETER JONES & PARTNERS" on the canopy band around the curve (photos 1, 4)
const LETTERS_SPAN = [100, 116]; // "PETER JONES" letters on spandrel panels, Sloane Square face (photo 3, listing)

const C = {
  mullion: hex('#c9a95e'), // gold/bronze mullions after restoration (photos 1, 4)
  transom: hex('#d6c28d'),
  spandrel: hex('#dfe8e6'), // pale blue-white panels
  glass: hex('#4c6575'),
  sky: hex('#9db6c3'),
  slab: hex('#f2f0ea'),
  white: hex('#ece9e1'),
  canopy: hex('#2e3237'),
  bronze: hex('#b89452'),
  shop: hex('#38434d'),
  shopLit: hex('#c9bda2'),
  railing: hex('#2a2d31'),
  roof: hex('#a7abaf'),
  back: hex('#e6dfcf'),
  backWin: hex('#56636e'),
  extSpandrel: hex('#e6dfcd'), // the more muted King's Road extension
  extGlass: hex('#66757f'),
  extMullion: hex('#b9b09b'),
};

type P2 = [number, number];
const pairs = (f: number[]): P2[] => { const o: P2[] = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };

/**
 * Arc-length parameterised facade with outward normals (outline order: outward = left of travel).
 * The OSM line is resampled every 0.5 m and its tangents are averaged over ±1.5 m, so offsets
 * (canopy, slab) stay smooth without moving the line itself.
 */
class Facade {
  pts: P2[] = [];
  tan: P2[] = [];
  length: number;
  private step = 0.5;
  constructor(flatPts: number[]) {
    const src = pairs(flatPts);
    const cum = [0];
    for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]));
    this.length = cum[cum.length - 1];
    const n = Math.max(2, Math.ceil(this.length / this.step) + 1);
    let j = 1;
    for (let k = 0; k < n; k++) {
      const s = (k / (n - 1)) * this.length;
      while (j < cum.length - 1 && cum[j] < s) j++;
      const t = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1);
      this.pts.push([src[j - 1][0] + (src[j][0] - src[j - 1][0]) * t, src[j - 1][1] + (src[j][1] - src[j - 1][1]) * t]);
    }
    this.step = this.length / (n - 1);
    const w = Math.max(1, Math.round(1.5 / this.step));
    for (let k = 0; k < n; k++) {
      const a = this.pts[Math.max(0, k - w)], b = this.pts[Math.min(n - 1, k + w)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      this.tan.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
    }
  }
  /** Point, unit tangent and outward normal at arc length s. */
  at(s: number): { x: number; z: number; tx: number; tz: number; nx: number; nz: number } {
    s = Math.max(0, Math.min(this.length, s));
    const f = s / this.step;
    const k = Math.min(this.pts.length - 2, Math.floor(f));
    const t = f - k;
    const a = this.pts[k], b = this.pts[k + 1], ta = this.tan[k], tb = this.tan[k + 1];
    let tx = ta[0] + (tb[0] - ta[0]) * t, tz = ta[1] + (tb[1] - ta[1]) * t;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return { x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, tx, tz, nx: -tz, nz: tx };
  }
  /** Sample positions from s0 to s1 every `step` (always including both ends). */
  samples(s0: number, s1: number, step: number): number[] {
    const out: number[] = [];
    for (let s = s0; s < s1 - 1e-6; s += step) out.push(s);
    out.push(s1);
    return out;
  }
}

const smooth = (t: number) => t * t * (3 - 2 * t);
function slabUnder(s: number): number {
  const k = Math.max(0, Math.min(1, (s - SLAB_RISE[0]) / (SLAB_RISE[1] - SLAB_RISE[0])));
  return SLAB_LOW + (SLAB_HIGH - SLAB_LOW) * smooth(k);
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Vertical strip along the facade between s0..s1 at outward offset o, from y0 to y1 (may vary with s). */
function strip(b: MeshBuilder, f: Facade, s0: number, s1: number, o: number, y0: number | ((s: number) => number), y1: number | ((s: number) => number), col: RGB, step = 0.75, inward = false): void {
  const Y0 = typeof y0 === 'number' ? () => y0 : y0, Y1 = typeof y1 === 'number' ? () => y1 : y1;
  const ss = f.samples(s0, s1, step);
  for (let i = 0; i + 1 < ss.length; i++) {
    const p = f.at(ss[i]), q = f.at(ss[i + 1]);
    const a = [p.x + p.nx * o, p.z + p.nz * o], c = [q.x + q.nx * o, q.z + q.nz * o];
    const ya0 = Y0(ss[i]), ya1 = Y1(ss[i]), yb0 = Y0(ss[i + 1]), yb1 = Y1(ss[i + 1]);
    if (ya1 - ya0 < 0.01 && yb1 - yb0 < 0.01) continue;
    if (!inward) b.quad([a[0], ya0, a[1]], [c[0], yb0, c[1]], [c[0], yb1, c[1]], [a[0], ya1, a[1]], col);
    else b.quad([c[0], yb0, c[1]], [a[0], ya0, a[1]], [a[0], ya1, a[1]], [c[0], yb1, c[1]], col);
  }
}

/** Horizontal band (top face up, or bottom face down) between offsets o0 < o1 at height y(s). */
function band(b: MeshBuilder, f: Facade, s0: number, s1: number, o0: number, o1: number, y: number | ((s: number) => number), col: RGB, down = false, step = 0.75): void {
  const Y = typeof y === 'number' ? () => y : y;
  const ss = f.samples(s0, s1, step);
  for (let i = 0; i + 1 < ss.length; i++) {
    const p = f.at(ss[i]), q = f.at(ss[i + 1]);
    const ya = Y(ss[i]), yb = Y(ss[i + 1]);
    const pi = [p.x + p.nx * o0, ya, p.z + p.nz * o0], po = [p.x + p.nx * o1, ya, p.z + p.nz * o1];
    const qi = [q.x + q.nx * o0, yb, q.z + q.nz * o0], qo = [q.x + q.nx * o1, yb, q.z + q.nz * o1];
    // (pi → qi → qo → po) faces up when outward is left of travel
    if (!down) b.quad(pi, qi, qo, po, col);
    else b.quad(pi, po, qo, qi, col);
  }
}

/** A box-section fin (mullion / pier) standing proud of the facade at arc length s. */
function fin(b: MeshBuilder, f: Facade, s: number, width: number, depth: number, y0: number, y1: number, col: RGB, o = 0): void {
  const p = f.at(s);
  const hw = width / 2;
  const L = [p.x - p.tx * hw + p.nx * o, p.z - p.tz * hw + p.nz * o], R = [p.x + p.tx * hw + p.nx * o, p.z + p.tz * hw + p.nz * o];
  const Lf = [L[0] + p.nx * depth, L[1] + p.nz * depth], Rf = [R[0] + p.nx * depth, R[1] + p.nz * depth];
  b.quad([Lf[0], y0, Lf[1]], [Rf[0], y0, Rf[1]], [Rf[0], y1, Rf[1]], [Lf[0], y1, Lf[1]], col); // front
  b.quad([L[0], y0, L[1]], [Lf[0], y0, Lf[1]], [Lf[0], y1, Lf[1]], [L[0], y1, L[1]], col); // left side
  b.quad([Rf[0], y0, Rf[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [Rf[0], y1, Rf[1]], col); // right side
}

/** Extruded walls along an open polyline (outline order), outward = left of travel. */
function walls(b: MeshBuilder, pts: P2[], y0: number, y1: number, col: RGB): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1];
    b.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], col);
  }
}

function ringArea(r: P2[]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

function flat(b: MeshBuilder, tris: number[], y: number, col: RGB): void {
  for (let i = 0; i + 5 < tris.length; i += 6) b.tri([tris[i], y, tris[i + 1]], [tris[i + 2], y, tris[i + 3]], [tris[i + 4], y, tris[i + 5]], col);
}

/** Railing: thin top rail plus posts, following a polyline at height y. */
function railing(b: MeshBuilder, pts: { x: number; z: number }[], y: number, h = 1.1): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1];
    const quad = (y0: number, y1: number) => {
      b.quad([a.x, y0, a.z], [c.x, y0, c.z], [c.x, y1, c.z], [a.x, y1, a.z], C.railing);
      b.quad([c.x, y0, c.z], [a.x, y0, a.z], [a.x, y1, a.z], [c.x, y1, c.z], C.railing);
    };
    quad(y + h - 0.08, y + h);
    quad(y + h * 0.5 - 0.04, y + h * 0.5);
    if (i % 3 === 0) { b.box(a.x - 0.04, y, a.z - 0.04, a.x + 0.04, y + h, a.z + 0.04, C.railing); }
  }
}

function hashf(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function buildPeterJones(b: MeshBuilder, m: LandmarkModelData): { top: number } {
  const f = new Facade(m.facade);
  const L = f.length;
  const ring = pairs(m.ring);
  // ---- back walls (Symons Street / Cadogan Gardens sides; not in the references → plain, approximate)
  // The back run is the outline from the facade end round to the facade start.
  const fStart = pairs(m.facade)[0], fEnd = pairs(m.facade)[pairs(m.facade).length - 1];
  const idx = (p: P2) => ring.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.05);
  const iS = idx(fStart), iE = idx(fEnd);
  const back: P2[] = [];
  if (iS >= 0 && iE >= 0) for (let k = iE; ; k = (k + 1) % ring.length) { back.push(ring[k]); if (k === iS) break; }
  walls(b, back, 0, RECESS_TOP, C.back);
  for (let r = 0; r < ROWS + 1; r++) {
    const y = CANOPY_TOP + r * ROW_H + PANEL_H * 0.9;
    for (let i = 0; i + 1 < back.length; i++) {
      const a = back[i], c = back[i + 1];
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      if (len < 4) continue;
      const nx = -(c[1] - a[1]) / len * 0.06, nz = (c[0] - a[0]) / len * 0.06;
      b.quad([a[0] + nx, y, a[1] + nz], [c[0] + nx, y, c[1] + nz], [c[0] + nx, y + 1.5, c[1] + nz], [a[0] + nx, y + 1.5, a[1] + nz], C.backWin);
    }
  }
  // ---- main roof (behind the recessed storey) and recessed-storey roof
  flat(b, m.ringTris, CW_TOP, C.roof);
  flat(b, m.recessTris, RECESS_TOP, C.roof);

  // ---- ground floor: plate glass set back beneath a cantilevered canopy with bronze trim (listing; photos)
  strip(b, f, 0, L, -0.8, 0, SHOP_TOP, C.shop, 0.75);
  for (const s of f.samples(1.5, L - 1.5, 3.0)) {
    fin(b, f, s, 0.25, 0.12, 0, SHOP_TOP, C.bronze, -0.8);
    // warm display lighting behind the glass in alternate bays
    if (Math.floor(s / 3) % 2 === 0) strip(b, f, s + 0.3, Math.min(L, s + 2.6), -0.75, 0.6, 3.6, C.shopLit, 1.2);
  }
  band(b, f, 0, L, -0.8, 2.2, SHOP_TOP, C.canopy, true); // canopy soffit
  band(b, f, 0, L, -0.8, 2.2, CANOPY_TOP, C.canopy); // canopy top
  strip(b, f, 0, L, 2.2, SHOP_TOP, CANOPY_TOP - 0.65, C.canopy); // dark fascia
  strip(b, f, 0, L, 2.2, CANOPY_TOP - 0.65, CANOPY_TOP, C.bronze); // bronze/gold sign band

  // ---- curtain wall: corner block (gold mullions) and the muted King's Road extension
  const ranges: { s0: number; s1: number; ext: boolean }[] = [
    { s0: 0, s1: TOWER[0], ext: true },
    { s0: TOWER[1], s1: L, ext: false },
  ];
  for (const { s0, s1, ext } of ranges) {
    const spandrel = ext ? C.extSpandrel : C.spandrel, mull = ext ? C.extMullion : C.mullion;
    const glass = ext ? C.extGlass : C.glass;
    // structural backing behind the glazing (seen through gaps at the ends)
    for (let r = 0; r < ROWS; r++) {
      const y = CANOPY_TOP + r * ROW_H;
      strip(b, f, s0, s1, 0.02, y, y + PANEL_H, spandrel, 0.75);
      // glazed panels, individually tinted for cheap reflection variety (upper rows catch more sky)
      const n = Math.max(1, Math.round((s1 - s0) / PANEL_W));
      const pw = (s1 - s0) / n;
      for (let k = 0; k < n; k++) {
        const t = 0.12 + 0.35 * hashf(k, r) + (ext ? 0 : r * 0.05);
        strip(b, f, s0 + k * pw, s0 + (k + 1) * pw, 0.02, y + PANEL_H, y + ROW_H, mix(glass, C.sky, Math.min(0.75, t)), pw);
      }
      // horizontal glazing bars at the panel joints: slim, so the vertical mullions dominate (photos)
      for (const ty of [y, y + PANEL_H]) strip(b, f, s0, s1, 0.06, ty - 0.035, ty + 0.035, ext ? C.extMullion : C.transom, 0.75);
      strip(b, f, s0, s1, 0.04, y + PANEL_H * 2 - 0.02, y + PANEL_H * 2 + 0.02, mix(glass, C.sky, 0.6), 0.75);
    }
    // vertical mullions at the panel module, full height of the curtain wall
    const n = Math.max(1, Math.round((s1 - s0) / PANEL_W));
    const pw = (s1 - s0) / n;
    for (let k = 0; k <= n; k++) fin(b, f, s0 + k * pw, 0.075, ext ? 0.08 : 0.15, CANOPY_TOP, CW_TOP, mull, 0.02);
    strip(b, f, s0, s1, 0.02, CW_TOP - 0.05, CW_TOP + 0.35, C.white); // head band
  }

  // ---- recessed top storey: glazing under the cantilevered slab, white wall above it where the slab is low
  const inset = new Facade(m.recessRing.slice(0, m.facade.length)); // recessRing starts with the inset facade
  const k = inset.length / L; // map facade s → inset s
  strip(b, inset, 0, inset.length, 0, CW_TOP, (s) => slabUnder(s / k), C.glass, 0.75);
  for (const s of inset.samples(0, inset.length, PANEL_W * 2)) fin(b, inset, s, 0.08, 0.1, CW_TOP, slabUnder(s / k), C.railing);
  strip(b, inset, 0, inset.length, 0, (s) => slabUnder(s / k) + SLAB_T, RECESS_TOP, C.white, 0.75);
  // the sweeping slab (S-curve), cantilevered past the curtain wall
  band(b, f, 0, L, -3.0, 1.2, slabUnder, C.slab, true);
  band(b, f, 0, L, -3.0, 1.2, (s) => slabUnder(s) + SLAB_T, C.slab);
  strip(b, f, 0, L, 1.2, slabUnder, (s) => slabUnder(s) + SLAB_T, C.slab, 0.5);
  // tubular railings on the slab edge (listing; photos)
  {
    const pts = f.samples(0, L, 1.2).map((s) => ({ s, p: f.at(s) }));
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], c = pts[i + 1];
      const ya = slabUnder(a.s) + SLAB_T, yc = slabUnder(c.s) + SLAB_T;
      const ax = a.p.x + a.p.nx * 1.0, az = a.p.z + a.p.nz * 1.0, cx = c.p.x + c.p.nx * 1.0, cz = c.p.z + c.p.nz * 1.0;
      for (const [h0, h1] of [[1.02, 1.1], [0.52, 0.58]]) {
        b.quad([ax, ya + h0, az], [cx, yc + h0, cz], [cx, yc + h1, cz], [ax, ya + h1, az], C.railing);
        b.quad([cx, yc + h0, cz], [ax, ya + h0, az], [ax, ya + h1, az], [cx, yc + h1, cz], C.railing);
      }
      if (i % 2 === 0) b.box(ax - 0.04, ya, az - 0.04, ax + 0.04, ya + 1.1, az + 0.04, C.railing);
    }
  }

  // ---- white upper block with the rounded drum (OSM part 532097395, building:colour=white)
  let upper = pairs(m.upperRing);
  if (ringArea(upper) > 0) upper = upper.reverse(); // outward = left of travel
  walls(b, [...upper, upper[0]], RECESS_TOP, UPPER_TOP, C.white);
  for (let i = 0; i < upper.length; i++) {
    const a = upper[i], c = upper[(i + 1) % upper.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 1.2) {
      // short edges belong to the drum: glaze them as a continuous band
      const nx = -(c[1] - a[1]) / (len || 1) * 0.05, nz = (c[0] - a[0]) / (len || 1) * 0.05;
      b.quad([a[0] + nx, RECESS_TOP + 0.9, a[1] + nz], [c[0] + nx, RECESS_TOP + 0.9, c[1] + nz], [c[0] + nx, UPPER_TOP - 0.8, c[1] + nz], [a[0] + nx, UPPER_TOP - 0.8, a[1] + nz], C.glass);
    }
  }
  flat(b, m.upperTris, UPPER_TOP, C.slab);
  railing(b, [...upper, upper[0]].map(([x, z]) => ({ x, z })), UPPER_TOP, 1.0);

  // ---- white stair tower with a column of small windows (photos 1, 2; position approximate)
  {
    const sMid = (TOWER[0] + TOWER[1]) / 2;
    const p = f.at(sMid);
    const hw = (TOWER[1] - TOWER[0]) / 2, depth = 9;
    const corner = (u: number, v: number): [number, number] => [p.x + p.tx * u + p.nx * v, p.z + p.tz * u + p.nz * v];
    const fl = corner(-hw, 0.35), fr = corner(hw, 0.35), bl = corner(-hw, -depth), br = corner(hw, -depth);
    const y0 = CANOPY_TOP, y1 = TOWER_TOP;
    b.quad([fl[0], y0, fl[1]], [fr[0], y0, fr[1]], [fr[0], y1, fr[1]], [fl[0], y1, fl[1]], C.white); // front
    b.quad([fr[0], y0, fr[1]], [br[0], y0, br[1]], [br[0], y1, br[1]], [fr[0], y1, fr[1]], C.white);
    b.quad([bl[0], y0, bl[1]], [fl[0], y0, fl[1]], [fl[0], y1, fl[1]], [bl[0], y1, bl[1]], C.white);
    b.quad([br[0], y0, br[1]], [bl[0], y0, bl[1]], [bl[0], y1, bl[1]], [br[0], y1, br[1]], C.white);
    b.quad([fl[0], y1, fl[1]], [fr[0], y1, fr[1]], [br[0], y1, br[1]], [bl[0], y1, bl[1]], C.slab);
    for (let y = CANOPY_TOP + 1.2; y < TOWER_TOP - 1.5; y += ROW_H / 2) {
      for (const u of [-0.9, 0.9]) {
        const w0 = corner(u - 0.4, 0.4), w1 = corner(u + 0.4, 0.4);
        b.quad([w0[0], y, w0[1]], [w1[0], y, w1[1]], [w1[0], y + 1.0, w1[1]], [w0[0], y + 1.0, w0[1]], C.backWin);
      }
    }
  }
  return { top: UPPER_TOP + 1 };
}

/** Signage as textured strips: canopy sign around the curve, and letters on Sloane Square spandrels. */
export function peterJonesDecals(m: LandmarkModelData): { canvas: HTMLCanvasElement; data: Float32Array }[] {
  const f = new Facade(m.facade);
  const out: { canvas: HTMLCanvasElement; data: Float32Array }[] = [];
  const decal = (s0: number, s1: number, o: number, y0: number, y1: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext('2d')!, w, h);
    const data: number[] = [];
    const ss = f.samples(s0, s1, 0.6);
    for (let i = 0; i + 1 < ss.length; i++) {
      const p = f.at(ss[i]), q = f.at(ss[i + 1]);
      const u0 = (ss[i] - s0) / (s1 - s0), u1 = (ss[i + 1] - s0) / (s1 - s0);
      const a = [p.x + p.nx * o, p.z + p.nz * o], c = [q.x + q.nx * o, q.z + q.nz * o];
      data.push(a[0], y0, a[1], u0, 1, c[0], y0, c[1], u1, 1, c[0], y1, c[1], u1, 0);
      data.push(a[0], y0, a[1], u0, 1, c[0], y1, c[1], u1, 0, a[0], y1, a[1], u0, 0);
    }
    out.push({ canvas, data: new Float32Array(data) });
  };
  // Canopy band: dark sans-serif capitals on the bronze band (photo 4; photo 1 shows the same wording).
  const bandY0 = CANOPY_TOP - 0.62, bandY1 = CANOPY_TOP - 0.03;
  decal(SIGN_SPAN[0], SIGN_SPAN[1], 2.23, bandY0, bandY1, (c, w, h) => {
    c.fillStyle = '#b89452';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#2b2620';
    c.font = `600 ${Math.round(h * 0.62)}px ${UI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const text = 'PETER JONES & PARTNERS';
    // letter-spaced across the band
    const spacing = (w * 0.86) / text.length;
    for (let i = 0; i < text.length; i++) c.fillText(text[i], w * 0.07 + spacing * (i + 0.5), h * 0.54);
  }, 2048, 96);
  // Large letters on white spandrel panels, Sloane Square face (photo 3 and the listing text).
  const y = CANOPY_TOP + ROW_H; // second-row spandrel
  decal(LETTERS_SPAN[0], LETTERS_SPAN[1], 0.12, y + 0.08, y + PANEL_H - 0.08, (c, w, h) => {
    c.fillStyle = '#dfe8e6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#3a3a38';
    c.font = `300 ${Math.round(h * 0.78)}px ${UI_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const text = 'PETER  JONES';
    const spacing = w / text.length;
    for (let i = 0; i < text.length; i++) c.fillText(text[i], spacing * (i + 0.5), h * 0.55);
  }, 1024, 80);
  return out;
}
