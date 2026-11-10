// Sloane Square's central public space: Yorkstone paving inside the real kerb line, the Venus
// Fountain (Gilbert Ledward, 1953), the Chelsea war memorial, the 1882 drinking fountain, benches,
// lamps, cycle stands and the square's London plane trees.
//
// Positions come from OpenStreetMap (data/osm/square-raw.json via scripts/osm/process.mjs). Shapes and
// sizes are original procedural modelling informed by openly licensed photographs; estimated
// dimensions are listed in docs/sloane-square.md. Everything is in map metres.
import { MeshBuilder, hex, rng, shade, type RGB } from '../../engine/geometry';
import { NatureBuilder, type V3 } from '../../engine/nature';
import { buildBranches, buildCardFoliage, buildClumpFoliage, planeSkeleton, squareTreeSpec } from './planeTree';

export interface SquareData {
  name: string;
  source: string;
  ring: number[];
  tris: number[];
  area: number;
  axis: number;
  fountain: { osm: string; x: number; z: number; basin: number[]; statue: [number, number] };
  memorial?: { osm: string; x: number; z: number };
  drinkingFountain?: { osm: string; x: number; z: number };
  trees: { osm: string; x: number; z: number }[];
  benches: { osm: string; x: number; z: number }[];
  lamps: { osm: string; x: number; z: number }[];
  cycleStands: { osm: string; x: number; z: number; capacity: number }[];
}

/** Paving level: the square is raised a kerb above the surrounding carriageways (drawn up to 0.38). */
export const SQUARE_Y = 0.52;
const KERB_W = 0.3;

const C = {
  kerb: hex('#a3a19b'),
  kerbFace: hex('#8f8d87'),
  joint: hex('#9a9080'),
  // Yorkstone: buff to warm grey, restrained variation
  flags: ['#b6aa93', '#ada18b', '#b9ae98', '#a99d88', '#b2a68d', '#b4ab98'].map(hex),
  portland: hex('#e4dfd0'),
  portlandShade: hex('#d3cdbc'),
  coping: hex('#cfc8b6'),
  tile: hex('#8aa9b6'),
  bronze: hex('#3e3c35'),
  bronzeHi: hex('#55584c'),
  patina: hex('#5f6b5c'),
  granite: hex('#b4b0a9'),
  wood: hex('#8a5b36'),
  iron: hex('#25282a'),
  lampGreen: hex('#24392f'),
  lampGlass: hex('#f4e6b8'),
  steel: hex('#62676c'),
  water: hex('#5f8796'),
  waterFall: hex('#cfe3ea'),
};

// ---- small geometry helpers (lit MeshBuilder) -------------------------------------------------------
type Pt = [number, number];
const ringPts = (flat: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };
const signedArea = (r: Pt[]) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };

export function pointInRing(x: number, z: number, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from (x, z) to the ring's edges. */
export function distToRing(x: number, z: number, r: Pt[]): number {
  let d = Infinity;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length];
    const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l));
    d = Math.min(d, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return d;
}

/** Inset a counter-clockwise or clockwise ring by d metres (miter offset, fine for this gently curved ring). */
function inset(r: Pt[], d: number): Pt[] {
  const s = signedArea(r) > 0 ? 1 : -1;
  return r.map((p, i) => {
    const a = r[(i - 1 + r.length) % r.length], b = r[(i + 1) % r.length];
    const n1 = norm2([(p[1] - a[1]) * s, -(p[0] - a[0]) * s]), n2 = norm2([(b[1] - p[1]) * s, -(b[0] - p[0]) * s]);
    const m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
    const k = d / Math.max(0.3, m[0] * n1[0] + m[1] * n1[1]);
    return [p[0] - m[0] * k, p[1] - m[1] * k] as Pt;
  });
}
const norm2 = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };

/** Sutherland–Hodgman clip of a polygon against a convex ring. */
function clipConvex(poly: Pt[], clip: Pt[]): Pt[] {
  const s = signedArea(clip) > 0 ? 1 : -1;
  let out = poly;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const side = (p: Pt) => s * ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]));
    const inp = out; out = [];
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k], q = inp[(k + 1) % inp.length];
      const sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out;
}

/** Upward-facing convex polygon fan at height y. */
function flatPoly(b: MeshBuilder, poly: Pt[], y: number, col: RGB): void {
  const ccwDown = signedArea(poly) > 0; // x east, z south: positive area = clockwise seen from above
  for (let i = 1; i + 1 < poly.length; i++) {
    const a = poly[0], p = poly[i], q = poly[i + 1];
    if (ccwDown) b.tri([a[0], y, a[1]], [q[0], y, q[1]], [p[0], y, p[1]], col);
    else b.tri([a[0], y, a[1]], [p[0], y, p[1]], [q[0], y, q[1]], col);
  }
}

/** Vertical wall along a ring between y0 and y1, facing outward. */
function ringWall(b: MeshBuilder, r: Pt[], y0: number, y1: number, col: RGB, outward = true): void {
  const s = (signedArea(r) > 0 ? 1 : -1) * (outward ? 1 : -1);
  for (let i = 0; i < r.length; i++) {
    const p = r[i], q = r[(i + 1) % r.length];
    if (s > 0) b.quad([q[0], y0, q[1]], [p[0], y0, p[1]], [p[0], y1, p[1]], [q[0], y1, q[1]], col);
    else b.quad([p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]], col);
  }
}

/** Band between two rings (same vertex count) facing up at height y. */
function band(b: MeshBuilder, outer: Pt[], inner: Pt[], y: number, col: RGB, yIn = y): void {
  const s = signedArea(outer) > 0 ? 1 : -1;
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const o0: number[] = [outer[i][0], y, outer[i][1]], o1 = [outer[j][0], y, outer[j][1]], i0 = [inner[i][0], yIn, inner[i][1]], i1 = [inner[j][0], yIn, inner[j][1]];
    if (s > 0) b.quad(o0, i0, i1, o1, col); else b.quad(o0, o1, i1, i0, col);
  }
}

/** Regular n-gon ring of circumradius r centred on (x, z), rotated by rot. */
const ngon = (x: number, z: number, r: number, n: number, rot = Math.PI / n): Pt[] => Array.from({ length: n }, (_, i) => [x + Math.cos(rot + (i / n) * Math.PI * 2) * r, z + Math.sin(rot + (i / n) * Math.PI * 2) * r] as Pt);

/** Solid prism over a ring: walls plus top. */
function prism(b: MeshBuilder, r: Pt[], y0: number, y1: number, side: RGB, top: RGB = side): void {
  ringWall(b, r, y0, y1, side);
  flatPoly(b, r, y1, top);
}

/** Lathe (surface of revolution) from a profile of [radius, y] pairs; colours per ring. */
function lathe(b: MeshBuilder, x: number, z: number, profile: [number, number][], n: number, colAt: (k: number) => RGB): void {
  for (let k = 0; k + 1 < profile.length; k++) {
    const [r0, y0] = profile[k], [r1, y1] = profile[k + 1];
    const col = colAt(k);
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const p = (r: number, a: number, y: number) => [x + Math.cos(a) * r, y, z + Math.sin(a) * r];
      b.quad(p(r0, a1, y0), p(r0, a0, y0), p(r1, a0, y1), p(r1, a1, y1), col);
    }
  }
}

/** Tapered tube between two points (lit, flat shaded). */
function limb(b: MeshBuilder, a: V3, c: V3, ra: number, rc: number, col: RGB, sides = 6): void {
  const ax: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const l = Math.hypot(ax[0], ax[1], ax[2]) || 1;
  const d: V3 = [ax[0] / l, ax[1] / l, ax[2] / l];
  const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u: V3 = [d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]];
  const ul = Math.hypot(u[0], u[1], u[2]); u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const w: V3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const at = (p: V3, r: number, k: number) => { const t = (k / sides) * Math.PI * 2; return [p[0] + (u[0] * Math.cos(t) + w[0] * Math.sin(t)) * r, p[1] + (u[1] * Math.cos(t) + w[1] * Math.sin(t)) * r, p[2] + (u[2] * Math.cos(t) + w[2] * Math.sin(t)) * r]; };
  for (let k = 0; k < sides; k++) {
    b.quad(at(a, ra, k), at(a, ra, k + 1), at(c, rc, k + 1), at(c, rc, k), col);
  }
  // end caps (small fans) so short limbs read as solid
  for (let k = 0; k < sides; k++) { b.tri(a, at(a, ra, k + 1), at(a, ra, k), col); b.tri(c, at(c, rc, k), at(c, rc, k + 1), col); }
}

/** Ellipsoid blob (lit) for heads, conch, cushion. */
function ellipsoid(b: MeshBuilder, c: V3, rx: number, ry: number, rz: number, col: RGB, n = 8, m = 5): void {
  const P = (i: number, j: number) => { const th = (i / n) * Math.PI * 2, ph = (j / m) * Math.PI - Math.PI / 2; return [c[0] + Math.cos(ph) * Math.cos(th) * rx, c[1] + Math.sin(ph) * ry, c[2] + Math.cos(ph) * Math.sin(th) * rz]; };
  for (let j = 0; j < m; j++) for (let i = 0; i < n; i++) b.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), col);
}

// ---- the square -------------------------------------------------------------------------------------

/** Paving, kerb and permanent features (static, lit). */
export function buildSloaneSquare(b: MeshBuilder, sq: SquareData): void {
  const ring = ringPts(sq.ring);
  const inner = inset(ring, KERB_W);
  const Y = SQUARE_Y;
  // kerb: granite face down to the carriageway, and a granite top band
  ringWall(b, ring, 0.3, Y, C.kerbFace);
  band(b, ring, inner, Y, C.kerb);
  // joint (mortar) base under the flags
  flatPoly(b, inner, Y, C.joint);
  // Yorkstone flags: random-coursed rows along the square's axis, clipped to the kerb line, with soft
  // tree shade baked into the colour (no dynamic shadows).
  const r = rng(1953);
  const ca = Math.cos(sq.axis), sa = Math.sin(sq.axis);
  const toW = (u: number, v: number): Pt => [u * ca - v * sa, u * sa + v * ca];
  const toL = (x: number, z: number) => [x * ca + z * sa, -x * sa + z * ca];
  const L = inner.map((p) => toL(p[0], p[1]));
  const [u0, u1] = [Math.min(...L.map((p) => p[0])), Math.max(...L.map((p) => p[0]))];
  const [v0, v1] = [Math.min(...L.map((p) => p[1])), Math.max(...L.map((p) => p[1]))];
  const shade1 = (x: number, z: number) => {
    let k = 1;
    for (const t of sq.trees) { const d = Math.hypot(x - t.x, z - t.z); if (d < 7) k *= 0.86 + 0.14 * (d / 7) ** 2; }
    return Math.max(0.74, k);
  };
  const fountainR = 4.6, memR = 3.4;
  const skip = (x: number, z: number) => Math.hypot(x - sq.fountain.x, z - sq.fountain.z) < fountainR - 0.2 || (sq.memorial && Math.hypot(x - sq.memorial.x, z - sq.memorial.z) < memR - 0.3);
  const GAP = 0.015;
  for (let v = v0; v < v1;) {
    const rowD = [0.6, 0.75, 0.9][Math.floor(r() * 3)];
    for (let u = u0 - r() * 0.9; u < u1;) {
      const fl = [0.6, 0.75, 0.9, 1.05][Math.floor(r() * 4)];
      const cx = u + fl / 2, cv = v + rowD / 2;
      const [wx, wz] = toW(cx, cv);
      if (!skip(wx, wz)) {
        const quad: Pt[] = [toW(u + GAP, v + GAP), toW(u + fl - GAP, v + GAP), toW(u + fl - GAP, v + rowD - GAP), toW(u + GAP, v + rowD - GAP)];
        const poly = clipConvex(quad, inner);
        if (poly.length >= 3) {
          const col = shade(C.flags[Math.floor(r() * C.flags.length)], (0.98 + r() * 0.04) * shade1(wx, wz));
          flatPoly(b, poly, Y + 0.012, col);
        }
      }
      u += fl;
    }
    v += rowD;
  }
  buildVenusFountain(b, sq);
  if (sq.memorial) buildWarMemorial(b, sq.memorial.x, sq.memorial.z, sq.axis);
  if (sq.drinkingFountain) buildDrinkingFountain(b, sq.drinkingFountain.x, sq.drinkingFountain.z);
  for (const be of sq.benches) bench(b, be.x, be.z, benchYaw(sq, be.x, be.z));
  for (const l of sq.lamps) lamp(b, l.x, l.z);
  for (const c of sq.cycleStands) cycleStands(b, c.x, c.z, c.capacity, sq.axis);
}

/** Benches face the fountain or memorial when near one, otherwise the square's centre line (estimated). */
export function benchYaw(sq: SquareData, x: number, z: number): number {
  const targets = [sq.fountain, sq.memorial].filter(Boolean) as { x: number; z: number }[];
  const near = targets.map((t) => ({ t, d: Math.hypot(t.x - x, t.z - z) })).sort((a, c) => a.d - c.d)[0];
  if (near && near.d < 12) return Math.atan2(near.t.x - x, near.t.z - z);
  // perpendicular to the long axis, toward the centre line
  const ring = ringPts(sq.ring);
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const nx = -Math.sin(sq.axis), nz = Math.cos(sq.axis);
  const side = (x - cx) * nx + (z - cz) * nz;
  return Math.atan2(-nx * Math.sign(side), -nz * Math.sign(side));
}

/** Bench: 1.9 m wooden slats on black cast-iron ends; faces +z local before rotation by yaw. */
function bench(b: MeshBuilder, x: number, z: number, yaw: number): void {
  const Y = SQUARE_Y + 0.012;
  const m = new Float32Array(16);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  m.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, Y, z, 1]);
  b.setTransform(m);
  for (const ex of [-0.85, 0.85]) { b.box(ex - 0.04, 0, -0.28, ex + 0.04, 0.45, 0.25, C.iron); b.box(ex - 0.04, 0.45, -0.3, ex + 0.04, 0.85, -0.22, C.iron); }
  for (let k = 0; k < 3; k++) b.box(-0.95, 0.4, -0.25 + k * 0.17, 0.95, 0.45, -0.25 + k * 0.17 + 0.13, C.wood);
  for (let k = 0; k < 2; k++) b.box(-0.95, 0.55 + k * 0.16, -0.31, 0.95, 0.67 + k * 0.16, -0.25, C.wood);
  b.setTransform(null);
}

/** Victorian-style lantern on a dark green column, about 4.5 m. */
function lamp(b: MeshBuilder, x: number, z: number): void {
  const Y = SQUARE_Y + 0.012;
  b.cylinder(x, z, Y, Y + 0.5, 0.16, 8, C.lampGreen);
  b.cylinder(x, z, Y + 0.5, Y + 3.9, 0.07, 8, C.lampGreen);
  b.cylinder(x, z, Y + 3.9, Y + 4.0, 0.14, 8, C.lampGreen);
  b.box(x - 0.2, Y + 4.0, z - 0.2, x + 0.2, Y + 4.55, z + 0.2, C.lampGlass);
  b.gable(x - 0.26, z - 0.26, x + 0.26, z + 0.26, Y + 4.55, 0.25, C.lampGreen, true);
}

/** A row of Sheffield stands (two bikes each). Layout and orientation are estimated. */
function cycleStands(b: MeshBuilder, x: number, z: number, capacity: number, axis: number): void {
  const n = Math.max(1, Math.round(capacity / 2));
  const Y = SQUARE_Y + 0.012;
  const ux = Math.cos(axis), uz = Math.sin(axis);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) * 1.0;
    const cx = x + ux * t, cz = z + uz * t;
    // inverted U across the row direction
    const px = -uz * 0.35, pz = ux * 0.35;
    b.box(cx + px - 0.03, Y, cz + pz - 0.03, cx + px + 0.03, Y + 0.8, cz + pz + 0.03, C.steel);
    b.box(cx - px - 0.03, Y, cz - pz - 0.03, cx - px + 0.03, Y + 0.8, cz - pz + 0.03, C.steel);
    const x0 = Math.min(cx + px, cx - px), x1 = Math.max(cx + px, cx - px), z0 = Math.min(cz + pz, cz - pz), z1 = Math.max(cz + pz, cz - pz);
    b.box(x0 - 0.03, Y + 0.76, z0 - 0.03, x1 + 0.03, Y + 0.82, z1 + 0.03, C.steel);
  }
}

/**
 * Venus Fountain: octagonal stone pool (OSM outline) with a rounded coping, blue-tiled lining, a
 * narrow three-step stone base, a large vase-shaped bronze basin with a relief band, a drum pedestal
 * and the kneeling Venus holding a conch to her head. Water is added separately (fountainWater).
 */
export function buildVenusFountain(b: MeshBuilder, sq: SquareData): void {
  const f = sq.fountain;
  const Y = SQUARE_Y + 0.012;
  const basin = ringPts(f.basin);
  const innerEdge = inset(basin, 0.45);
  const lining = inset(basin, 0.5);
  // coping: outer face, rounded top (two bevels), inner face down to the pool floor
  ringWall(b, basin, Y, Y + 0.42, C.portlandShade);
  const mid = inset(basin, 0.08), mid2 = inset(basin, 0.37);
  band(b, basin, mid, Y + 0.42, C.coping, Y + 0.5);
  band(b, mid, mid2, Y + 0.5, C.portland);
  band(b, mid2, innerEdge, Y + 0.5, C.coping, Y + 0.44);
  ringWall(b, innerEdge, Y + 0.05, Y + 0.44, C.tile, false);
  flatPoly(b, lining, Y + 0.05, C.tile);
  flatPoly(b, innerEdge, Y + 0.049, C.tile);
  // three-step octagonal stone base (photos: square-ish stepped block with chamfered corners)
  const { x, z } = f;
  const rot = Math.PI / 8;
  prism(b, ngon(x, z, 1.3, 8, rot), Y + 0.05, Y + 0.45, C.portlandShade, C.portland);
  prism(b, ngon(x, z, 1.12, 8, rot), Y + 0.45, Y + 0.72, C.portlandShade, C.portland);
  prism(b, ngon(x, z, 0.95, 8, rot), Y + 0.72, Y + 1.02, C.portlandShade, C.portland);
  // bronze vase: foot, banded lower body, swelling relief zone, flared rim
  const by = Y + 1.02;
  const prof: [number, number][] = [[0.55, 0], [0.6, 0.06], [0.6, 0.16], [0.56, 0.22], [0.58, 0.4], [0.64, 0.75], [0.69, 1.1], [0.72, 1.38], [0.79, 1.48], [0.81, 1.56], [0.76, 1.6]];
  lathe(b, x, z, prof.map(([rr, yy]) => [rr, by + yy]), 16, (k) => (k >= 4 && k <= 6 ? (k % 2 ? C.bronzeHi : C.bronze) : k === 1 ? C.patina : C.bronze));
  // relief suggestion: raised figures as slight bumps on the body (Charles II, Nell Gwynn, cupid, deer)
  const rr = rng(1952);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + rr() * 0.3;
    const h = by + 0.5 + rr() * 0.5;
    ellipsoid(b, [x + Math.cos(a) * 0.62, h, z + Math.sin(a) * 0.62], 0.1 + rr() * 0.06, 0.13 + rr() * 0.08, 0.04, C.bronzeHi, 8, 4);
  }
  // inner dish (dark) under the overflowing water
  flatPoly(b, ngon(x, z, 0.74, 16), by + 1.5, C.bronze);
  // drum pedestal and drapery cushion
  const py = by + 1.5;
  b.cylinder(x, z, py, py + 0.32, 0.26, 12, C.bronze);
  ellipsoid(b, [x, py + 0.36, z], 0.42, 0.09, 0.36, C.bronzeHi, 10, 4);
  venus(b, x, py + 0.42, z, faceYaw(f));
}

/** The figure faces south-west, toward Peter Jones (observed: her back is seen from the north-east). */
export const faceYaw = (_f: { x: number; z: number }) => Math.atan2(-1, 1);

/**
 * Kneeling Venus, about 1.1 m high: left leg folded under, right knee raised, torso leaning forward,
 * right hand holding a conch to her head, left forearm resting across the raised knee. Simplified to
 * tapered limbs and ellipsoids (no facial or anatomical detail at this scale).
 */
function venus(b: MeshBuilder, x: number, y: number, z: number, yaw: number): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  // local: +z forward, +x her left→right? (x right of figure), y up
  const P = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const br = C.bronze, hi = C.bronzeHi;
  // pelvis and folded left leg (shin under the body, foot behind)
  ellipsoid(b, P(-0.02, 0.17, -0.06), 0.17, 0.12, 0.15, br);
  limb(b, P(-0.1, 0.14, -0.04), P(-0.14, 0.1, 0.24), 0.1, 0.075, br);
  limb(b, P(-0.14, 0.08, 0.24), P(-0.12, 0.05, -0.2), 0.07, 0.045, br);
  limb(b, P(-0.12, 0.04, -0.2), P(-0.1, 0.02, -0.3), 0.045, 0.035, hi);
  // raised right leg: thigh forward and up to the knee, shin down to the foot on the cushion
  limb(b, P(0.1, 0.15, -0.04), P(0.15, 0.42, 0.26), 0.1, 0.07, br);
  limb(b, P(0.15, 0.42, 0.26), P(0.17, 0.04, 0.2), 0.065, 0.045, br);
  limb(b, P(0.17, 0.03, 0.2), P(0.18, 0.02, 0.32), 0.04, 0.035, hi);
  // torso leaning forward
  limb(b, P(0, 0.2, -0.06), P(0.02, 0.62, 0.05), 0.15, 0.13, br, 8);
  ellipsoid(b, P(0.02, 0.64, 0.06), 0.15, 0.08, 0.1, br);
  // head bowed, hair gathered in a bun
  limb(b, P(0.02, 0.68, 0.07), P(0.03, 0.76, 0.1), 0.045, 0.045, br);
  ellipsoid(b, P(0.03, 0.83, 0.13), 0.075, 0.09, 0.08, br);
  ellipsoid(b, P(0.02, 0.92, 0.08), 0.05, 0.04, 0.05, hi);
  // right arm raised: elbow out and forward, hand at the right side of the head holding the conch
  limb(b, P(0.14, 0.6, 0.03), P(0.27, 0.5, 0.2), 0.045, 0.04, br);
  limb(b, P(0.27, 0.5, 0.2), P(0.15, 0.85, 0.17), 0.04, 0.035, br);
  ellipsoid(b, P(0.15, 0.9, 0.17), 0.09, 0.075, 0.07, C.patina);
  // left arm down across the body to rest on the raised knee
  limb(b, P(-0.14, 0.6, 0.03), P(-0.06, 0.4, 0.24), 0.045, 0.04, br);
  limb(b, P(-0.06, 0.4, 0.24), P(0.12, 0.45, 0.3), 0.04, 0.035, br);
}

/** Chelsea war memorial: octagonal three-step base, plinth, tapered octagonal shaft and plain cross (~8 m). */
function buildWarMemorial(b: MeshBuilder, x: number, z: number, axis: number): void {
  const Y = SQUARE_Y + 0.012;
  const rot = Math.PI / 8 + axis;
  prism(b, ngon(x, z, 3.0, 8, rot), Y, Y + 0.18, C.portlandShade, C.portland);
  prism(b, ngon(x, z, 2.6, 8, rot), Y + 0.18, Y + 0.36, C.portlandShade, C.portland);
  prism(b, ngon(x, z, 2.2, 8, rot), Y + 0.36, Y + 0.54, C.portlandShade, C.portland);
  prism(b, ngon(x, z, 1.55, 8, rot), Y + 0.54, Y + 1.45, C.portland, C.portland);
  prism(b, ngon(x, z, 1.2, 8, rot), Y + 1.45, Y + 1.75, C.portlandShade, C.portland);
  prism(b, ngon(x, z, 1.0, 8, rot), Y + 1.75, Y + 2.75, C.portland, C.portland);
  prism(b, ngon(x, z, 0.62, 8, rot), Y + 2.75, Y + 3.15, C.portlandShade, C.portland);
  // tapered shaft
  const sh0 = ngon(x, z, 0.36, 8, rot), sh1 = ngon(x, z, 0.26, 8, rot);
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    b.quad([sh0[j][0], Y + 3.15, sh0[j][1]], [sh0[i][0], Y + 3.15, sh0[i][1]], [sh1[i][0], Y + 7.9, sh1[i][1]], [sh1[j][0], Y + 7.9, sh1[j][1]], C.portland);
  }
  flatPoly(b, sh1, Y + 7.9, C.portland);
  // cross arms (along the square's axis), capped head
  const ux = Math.cos(axis), uz = Math.sin(axis);
  const m = new Float32Array(16);
  m.set([ux, 0, uz, 0, 0, 1, 0, 0, -uz, 0, ux, 0, x, Y, z, 1]);
  b.setTransform(m);
  b.box(-0.85, 6.55, -0.2, 0.85, 7.0, 0.2, C.portland);
  b.box(-0.24, 7.9, -0.24, 0.24, 8.05, 0.24, C.portlandShade);
  b.setTransform(null);
}

/** 1882 granite drinking fountain: octagonal base, two blocks, column, bowl and urn finial. */
function buildDrinkingFountain(b: MeshBuilder, x: number, z: number): void {
  const Y = SQUARE_Y + 0.012;
  prism(b, ngon(x, z, 0.85, 8), Y, Y + 0.12, C.granite);
  b.box(x - 0.75, Y + 0.12, z - 0.2, x - 0.42, Y + 0.38, z + 0.2, C.granite);
  b.box(x + 0.42, Y + 0.12, z - 0.2, x + 0.75, Y + 0.38, z + 0.2, C.granite);
  lathe(b, x, z, [[0.36, Y + 0.12], [0.36, Y + 0.42], [0.27, Y + 0.46], [0.24, Y + 0.85], [0.3, Y + 0.9], [0.52, Y + 1.0], [0.55, Y + 1.1], [0.5, Y + 1.15], [0.15, Y + 1.15], [0.12, Y + 1.25], [0.22, Y + 1.38], [0.2, Y + 1.5], [0.08, Y + 1.58], [0.05, Y + 1.66], [0, Y + 1.7]], 10, () => C.granite);
}

// ---- dynamic layers (nature shader) ---------------------------------------------------------------------

export interface SquareNature {
  /** Trunks and branches (opaque). */
  branches: Float32Array;
  /** Approach B: dark opaque core clumps (drawn before the cards so they fill the depth buffer). */
  core: Float32Array;
  /** Approach B: alpha-tested leaf cards. */
  cards: Float32Array;
  /** Low-detail foliage: opaque clumps only (approach A at half density); keeps silhouettes. */
  lowFoliage: Float32Array;
  lowBranches: Float32Array;
  water: Float32Array;
  stats: { trees: number; branchTris: number; coreTris: number; cardTris: number; lowTris: number; waterTris: number };
}

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 100000; };

/** Deterministic per-tree variation from the OSM id: size, branching, rotation and sway phase. */
export function squareTrees(sq: SquareData) {
  return sq.trees.map((t, i) => {
    const h = hash(t.osm);
    const spec = squareTreeSpec(h % 23, 4150 + (h % 997));
    return { ...t, spec, yaw: ((h % 360) * Math.PI) / 180, phase: (h % 628) / 100 + i * 0.37 };
  });
}

export function buildSquareNature(sq: SquareData): SquareNature {
  const branches = new NatureBuilder(), core = new NatureBuilder(), cards = new NatureBuilder();
  const lowF = new NatureBuilder(), lowB = new NatureBuilder();
  const Y = SQUARE_Y + 0.012;
  for (const t of squareTrees(sq)) {
    const sk = planeSkeleton(t.spec);
    const o = { x: t.x, y: Y, z: t.z, yaw: t.yaw, phase: t.phase };
    buildBranches(branches, sk, o, 0, 3);
    buildCardFoliage(core, cards, sk, o);
    buildBranches(lowB, sk, o, 0, 1, (d) => (d === 0 ? 6 : 4));
    buildClumpFoliage(lowF, sk, o, 0.3);
  }
  const water = fountainWater(sq);
  const tri = (n: NatureBuilder) => n.vertexCount / 3;
  return {
    branches: branches.toFloat32(), core: core.toFloat32(), cards: cards.toFloat32(), lowFoliage: lowF.toFloat32(), lowBranches: lowB.toFloat32(), water: water.toFloat32(),
    stats: { trees: sq.trees.length, branchTris: tri(branches), coreTris: tri(core), cardTris: tri(cards), lowTris: tri(lowF) + tri(lowB), waterTris: tri(water) },
  };
}

/** Pool surface, the bowl's brimming top, the sheet overflowing its rim and the jet from the conch. */
function fountainWater(sq: SquareData): NatureBuilder {
  const w = new NatureBuilder();
  const f = sq.fountain;
  const Y = SQUARE_Y + 0.012;
  const pool = inset(ringPts(f.basin), 0.46);
  // pool surface (fan from centre, around the stone base)
  const up: V3 = [0, 1, 0];
  const wy = Y + 0.38;
  const base = ngon(f.x, f.z, 1.31, 8, Math.PI / 8);
  for (let i = 0; i < pool.length; i++) {
    const p = pool[i], q = pool[(i + 1) % pool.length];
    // quad between the pool edge and the stone base, matched by angle
    const ang = (pt: Pt) => Math.atan2(pt[1] - f.z, pt[0] - f.x);
    const near = (a: number) => base.reduce((best, bp) => (Math.abs(Math.atan2(Math.sin(ang(bp) - a), Math.cos(ang(bp) - a))) < Math.abs(Math.atan2(Math.sin(ang(best) - a), Math.cos(ang(best) - a))) ? bp : best));
    const bp = near(ang(p)), bq = near(ang(q));
    const tri = (a: Pt, b2: Pt, c: Pt) => {
      const cross = (b2[0] - a[0]) * (c[1] - a[1]) - (b2[1] - a[1]) * (c[0] - a[0]);
      const pts = cross < 0 ? [a, b2, c] : [a, c, b2];
      for (const pt of pts) w.vert([pt[0], wy, pt[1]], up, C.water, pt[0], pt[1]);
    };
    tri(p, q, bq);
    if (bp !== bq) tri(p, bq, bp);
  }
  // brimming bowl surface
  const bowlY = Y + 1.02 + 1.555;
  const rim = ngon(f.x, f.z, 0.76, 16);
  for (let i = 0; i < 16; i++) {
    const a = rim[i], c = rim[(i + 1) % 16];
    w.vert([f.x, bowlY, f.z], up, C.water); w.vert([c[0], bowlY, c[1]], up, C.water); w.vert([a[0], bowlY, a[1]], up, C.water);
  }
  // overflow sheet: falls from the rim and spreads slightly as it drops (both faces)
  const r0 = 0.82, r1 = 0.98;
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2, a1 = ((i + 1) / 24) * Math.PI * 2;
    const P = (a: number, r: number, y: number): V3 => [f.x + Math.cos(a) * r, y, f.z + Math.sin(a) * r];
    const n0: V3 = [Math.cos(a0), 0.2, Math.sin(a0)], n1: V3 = [Math.cos(a1), 0.2, Math.sin(a1)];
    const A = P(a0, r0, bowlY), B = P(a1, r0, bowlY), Cc = P(a1, r1, wy), D = P(a0, r1, wy);
    w.vert(A, n0, C.waterFall, 0, 0, 0.2, i); w.vert(D, n0, C.waterFall, 0, 0, 0.2, i); w.vert(Cc, n1, C.waterFall, 0, 0, 0.2, i);
    w.vert(A, n0, C.waterFall, 0, 0, 0.2, i); w.vert(Cc, n1, C.waterFall, 0, 0, 0.2, i); w.vert(B, n1, C.waterFall, 0, 0, 0.2, i);
  }
  // jet from the conch: a thin arc out over the bowl rim into the pool
  const yaw = faceYaw(f);
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const conch: V3 = [f.x + rx * 0.15 + fx * 0.17, Y + 1.02 + 1.5 + 0.42 + 0.9, f.z + rz * 0.15 + fz * 0.17];
  const out: V3 = [rx * 0.8 + fx * 0.6, 0, rz * 0.8 + fz * 0.6];
  const ol = Math.hypot(out[0], out[2]);
  let prev = conch;
  for (let k = 1; k <= 16; k++) {
    const t = k / 10;
    const dist = 2.0 * t;
    const p: V3 = [conch[0] + (out[0] / ol) * dist, conch[1] + 0.35 * t - 3.3 * t * t, conch[2] + (out[2] / ol) * dist];
    if (p[1] < wy) break;
    w.tube(prev, p, 0.04, 0.035, 5, () => C.waterFall, 0.1, 0.1, 0.5);
    prev = p;
  }
  return w;
}
