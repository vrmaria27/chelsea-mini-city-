// Duke of York Square and the Saatchi Gallery: individual reconstructions replacing the generic OSM
// extrusions. Footprints are OpenStreetMap's (ODbL). Composition, storey heights and materials come from
// the Historic England list entries (Duke of York's Headquarters, 1266717; Chapel, 1224627) and dated,
// openly licensed photographs (see docs/duke-of-york-square.md for the inventory and confidence of each
// element). Heights not given by a source are estimates scaled from photographs (window bay ≈ 3.4 m).
// Exhibition banners, markets and seasonal decorations are not part of these models.
import { MeshBuilder, hex, shade, type RGB } from '../../engine/geometry';
import { F, chimney, edgesOf, type Front, type Pt } from './facadeKit';
import { flatLid, partyWall, sign, walls, type Ctx } from './buildingKit';

// ---- palette (from photographs; colours are estimates) ---------------------------------------------
const C = {
  stock: hex('#b99f6c'), // yellow stock brick, weathered gold-buff
  stockDark: hex('#a88f5f'),
  gauged: hex('#c0965e'), // rubbed-brick arches
  stone: hex('#e2dccd'),
  stoneShade: hex('#d3ccbb'),
  sash: hex('#efebe2'),
  glass: hex('#29323a'),
  doorGreen: hex('#2e4a3d'),
  slate: hex('#59606a'),
  lead: hex('#7d838a'),
  white: hex('#eeece6'),
  precast: hex('#ebe8e0'), // Vardo's quartz concrete
  steel: hex('#3a3d41'),
  timber: hex('#9c7a55'),
};

// ---- local building frame ------------------------------------------------------------------------
/** Orthogonal frame on the ground: s along `u`, w along `v` = (u.z, −u.x). P(s, w) → map x/z. */
class Frame {
  readonly v: Pt;
  constructor(readonly o: Pt, readonly u: Pt) { this.v = [u[1], -u[0]]; }
  P(s: number, w: number): Pt { return [this.o[0] + this.u[0] * s + this.v[0] * w, this.o[1] + this.u[1] * s + this.v[1] * w]; }
  sw(p: Pt): [number, number] {
    const dx = p[0] - this.o[0], dz = p[1] - this.o[1];
    return [dx * this.u[0] + dz * this.u[1], dx * this.v[0] + dz * this.v[1]];
  }
  /** Façade on the line w = const from s0 to s1, facing −v (dir = −1) or +v (dir = +1). */
  alongS(s0: number, s1: number, w: number, dir: 1 | -1): Front {
    return frontOf(this.P(s0, w), this.P(s1, w), dir < 0 ? [-this.v[0], -this.v[1]] : this.v);
  }
  /** Façade on the line s = const from w0 to w1, facing −u (dir = −1) or +u (dir = +1). */
  alongW(s: number, w0: number, w1: number, dir: 1 | -1): Front {
    return frontOf(this.P(s, w0), this.P(s, w1), dir < 0 ? [-this.u[0], -this.u[1]] : this.u);
  }
}

/** A Front between two points with a given outward normal (ends ordered left → right from outside). */
function frontOf(a: Pt, b: Pt, n: Pt): Front {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t: Pt = [n[1], -n[0]];
  if ((b[0] - a[0]) * t[0] + (b[1] - a[1]) * t[1] < 0) [a, b] = [b, a];
  return { a, b, len, t, n };
}

/** Hipped roof over the frame rectangle [s0,s1] × [w0,w1] from eaves y, rising h. */
function hipRoof(b: MeshBuilder, fr: Frame, s0: number, s1: number, w0: number, w1: number, y: number, h: number, col: RGB): void {
  const ls = s1 - s0, lw = w1 - w0;
  const half = Math.min(ls, lw) / 2;
  const P3 = (s: number, w: number, yy: number) => { const p = fr.P(s, w); return [p[0], yy, p[1]]; };
  const A = P3(s0, w0, y), B = P3(s1, w0, y), Cc = P3(s1, w1, y), D = P3(s0, w1, y);
  let R0: number[], R1: number[];
  if (ls >= lw) { R0 = P3(s0 + half, (w0 + w1) / 2, y + h); R1 = P3(s1 - half, (w0 + w1) / 2, y + h); }
  else { R0 = P3((s0 + s1) / 2, w0 + half, y + h); R1 = P3((s0 + s1) / 2, w1 - half, y + h); }
  const up = (p: number[], q: number[], r: number[], c: RGB) => {
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const ny = uz * vx - ux * vz;
    void uy; void vy;
    if (ny > 0) b.tri(p, q, r, c); else b.tri(p, r, q, c);
  };
  if (ls >= lw) {
    up(A, B, R1, col); up(A, R1, R0, col); // front slope (w0 side)
    up(Cc, D, R0, shade(col, 0.95)); up(Cc, R0, R1, shade(col, 0.95));
    up(B, Cc, R1, shade(col, 1.04)); up(D, A, R0, shade(col, 0.92)); // hips
  } else {
    up(B, Cc, R1, col); up(B, R1, R0, col);
    up(D, A, R0, shade(col, 0.95)); up(D, R0, R1, shade(col, 0.95));
    up(A, B, R0, shade(col, 1.04)); up(Cc, D, R1, shade(col, 0.92));
  }
}

const bayCentres = (u0: number, u1: number, n: number) => Array.from({ length: n }, (_, i) => u0 + ((i + 0.5) * (u1 - u0)) / n);

// ---- Georgian elevation vocabulary (Duke of York's HQ group, 1801; chapel 1824) -------------------
interface Storeys { plinth: number; band0: number; band1: number; ff: [number, number]; sf: [number, number] | null; cornice: number; top: number }
const HQ: Storeys = { plinth: 0.45, band0: 4.35, band1: 4.75, ff: [5.35, 7.65], sf: [8.35, 9.85], cornice: 10.75, top: 11.55 };

/** Plinth, stone band, cornice and blocking course across one front. */
function georgianFrame(fr: F, s: Storeys, u0 = 0, u1 = fr.len): void {
  fr.box(u0, u1, 0, s.plinth, 0, 0.1, C.stoneShade);
  fr.box(u0 - 0.02, u1 + 0.02, s.band0, s.band1, 0, 0.12, C.stone);
  fr.box(u0 - 0.05, u1 + 0.05, s.cornice - 0.45, s.cornice, 0, 0.42, C.stone, true);
  fr.box(u0 - 0.05, u1 + 0.05, s.cornice, s.top, -0.02, 0.12, C.stone);
}

/** One window bay: ground storey round-headed window in a gauged-brick arch, sash above. */
function georgianBay(fr: F, u: number, s: Storeys, o: { ground?: 'arch' | 'arcade' | 'none' | 'door'; balustrade?: boolean } = {}): void {
  const g = o.ground ?? 'arch';
  if (g === 'arch') fr.window(u, 1.25, 1.2, 2.75, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.09, depth: 0.1 }), fr.archRing(u, 1.25 + 2.75 - 0.6, 0.69, 0.69, 0.32, 0.06, C.gauged);
  else if (g === 'arcade') {
    // open arcade arch with a recessed (dark green) door or window behind
    fr.wall(u - 1.15, u + 1.15, s.plinth, 2.75, C.doorGreen, -0.35);
    fr.arch(u, 2.75, 1.15, 1.15, C.doorGreen, -0.35, 10);
    fr.box(u - 1.45, u - 1.15, s.plinth, 2.75, -0.35, 0.02, C.stockDark);
    fr.box(u + 1.15, u + 1.45, s.plinth, 2.75, -0.35, 0.02, C.stockDark);
    fr.archRing(u, 2.75, 1.15, 1.15, 0.34, 0.06, C.gauged, 10);
  } else if (g === 'door') {
    fr.wall(u - 0.8, u + 0.8, s.plinth, 3.4, C.doorGreen, 0.02);
    fr.arch(u, 3.4, 0.8, 0.8, C.glass, 0.02);
    fr.archRing(u, 3.4, 0.8, 0.8, 0.3, 0.08, C.stone);
    fr.box(u - 1.1, u - 0.8, s.plinth, 3.4, 0, 0.1, C.stone);
    fr.box(u + 0.8, u + 1.1, s.plinth, 3.4, 0, 0.1, C.stone);
  }
  // first floor: tall sash with gauged flat arch, short balustrade panel below (stone)
  const [f0, f1] = s.ff;
  fr.window(u, f0, 1.2, f1 - f0, { frame: C.sash, glass: C.glass, bars: 1, frameW: 0.09, sill: false });
  fr.box(u - 0.72, u + 0.72, f1, f1 + 0.32, 0, 0.04, C.gauged, false, false);
  if (o.balustrade !== false) fr.balustrade(u - 0.75, u + 0.75, s.band1, f0 - s.band1, C.stone, 0, 0.16);
  if (s.sf) {
    const [g0, g1] = s.sf;
    fr.window(u, g0, 1.15, g1 - g0, { frame: C.sash, glass: C.glass, bars: 1, frameW: 0.09 });
    fr.box(u - 0.68, u + 0.68, g1, g1 + 0.28, 0, 0.04, C.gauged, false, false);
  }
}

// ---- Saatchi Gallery (Duke of York's Headquarters; John Sanders, 1801; Grade II*) ---------------------
// HE 1266717: three storeys; thirteen windows wide with wing ends three windows wide; yellow brick with a
// stone pedimented Roman Doric tetrastyle portico; stone cornice and blocking course; band below the
// first-floor balustrade; ground-floor windows arched and recessed; gauged flat arches above. Photos
// (2019–2026): the portico projects ≈5 m on the south-west front (OSM jog), with the name on the frieze;
// the wing ends have open ground-floor arches with green doors; hipped slate roofs with paired stacks.
function saatchi(c: Ctx): void {
  const ring = c.bl.rings[0];
  // frame: u along the long south-west front (bearing ≈ 142°), v toward the back (north-east)
  const edges = edgesOf(ring);
  const u0: Pt = [0.619, 0.785];
  let ux = 0, uz = 0;
  for (const e of edges) { const d = e.t[0] * u0[0] + e.t[1] * u0[1]; if (Math.abs(d) > 0.985 && e.len > 8) { const sg = Math.sign(d); ux += e.t[0] * sg * e.len; uz += e.t[1] * sg * e.len; } }
  const ul = Math.hypot(ux, uz);
  const u: Pt = [ux / ul, uz / ul];
  let fr0 = new Frame([0, 0], u);
  const pts: Pt[] = []; for (let i = 0; i < ring.length; i += 2) pts.push([ring[i], ring[i + 1]]);
  const sw = pts.map((p) => fr0.sw(p));
  const sMin = Math.min(...sw.map((q) => q[0])), sMax = Math.max(...sw.map((q) => q[0]));
  // the main front line: the most common w among front points with w > the portico jog
  const frontW = Math.min(...sw.filter((q) => q[1] > Math.min(...sw.map((r) => r[1])) + 3).map((q) => q[1]));
  const fr = new Frame(fr0.P(sMin, frontW), u);
  fr0 = fr;
  const L = sMax - sMin; // ≈ 65.6 m
  const S = HQ;
  const local = pts.map((p) => fr.sw(p));
  const jogW = Math.min(...local.map((q) => q[1])); // portico front (≈ −5.9)
  const jog = local.filter((q) => q[1] < -2);
  const ps0 = Math.min(...jog.map((q) => q[0])), ps1 = Math.max(...jog.map((q) => q[0]));
  const pc = (ps0 + ps1) / 2; // portico centre (≈ L / 2)

  // body walls (backs, ends and party walls plain; Georgian treatment on exposed faces)
  for (const e of edges) {
    const m: Pt = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
    const [ms, mw] = fr.sw(m);
    if (mw < -1.5) continue; // the portico jog is built below
    const f = new F(c.b, e);
    f.wall(0, e.len, 0, S.top, C.stock);
    const facingFront = e.n[0] * -fr.v[0] + e.n[1] * -fr.v[1] > 0.9;
    if (facingFront || e.len < 2.5) continue;
    if (partyWall(c, e)) {
      // a neighbour abuts part of this wall: treat only the exposed run(s) as façade
      for (const [r0, r1] of exposedRuns(c, e)) {
        const sub = new F(c.b, { ...e, a: [e.a[0] + e.t[0] * r0, e.a[1] + e.t[1] * r0], len: r1 - r0 });
        georgianFrame(sub, S);
        const k = Math.floor((r1 - r0 - 0.8) / 3.4);
        if (k >= 1) for (const uu of bayCentres(0.4, r1 - r0 - 0.4, k)) georgianBay(sub, uu, S, { ground: 'arcade', balustrade: false });
      }
      continue;
    }
    // ends, back and rear wing: same storeys, plainer ground floor
    georgianFrame(f, S);
    const n = Math.floor((e.len - 1.2) / 3.4);
    if (n >= 1) for (const uu of bayCentres(0.6, e.len - 0.6, n)) georgianBay(f, uu, S, { ground: ms < 1 || ms > L - 1 ? 'arcade' : 'arch', balustrade: false });
  }
  // the long south-west front, one continuous composition across the portico gap
  const front = new F(c.b, fr.alongS(0, L, 0, -1));
  front.wall(ps0 - 0.05, ps1 + 0.05, 0, S.top, C.stock, -0.02);
  georgianFrame(front, S);
  const wing = (L - 13 * 3.4) / 2; // wing ends three windows wide, thirteen windows between
  for (const uu of bayCentres(0, wing, 3)) georgianBay(front, uu, S, { ground: 'arcade' });
  for (const uu of bayCentres(L - wing, L, 3)) georgianBay(front, uu, S, { ground: 'arcade' });
  const main = bayCentres(wing, L - wing, 13);
  main.forEach((uu, i) => georgianBay(front, uu, S, { ground: i === 6 ? 'door' : 'arch' }));
  // slight breaks between wing ends and the main range (pilaster strips)
  for (const uu of [wing, L - wing]) front.box(uu - 0.3, uu + 0.3, S.plinth, S.cornice - 0.45, 0, 0.08, C.stockDark);

  // portico: four Roman Doric columns on a stepped podium, entablature with the name, pediment
  const P = new F(c.b, fr.alongS(0, L, 0, -1));
  const depth = -jogW - 0.3; // column line set back from the OSM jog front (steps in front)
  const floor = 1.0;
  const colY1 = 8.55, arch0 = 8.55, frieze0 = 9.15, frieze1 = 9.85, cor1 = 10.3;
  const halfW = 6.2;
  // podium and steps across the jog
  for (let k = 0; k < 6; k++) {
    const y1 = (k + 1) * (floor / 6);
    const v1 = depth + 0.3 - k * 0.32;
    P.box(pc - halfW - 1.2 + k * 0.05, pc + halfW + 1.2 - k * 0.05, k * (floor / 6), y1, 0, v1, k % 2 ? C.stoneShade : C.stone);
  }
  const colU = [pc - 5.4, pc - 1.8, pc + 1.8, pc + 5.4];
  for (const cu of colU) {
    const base = P.P(cu, floor, depth - 0.5);
    columnAt(c.b, base[0], base[2], floor, colY1, 0.48, C.stone);
  }
  // responds (pilasters) against the wall
  for (const cu of [pc - 5.4, pc + 5.4]) P.box(cu - 0.45, cu + 0.45, floor, colY1, 0, 0.18, C.stone);
  // soffit, entablature (architrave, frieze, cornice) and pediment
  P.box(pc - halfW, pc + halfW, arch0, frieze0, 0, depth, C.stone, true);
  P.box(pc - halfW + 0.1, pc + halfW - 0.1, arch0 - 0.03, arch0, 0.05, depth - 0.1, hex('#f7f5ef'), true); // light ceiling
  P.box(pc - halfW, pc + halfW, frieze0, frieze1, 0, depth - 0.05, C.white, false);
  P.box(pc - halfW - 0.25, pc + halfW + 0.25, frieze1, cor1, 0, depth + 0.3, C.stone, true);
  // pediment: front face and the raking roof back to the main wall
  const pedH = 2.25;
  const L0 = P.P(pc - halfW - 0.25, cor1, depth + 0.25), R0 = P.P(pc + halfW + 0.25, cor1, depth + 0.25), T0 = P.P(pc, cor1 + pedH, depth + 0.25);
  c.b.tri(L0, R0, T0, C.stone);
  const Lb = P.P(pc - halfW - 0.25, cor1, -0.3), Rb = P.P(pc + halfW + 0.25, cor1, -0.3), Tb = P.P(pc, cor1 + pedH, -0.3);
  c.b.quad(L0, T0, Tb, Lb, C.lead);
  c.b.quad(T0, R0, Rb, Tb, shade(C.lead, 0.94));
  // raking cornice mouldings and the coat of arms (simplified relief)
  P.box(pc - 1.1, pc + 1.1, cor1 + 0.35, cor1 + 1.45, depth + 0.25, depth + 0.45, C.stoneShade);
  P.box(pc - 0.5, pc + 0.5, cor1 + 1.45, cor1 + 1.8, depth + 0.25, depth + 0.42, C.stoneShade);
  // inscription on the frieze and architrave (permanent; letters only)
  sign(c, P, pc - 4.6, pc + 4.6, frieze0 + 0.12, frieze1 - 0.1, depth - 0.03, "DUKE  OF  YORK'S", '#ebe8df', '#4a4a48', { font: 'serif', spacing: 1.5 });
  sign(c, P, pc - 3.4, pc + 3.4, arch0 + 0.12, frieze0 - 0.08, depth + 0.01, 'HEADQUARTERS', '#e2dccd', '#4a4a48', { font: 'serif', spacing: 1.3 });
  // portico ceiling lamp-free; back wall door already in the central bay

  // roofs: hipped slate over the main range and the rear wing, lids under them, paired stacks
  const rear = local.filter((q) => q[1] > 30);
  const rs0 = rear.length ? Math.min(...rear.map((q) => q[0])) : pc - 9, rs1 = rear.length ? Math.max(...rear.map((q) => q[0])) : pc + 9;
  // main range back wall: the shallowest back line (the deeper middle is covered by the rear wing's roof)
  const back = Math.min(...local.filter((q) => q[1] > 15 && q[1] < 30).map((q) => q[1]));
  const rearBack = rear.length ? Math.max(...rear.map((q) => q[1])) : back;
  const eaves = S.top - 0.15;
  flatLid(c.b, c.bl.tris.length ? lidTris(fr, -0.4, L + 0.4, -0.6, back + 0.4) : [], eaves, C.slate);
  hipRoof(c.b, fr, -0.4, L + 0.4, -0.6, back + 0.4, eaves, 3.4, C.slate);
  if (rear.length) hipRoof(c.b, fr, rs0 - 0.3, rs1 + 0.3, back - 1, rearBack + 0.3, eaves - 0.01, 3.0, shade(C.slate, 0.97));
  for (const s of [5.2, 21.5, L - 21.5, L - 5.2]) for (const w of [4.2, back - 4.2]) {
    const p = fr.P(s, w);
    chimney(c.b, p[0], p[1], 1.9, 0.9, eaves + 1.2, eaves + 4.6, hex('#b39565'), Math.atan2(-u[1], u[0]), 4);
  }
}

/** Runs (u0, u1) of an edge with no neighbouring building directly outside it, at least 3 m long. */
function exposedRuns(c: Ctx, e: Front): [number, number][] {
  const inR = (x: number, z: number, r: number[]) => { let ins = false; for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) { const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1]; if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
  const out: [number, number][] = [];
  let start = -1;
  const n = Math.max(2, Math.ceil(e.len / 0.5));
  for (let k = 0; k <= n; k++) {
    const u = (k / n) * e.len;
    const x = e.a[0] + e.t[0] * u + e.n[0] * 1.0, z = e.a[1] + e.t[1] * u + e.n[1] * 1.0;
    const free = k < n && !c.others.some((r) => inR(x, z, r));
    if (free && start < 0) start = u;
    if ((!free || k === n) && start >= 0) { if (u - start >= 3) out.push([start, u - 0.3]); start = -1; }
  }
  return out;
}

/** Two triangles covering a frame rectangle (for lids). */
function lidTris(fr: Frame, s0: number, s1: number, w0: number, w1: number): number[] {
  const a = fr.P(s0, w0), b = fr.P(s1, w0), c = fr.P(s1, w1), d = fr.P(s0, w1);
  return [a[0], a[1], b[0], b[1], c[0], c[1], a[0], a[1], c[0], c[1], d[0], d[1]];
}

/** Free-standing Roman Doric column: base, slightly tapered shaft, capital with abacus. */
function columnAt(b: MeshBuilder, x: number, z: number, y0: number, y1: number, r: number, col: RGB): void {
  const n = 12;
  const ring = (y: number, rr: number) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2; return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr]; });
  const band = (ya: number, ra: number, yb: number, rb: number, c: RGB) => {
    const A = ring(ya, ra), B = ring(yb, rb);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; b.quad(A[j], A[i], B[i], B[j], i % 2 ? c : shade(c, 0.97)); }
  };
  b.box(x - r * 1.35, y0, z - r * 1.35, x + r * 1.35, y0 + 0.22, z + r * 1.35, shade(col, 0.96)); // plinth
  band(y0 + 0.22, r * 1.18, y0 + 0.42, r * 1.05, col);
  band(y0 + 0.42, r, y1 - 0.55, r * 0.86, col); // entasis approximated by taper
  band(y1 - 0.55, r * 0.86, y1 - 0.35, r * 0.9, shade(col, 1.02)); // necking
  band(y1 - 0.35, r * 0.95, y1 - 0.18, r * 1.18, col); // echinus
  b.box(x - r * 1.3, y1 - 0.18, z - r * 1.3, x + r * 1.3, y1, z + r * 1.3, shade(col, 1.03)); // abacus
}

// ---- Chapel to the Duke of York's HQ (1824; Grade II*), now a shop ------------------------------
// HE 1224627 / photos 2013–2022: yellow stock brick, stone cornice and blocking course, low hipped roof;
// tall round-headed windows; King's Road front of four bays with arched ground-floor windows in arched
// recesses; a single-storey projection toward the square with a Doric colonnade in antis.
function chapel(c: Ctx): void {
  const ring = c.bl.rings[0];
  const edges = edgesOf(ring);
  const E = 8.6, top = 9.3;
  const longEdges = edges.filter((e) => e.len > 12);
  // main body: walls to the cornice on the long edges; the short projection edges are single-storey
  const proj = edges.filter((e) => e.len <= 9);
  for (const e of edges) {
    const f = new F(c.b, e);
    const low = proj.includes(e);
    f.wall(0, e.len, 0, low ? 4.6 : top, C.stock);
    if (partyWall(c, e)) continue;
    if (low) {
      f.box(-0.05, e.len + 0.05, 4.2, 4.6, 0, 0.3, C.stone, true);
      if (e.len > 6) {
        // colonnade in antis: two Doric columns between end piers, shop glazing behind
        f.wall(0.9, e.len - 0.9, 0.3, 3.9, C.glass, -1.2);
        for (const cu of [e.len * 0.36, e.len * 0.64]) { const p = f.P(cu, 0, -0.35); columnAt(c.b, p[0], p[2], 0.15, 4.2, 0.3, C.stone); }
        f.box(-0.05, 0.9, 0.15, 4.2, -0.02, 0.08, C.stock);
        f.box(e.len - 0.9, e.len + 0.05, 0.15, 4.2, -0.02, 0.08, C.stock);
        f.wall(0.9, e.len - 0.9, 3.9, 4.2, C.stone, -1.2);
      } else if (e.len > 2.6) {
        f.window(e.len / 2, 0.5, Math.min(2.2, e.len - 0.9), 3.1, { frame: C.stone, glass: C.glass, head: 'round', bars: 0, frameW: 0.14 });
      }
      continue;
    }
    // main storeys
    f.box(-0.02, e.len + 0.02, 0, 0.4, 0, 0.08, C.stoneShade);
    f.box(-0.05, e.len + 0.05, E - 0.4, E, 0, 0.38, C.stone, true);
    f.box(-0.05, e.len + 0.05, E, top, -0.02, 0.1, C.stone);
    const n = e.len > 20 ? 4 : e.len > 13 ? 3 : 2;
    for (const uu of bayCentres(1.2, e.len - 1.2, n)) {
      if (longEdges.includes(e) && e.len > 20) {
        // King's Road front: arched ground-floor windows in arched recesses, sashes above
        f.wall(uu - 1.0, uu + 1.0, 0.4, 3.0, C.stockDark, -0.12);
        f.arch(uu, 3.0, 1.0, 1.0, C.stockDark, -0.12, 10);
        f.window(uu, 1.0, 1.25, 2.55, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.09 });
        f.window(uu, 5.1, 1.2, 2.2, { frame: C.sash, glass: C.glass, bars: 1, frameW: 0.09 });
      } else {
        // tall round-headed chapel windows
        f.window(uu, 4.9, 1.05, 3.0, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.09 });
        f.window(uu, 1.0, 1.2, 2.4, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.09 });
      }
    }
  }
  // low hipped roof over the main body (oriented on the King's Road front)
  const kr = longEdges.sort((a, b) => b.len - a.len)[0];
  const fr = new Frame(kr.a, kr.t);
  const local = (() => { const o: [number, number][] = []; for (let i = 0; i < ring.length; i += 2) o.push(fr.sw([ring[i], ring[i + 1]])); return o; })();
  const sAll0 = Math.min(...local.map((q) => q[0])), sAll1 = Math.max(...local.map((q) => q[0]));
  // the body spans the King's Road front; the projection extends beyond one end
  const krS = [fr.sw(kr.a)[0], fr.sw(kr.b)[0]];
  const s0 = Math.max(sAll0, Math.min(...krS) - 0.2), s1 = Math.min(sAll1, Math.max(...krS) + 0.2);
  // body depth: the far long edge (the deepest point from the King's Road front)
  const wBody = local.reduce((m, q) => (Math.abs(q[1]) > Math.abs(m) ? q[1] : m), 0);
  const w0 = Math.min(0, wBody), w1 = Math.max(0, wBody);
  flatLid(c.b, lidTris(fr, s0, s1, w0, w1), top - 0.05, C.slate);
  hipRoof(c.b, fr, s0 - 0.15, s1 + 0.15, w0 - 0.15, w1 + 0.15, top - 0.05, 2.0, C.slate);
  // the body's square-side wall above the single-storey projection (no footprint edge runs there):
  // the projection sits on the short end nearer the projection edges' midpoints
  const pm = proj.map((e) => fr.sw([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2])[0]);
  const pAvg = pm.reduce((a, b) => a + b, 0) / Math.max(1, pm.length);
  const atEnd = Math.abs(pAvg - s0) < Math.abs(pAvg - s1) ? s0 : s1;
  const side = new F(c.b, fr.alongW(atEnd, w0, w1, atEnd === s0 ? -1 : 1));
  side.wall(0, side.len, 4.2, top, C.stock);
  side.box(-0.05, side.len + 0.05, E - 0.4, E, 0, 0.38, C.stone, true);
  side.box(-0.05, side.len + 0.05, E, top, -0.02, 0.1, C.stone);
  for (const uu of bayCentres(1.2, side.len - 1.2, 3)) side.window(uu, 5.0, 1.05, 2.9, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.09 });
}

// ---- Vardo (Nex, 2018): circular restaurant pavilion ---------------------------------------------
// RIBA Journal: circular, "no front or back"; precast Dolomite-quartz concrete arches; three curved
// glass walls that can sink into the floor; a planted, walkable roof garden reached by a timber stair,
// "4 m high"; photos 2020–2023: white arches on slim piers, roof parapet with a steel rail, a small drum
// (stair/lift) on the roof.
function vardo(c: Ctx): void {
  const ring = c.bl.rings[0];
  let cx = 0, cz = 0;
  const n0 = ring.length / 2;
  for (let i = 0; i < ring.length; i += 2) { cx += ring[i] / n0; cz += ring[i + 1] / n0; }
  let r = 0;
  for (let i = 0; i < ring.length; i += 2) r += Math.hypot(ring[i] - cx, ring[i + 1] - cz) / n0;
  const b = c.b;
  const arches = 12, H = 3.9, springY = 1.75, rise = 1.55;
  const P = (a: number, rr: number, y: number) => [cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr];
  // glazed drum behind the arches
  const gN = 36, gr = r - 0.9;
  for (let i = 0; i < gN; i++) {
    const a0 = (i / gN) * Math.PI * 2, a1 = ((i + 1) / gN) * Math.PI * 2;
    b.quad(P(a1, gr, 0.05), P(a0, gr, 0.05), P(a0, gr, H - 0.4), P(a1, gr, H - 0.4), C.glass);
  }
  // precast shell: piers and arch spandrels, the roof slab with a thick edge
  for (let k = 0; k < arches; k++) {
    const a = (k / arches) * Math.PI * 2, step = (Math.PI * 2) / arches;
    const pier = step * 0.09;
    const seg = 8;
    // pier faces
    for (const [p0, p1] of [[a - pier, a + pier]] as [number, number][]) {
      b.quad(P(p1, r, 0), P(p0, r, 0), P(p0, r, springY), P(p1, r, springY), C.precast);
      b.quad(P(p0, r, 0), P(p0, gr, 0), P(p0, gr, springY), P(p0, r, springY), shade(C.precast, 0.92));
      b.quad(P(p1, gr, 0), P(p1, r, 0), P(p1, r, springY), P(p1, gr, springY), shade(C.precast, 0.92));
    }
    // arch spandrel between this pier and the next: semicircular-ish opening in the shell
    const s0 = a + pier, s1 = a + step - pier;
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const q0 = s0 + (s1 - s0) * t0, q1 = s0 + (s1 - s0) * t1;
      const y0 = springY + Math.sqrt(Math.max(0, Math.sin(t0 * Math.PI))) * rise, y1 = springY + Math.sqrt(Math.max(0, Math.sin(t1 * Math.PI))) * rise;
      b.quad(P(q1, r, y1), P(q0, r, y0), P(q0, r, H), P(q1, r, H), C.precast);
      // arch soffit
      b.quad(P(q0, r, y0), P(q1, r, y1), P(q1, gr, y1), P(q0, gr, y0), shade(C.precast, 0.8));
    }
    b.quad(P(a + pier, r, springY), P(a - pier, r, springY), P(a - pier, r, H), P(a + pier, r, H), C.precast);
  }
  // roof slab underside, top and the planted edge with a steel rail
  const rN = 36;
  for (let i = 0; i < rN; i++) {
    const a0 = (i / rN) * Math.PI * 2, a1 = ((i + 1) / rN) * Math.PI * 2;
    b.tri([cx, H, cz], P(a1, r, H), P(a0, r, H), hex('#8f9a7a')); // planted roof (seen from above)
    b.quad(P(a1, r, H), P(a0, r, H), P(a0, r, H + 0.35), P(a1, r, H + 0.35), C.precast); // parapet face
    b.quad(P(a0, r - 0.3, H + 0.35), P(a1, r - 0.3, H + 0.35), P(a1, r, H + 0.35), P(a0, r, H + 0.35), shade(C.precast, 1.05));
    b.quad(P(a0, r - 0.3, H + 0.35), P(a0, r - 0.3, H), P(a1, r - 0.3, H), P(a1, r - 0.3, H + 0.35), shade(C.precast, 0.9));
    b.quad(P(a1, r - 0.15, H + 1.35), P(a0, r - 0.15, H + 1.35), P(a0, r - 0.15, H + 1.4), P(a1, r - 0.15, H + 1.4), C.steel);
    if (i % 3 === 0) b.quad(P(a0 + 0.01, r - 0.15, H + 0.35), P(a0 - 0.01, r - 0.15, H + 0.35), P(a0 - 0.01, r - 0.15, H + 1.35), P(a0 + 0.01, r - 0.15, H + 1.35), C.steel);
    // planting band inside the parapet
    b.quad(P(a0, r - 1.3, H + 0.55), P(a1, r - 1.3, H + 0.55), P(a1, r - 0.3, H + 0.55), P(a0, r - 0.3, H + 0.55), hex('#6f8d55'));
  }
  // rooftop drum (stair / lift enclosure), offset toward the back
  const da = Math.atan2(cz - 40, cx - 60); // away from the gallery side (approximate placement)
  const dx = cx + Math.cos(da) * r * 0.35, dz = cz + Math.sin(da) * r * 0.35;
  b.cylinder(dx, dz, H, H + 2.6, 2.2, 20, C.precast);
  b.cylinder(dx, dz, H + 2.6, H + 2.75, 2.35, 20, shade(C.precast, 1.03));
}

// ---- Corner block on Duke of York Square (King's Road corner; c. 2003) -----------------------------
// Photos 2023–2025: white stone ground floor with shopfronts between pilasters; three storeys of
// yellow-buff brick with stone-framed windows and Juliet balconies; a recessed top storey under a thin
// white canopy roof; a fully glazed stair bay on the square side. Shop names are not modelled.
function cornerBlock(c: Ctx): void {
  const E = 12.2, top = 15.4;
  walls(c, E, C.stock);
  const edges = edgesOf(c.bl.rings[0]);
  for (const e of edges) {
    if (partyWall(c, e) || e.len < 3) continue;
    const f = new F(c.b, e);
    // ground floor: stone with pilasters and shop glazing
    f.box(-0.05, e.len + 0.05, 0, 4.3, 0, 0.18, C.white);
    const nb = Math.max(1, Math.round(e.len / 4.2));
    for (const uu of bayCentres(0.3, e.len - 0.3, nb)) f.wall(uu - 1.55, uu + 1.55, 0.35, 3.6, C.glass, 0.19);
    for (let k = 0; k <= nb; k++) { const uu = 0.3 + (k * (e.len - 0.6)) / nb; f.box(uu - 0.3, uu + 0.3, 0, 4.3, 0.18, 0.32, C.white); }
    f.box(-0.08, e.len + 0.08, 4.3, 4.65, 0, 0.36, C.stone, true);
    // brick storeys: pairs of stone-framed windows with Juliet balconies on the first floor
    const nw = Math.max(1, Math.round(e.len / 3.1));
    for (const uu of bayCentres(0.5, e.len - 0.5, nw)) {
      for (let s = 0; s < 3; s++) f.window(uu, 5.3 + s * 2.35, 1.1, s === 0 ? 1.85 : 1.6, { frame: C.stone, glass: C.glass, bars: 1, frameW: 0.13 });
      f.railing(uu - 0.6, uu + 0.6, 5.3, 0.12, 0.85);
    }
    f.box(-0.06, e.len + 0.06, E - 0.35, E, 0, 0.25, C.stone);
    // recessed top storey: glazed band under a thin overhanging white canopy
    f.wall(0.8, e.len - 0.8, E, top - 0.5, hex('#4c5862'), -1.6);
    f.box(-0.2, e.len + 0.2, top - 0.35, top, -1.8, 0.65, C.white, true);
  }
  flatLid(c.b, c.bl.tris, top - 0.05, hex('#a7a49d'));
  flatLid(c.b, c.bl.tris, E, hex('#8e8b84'));
}

// ---- Queripel House and the gallery's north-west wing ----------------------------------------------
// Estimated from photographs (2022–2025): yellow stock brick with stone bands and cornice, sash windows,
// arched ground-floor openings (restaurant fronts on the square side), parapets.
function queripel(c: Ctx): void {
  const top = c.bl.h, E = top - 0.6;
  const storeys = Math.max(2, Math.round((top - 1.4) / 3.3));
  walls(c, top, C.stock);
  for (const e of edgesOf(c.bl.rings[0])) {
    if (partyWall(c, e) || e.len < 3) continue;
    const f = new F(c.b, e);
    f.box(-0.02, e.len + 0.02, 0, 0.45, 0, 0.08, C.stoneShade);
    f.box(-0.02, e.len + 0.02, 4.05, 4.35, 0, 0.12, C.stone);
    f.box(-0.05, e.len + 0.05, E - 0.3, E, 0, 0.35, C.stone, true);
    f.box(-0.05, e.len + 0.05, E, top, -0.02, 0.1, C.stone);
    const n = Math.floor((e.len - 0.8) / 3.5);
    if (n < 1) continue;
    for (const uu of bayCentres(0.4, e.len - 0.4, n)) {
      f.window(uu, 0.6, 1.7, 3.0, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.1 });
      f.archRing(uu, 0.6 + 3.0 - 0.85, 0.94, 0.94, 0.3, 0.06, C.gauged);
      for (let s = 1; s < storeys; s++) {
        const y0 = 4.35 + (s - 1) * 3.2 + 0.75;
        if (y0 + 1.6 > E - 0.3) break;
        f.window(uu, y0, 1.15, s === 1 ? 2.1 : 1.6, { frame: C.sash, glass: C.glass, bars: 1, frameW: 0.09 });
        f.box(uu - 0.7, uu + 0.7, y0 + (s === 1 ? 2.1 : 1.6), y0 + (s === 1 ? 2.1 : 1.6) + 0.26, 0, 0.04, C.gauged, false, false);
      }
    }
  }
  flatLid(c.b, c.bl.tris, top, hex('#8e8b84'));
}

function leftWing(c: Ctx): void {
  const top = Math.max(7.6, c.bl.h + 0.4), E = top - 0.9;
  walls(c, top, C.stock);
  for (const e of edgesOf(c.bl.rings[0])) {
    if (partyWall(c, e) || e.len < 3) continue;
    const f = new F(c.b, e);
    f.box(-0.02, e.len + 0.02, 0, 0.45, 0, 0.08, C.stoneShade);
    f.box(-0.02, e.len + 0.02, 3.95, 4.25, 0, 0.12, C.stone);
    f.box(-0.05, e.len + 0.05, E - 0.3, E, 0, 0.35, C.stone, true);
    f.balustrade(0.2, e.len - 0.2, E, top - E, C.stone, -0.05, 0.12);
    const n = Math.floor((e.len - 0.6) / 3.4);
    if (n < 1) continue;
    for (const uu of bayCentres(0.3, e.len - 0.3, n)) {
      f.window(uu, 0.8, 1.3, 2.7, { frame: C.sash, glass: C.glass, head: 'round', bars: 1, frameW: 0.09 });
      f.archRing(uu, 0.8 + 2.7 - 0.65, 0.74, 0.74, 0.3, 0.06, C.gauged);
      f.window(uu, 4.75, 1.15, 1.85, { frame: C.sash, glass: C.glass, bars: 1, frameW: 0.09 });
    }
  }
  flatLid(c.b, c.bl.tris, E, hex('#8e8b84'));
}

// The Chelsea Grocer building (2–5 Duke of York Square): photo 2026-03 — yellow stock brick, tall white
// sashes over a stone band, stone cornice; café terrace on the square. Brand signage is not modelled.
function grocer(c: Ctx): void {
  const top = 8.4, E = 7.8;
  walls(c, top, C.stock);
  for (const e of edgesOf(c.bl.rings[0])) {
    if (partyWall(c, e) || e.len < 3) continue;
    const f = new F(c.b, e);
    f.box(-0.02, e.len + 0.02, 0, 0.45, 0, 0.08, C.stoneShade);
    f.box(-0.02, e.len + 0.02, 3.8, 4.1, 0, 0.12, C.stone);
    f.box(-0.05, e.len + 0.05, E - 0.3, E, 0, 0.32, C.stone, true);
    f.box(-0.05, e.len + 0.05, E, top, -0.02, 0.1, C.stone);
    const n = Math.floor((e.len - 0.6) / 3.3);
    if (n < 1) continue;
    for (const uu of bayCentres(0.3, e.len - 0.3, n)) {
      f.window(uu, 0.45, 1.45, 3.0, { frame: C.sash, glass: C.glass, bars: 2, frameW: 0.1 });
      f.window(uu, 4.7, 1.2, 2.2, { frame: C.sash, glass: C.glass, bars: 1, frameW: 0.09 });
    }
  }
  flatLid(c.b, c.bl.tris, top, hex('#8e8b84'));
}

// Ticket kiosk in the gallery forecourt (OSM: "position is approximative"): a small timber-clad box.
function kiosk(c: Ctx): void {
  walls(c, 2.7, C.timber);
  for (const e of edgesOf(c.bl.rings[0])) if (e.len > 3) new F(c.b, e).wall(0.4, e.len - 0.4, 1.0, 2.1, C.glass, 0.02);
  flatLid(c.b, c.bl.tris, 2.75, C.steel);
}

// Glass-and-steel canopy on slim columns (OSM building=roof, amenity=shelter).
function canopy(c: Ctx): void {
  const r = c.bl.rings[0];
  flatLid(c.b, c.bl.tris, 3.6, hex('#9aa6ad'));
  for (const e of edgesOf(r)) {
    const f = new F(c.b, e);
    f.box(0, e.len, 3.45, 3.6, -0.02, 0.05, C.steel, true);
    for (const uu of [0.3, e.len - 0.3]) f.box(uu - 0.08, uu + 0.08, 0, 3.45, -0.3, -0.14, C.steel);
  }
}

export const DOY_BUILDERS: Record<string, (c: Ctx) => void> = {
  'doy:saatchi': saatchi,
  'doy:chapel': chapel,
  'doy:vardo': vardo,
  'doy:corner': cornerBlock,
  'doy:queripel': queripel,
  'doy:left-wing': leftWing,
  'doy:grocer': grocer,
  'doy:kiosk': kiosk,
  'doy:canopy': canopy,
};
