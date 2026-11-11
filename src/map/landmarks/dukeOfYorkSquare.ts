// Duke of York Square's public spaces: the paved square (Yorkstone flags), the gallery forecourt inside
// the listed curved wall, the splash-pad fountain, the statue of Sir Hans Sloane, the wall's gateways and
// trophy, railings, hedges, benches, cycle stands, the running track and playing field (fenced, private),
// and the London plane trees.
//
// Positions come from OpenStreetMap (data/osm/doy-raw.json via scripts/osm/process.mjs). Shapes and sizes
// are original procedural modelling informed by openly licensed photographs; estimates are listed in
// docs/duke-of-york-square.md. Everything is in map metres.
import { MeshBuilder, hex, rng, shade, type RGB } from '../../engine/geometry';
import { NatureBuilder, type V3 } from '../../engine/nature';
import { buildBranches, buildCardFoliage, buildClumpFoliage, planeSkeleton, type TreeSpec } from './planeTree';
import { clipConvex, ellipsoid, flatPoly, lathe, limb } from './sloaneSquare';
import type { SignQuad } from './buildingKit';

type Pt = [number, number];

export interface DoyData {
  source: string;
  trees: { osm: string; x: number; z: number }[];
  walls: { osm: string; pts: number[]; h: number | null }[];
  fences: { osm: string; pts: number[]; h: number | null }[];
  gates: { osm: string; x: number; z: number }[];
  benches: ({ osm: string; x: number; z: number; seats: number | null; backrest: string | null } | { osm: string; pts: number[]; material: string | null })[];
  cycleStands: { osm: string; x: number; z: number; capacity: number; kind: string | null }[];
  lamps: { osm: string; x: number; z: number }[];
  fountain: { osm: string; x: number; z: number; kind: string | null } | null;
  statue: { osm: string; x: number; z: number; name: string } | null;
  kerbs: { osm: string; pts: number[] }[];
  footways: { osm: string; pts: number[]; hw: string; surface: string | null; name: string | null }[];
  track: { osm: string; outer: number[][]; inner: number[][]; tris: number[]; innerTris: number[] } | null;
  pitch: { osm: string; ring: number[] } | null;
  entrances: { osm: string; x: number; z: number; kind: string }[];
  forecourt?: { ring: number[]; tris: number[] };
}

/** Paving level of the square and the forecourt (map metres; footways are drawn at 0.22). */
export const DOY_Y = 0.32;
/** Direction of King's Road along the square (unit, map x/z): flags are coursed along it. */
const KR: Pt = [0.754, -0.658];
/** Gallery front direction (unit) and its outward normal (south-west). */
const GU: Pt = [0.619, 0.785], GN: Pt = [-0.785, 0.619];

const C = {
  joint: hex('#968a78'),
  // Square: warm buff-pink Yorkstone (photos 2022–2026), forecourt: greyer sawn stone
  flags: ['#bcab92', '#b3a389', '#c2b39b', '#ad9e86', '#b8a78e', '#bfb098'].map(hex),
  grey: ['#a9a59c', '#b2ada3', '#a39e95', '#aca79d'].map(hex),
  granite: hex('#6d6c6a'),
  graniteLight: hex('#8b8984'),
  brick: hex('#b39a68'),
  brickDark: hex('#a08757'),
  stone: hex('#e0dacb'),
  lead: hex('#7c8288'),
  iron: hex('#1f2226'),
  hedge: hex('#3f5f34'),
  hedgeTop: hex('#4c6e3d'),
  grass: hex('#79a05a'),
  pitch: hex('#86ab61'),
  track: hex('#a85c4b'),
  line: hex('#ece9e1'),
  timber: hex('#8a6a48'),
  steel: hex('#5d6266'),
  marble: hex('#ece7dc'),
  pylon: hex('#7f888f'),
  water: hex('#7fa3b0'),
  bark: hex('#6f6a5e'),
};

const toPts = (f: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
export function pointIn(x: number, z: number, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, zi] = r[i], [xj, zj] = r[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const segD = (x: number, z: number, a: Pt, b: Pt) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };

/** Coursed flags clipped exactly to a triangulated area; `skip` filters slabs by centre. */
function pave(b: MeshBuilder, tris: number[], dir: Pt, y: number, cols: RGB[], seed: number, rows: number[], lens: number[], skip: (x: number, z: number) => boolean, shadeAt: (x: number, z: number) => number): void {
  const T: Pt[][] = [];
  for (let i = 0; i + 5 < tris.length; i += 6) T.push([[tris[i], tris[i + 1]], [tris[i + 2], tris[i + 3]], [tris[i + 4], tris[i + 5]]]);
  if (!T.length) return;
  // joint base
  for (const t of T) flatPoly(b, t, y - 0.004, C.joint);
  const n: Pt = [-dir[1], dir[0]];
  const toL = (p: Pt) => [p[0] * dir[0] + p[1] * dir[1], p[0] * n[0] + p[1] * n[1]];
  const toW = (u: number, v: number): Pt => [u * dir[0] + v * n[0], u * dir[1] + v * n[1]];
  const all = T.flat().map(toL);
  const u0 = Math.min(...all.map((p) => p[0])), u1 = Math.max(...all.map((p) => p[0]));
  const v0 = Math.min(...all.map((p) => p[1])), v1 = Math.max(...all.map((p) => p[1]));
  const bbs = T.map((t) => { const l = t.map(toL); return [Math.min(...l.map((p) => p[0])), Math.max(...l.map((p) => p[0])), Math.min(...l.map((p) => p[1])), Math.max(...l.map((p) => p[1]))]; });
  const r = rng(seed);
  const GAP = 0.012;
  for (let v = v0; v < v1;) {
    const rowD = rows[Math.floor(r() * rows.length)];
    for (let u = u0 - r() * 0.8; u < u1;) {
      const fl = lens[Math.floor(r() * lens.length)];
      const [cx, cz] = toW(u + fl / 2, v + rowD / 2);
      if (!skip(cx, cz)) {
        const quad: Pt[] = [toW(u + GAP, v + GAP), toW(u + fl - GAP, v + GAP), toW(u + fl - GAP, v + rowD - GAP), toW(u + GAP, v + rowD - GAP)];
        const col = shade(cols[Math.floor(r() * cols.length)], (0.97 + r() * 0.05) * shadeAt(cx, cz));
        for (let k = 0; k < T.length; k++) {
          const bb = bbs[k];
          if (u + fl < bb[0] || u > bb[1] || v + rowD < bb[2] || v > bb[3]) continue;
          const poly = clipConvex(quad, T[k]);
          if (poly.length >= 3) flatPoly(b, poly, y, col);
        }
      }
      u += fl;
    }
    v += rowD;
  }
}

/** Wall of thickness t and height h along a polyline, brick with a stone band and coping. */
function wallAlong(b: MeshBuilder, pts: Pt[], y0: number, h: number, t: number, skip: (s: number, i: number) => boolean): void {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 0.05) continue;
    const ux = (c[0] - a[0]) / len, uz = (c[1] - a[1]) / len, nx = -uz * t / 2, nz = ux * t / 2;
    // split around gateways (skip returns true for a length position along this segment)
    const steps = Math.max(1, Math.ceil(len / 0.5));
    let run0 = -1;
    const flush = (s0: number, s1: number) => {
      const A: Pt = [a[0] + ux * s0, a[1] + uz * s0], B: Pt = [a[0] + ux * s1, a[1] + uz * s1];
      const box = (yb: number, yt: number, grow: number, col: RGB) => {
        const gx = nx * (1 + grow), gz = nz * (1 + grow);
        const p = (q: Pt, s: number, y: number) => [q[0] + gx * s, y, q[1] + gz * s];
        b.quad(p(A, 1, yb), p(B, 1, yb), p(B, 1, yt), p(A, 1, yt), col);
        b.quad(p(B, -1, yb), p(A, -1, yb), p(A, -1, yt), p(B, -1, yt), shade(col, 0.95));
        b.quad(p(A, 1, yt), p(B, 1, yt), p(B, -1, yt), p(A, -1, yt), shade(col, 1.05));
        b.quad(p(A, -1, yb), p(A, 1, yb), p(A, 1, yt), p(A, -1, yt), shade(col, 0.9));
        b.quad(p(B, 1, yb), p(B, -1, yb), p(B, -1, yt), p(B, 1, yt), shade(col, 0.9));
      };
      box(y0, y0 + 0.35, 0.15, C.stone); // plinth
      box(y0 + 0.35, y0 + h - 0.25, 0, C.brick);
      box(y0 + 3.0, y0 + 3.18, 0.35, C.stone); // string course
      box(y0 + h - 0.25, y0 + h, 0.25, C.stone); // coping
    };
    for (let k = 0; k <= steps; k++) {
      const s = (k / steps) * len;
      const blocked = k === steps || skip(s, i);
      if (!blocked && run0 < 0) run0 = s;
      if (blocked && run0 >= 0) { flush(run0, Math.min(len, s + (k === steps ? 0 : 0))); run0 = -1; }
    }
  }
}

/** Point and tangent at arc length `s` along a polyline. */
function along(pts: Pt[], s: number): { p: Pt; t: Pt } {
  let acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (acc + l >= s || i + 2 === pts.length) {
      const k = Math.min(1, Math.max(0, (s - acc) / (l || 1)));
      return { p: [a[0] + (c[0] - a[0]) * k, a[1] + (c[1] - a[1]) * k], t: [(c[0] - a[0]) / (l || 1), (c[1] - a[1]) / (l || 1)] };
    }
    acc += l;
  }
  return { p: pts[0], t: [1, 0] };
}
const polyLen = (pts: Pt[]) => pts.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
const arcPos = (pts: Pt[], q: Pt) => {
  let best = { s: 0, d: Infinity }, acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], c = pts[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
    const dx = c[0] - a[0], dz = c[1] - a[1];
    const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / (l * l || 1)));
    const d = Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dz);
    if (d < best.d) best = { s: acc + t * l, d };
    acc += l;
  }
  return best.s;
};

/** Oriented box in a local frame at (x, z) rotated so local +z points along (dx, dz). */
function obox(b: MeshBuilder, x: number, y: number, z: number, dir: Pt, w: number, h: number, d: number, col: RGB, lx = 0, lz = 0): void {
  const m = new Float32Array(16);
  const c = dir[1], s = dir[0]; // local +z → dir
  m.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, x, y, z, 1]);
  b.setTransform(m);
  b.box(lx - w / 2, 0, lz - d / 2, lx + w / 2, h, lz + d / 2, col);
  b.setTransform(null);
}

export interface DoyBuild { signs: SignQuad[]; stats: Record<string, number> }

export function buildDukeOfYorkSquare(b: MeshBuilder, d: DoyData, plaza: { ring: number[]; tris: number[] }[], gallery?: number[]): DoyBuild {
  const signs: SignQuad[] = [];
  const stats: Record<string, number> = {};
  const count = (k: string, before: number) => { stats[k] = (stats[k] ?? 0) + (b.vertexCount - before) / 3; };
  const Y = DOY_Y;
  const plazaRings = plaza.map((p) => toPts(p.ring));
  const inPlaza = (x: number, z: number) => plazaRings.some((r) => pointIn(x, z, r));
  const fc = d.forecourt ? toPts(d.forecourt.ring) : [];
  const trees = d.trees;
  const treeShade = (x: number, z: number) => { let k = 1; for (const t of trees) { const dd = Math.hypot(x - t.x, z - t.z); if (dd < 7.5) k *= 0.88 + 0.12 * (dd / 7.5) ** 2; } return Math.max(0.78, k); };
  const fountain = d.fountain;
  const padHalf: Pt = [4.2, 2.6];
  const onPad = (x: number, z: number) => !!fountain && Math.abs((x - fountain.x) * KR[0] + (z - fountain.z) * KR[1]) < padHalf[0] && Math.abs((x - fountain.x) * -KR[1] + (z - fountain.z) * KR[0]) < padHalf[1];
  let v0 = b.vertexCount;
  // ---- paving
  plaza.forEach((p, i) => pave(b, p.tris, KR, Y, C.flags, 2003 + i, [0.6, 0.75, 0.9], [0.9, 1.2, 1.5], (x, z) => onPad(x, z) || (i > 0 && plazaRings.slice(0, i).some((r) => pointIn(x, z, r))), treeShade));
  if (d.forecourt) pave(b, d.forecourt.tris, GU, Y, C.grey, 1801, [0.75, 0.9], [0.9, 1.2], (x, z) => inPlaza(x, z), treeShade);
  count('paving', v0);

  // ---- splash-pad fountain: a darker granite field with flush jet nozzles (water added in nature)
  v0 = b.vertexCount;
  if (fountain) {
    const n: Pt = [-KR[1], KR[0]];
    const P = (u: number, v: number): Pt => [fountain.x + KR[0] * u + n[0] * v, fountain.z + KR[1] * u + n[1] * v];
    flatPoly(b, [P(-padHalf[0], -padHalf[1]), P(padHalf[0], -padHalf[1]), P(padHalf[0], padHalf[1]), P(-padHalf[0], padHalf[1])], Y, C.granite);
    for (const [u, v] of fountainJets()) {
      const q = P(u, v);
      flatPoly(b, Array.from({ length: 6 }, (_, k) => [q[0] + Math.cos((k / 6) * Math.PI * 2) * 0.12, q[1] + Math.sin((k / 6) * Math.PI * 2) * 0.12] as Pt), Y + 0.006, C.steel);
    }
    // drainage slot round the field
    for (const s of [-1, 1]) flatPoly(b, [P(-padHalf[0], s * padHalf[1]), P(padHalf[0], s * padHalf[1]), P(padHalf[0], s * (padHalf[1] + 0.12)), P(-padHalf[0], s * (padHalf[1] + 0.12))].map((p, k, a) => (s < 0 ? a[a.length - 1 - k] : p)) as Pt[], Y + 0.003, C.iron);
  }
  count('fountain', v0);

  // ---- statue of Sir Hans Sloane (stone pedestal, marble figure), facing the square
  v0 = b.vertexCount;
  if (d.statue) {
    const s = d.statue;
    const face: Pt = (() => { const cx = -12, cz = 20; const l = Math.hypot(cx - s.x, cz - s.z); return [(cx - s.x) / l, (cz - s.z) / l]; })();
    obox(b, s.x, Y, s.z, face, 1.9, 0.35, 1.9, C.stone);
    obox(b, s.x, Y + 0.35, s.z, face, 1.5, 0.3, 1.5, shade(C.stone, 0.96));
    obox(b, s.x, Y + 0.65, s.z, face, 1.2, 1.65, 1.2, C.stone);
    obox(b, s.x, Y + 2.3, s.z, face, 1.45, 0.25, 1.45, shade(C.stone, 1.03));
    hansSloane(b, s.x, Y + 2.55, s.z, Math.atan2(face[0], face[1]));
    // inscription panel on the front of the pedestal
    const fx = s.x + face[0] * 0.61, fz = s.z + face[1] * 0.61, tx = face[1], tz = -face[0];
    signs.push({ corners: [[fx - tx * 0.5, Y + 1.15, fz - tz * 0.5], [fx + tx * 0.5, Y + 1.15, fz + tz * 0.5], [fx + tx * 0.5, Y + 1.75, fz + tz * 0.5], [fx - tx * 0.5, Y + 1.75, fz - tz * 0.5]], text: 'SIR HANS SLOANE', bg: '#e0dacb', fg: '#6b665c', font: 'serif' });
  }
  count('statue', v0);

  // ---- the listed curved wall: brick with a stone band and coping, the arched gateway with the trophy
  v0 = b.vertexCount;
  const wall = d.walls.find((w) => (w.h ?? 0) >= 3.5);
  if (wall) {
    const wp = toPts(wall.pts);
    const L = polyLen(wp);
    const gatesOn = d.gates.map((g) => ({ g, s: arcPos(wp, [g.x, g.z]), dd: Math.min(...wp.map((q) => Math.hypot(q[0] - g.x, q[1] - g.z))) })).filter((q) => q.dd < 1.5);
    const main = gatesOn.filter((q) => q.s > 2 && q.s < L - 2); // the arched gateway mid-wall
    const H = wall.h ?? 4;
    const R = 1.3, PIER = 0.45, SPRING = Y + 2.35, T = 0.29; // opening radius, pier width, springing, half thickness
    const gapAt = (s: number) => main.some((q) => Math.abs(s - q.s) < R + PIER);
    const segStarts: number[] = [];
    { let acc = 0; for (let i = 0; i + 1 < wp.length; i++) { segStarts.push(acc); acc += Math.hypot(wp[i + 1][0] - wp[i][0], wp[i + 1][1] - wp[i][1]); } }
    wallAlong(b, wp, Y - 0.05, H, 0.55, (s, i) => gapAt(segStarts[i] + s));
    for (const q of main) {
      // local frame: chord across the gap (so both piers meet the two wall runs), v through the wall
      const A = along(wp, q.s - R - PIER).p, B = along(wp, q.s + R + PIER).p;
      const cl = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      const t: Pt = [(B[0] - A[0]) / cl, (B[1] - A[1]) / cl], n: Pt = [-t[1], t[0]];
      const p: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const P3 = (u: number, y: number, v: number) => [p[0] + t[0] * u + n[0] * v, y, p[1] + t[1] * u + n[1] * v];
      const half = cl / 2;
      const m = new Float32Array(16);
      m.set([t[0], 0, t[1], 0, 0, 1, 0, 0, n[0], 0, n[1], 0, p[0], 0, p[1], 1]);
      const pb = (u0: number, u1: number, y0: number, y1: number, v0b: number, v1b: number, col: RGB) => { b.setTransform(m); b.box(u0, y0, v0b, u1, y1, v1b, col); b.setTransform(null); };
      // piers with stone plinths, string course and coping continuing the wall's
      for (const sg of [-1, 1]) {
        const u0 = sg < 0 ? -half : R, u1 = sg < 0 ? -R : half;
        pb(u0, u1, Y - 0.05, Y + 0.3, -T - 0.08, T + 0.08, C.stone);
        pb(u0, u1, Y + 0.3, Y + H - 0.25, -T, T, C.brickDark);
        pb(u0 - 0.02, u1 + 0.02, Y + 3.0, Y + 3.18, -T - 0.1, T + 0.1, C.stone);
        pb(sg < 0 ? -R - 0.08 : R, sg < 0 ? -R : R + 0.08, Y + 0.3, SPRING, -T, T, C.stone); // stone reveal
      }
      // spandrels over the semicircular arch (both faces), the arch soffit, and the coping
      const seg = 12;
      for (let k = 0; k < seg; k++) {
        const a0 = Math.PI - (k / seg) * Math.PI, a1 = Math.PI - ((k + 1) / seg) * Math.PI;
        const x0 = Math.cos(a0) * R, x1 = Math.cos(a1) * R, y0 = SPRING + Math.sin(a0) * R, y1 = SPRING + Math.sin(a1) * R;
        const top = Y + H - 0.25;
        b.quad(P3(x0, y0, T), P3(x1, y1, T), P3(x1, top, T), P3(x0, top, T), C.brick);
        b.quad(P3(x1, y1, -T), P3(x0, y0, -T), P3(x0, top, -T), P3(x1, top, -T), shade(C.brick, 0.95));
        b.quad(P3(x0, y0, -T), P3(x1, y1, -T), P3(x1, y1, T), P3(x0, y0, T), shade(C.brick, 0.75));
        // gauged-brick arch ring and keystone line on both faces
        const xr0 = Math.cos(a0) * (R + 0.32), xr1 = Math.cos(a1) * (R + 0.32), yr0 = SPRING + Math.sin(a0) * (R + 0.32), yr1 = SPRING + Math.sin(a1) * (R + 0.32);
        b.quad(P3(x0, y0, T + 0.03), P3(x1, y1, T + 0.03), P3(xr1, yr1, T + 0.03), P3(xr0, yr0, T + 0.03), C.brickDark);
        b.quad(P3(x1, y1, -T - 0.03), P3(x0, y0, -T - 0.03), P3(xr0, yr0, -T - 0.03), P3(xr1, yr1, -T - 0.03), C.brickDark);
      }
      pb(-R - 0.02, R + 0.02, Y + 3.0, Y + 3.18, -T - 0.1, T + 0.1, C.stone);
      pb(-half, half, Y + H - 0.25, Y + H, -T - 0.1, T + 0.1, C.stone);
      pb(-0.18, 0.18, SPRING + R - 0.15, SPRING + R + 0.35, -T - 0.06, T + 0.06, C.stone); // keystone
      // raised stone block over the gateway carrying the trophy (crossed flags and drum, simplified)
      pb(-1.95, 1.95, Y + H, Y + H + 0.55, -0.42, 0.42, C.stone);
      pb(-1.05, 1.05, Y + H + 0.55, Y + H + 0.72, -0.34, 0.34, shade(C.stone, 0.96));
      ellipsoid(b, P3(0, Y + H + 1.05, 0) as V3, 0.45, 0.32, 0.3, C.stone);
      limb(b, P3(-0.9, Y + H + 0.8, 0) as V3, P3(0.7, Y + H + 1.9, 0) as V3, 0.05, 0.04, shade(C.stone, 0.95));
      limb(b, P3(0.9, Y + H + 0.8, 0) as V3, P3(-0.7, Y + H + 1.9, 0) as V3, 0.05, 0.04, shade(C.stone, 0.95));
      for (const sg of [-1, 1]) { const q0 = P3(sg * 0.15, Y + H + 1.15, 0.05), q1 = P3(sg * 0.75, Y + H + 1.85, 0.05), q2 = P3(sg * 0.85, Y + H + 1.35, 0.05); b.tri(q0, sg > 0 ? q1 : q2, sg > 0 ? q2 : q1, C.stone); b.tri(q0, sg > 0 ? q2 : q1, sg > 0 ? q1 : q2, shade(C.stone, 0.92)); }
      // open iron gates folded back against the reveals, and a lantern hanging in the arch
      for (const sg of [-1, 1]) for (let k = 0; k < 8; k++) { const qq = P3(sg * (R - 0.12), Y, T - 0.05 - k * 0.15); b.box(qq[0] - 0.015, Y, qq[2] - 0.015, qq[0] + 0.015, Y + 2.3, qq[2] + 0.015, C.iron); }
      const lp = P3(0, Y + 3.0, 0);
      b.box(lp[0] - 0.17, Y + 2.55, lp[2] - 0.17, lp[0] + 0.17, Y + 3.05, lp[2] + 0.17, hex('#d9cfa8'));
    }
    // the gate at the wall's end, where the railings begin: a brick pier with a stone cap
    for (const q of gatesOn.filter((g) => !main.includes(g))) {
      const { p, t } = along(wp, Math.min(L - 0.4, Math.max(0.4, q.s)));
      const n: Pt = [-t[1], t[0]];
      obox(b, p[0], Y, p[1], n, 0.8, H + 0.3, 0.8, C.brickDark);
      obox(b, p[0], Y + H + 0.3, p[1], n, 0.95, 0.2, 0.95, C.stone);
    }
    // gallery name pylons on the square side of the wall (permanent wayfinding; not exhibition banners)
    const squareSide: Pt = (() => { const m = along(wp, L / 2); const n: Pt = [-m.t[1], m.t[0]]; const q: Pt = [m.p[0] + n[0] * 3, m.p[1] + n[1] * 3]; return inPlaza(q[0], q[1]) || !pointIn(q[0], q[1], fc) ? n : [-n[0], -n[1]] as Pt; })();
    for (const sPos of [L * 0.28, L * 0.5 + 2.9, L * 0.72]) {
      if (main.some((q) => Math.abs(sPos - q.s) < 2.2)) continue;
      const { p, t } = along(wp, sPos);
      const n = squareSide;
      const sgn = Math.sign(n[0] * -t[1] + n[1] * t[0]) || 1;
      const P3 = (u: number, y: number, v: number) => [p[0] + t[0] * u + n[0] * v, y, p[1] + t[1] * u + n[1] * v];
      const m = new Float32Array(16);
      m.set([t[0], 0, t[1], 0, 0, 1, 0, 0, n[0], 0, n[1], 0, p[0], 0, p[1], 1]);
      void sgn;
      b.setTransform(m); b.box(-0.32, Y, 0.3, 0.32, Y + 3.7, 0.42, C.pylon); b.setTransform(null);
      // vertical lettering reading top to bottom
      const f = (u: number, y: number) => P3(u, y, 0.43);
      signs.push({ corners: [f(0.24, Y + 3.5), f(0.24, Y + 0.3), f(-0.24, Y + 0.3), f(-0.24, Y + 3.5)], text: 'SAATCHI GALLERY', bg: '#7f888f', fg: '#f4f4f2', weight: 600 });
    }
  }
  count('wall', v0);

  // ---- railings: OSM fence round the track (spear-top, ≈1.8 m in photos; OSM height=1), and along the
  // forecourt edge in front of the gallery (estimated where OSM maps the path but no fence)
  v0 = b.vertexCount;
  const railing = (pts: Pt[], h: number) => {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], c = pts[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
      // bars: a crossed pair of thin quads each (4 triangles), spear tips as small triangles
      const n = Math.max(1, Math.round(l / 0.14));
      const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l;
      for (let k = 0; k < n; k++) {
        const q: Pt = [a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n];
        const w = 0.014;
        b.quad([q[0] - ux * w, Y, q[1] - uz * w], [q[0] + ux * w, Y, q[1] + uz * w], [q[0] + ux * w, Y + h, q[1] + uz * w], [q[0] - ux * w, Y + h, q[1] - uz * w], C.iron);
        b.quad([q[0] + ux * w, Y, q[1] + uz * w], [q[0] - ux * w, Y, q[1] - uz * w], [q[0] - ux * w, Y + h, q[1] - uz * w], [q[0] + ux * w, Y + h, q[1] + uz * w], C.iron);
      }
      const rail = (y: number, hh: number) => {
        const ux = (c[0] - a[0]) / l, uz = (c[1] - a[1]) / l, nx = -uz * 0.02, nz = ux * 0.02;
        b.quad([a[0] + nx, y, a[1] + nz], [c[0] + nx, y, c[1] + nz], [c[0] + nx, y + hh, c[1] + nz], [a[0] + nx, y + hh, a[1] + nz], C.iron);
        b.quad([c[0] - nx, y, c[1] - nz], [a[0] - nx, y, a[1] - nz], [a[0] - nx, y + hh, a[1] - nz], [c[0] - nx, y + hh, c[1] - nz], C.iron);
      };
      rail(Y + 0.12, 0.05); rail(Y + h - 0.22, 0.05);
      for (let k = 0; k < l; k += 2.4) { const q: Pt = [a[0] + ((c[0] - a[0]) * k) / l, a[1] + ((c[1] - a[1]) * k) / l]; b.box(q[0] - 0.04, Y, q[1] - 0.04, q[0] + 0.04, Y + h + 0.05, q[1] + 0.04, C.iron); }
    }
  };
  const trackFence = d.fences.find((f) => f.osm === 'way/101938918');
  if (trackFence) railing(toPts(trackFence.pts), 1.8);
  if (d.forecourt) {
    // the forecourt's outer edge from the gallery's south-east end back to the wall: ring points after "se"
    const r = toPts(d.forecourt.ring);
    const iSE = r.findIndex((q, i) => i > 0 && Math.hypot(q[0] - 95.1, q[1] - 93.8) < 1.5);
    if (iSE > 0) railing([...r.slice(iSE + 1, r.length - 1), [14.0, 27.0]], 1.8);
  }
  count('railings', v0);

  // ---- hedge along the gallery front (clipped, ≈0.9 m), broken at the portico and the doors
  v0 = b.vertexCount;
  if (gallery) {
    const g = toPts(gallery);
    const sOf = (q: Pt) => q[0] * GU[0] + q[1] * GU[1], wOf = (q: Pt) => q[0] * -GN[0] + q[1] * -GN[1];
    const front = g.filter((q) => wOf(q) < Math.min(...g.map(wOf)) + 7);
    const fw = Math.min(...front.filter((q) => wOf(q) > Math.min(...g.map(wOf)) + 3).map(wOf));
    const s0 = Math.min(...g.map(sOf)), s1 = Math.max(...g.map(sOf));
    const L = s1 - s0, pc = s0 + L / 2;
    const at = (s: number, w: number): Pt => [GU[0] * s - GN[0] * w, GU[1] * s - GN[1] * w];
    const hedge = (sa: number, sb: number) => {
      const A = at(sa, fw - 0.5), B = at(sb, fw - 0.5), C2 = at(sb, fw - 1.6), D = at(sa, fw - 1.6);
      const hY = Y + 0.95;
      const q = (p: Pt, y: number) => [p[0], y, p[1]];
      b.quad(q(D, Y), q(C2, Y), q(C2, hY), q(D, hY), C.hedge);
      b.quad(q(B, Y), q(A, Y), q(A, hY), q(B, hY), shade(C.hedge, 0.9));
      b.quad(q(D, hY), q(C2, hY), q(B, hY), q(A, hY), C.hedgeTop);
      b.quad(q(A, Y), q(D, Y), q(D, hY), q(A, hY), shade(C.hedge, 0.85));
      b.quad(q(C2, Y), q(B, Y), q(B, hY), q(C2, hY), shade(C.hedge, 0.85));
    };
    const wing = (L - 13 * 3.4) / 2;
    const breaks = [[pc - 9, pc + 9], [s0 + wing - 0.4, s0 + wing + 0.4], [s1 - wing - 0.4, s1 - wing + 0.4]];
    let sa = s0 + 0.6;
    for (const [b0, b1] of breaks.sort((a, c) => a[0] - c[0])) { if (b0 - sa > 1) hedge(sa, b0); sa = Math.max(sa, b1); }
    if (s1 - 0.6 - sa > 1) hedge(sa, s1 - 0.6);
  }
  count('hedges', v0);

  // ---- running track and playing field (private, fenced): red track, grass infield
  v0 = b.vertexCount;
  if (d.track) {
    for (let i = 0; i + 5 < d.track.tris.length; i += 6) flatPoly(b, [[d.track.tris[i], d.track.tris[i + 1]], [d.track.tris[i + 2], d.track.tris[i + 3]], [d.track.tris[i + 4], d.track.tris[i + 5]]], 0.24, C.track);
    for (let i = 0; i + 5 < d.track.innerTris.length; i += 6) flatPoly(b, [[d.track.innerTris[i], d.track.innerTris[i + 1]], [d.track.innerTris[i + 2], d.track.innerTris[i + 3]], [d.track.innerTris[i + 4], d.track.innerTris[i + 5]]], 0.25, C.grass);
  }
  count('track', v0);

  // ---- benches (timber, long rows of 12 seats along the gallery path; stone benches in the square)
  v0 = b.vertexCount;
  for (const be of d.benches) {
    if ('pts' in be) {
      const pts = toPts(be.pts);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], c = pts[i + 1], l = Math.hypot(c[0] - a[0], c[1] - a[1]);
        const dir: Pt = [(c[0] - a[0]) / l, (c[1] - a[1]) / l];
        obox(b, (a[0] + c[0]) / 2, Y, (a[1] + c[1]) / 2, dir, 0.7, 0.45, l, be.material === 'stone' ? C.stone : C.timber);
      }
      continue;
    }
    const long = (be.seats ?? 0) >= 8;
    // orient parallel to the nearest wall/path: the gallery path for the long benches, the lane otherwise
    const dir: Pt = long ? GU : KR;
    const len = long ? 6 : 1.9;
    const nrm: Pt = [-dir[1], dir[0]];
    obox(b, be.x, Y, be.z, dir, 0.5, 0.42, len, C.timber);
    for (const s of [-0.45, 0.45]) obox(b, be.x + dir[0] * s * len, Y, be.z + dir[1] * s * len, dir, 0.55, 0.42, 0.08, C.steel);
    if (be.backrest === 'yes') obox(b, be.x + nrm[0] * 0.22, Y + 0.45, be.z + nrm[1] * 0.22, dir, 0.06, 0.42, len, C.timber);
  }
  // cycle stands (Sheffield stands in rows, estimated orientation along the square)
  for (const cs of d.cycleStands) {
    if (cs.kind === 'bollard') continue;
    const n = Math.min(12, Math.max(1, Math.round(cs.capacity / 2)));
    for (let i = 0; i < n; i++) {
      const t = (i - (n - 1) / 2) * 0.9;
      const x = cs.x + KR[0] * t, z = cs.z + KR[1] * t;
      for (const s of [-0.35, 0.35]) obox(b, x - KR[1] * s, Y, z + KR[0] * s, KR, 0.05, 0.8, 0.05, C.steel);
      obox(b, x, Y + 0.76, z, [-KR[1], KR[0]], 0.05, 0.05, 0.75, C.steel);
    }
  }
  count('furniture', v0);
  return { signs, stats };
}

/** Jet positions of the splash pad (local u along King's Road, v across); layout estimated. */
export function fountainJets(): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) out.push([-3.2 + i * 1.28, -1.6 + j * 1.6]);
  return out;
}

/** Sir Hans Sloane in court dress with a full wig (simplified figure, ≈2.1 m), facing yaw. */
function hansSloane(b: MeshBuilder, x: number, y: number, z: number, yaw: number): void {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P = (lx: number, ly: number, lz: number): V3 => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
  const m = C.marble, ms = shade(C.marble, 0.92);
  // legs, long coat (flared), waistcoat
  limb(b, P(-0.11, 0, 0), P(-0.1, 0.62, 0), 0.075, 0.08, ms);
  limb(b, P(0.11, 0, 0.05), P(0.1, 0.62, 0), 0.075, 0.08, ms);
  lathe(b, x, z, [[0.0, y + 0.55], [0.36, y + 0.6], [0.31, y + 1.2], [0.24, y + 1.55], [0.0, y + 1.6]].map(([r, yy]) => [r, yy]) as [number, number][], 10, () => m);
  // shoulders, arms (right hand on hip, left holding a book), head and wig
  ellipsoid(b, P(0, 1.55, 0), 0.28, 0.12, 0.17, m);
  limb(b, P(0.25, 1.52, 0), P(0.33, 1.2, 0.05), 0.07, 0.06, m);
  limb(b, P(0.33, 1.2, 0.05), P(0.2, 1.0, 0.12), 0.06, 0.05, m);
  limb(b, P(-0.25, 1.52, 0), P(-0.3, 1.18, 0.12), 0.07, 0.06, m);
  limb(b, P(-0.3, 1.18, 0.12), P(-0.18, 1.1, 0.25), 0.06, 0.05, m);
  obox(b, ...(P(-0.17, 1.05, 0.27) as [number, number, number]), [s, c], 0.22, 0.28, 0.06, ms);
  limb(b, P(0, 1.62, 0), P(0, 1.72, 0.01), 0.07, 0.07, m);
  ellipsoid(b, P(0, 1.84, 0.02), 0.11, 0.14, 0.12, m);
  ellipsoid(b, P(0, 1.8, -0.03), 0.19, 0.24, 0.15, ms, 8, 5); // full-bottomed wig
}

// ---- trees -------------------------------------------------------------------------------------------
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 100000; };

/** Trees within the modelled area: the square, the forecourt, the gallery path and the lane. */
export function doyTrees(d: DoyData, plaza: { ring: number[] }[]) {
  const fc = d.forecourt ? toPts(d.forecourt.ring) : [];
  const rings = plaza.map((p) => toPts(p.ring));
  return d.trees
    .filter((t) => t.x > -60 && t.x < 100 && t.z > -30 && t.z < 110)
    .map((t, i) => {
      const h = hash(t.osm), r = rng(9000 + (h % 997));
      // mature planes in the gallery grounds (photos: canopy above the 4 m wall and the 3-storey gallery);
      // medium planes in the square and the lane
      const grounds = fc.length > 0 && (pointIn(t.x, t.z, fc) || Math.min(...fc.map((q, k) => segD(t.x, t.z, q, fc[(k + 1) % fc.length]))) < 4);
      const square = rings.some((rr) => pointIn(t.x, t.z, rr));
      const spec: TreeSpec = grounds
        ? { height: 23 + r() * 5, spread: 15 + r() * 4, clearTrunk: 5.5 + r() * 2.5, trunkR: 0.55 + r() * 0.15, seed: 7100 + (h % 977) }
        : square
          ? { height: 15 + r() * 4, spread: 10 + r() * 3, clearTrunk: 3.8 + r() * 1.5, trunkR: 0.36 + r() * 0.1, seed: 7300 + (h % 977) }
          : { height: 12 + r() * 3, spread: 8 + r() * 3, clearTrunk: 3.2 + r() * 1.2, trunkR: 0.3 + r() * 0.08, seed: 7500 + (h % 977) };
      return { ...t, spec, yaw: ((h % 360) * Math.PI) / 180, phase: (h % 628) / 100 + i * 0.41, grounds };
    });
}

/** Adds the trees and the splash-pad jets to the shared nature builders. */
export function addDoyNature(d: DoyData, plaza: { ring: number[] }[], n: { branches: NatureBuilder; core: NatureBuilder; cards: NatureBuilder; lowB: NatureBuilder; lowF: NatureBuilder; water: NatureBuilder }): number {
  const ts = doyTrees(d, plaza);
  for (const t of ts) {
    const sk = planeSkeleton(t.spec);
    const o = { x: t.x, y: DOY_Y, z: t.z, yaw: t.yaw, phase: t.phase };
    // lighter than the square's 14 trees (Quest budget): branches to depth 2, two cards per tip
    buildBranches(n.branches, sk, o, 0, 2, (k) => (k === 0 ? 8 : k === 1 ? 5 : 4));
    buildCardFoliage(n.core, n.cards, sk, o, 2);
    buildBranches(n.lowB, sk, o, 0, 1, (k) => (k === 0 ? 6 : 4));
    buildClumpFoliage(n.lowF, sk, o, 0.22);
  }
  if (d.fountain) {
    const f = d.fountain, up: V3 = [0, 1, 0];
    const nn: Pt = [-KR[1], KR[0]];
    for (const [u, v] of fountainJets()) {
      const cx = f.x + KR[0] * u + nn[0] * v, cz = f.z + KR[1] * u + nn[1] * v;
      const h = 0.7 + ((Math.abs(u * 7 + v * 3) * 13) % 5) * 0.08;
      for (const [ax, az] of [[0.06, 0], [0, 0.06]] as Pt[]) {
        const A: V3 = [cx - ax, DOY_Y, cz - az], B: V3 = [cx + ax, DOY_Y, cz + az], Cc: V3 = [cx + ax * 0.3, DOY_Y + h, cz + az * 0.3], D: V3 = [cx - ax * 0.3, DOY_Y + h, cz - az * 0.3];
        for (const p of [A, B, Cc, A, Cc, D]) n.water.vert(p, up, C.water);
        for (const p of [B, A, D, B, D, Cc]) n.water.vert(p, up, C.water);
      }
      // wet sheen ring on the granite
      for (let k = 0; k < 8; k++) {
        const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
        n.water.vert([cx, DOY_Y + 0.01, cz], up, C.water); n.water.vert([cx + Math.cos(a1) * 0.45, DOY_Y + 0.01, cz + Math.sin(a1) * 0.45], up, C.water); n.water.vert([cx + Math.cos(a0) * 0.45, DOY_Y + 0.01, cz + Math.sin(a0) * 0.45], up, C.water);
      }
    }
  }
  return ts.length;
}

export const DOY_PLAZA_IDS = ['w5318345', 'w900260769'];
