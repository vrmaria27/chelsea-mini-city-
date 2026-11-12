// King's Road, Sloane Square to the Markham Square junction: building-by-building reconstruction.
//
// Each street-facing building has its own configuration in kingsRoadSpecs.ts (storeys, bay rhythm,
// materials, shopfront arrangement, roofline and features, with sources and confidence). This file
// turns a configuration into geometry on the building's OpenStreetMap footprint: the King's Road
// frontage (and a short return where a corner faces a side street) gets its façade; party walls and
// backs stay plain; roofs follow the configuration. Shared components (windows, shopfronts, cornices)
// repeat only where the buildings genuinely share them. All dimensions are map metres.
import { MeshBuilder, hex, shade, type RGB } from '../../engine/geometry';
import { F, chimney, edgesOf, mergeFronts, type Front, type Pt } from './facadeKit';
import { flatLid, partyWall, slopedRoof, type Ctx, type SignQuad } from './buildingKit';

/** Height of the King's Road pavement surface (map metres); façades start here. */
export const KR_PAVE = 0.5;

// ---- materials -----------------------------------------------------------------------------------

export const M = {
  stucco: hex('#ece6d8'),
  stuccoWarm: hex('#eadfcb'),
  stuccoGrey: hex('#dcdad3'),
  stuccoPink: hex('#ead2c6'),
  stuccoGreen: hex('#cfdccd'),
  paintBlack: hex('#2a2c2f'),
  stock: hex('#c4ab7a'),
  stockDark: hex('#a8926a'),
  stockGrey: hex('#b7aa8f'),
  buff: hex('#cdb68a'),
  red: hex('#a5492f'),
  redDeep: hex('#8c3c2a'),
  redBright: hex('#b75437'),
  brown: hex('#7a4a35'),
  plum: hex('#6e3f33'),
  portland: hex('#e3ddcc'),
  stone: hex('#d9d0bb'),
  travertine: hex('#ddd4c3'),
  concrete: hex('#cfccc4'),
  white: hex('#f1efe9'),
  slate: hex('#5c6168'),
  lead: hex('#787e85'),
  glass: hex('#2f3944'),
  shopGlass: hex('#3d4954'),
  frame: hex('#efebe2'),
  frameDark: hex('#2d3034'),
  iron: hex('#1f2226'),
  granite: hex('#77787a'),
  kerb: hex('#9a9a96'),
  pave: hex('#c4beb2'),
  paveJoint: hex('#b1ab9f'),
  green: hex('#2f5b4a'),
  tileGreen: hex('#3f7a5d'),
};
export type MatKey = keyof typeof M;

// ---- configuration types -----------------------------------------------------------------------

export type Head = 'flat' | 'round' | 'segment' | 'none';
/** Upper-floor window treatment for one storey. */
export interface Win {
  /** Window height as a fraction of the storey (default 0.62). */
  h?: number;
  /** Width (default 1.05 m). */
  w?: number;
  head?: Head;
  /** 'arch' = moulded architrave, 'plain' = thin reveal (brick), 'stone' = flat stone surround. */
  surround?: 'arch' | 'plain' | 'stone' | 'none';
  /** Crowning feature above the window: triangular or segmental pediment, or a cornice hood on consoles. */
  crown?: 'none' | 'pediment' | 'segment' | 'hood' | 'alt';
  /** Glazing bars (vertical) for sashes; 0 for plate glass / casements. */
  bars?: number;
  /** Iron balconette at the sill, or a balcony slab with railing across the bay. */
  balcony?: 'none' | 'balconette' | 'balcony';
  /** Gauged brick (or stone) flat arch over the opening, in a contrasting colour. */
  archCol?: MatKey;
  /** Number of lights per bay (2 = paired windows). */
  pair?: number;
  /** French doors to the floor (first-floor drawing rooms). */
  tall?: boolean;
  /** No windows on this storey (drawn by a hook instead). */
  skip?: boolean;
}

export interface Ground {
  /** shops: timber/metal shopfronts between pilasters; pub: Victorian pub front; glass: modern full-height
   *  glazing; arcade: arched openings; stone: stone-clad base with large openings. */
  kind: 'shops' | 'pub' | 'glass' | 'arcade' | 'stone' | 'podium';
  /** Shop units across the frontage (each with a fascia and entrance). */
  units?: number;
  fascia?: MatKey;
  pilaster?: MatKey;
  /** Entrance side for each unit ('l', 'r', 'c'); repeats if shorter than units. */
  doors?: ('l' | 'r' | 'c')[];
  /** Separate door to the upper floors at one end of the frontage. */
  sideDoor?: 'l' | 'r';
  /** Recessed lobby depth for shop entrances (m). */
  recess?: number;
  /** Fascia depth (m, default 0.7). */
  fasciaH?: number;
  /** Corbels/consoles at the pilaster heads (Victorian shopfronts). */
  consoles?: boolean;
  /** Awning over each unit (only where verified in recent photographs). */
  awning?: MatKey;
  /** Stall riser colour. */
  riser?: MatKey;
  /** Number of arches (arcade kind). */
  arches?: number;
}

export interface KrSpec {
  /** Verified address (King's Road unless stated), shown in the coverage table. */
  addr: string;
  side: 'N' | 'S';
  name?: string;
  /** Storey heights from the ground floor up (m). */
  floors: number[];
  /** Main wall material for upper floors. */
  wall: MatKey;
  /** Ground-floor wall material around the shopfronts (default: wall). */
  base?: MatKey;
  /** Upper-floor window bays on the main King's Road front. */
  bays: number;
  /** Margin at each end of the frontage before the first bay (m). */
  edge?: number;
  /** Window treatment per upper storey (index 0 = first floor). Last entry repeats. */
  win: Win[];
  ground: Ground;
  top: { kind: 'cornice' | 'parapet' | 'blocking' | 'eaves' | 'none'; h?: number; col?: MatKey; dentil?: boolean };
  roof?: { kind: 'flat' | 'mansard' | 'hip' | 'pitched'; h?: number; col?: MatKey; dormers?: number };
  /** String courses at the floor line below these storey indices (1 = first floor). */
  bands?: number[];
  bandCol?: MatKey;
  /** Channelled (rusticated) stucco on the ground floor surround / first floor. */
  rusticate?: boolean;
  /** Pilasters from storey a to b (inclusive, 1-based upper storeys) between bays or at the ends only. */
  pilasters?: { from: number; to: number; at: 'bays' | 'ends'; col?: MatKey; w?: number };
  quoins?: MatKey;
  /** Gables above the eaves on the main front. */
  gables?: { n: number; style: 'dutch' | 'triangle' | 'segment'; h: number; col?: MatKey; trim?: MatKey };
  chimneys?: number;
  /** Windows per storey on a corner return (default: by length). */
  returnBays?: number;
  /** Unique features drawn by a named hook after the standard composition. */
  extra?: string;
  /** Source notes (photographs, listing) and confidence, for the coverage table. */
  src: string;
  conf: 'observed' | 'partly' | 'estimated';
  /** Approximations still in place (shown in the coverage table). */
  approx?: string;
}

// ---- King's Road geometry --------------------------------------------------------------------------

let LINE: Pt[] = [];
/** Sets the King's Road centreline used to find each building's frontage (map metres). */
export function useKingsRoadLine(line: number[]): void {
  LINE = [];
  for (let i = 0; i + 1 < line.length; i += 2) LINE.push([line[i], line[i + 1]]);
}

/** Nearest point on the centreline: distance, chainage and the point. */
export function krNearest(x: number, z: number, line: Pt[] = LINE): { d: number; s: number; p: Pt; t: Pt } {
  let best = { d: Infinity, s: 0, p: [0, 0] as Pt, t: [1, 0] as Pt };
  let acc = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], b = line[i + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    if (L < 1e-6) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (L * L)));
    const p: Pt = [a[0] + dx * t, a[1] + dz * t];
    const d = Math.hypot(x - p[0], z - p[1]);
    if (d < best.d) best = { d, s: acc + t * L, p, t: [dx / L, dz / L] };
    acc += L;
  }
  return best;
}

// ---- components ----------------------------------------------------------------------------------

/** Sash window with surround, sill and head; compact (no hidden faces). */
function sash(fr: F, uc: number, y0: number, w: number, h: number, o: Win, wallCol: RGB, frame: RGB = M.frame): void {
  const sur = o.surround ?? 'arch';
  const head = o.head ?? 'flat';
  const gl = M.glass;
  const u0 = uc - w / 2, u1 = uc + w / 2;
  const archH = head === 'round' ? w / 2 : head === 'segment' ? w * 0.16 : 0;
  const yr = y0 + h - archH;
  // reveal: the glass sits slightly back from a lit reveal (suggests depth without a cut)
  fr.box(u0, u1, y0, yr, -0.02, 0.0, gl, false, false);
  fr.wall(u0, u1, y0, yr, gl, 0.005);
  if (archH > 0) fr.arch(uc, yr, w / 2, archH, gl, 0.005, 6);
  // sash frame: perimeter, meeting rail and glazing bars as thin quads
  const fw = 0.06;
  fr.wall(u0, u0 + fw, y0, yr, frame, 0.02); fr.wall(u1 - fw, u1, y0, yr, frame, 0.02);
  fr.wall(u0, u1, y0, y0 + fw, frame, 0.02);
  if (archH === 0) fr.wall(u0, u1, yr - fw, yr, frame, 0.02);
  const mr = y0 + (yr - y0) * 0.5;
  fr.wall(u0, u1, mr - 0.03, mr + 0.03, frame, 0.025);
  const bars = o.bars ?? 1;
  for (let k = 1; k <= bars; k++) { const u = u0 + (w * k) / (bars + 1); fr.wall(u - 0.02, u + 0.02, y0, yr, frame, 0.022); }
  if (bars >= 2) for (const f of [0.25, 0.75]) { const y = y0 + (yr - y0) * f; fr.wall(u0, u1, y - 0.02, y + 0.02, frame, 0.022); }
  // surround
  const sc = sur === 'stone' ? M.portland : sur === 'plain' ? shade(wallCol, 0.92) : shade(wallCol, 1.04);
  const sw = sur === 'arch' ? 0.16 : sur === 'stone' ? 0.2 : 0.08;
  const sd = sur === 'arch' ? 0.1 : sur === 'stone' ? 0.08 : 0.03;
  if (sur !== 'none') {
    fr.box(u0 - sw, u0, y0, yr, 0, sd, sc, false, true);
    fr.box(u1, u1 + sw, y0, yr, 0, sd, sc, false, true);
    if (archH > 0) fr.archRing(uc, yr, w / 2, archH, sw, sd, sc, 6);
    else fr.box(u0 - sw, u1 + sw, yr, yr + sw, 0, sd, sc, false, false);
  }
  if (o.archCol && archH === 0) fr.box(u0 - 0.06, u1 + 0.06, yr, yr + 0.32, 0, 0.02, M[o.archCol], false, false);
  if (archH > 0 && o.archCol) fr.archRing(uc, yr, w / 2 + 0.02, archH + 0.02, 0.22, 0.03, M[o.archCol], 6);
  // sill
  fr.box(u0 - sw - 0.06, u1 + sw + 0.06, y0 - 0.1, y0, 0, Math.max(0.12, sd + 0.05), shade(sc, 0.97), true, false);
  // crown
  const crown = o.crown ?? 'none';
  const topY = (archH > 0 ? y0 + h + sw : yr + sw);
  if (crown === 'hood') {
    fr.box(u0 - sw - 0.14, u1 + sw + 0.14, topY, topY + 0.16, 0, 0.26, shade(sc, 1.03), true, true);
    for (const u of [u0 - sw - 0.05, u1 + sw + 0.05]) fr.box(u - 0.07, u + 0.07, topY - 0.38, topY, 0, 0.2, sc, false, true);
  } else if (crown === 'pediment') {
    fr.box(u0 - sw - 0.08, u1 + sw + 0.08, topY, topY + 0.12, 0, 0.18, sc, true, true);
    fr.pediment(uc, topY + 0.12, w + sw * 2 + 0.3, 0.42, sc, 0.18);
  } else if (crown === 'segment') {
    fr.box(u0 - sw - 0.08, u1 + sw + 0.08, topY, topY + 0.12, 0, 0.18, sc, true, true);
    fr.archRing(uc, topY + 0.12, w / 2 + sw, 0.32, 0.12, 0.16, sc, 6);
  }
  // balcony
  const bal = o.balcony ?? 'none';
  if (bal === 'balconette') {
    fr.box(u0 - 0.1, u1 + 0.1, y0 - 0.02, y0 + 0.04, 0, 0.32, M.iron, true, false);
    fr.box(u0 - 0.1, u1 + 0.1, y0 + 0.82, y0 + 0.86, 0.28, 0.32, M.iron, false, false);
    for (let k = 0; k <= 6; k++) { const u = u0 - 0.1 + ((w + 0.2) * k) / 6; fr.wall(u - 0.015, u + 0.015, y0, y0 + 0.84, M.iron, 0.3); }
  } else if (bal === 'balcony') {
    fr.box(u0 - 0.45, u1 + 0.45, y0 - 0.16, y0, 0, 0.75, shade(M.stucco, 0.96), true, true);
    fr.box(u0 - 0.45, u1 + 0.45, y0 + 0.9, y0 + 0.95, 0.68, 0.72, M.iron, false, false);
    for (let k = 0; k <= 9; k++) { const u = u0 - 0.45 + ((w + 0.9) * k) / 9; fr.wall(u - 0.015, u + 0.015, y0, y0 + 0.92, M.iron, 0.7); }
  }
}

/** One shop unit between pilasters: glazing on a stall riser, transom, fascia and recessed entrance. */
function shopUnit(fr: F, u0: number, u1: number, y0: number, y1: number, g: Ground, door: 'l' | 'r' | 'c', base: RGB): void {
  const fh = g.fasciaH ?? 0.72;
  const fasciaCol = M[g.fascia ?? 'paintBlack'];
  const pil = M[g.pilaster ?? 'stucco'];
  const riser = M[g.riser ?? (g.pilaster ?? 'paintBlack')];
  const yF = y1 - fh - 0.18; // underside of the fascia
  const w = u1 - u0;
  const dw = Math.min(1.25, w * 0.3);
  const du = door === 'l' ? u0 + 0.2 + dw / 2 : door === 'r' ? u1 - 0.2 - dw / 2 : (u0 + u1) / 2;
  const rec = g.recess ?? 0.6;
  const dy1 = Math.min(yF - 0.05, y0 + 2.5);
  // recessed entrance: back wall with door, two reveals and a soffit (real geometry, inside the line)
  fr.wall(du - dw / 2, du + dw / 2, y0, dy1, M.frameDark, -rec);
  fr.wall(du - dw / 2 + 0.08, du + dw / 2 - 0.08, y0 + 0.05, dy1 - 0.4, M.shopGlass, -rec + 0.01);
  const rv = shade(base, 0.82);
  fr.b.quad(fr.P(du - dw / 2, y0, 0), fr.P(du - dw / 2, y0, -rec), fr.P(du - dw / 2, dy1, -rec), fr.P(du - dw / 2, dy1, 0), rv);
  fr.b.quad(fr.P(du + dw / 2, y0, -rec), fr.P(du + dw / 2, y0, 0), fr.P(du + dw / 2, dy1, 0), fr.P(du + dw / 2, dy1, -rec), rv);
  fr.b.quad(fr.P(du - dw / 2, dy1, -rec), fr.P(du + dw / 2, dy1, -rec), fr.P(du + dw / 2, dy1, 0), fr.P(du - dw / 2, dy1, 0), shade(base, 0.7));
  fr.b.quad(fr.P(du - dw / 2, y0 + 0.01, -rec), fr.P(du + dw / 2, y0 + 0.01, -rec), fr.P(du + dw / 2, y0 + 0.01, 0), fr.P(du - dw / 2, y0 + 0.01, 0), M.granite);
  // transom over the door, glazing either side on stall risers
  fr.wall(du - dw / 2, du + dw / 2, dy1, yF, M.shopGlass, 0.02);
  const parts: [number, number][] = [[u0, du - dw / 2], [du + dw / 2, u1]];
  for (const [a, b] of parts) {
    if (b - a < 0.2) continue;
    fr.box(a, b, y0, y0 + 0.5, 0, 0.1, riser, false, false);
    fr.wall(a, b, y0 + 0.5, yF, M.shopGlass, 0.04);
    fr.box(a, b, y0 + 0.44, y0 + 0.52, 0.04, 0.16, M.frameDark, false, false);
    const ty = Math.min(yF - 0.45, y0 + 2.75);
    fr.wall(a, b, ty - 0.04, ty + 0.04, M.frameDark, 0.05);
    const nm = Math.max(0, Math.round((b - a) / 1.6) - 1);
    for (let k = 1; k <= nm; k++) { const u = a + ((b - a) * k) / (nm + 1); fr.wall(u - 0.03, u + 0.03, y0 + 0.5, yF, M.frameDark, 0.05); }
  }
  // fascia with its cornice
  fr.box(u0 - 0.05, u1 + 0.05, yF, yF + fh, 0, 0.24, fasciaCol, true, false);
  fr.box(u0 - 0.1, u1 + 0.1, yF + fh, yF + fh + 0.14, 0, 0.34, pil, true, false);
  if (g.awning) fr.awning(u0 + 0.1, u1 - 0.1, yF - 0.02, 0.9, 1.3, M[g.awning]);
}

// ---- the generic composition --------------------------------------------------------------------

export interface KrBuilt { fronts: Front[]; returns: Front[]; eaves: number; top: number }

/** Footprint edges facing King's Road (merged) and short corner returns facing side streets. */
export function krFronts(c: Ctx): { kr: Front[]; ret: Front[] } {
  const all = edgesOf(c.bl.rings[0]).filter((f) => !partyWall(c, f));
  const kr: Front[] = [], other: Front[] = [];
  for (const f of all) {
    const m: Pt = [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2];
    const q = krNearest(m[0], m[1]);
    const to: Pt = [(q.p[0] - m[0]) / (q.d || 1), (q.p[1] - m[1]) / (q.d || 1)];
    const dot = f.n[0] * to[0] + f.n[1] * to[1];
    if (q.d < 26 && dot > 0.6 && f.len > 0.8) kr.push(f);
    else other.push(f);
  }
  const krM = mergeFronts(kr, 0.2);
  // returns: exposed edges that meet a King's Road front at a corner (within 1.5 m of its end)
  const ends = krM.flatMap((f) => [f.a, f.b]);
  const ret = other.filter((f) => {
    if (f.len < 1.2) return false;
    const near = ends.some((p) => Math.hypot(p[0] - f.a[0], p[1] - f.a[1]) < 1.5 || Math.hypot(p[0] - f.b[0], p[1] - f.b[1]) < 1.5);
    if (!near) return false;
    const m: Pt = [(f.a[0] + f.b[0]) / 2 + f.n[0] * 2.5, (f.a[1] + f.b[1]) / 2 + f.n[1] * 2.5];
    return !c.others.some((r) => inRingFlat(m[0], m[1], r));
  });
  return { kr: krM, ret };
}

function inRingFlat(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Plain body walls on every edge; the King's Road fronts start above the shopfronts. */
function body(c: Ctx, eaves: number, wall: RGB, base: RGB, skip: Front[], groundTop: number): void {
  for (const e of edgesOf(c.bl.rings[0])) {
    const fr = new F(c.b, e);
    const isFront = skip.some((s) => onFront(e, s));
    if (isFront) fr.wall(0, e.len, groundTop, eaves, wall);
    else { fr.wall(0, e.len, 0, Math.min(groundTop, eaves), base); if (eaves > groundTop) fr.wall(0, e.len, groundTop, eaves, wall); }
  }
}
const onFront = (e: Front, s: Front) => {
  const d = (p: Pt) => Math.abs((p[0] - s.a[0]) * s.n[0] + (p[1] - s.a[1]) * s.n[1]);
  const along = (p: Pt) => (p[0] - s.a[0]) * s.t[0] + (p[1] - s.a[1]) * s.t[1];
  return d(e.a) < 0.3 && d(e.b) < 0.3 && along(e.a) > -0.3 && along(e.b) < s.len + 0.3 && e.n[0] * s.n[0] + e.n[1] * s.n[1] > 0.95;
};

export interface KrHookCtx { c: Ctx; spec: KrSpec; fronts: F[]; returns: F[]; ys: number[]; eaves: number; top: number }
export type KrHook = (h: KrHookCtx) => void;

/** Builds one building from its configuration. */
export function buildKr(c: Ctx, spec: KrSpec, hooks: Record<string, KrHook>): KrBuilt {
  const ys = [KR_PAVE];
  for (const h of spec.floors) ys.push(ys[ys.length - 1] + h);
  const eaves = ys[ys.length - 1];
  const wall = M[spec.wall], base = M[spec.base ?? spec.wall];
  const { kr, ret } = krFronts(c);
  const topH = spec.top.h ?? (spec.top.kind === 'parapet' ? 0.9 : spec.top.kind === 'blocking' ? 0.7 : spec.top.kind === 'cornice' ? 0.55 : 0);
  const top = eaves + topH;
  // body: the King's Road fronts leave the ground floor to the shopfront assembly (recessed entrances)
  body(c, top, wall, base, [...kr, ...ret.filter((r) => r.len < 18)], ys[1]);
  const frs = kr.map((f) => new F(c.b, f));
  const rets = ret.map((f) => new F(c.b, f));
  const totalLen = kr.reduce((s, f) => s + f.len, 0) || 1;
  const main = kr.slice().sort((a, b) => b.len - a.len)[0];
  for (const fr of [...frs, ...rets]) {
    const isRet = rets.includes(fr);
    const L = isRet ? Math.min(fr.len, 16) : fr.len;
    // a corner return runs from the corner: flip the frame so u = 0 is the corner end
    let u0 = 0, u1 = L;
    if (isRet) {
      const atA = kr.some((k) => Math.hypot(k.a[0] - fr.f.a[0], k.a[1] - fr.f.a[1]) < 1.5 || Math.hypot(k.b[0] - fr.f.a[0], k.b[1] - fr.f.a[1]) < 1.5);
      if (!atA) { u0 = fr.len - L; u1 = fr.len; }
    }
    // ground floor
    // shop units are shared across a multi-edge front (canted or bowed corners) in proportion to length
    const units = isRet ? 1 : Math.max(1, Math.round(((spec.ground.units ?? 1) * fr.len) / totalLen));
    groundFloor(fr, u0, u1, ys[0], ys[1], spec, isRet, base, units);
    // upper floors
    const edge = spec.edge ?? 0.9;
    const nb = isRet ? (spec.returnBays ?? Math.max(1, Math.floor((L - 1.2) / 3.4))) : fr.f === main ? spec.bays : Math.max(1, Math.round((spec.bays * fr.len) / totalLen));
    const span = u1 - u0 - edge * 2;
    const centres = Array.from({ length: nb }, (_, i) => u0 + edge + ((i + 0.5) * span) / nb);
    for (let s = 1; s < spec.floors.length; s++) {
      const w = spec.win[Math.min(s - 1, spec.win.length - 1)];
      if (w.skip || nb === 0) continue;
      const sh = spec.floors[s];
      const wh = sh * (w.h ?? 0.62);
      const wy = ys[s] + (w.tall ? 0.1 : Math.max(0.55, sh * 0.24));
      const ww = Math.min(w.w ?? 1.05, (span / nb) * 0.7);
      centres.forEach((uc, i) => {
        const o = w.crown === 'alt' ? { ...w, crown: (i % 2 ? 'segment' : 'pediment') as Win['crown'] } : w;
        if ((w.pair ?? 1) > 1) for (const d of [-0.32, 0.32]) sash(fr, uc + d * ww, wy, ww * 0.55, w.tall ? sh * 0.8 : wh, o, wall);
        else sash(fr, uc, wy, ww, w.tall ? sh * 0.8 : wh, o, wall);
      });
    }
    // bands, pilasters, quoins
    for (const k of spec.bands ?? []) if (ys[k] != null) fr.box(u0 - 0.04, u1 + 0.04, ys[k] - 0.08, ys[k] + 0.14, 0, 0.12, M[spec.bandCol ?? (spec.wall.startsWith('stucco') ? spec.wall : 'portland')], true, false);
    if (spec.pilasters) {
      const p = spec.pilasters, pc = M[p.col ?? spec.wall], pw = p.w ?? 0.5;
      const at = p.at === 'ends' ? [u0 + pw / 2, u1 - pw / 2] : [u0 + pw / 2, ...centres.slice(1).map((u, i) => (u + centres[i]) / 2), u1 - pw / 2];
      for (const u of at) fr.column(u, ys[p.from], ys[p.to + 1] - 0.3, pw, pc, 0.14, false);
    }
    if (spec.quoins) for (const u of [u0 + 0.3, u1 - 0.3]) for (let y = ys[1]; y + 0.3 < eaves; y += 0.6) fr.box(u - 0.3 + ((y / 0.6) % 2 < 1 ? 0 : 0.12), u + 0.3 - ((y / 0.6) % 2 < 1 ? 0 : 0.12), y, y + 0.28, 0, 0.05, M[spec.quoins], false, true);
    // top
    const tc = M[spec.top.col ?? (spec.wall.startsWith('stucco') ? spec.wall : 'portland')];
    if (spec.top.kind === 'cornice' || spec.top.kind === 'blocking' || spec.top.kind === 'parapet') {
      fr.box(u0 - 0.06, u1 + 0.06, eaves - 0.3, eaves, 0, 0.22, shade(tc, 0.97), true, false);
      fr.box(u0 - 0.12, u1 + 0.12, eaves, eaves + 0.2, 0, spec.top.kind === 'parapet' ? 0.18 : 0.45, tc, true, true);
      if (spec.top.dentil) for (let u = u0 + 0.2; u < u1 - 0.1; u += 0.32) fr.box(u - 0.07, u + 0.07, eaves - 0.42, eaves - 0.3, 0, 0.16, tc, false, false);
      if (spec.top.kind !== 'cornice') {
        fr.box(u0, u1, eaves + 0.2, top - 0.1, 0, 0.04, spec.top.kind === 'parapet' ? wall : tc, false, false);
        fr.box(u0 - 0.05, u1 + 0.05, top - 0.1, top, 0, 0.12, tc, false, true);
      }
    } else if (spec.top.kind === 'eaves') {
      fr.box(u0 - 0.1, u1 + 0.1, eaves - 0.18, eaves, 0, 0.45, shade(M.white, 0.95), true, false);
    }
    // gables
    if (spec.gables && !isRet && fr.f === main) {
      const g = spec.gables;
      const gw = Math.min(5.2, (u1 - u0) / (g.n + 0.4));
      for (let i = 0; i < g.n; i++) {
        const uc = g.n === 1 ? (u0 + u1) / 2 : u0 + ((i + 0.5) * (u1 - u0)) / g.n;
        fr.gable(uc, top, gw, g.h, M[g.col ?? spec.wall], M[g.trim ?? 'portland'], g.style, 0.12, -1.2);
        sash(fr, uc, top + 0.5, Math.min(1.1, gw * 0.3), g.h * 0.42, { surround: 'stone', bars: 1 }, M[g.col ?? spec.wall]);
      }
    }
  }
  // roof
  const r = spec.roof ?? { kind: 'flat' };
  const roofCol = M[r.col ?? 'slate'];
  if (r.kind === 'flat') flatLid(c.b, c.bl.tris, Math.max(eaves, top - 0.4), shade(M.lead, 0.9));
  else if (r.kind === 'mansard') {
    slopedRoof(c, top, r.h ?? 2.6, 1.2, roofCol, shade(M.lead, 0.9));
    if (r.dormers) for (const fr of frs) if (fr.f === main) {
      const n = r.dormers, L = fr.len;
      for (let i = 0; i < n; i++) {
        const uc = ((i + 0.5) * L) / n;
        const yb = top + 0.35, h = (r.h ?? 2.6) * 0.62;
        fr.box(uc - 0.65, uc + 0.65, yb, yb + h, -0.95, -0.35, roofCol, false, true);
        fr.wall(uc - 0.45, uc + 0.45, yb + 0.12, yb + h - 0.15, M.glass, -0.34);
        fr.wall(uc - 0.5, uc + 0.5, yb + 0.05, yb + 0.12, M.frame, -0.33);
        fr.box(uc - 0.72, uc + 0.72, yb + h, yb + h + 0.12, -1.0, -0.3, M.lead, true, false);
      }
    }
  } else if (r.kind === 'hip' || r.kind === 'pitched') slopedRoof(c, top, r.h ?? 2.4, r.kind === 'hip' ? 3 : 2, roofCol, roofCol);
  // chimney stacks on the party walls behind the front
  if (spec.chimneys && main) {
    const n = spec.chimneys;
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? main.len / 2 : (i * main.len) / (n - 1);
      const x = main.a[0] + main.t[0] * Math.min(main.len - 0.5, Math.max(0.5, u)) - main.n[0] * 2.6;
      const z = main.a[1] + main.t[1] * Math.min(main.len - 0.5, Math.max(0.5, u)) - main.n[1] * 2.6;
      chimney(c.b, x, z, 0.9, 0.55, top - 0.5, top + 1.5, hex('#9b5a42'), Math.atan2(main.t[1], main.t[0]), 3);
    }
  }
  if (spec.extra && hooks[spec.extra]) hooks[spec.extra]({ c, spec, fronts: frs, returns: rets, ys, eaves, top });
  return { fronts: kr, returns: ret, eaves, top };
}

function groundFloor(fr: F, u0: number, u1: number, y0: number, y1: number, spec: KrSpec, isRet: boolean, base: RGB, unitsHere = 1): void {
  const g = spec.ground;
  const pil = M[g.pilaster ?? spec.base ?? spec.wall];
  if (isRet && g.kind !== 'glass' && g.kind !== 'stone' && g.kind !== 'podium') {
    // corner return: the shopfront turns the corner for one bay, then rendered wall with a side door
    const wrap = Math.min(u1 - u0, 3.2);
    const atStart = u0 === 0;
    const a = atStart ? u0 : u1 - wrap, b = atStart ? u0 + wrap : u1;
    shopUnit(fr, a + 0.25, b - 0.25, y0, y1, { ...g, recess: 0.3 }, atStart ? 'r' : 'l', base);
    for (const u of [a, b]) fr.box(u - 0.25, u + 0.25, y0, y1, 0, 0.18, pil, false, true);
    const ra = atStart ? b : u0, rb = atStart ? u1 : a;
    if (rb - ra > 0.3) {
      fr.wall(ra, rb, 0, y1, base);
      fr.box(ra, rb, y0, y0 + 0.35, 0, 0.06, shade(base, 0.85), false, false);
      if (rb - ra > 2.5) fr.wall((ra + rb) / 2 - 0.5, (ra + rb) / 2 + 0.5, y0, y0 + 2.4, M.frameDark, 0.02);
    }
    return;
  }
  // plinth below the pavement line (hidden by the pavement; closes the gap at kerb level)
  fr.wall(u0, u1, 0, y0, shade(base, 0.8));
  if (g.kind === 'shops' || g.kind === 'pub') {
    const units = isRet ? 1 : unitsHere;
    const sd = g.sideDoor && !isRet ? 1.4 : 0;
    const ua = g.sideDoor === 'l' ? u0 + sd : u0, ub = g.sideDoor === 'r' ? u1 - sd : u1;
    const w = (ub - ua) / units;
    const pw = g.kind === 'pub' ? 0.55 : 0.42;
    for (let i = 0; i < units; i++) {
      const a = ua + i * w, b = a + w;
      const d = (g.doors ?? ['c'])[i % (g.doors ?? ['c']).length];
      shopUnit(fr, a + pw / 2, b - pw / 2, y0, y1, g, d, base);
    }
    for (let i = 0; i <= units; i++) {
      const u = ua + i * w;
      fr.box(u - pw / 2, u + pw / 2, y0, y1 - 0.05, 0, 0.2, pil, false, true);
      if (g.consoles) fr.box(u - pw / 2 - 0.04, u + pw / 2 + 0.04, y1 - 1.05, y1 - 0.25, 0, 0.36, shade(pil, 1.04), true, true);
    }
    if (sd) {
      const a = g.sideDoor === 'l' ? u0 : u1 - sd, b = a + sd;
      fr.wall(a, b, y0, y1, base);
      fr.wall(a + 0.3, b - 0.3, y0, y0 + 2.5, M.frameDark, -0.12);
      fr.box(a + 0.2, b - 0.2, y0 + 2.5, y0 + 2.62, 0, 0.12, pil, false, false);
    }
    if (g.kind === 'pub') fr.box(u0 - 0.1, u1 + 0.1, y1 - 0.25, y1, 0, 0.42, pil, true, false);
  } else if (g.kind === 'glass') {
    fr.wall(u0, u1, y0, y1 - 0.6, M.shopGlass, -0.05);
    fr.box(u0, u1, y1 - 0.6, y1, 0, 0.12, pil, true, false);
    const n = Math.max(1, Math.round((u1 - u0) / 3));
    for (let i = 0; i <= n; i++) { const u = u0 + ((u1 - u0) * i) / n; fr.box(u - 0.12, u + 0.12, y0, y1 - 0.6, -0.05, 0.08, pil, false, true); }
    for (let i = 0; i < n; i++) if (i % 2 === 0) { const u = u0 + ((u1 - u0) * (i + 0.5)) / n; fr.wall(u - 0.6, u + 0.6, y0, y0 + 2.4, M.frameDark, -0.04); }
  } else if (g.kind === 'arcade' || g.kind === 'stone') {
    const n = g.arches ?? Math.max(1, Math.round((u1 - u0) / 3.4));
    fr.wall(u0, u1, y0, y1, pil);
    const w = (u1 - u0) / n;
    for (let i = 0; i < n; i++) {
      const uc = u0 + (i + 0.5) * w, ow = w * 0.62;
      const top = y1 - 0.5;
      if (g.kind === 'arcade') { fr.wall(uc - ow / 2, uc + ow / 2, y0, top - ow / 2, M.shopGlass, 0.02); fr.arch(uc, top - ow / 2, ow / 2, ow / 2, M.shopGlass, 0.02, 8); fr.archRing(uc, top - ow / 2, ow / 2, ow / 2, 0.14, 0.08, shade(pil, 1.05), 8); }
      else fr.wall(uc - ow / 2, uc + ow / 2, y0 + 0.4, top, M.shopGlass, 0.02);
      fr.box(uc - ow / 2 - 0.06, uc + ow / 2 + 0.06, y0, y0 + 0.4, 0, 0.06, shade(pil, 0.9), false, false);
    }
  } else if (g.kind === 'podium') {
    fr.wall(u0, u1, y0, y1, pil);
  }
}

// ---- street: pavement, kerbs, furniture --------------------------------------------------------------

export interface KrData {
  /** King's Road centreline, Sloane Square (chainage 0) to beyond the Markham Square junction. */
  line: number[];
  /** Chainage where the reconstruction ends, and the boundary across the corridor. */
  sEnd: number;
  end: number[];
  /** Carriageway width (default) and per centreline vertex (fitted between the building lines). */
  roadW: number;
  w?: number[];
  /** Chainage where the corridor starts (it overlaps the Sloane Square zone). */
  sStart: number;
  trees: { x: number; z: number; osm: string; genus: string | null }[];
  lamps: { x: number; z: number }[];
  bollards: { x: number; z: number }[];
  crossings: { x: number; z: number; kind: string | null; osm: string }[];
  postBoxes: { x: number; z: number; osm: string }[];
  /** Side-street mouths (name and crossing segment across the side street at the pavement line). */
  mouths: { name: string; pts: number[]; w: number }[];
  /** Areas the pavement must not cover (plazas, square, gardens). */
  excl: number[][];
  /** Royal Avenue: low rail along its King's Road end. */
  rails: { pts: number[] }[];
}

/** Pavement (flags with joints and a granite kerb) along both sides of King's Road, at KR_PAVE. */
export function buildKrStreet(b: MeshBuilder, d: KrData, roads: { pts: number[]; w: number; name: string | null; cls: string }[], insideBuilding: (x: number, z: number) => boolean): { tris: number } {
  const before = b.vertexCount;
  const line: Pt[] = [];
  for (let i = 0; i + 1 < d.line.length; i += 2) line.push([d.line[i], d.line[i + 1]]);
  const sideRoads = roads.filter((r) => r.name !== "King's Road" && (r.cls === 'street' || r.cls === 'service' || r.cls === 'main'));
  const inSide = (x: number, z: number) => sideRoads.some((r) => { for (let i = 0; i + 3 < r.pts.length; i += 2) if (segD(x, z, r.pts[i], r.pts[i + 1], r.pts[i + 2], r.pts[i + 3]) < r.w / 2 + 0.2) return true; return false; });
  const excluded = (x: number, z: number) => d.excl.some((r) => inRingFlat(x, z, r));
  const W = 11; // pavement band (m beyond the kerb); building footprints hide the part inside them
  const step = 0.9;
  // walk the centreline in steps; each step lays two strips of flags per side
  let acc = 0;
  const segs: { a: Pt; t: Pt; n: Pt; s0: number; L: number; ha: number; hb: number }[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i], bb = line[i + 1];
    const L = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    if (L < 0.01) continue;
    const t: Pt = [(bb[0] - a[0]) / L, (bb[1] - a[1]) / L];
    segs.push({ a, t, n: [-t[1], t[0]], s0: acc, L, ha: (d.w?.[i] ?? d.roadW) / 2, hb: (d.w?.[i + 1] ?? d.roadW) / 2 });
    acc += L;
  }
  const y = KR_PAVE;
  const kerbW = 0.3;
  const CELL = 1.4; // flag courses across the pavement; joints every 0.9 m along it
  const nCells = Math.ceil((W - kerbW) / CELL);
  const up = (q: number[]) => { q[1] = y; return q; };
  for (const sg of segs) {
    if (sg.s0 > d.sEnd + 30 || sg.s0 + sg.L < d.sStart) continue;
    const n = Math.max(1, Math.ceil(sg.L / (step * 2)));
    for (let k = 0; k < n; k++) {
      const t0 = (sg.L * k) / n, t1 = (sg.L * (k + 1)) / n;
      const s = sg.s0 + (t0 + t1) / 2;
      if (s < d.sStart || s > d.sEnd + 25) continue;
      for (const side of [1, -1]) {
        // o is measured from the kerb line, which follows the fitted carriageway width
        const P = (t: number, o: number): number[] => { const oo = o + sg.ha + ((sg.hb - sg.ha) * t) / sg.L; return [sg.a[0] + sg.t[0] * t + sg.n[0] * oo * side, y, sg.a[1] + sg.t[1] * t + sg.n[1] * oo * side]; };
        const q = (A: number[], B: number[], C: number[], D: number[], col: RGB) => { if (side > 0) b.quad(A, D, C, B, col); else b.quad(A, B, C, D, col); };
        const ok = (o0: number, o1: number) => { const m = P((t0 + t1) / 2, (o0 + o1) / 2); return !excluded(m[0], m[2]) && !inSide(m[0], m[2]) && !insideBuilding(m[0], m[2]); };
        // granite kerb with its face down to the carriageway
        if (ok(0, kerbW)) {
          q(P(t0, 0), P(t1, 0), P(t1, kerbW), P(t0, kerbW), M.kerb);
          const A0 = P(t0, 0), B0 = P(t1, 0); A0[1] = B0[1] = 0.36;
          if (side > 0) b.quad(B0, A0, P(t0, 0), P(t1, 0), shade(M.kerb, 0.8)); else b.quad(A0, B0, P(t1, 0), P(t0, 0), shade(M.kerb, 0.8));
        }
        // flag courses: runs of consecutive cells that are pavement
        let run0 = -1;
        for (let c = 0; c <= nCells; c++) {
          const o0 = kerbW + c * CELL, o1 = Math.min(W, o0 + CELL);
          const good = c < nCells && ok(o0, o1);
          if (good) {
            q(P(t0, o0), P(t1, o0), P(t1, o1), P(t0, o1), (c + k) % 4 === 0 ? shade(M.pave, 0.97) : (c * 3 + k) % 7 === 0 ? shade(M.pave, 1.03) : M.pave);
            if (c > 0 && run0 >= 0) q(up(P(t0, o0 - 0.015)), up(P(t1, o0 - 0.015)), up(P(t1, o0 + 0.015)), up(P(t0, o0 + 0.015)), M.paveJoint);
            if (run0 < 0) run0 = c;
          }
          if ((!good || c === nCells) && run0 >= 0) {
            // transverse joints across the run (two per strip, staggered by course would cost more)
            const ra = kerbW + run0 * CELL, rb = Math.min(W, kerbW + c * CELL);
            for (const tj of [t0, (t0 + t1) / 2]) { const J = (o: number, dt: number) => { const p = P(tj + dt, o); p[1] = y + 0.004; return p; }; q(J(ra, 0), J(ra, 0.03), J(rb, 0.03), J(rb, 0), M.paveJoint); }
            run0 = -1;
          }
        }
      }
    }
  }
  return { tris: (b.vertexCount - before) / 3 };
}

function segD(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

/** Street furniture from OpenStreetMap: lamp columns, bollards, post boxes and zebra/signal crossings. */
export function buildKrFurniture(b: MeshBuilder, d: KrData, signs: SignQuad[]): { tris: number } {
  const before = b.vertexCount;
  const y = KR_PAVE;
  const inRange = (x: number, z: number) => { const q = krNearest(x, z); return q.s >= d.sStart - 5 && q.s <= d.sEnd + 2; };
  for (const l of d.lamps) {
    if (!inRange(l.x, l.z)) continue;
    // contemporary stainless-steel column (RH CAA 4.13) with a slim arm and lantern
    b.cylinder(l.x, l.z, y, y + 8, 0.09, 6, hex('#b9bcbe'));
    const q = krNearest(l.x, l.z);
    const to: Pt = [(q.p[0] - l.x) / (q.d || 1), (q.p[1] - l.z) / (q.d || 1)];
    const ex = l.x + to[0] * 1.2, ez = l.z + to[1] * 1.2;
    b.box(Math.min(l.x, ex) - 0.05, y + 7.9, Math.min(l.z, ez) - 0.05, Math.max(l.x, ex) + 0.05, y + 8.0, Math.max(l.z, ez) + 0.05, hex('#b9bcbe'));
    b.box(ex - 0.25, y + 7.75, ez - 0.25, ex + 0.25, y + 7.92, ez + 0.25, hex('#5f6468'));
  }
  for (const p of d.bollards) {
    if (!inRange(p.x, p.z)) continue;
    // black cast-iron bollard (RBKC pattern in photographs)
    b.cylinder(p.x, p.z, y, y + 0.85, 0.11, 6, M.iron);
    b.cylinder(p.x, p.z, y + 0.85, y + 0.95, 0.07, 6, M.iron);
    b.cylinder(p.x, p.z, y + 0.95, y + 1.02, 0.1, 6, M.iron);
  }
  for (const p of d.postBoxes) {
    if (!inRange(p.x, p.z)) continue;
    b.cylinder(p.x, p.z, y, y + 1.45, 0.3, 10, hex('#c8231f'));
    b.cylinder(p.x, p.z, y + 1.45, y + 1.6, 0.34, 10, hex('#b51f1c'));
  }
  void signs;
  return { tris: (b.vertexCount - before) / 3 };
}
