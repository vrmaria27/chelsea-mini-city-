// Walkable surfaces for street-level exploration (map metres: x east, z south).
// Pure geometry over the bundled map data, so it can be tested without a browser.
//
// A point is walkable when it is inside one of the bounded exploration zones (around Sloane Square,
// and Duke of York Square with the Saatchi Gallery forecourt) and is public pavement or open space: the paved square itself, mapped plazas, or a pavement band beside
// a carriageway or along a mapped footway. It is never walkable inside a building footprint, on a
// carriageway, in the fountain basin, at a tree trunk or memorial, or in a (possibly private)
// garden, or within 1.3 m of a façade (bays, columns and shopfronts project beyond the footprint).
// Courtyards and back gardens inside blocks are excluded because they are not pavement.

export interface NavRoad { cls: 'main' | 'street' | 'service' | 'pedestrian' | 'path'; w: number; pts: number[]; name?: string | null; wv?: number[] }
export interface NavArea { id?: string; kind: 'green' | 'plaza' | 'carriageway' | 'parking'; ring: number[] }
export interface NavBuilding { id: string; h: number; rings: number[][]; custom?: string }
export interface NavSquare {
  ring: number[];
  fountain: { x: number; z: number; basin: number[] };
  memorial?: { x: number; z: number };
  drinkingFountain?: { x: number; z: number };
  trees: { x: number; z: number }[];
  lamps: { x: number; z: number }[];
}
/** Duke of York Square: the public paved areas and their obstacles (positions from OSM). */
export interface NavDoy {
  forecourt?: { ring: number[] };
  trees: { x: number; z: number }[];
  walls: { pts: number[]; h: number | null }[];
  gates: { x: number; z: number }[];
  fences: { osm: string; pts: number[] }[];
  fountain: { x: number; z: number } | null;
  statue: { x: number; z: number } | null;
  benches: ({ x: number; z: number; seats: number | null } | { pts: number[] })[];
  cycleStands: { x: number; z: number; capacity: number; kind: string | null }[];
  track: { outer: number[][] } | null;
}
/** King's Road corridor (Sloane Square to the Markham Square junction). */
export interface NavKr {
  line: number[];
  sStart: number;
  sEnd: number;
  roadW: number;
  /** Carriageway width at each centreline vertex. */
  w?: number[];
  trees: { x: number; z: number }[];
  lamps: { x: number; z: number }[];
  bollards: { x: number; z: number }[];
  postBoxes: { x: number; z: number }[];
  crossings: { x: number; z: number; kind: string | null }[];
}
export interface NavData { roads: NavRoad[]; areas: NavArea[]; buildings: NavBuilding[]; square: NavSquare; doy?: NavDoy | null; kr?: NavKr | null }

/** The Duke of York Square plaza areas (OSM ids) that are public paved space. */
export const DOY_PLAZA_AREAS = ['w5318345', 'w900260769'];
/** Zone margin around Duke of York Square's paved areas (takes in the King's Road pavement). */
export const DOY_ZONE_M = 5;
export const DOY_GROUND = 0.32;
/** King's Road pavement height (matches KR_PAVE in kingsRoad.ts). */
export const KR_GROUND = 0.5;
/** Walkable band either side of King's Road beyond the carriageway edge (m). */
export const KR_BAND = 9.5;
/** Distance before the end of the reconstruction at which the end-of-area message appears (m). */
export const KR_END_WARN = 14;
/** Directions used to place the square's furniture (see dukeOfYorkSquare.ts). */
const DOY_KR: [number, number] = [0.754, -0.658];
const DOY_GU: [number, number] = [0.619, 0.785];

export type NavClass =
  | 'ok' | 'outside' | 'end' | 'building' | 'carriageway' | 'water' | 'tree' | 'feature' | 'garden' | 'not-public';

/** Exploration is limited to this distance (m) from the square's kerb: the well-reconstructed area. */
export const ZONE_M = 38;
/** Surface heights in map metres. */
export const SQUARE_GROUND = 0.52;
export const STREET_GROUND = 0.22;
/** Standing eye height used for the desktop camera and the VR seated option (m). */
export const EYE_HEIGHT = 1.6;
const PAVEMENT_BAND = 6.5; // beyond a carriageway edge
const FOOTWAY_BAND = 1.6; // beyond a footway edge
const TRUNK_R = 0.9;
/** Minimum distance from a building footprint: bays, columns and shopfronts project beyond it. */
export const FACADE_CLEARANCE = 1.3;
/** Clearance in front of the King's Road frontages. */
export const KR_FACADE_CLEARANCE = 0.8;
const CELL = 16;

interface Seg { ax: number; az: number; bx: number; bz: number; hw: number; ref: number; main?: boolean; kr?: boolean }
interface Poly { ring: number[]; minX: number; maxX: number; minZ: number; maxZ: number }
interface Bldg extends Poly { id: string; h: number; holes: number[][]; /** Façade clearance (m). */ c: number }

export function pointInRing(x: number, z: number, r: ArrayLike<number>): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function segDist(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t));
}

export function ringDist(x: number, z: number, r: ArrayLike<number>): number {
  let d = Infinity;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) d = Math.min(d, segDist(x, z, r[j * 2], r[j * 2 + 1], r[i * 2], r[i * 2 + 1]));
  return d;
}

function bounds(ring: number[]): Poly {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    minX = Math.min(minX, ring[i]); maxX = Math.max(maxX, ring[i]);
    minZ = Math.min(minZ, ring[i + 1]); maxZ = Math.max(maxZ, ring[i + 1]);
  }
  return { ring, minX, maxX, minZ, maxZ };
}

/** Uniform bucket grid so point queries only test nearby geometry. */
class Buckets<T> {
  private cells = new Map<number, T[]>();
  private key(cx: number, cz: number): number { return (cx + 4096) * 8192 + (cz + 4096); }
  add(item: T, minX: number, maxX: number, minZ: number, maxZ: number): void {
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const k = this.key(cx, cz);
        let l = this.cells.get(k);
        if (!l) this.cells.set(k, (l = []));
        l.push(item);
      }
  }
  at(x: number, z: number): readonly T[] { return this.cells.get(this.key(Math.floor(x / CELL), Math.floor(z / CELL))) ?? []; }
}

export class NavField {
  readonly square: NavSquare;
  /** Axis-aligned bounds of the exploration zone (for sampling and tests). */
  readonly zoneBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  private buildings = new Buckets<Bldg>();
  private carriageways = new Buckets<Seg>();
  private footways = new Buckets<Seg>();
  private areas = new Buckets<Poly & { kind: NavArea['kind'] }>();
  private basin: number[];
  /** Duke of York Square paved rings (plaza areas + forecourt) and its obstacles. */
  private doyRings: number[][] = [];
  private doyObstacles: { x: number; z: number; r: number; kind: NavClass }[] = [];
  private doyLines: { pts: number[]; r: number; kind: NavClass }[] = [];
  private doyBoxes: { x: number; z: number; u: [number, number]; hu: number; hv: number; kind: NavClass }[] = [];
  private doyTrack: number[] | null = null;
  private doyGates: { x: number; z: number }[] = [];
  readonly doyBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;
  private obstacles: { x: number; z: number; r: number; kind: NavClass }[] = [];
  private kr: { line: [number, number][]; cum: number[]; sStart: number; sEnd: number; hw: number; hwv: number[] } | null = null;
  private krObstacles = new Buckets<{ x: number; z: number; r: number; kind: NavClass }>();
  private krCrossings: { x: number; z: number; tx: number; tz: number }[] = [];
  /** Axis-aligned bounds of the King's Road corridor zone. */
  readonly krBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

  constructor(data: NavData) {
    this.square = data.square;
    const zb = bounds(data.square.ring);
    this.zoneBounds = { minX: zb.minX - ZONE_M, maxX: zb.maxX + ZONE_M, minZ: zb.minZ - ZONE_M, maxZ: zb.maxZ + ZONE_M };
    const pad = 40;
    // Duke of York Square's extent (for prefiltering geometry): its paved areas, before they are set up below
    const doyAreas = data.doy ? [...data.areas.filter((a) => DOY_PLAZA_AREAS.includes(a.id ?? '')).map((a) => a.ring), ...(data.doy.forecourt ? [data.doy.forecourt.ring] : [])].map(bounds) : [];
    const krb = data.kr ? (() => { const xs = data.kr.line.filter((_, i) => i % 2 === 0), zs = data.kr.line.filter((_, i) => i % 2 === 1); return { minX: Math.min(...xs) - 30, maxX: Math.max(...xs) + 30, minZ: Math.min(...zs) - 30, maxZ: Math.max(...zs) + 30 }; })() : null;
    const boxes = [this.zoneBounds, ...doyAreas, ...(krb ? [krb] : [])];
    const near = (p: Poly) => boxes.some((zb) => p.maxX > zb.minX - pad && p.minX < zb.maxX + pad && p.maxZ > zb.minZ - pad && p.minZ < zb.maxZ + pad);
    for (const b of data.buildings) {
      const p = bounds(b.rings[0]);
      if (!near(p)) continue;
      // King's Road frontages project less (flush shopfronts, fascias ≤ 0.35 m) than the square's bays and porticos
      const c = b.custom?.startsWith('kr:') ? KR_FACADE_CLEARANCE : FACADE_CLEARANCE;
      const item: Bldg = { ...p, id: b.id, h: b.h, holes: b.rings.slice(1), c };
      this.buildings.add(item, p.minX - c, p.maxX + c, p.minZ - c, p.maxZ + c);
    }
    data.roads.forEach((r, ref) => {
      const target = r.cls === 'main' || r.cls === 'street' || r.cls === 'service' ? this.carriageways : this.footways;
      for (let i = 0; i + 3 < r.pts.length; i += 2) {
        const w = r.wv ? Math.max(r.wv[i / 2], r.wv[i / 2 + 1]) : r.w;
        const s: Seg = { ax: r.pts[i], az: r.pts[i + 1], bx: r.pts[i + 2], bz: r.pts[i + 3], hw: w / 2, ref, main: r.cls === 'main', kr: r.name === "King's Road" };
        const m = s.hw + PAVEMENT_BAND;
        target.add(s, Math.min(s.ax, s.bx) - m, Math.max(s.ax, s.bx) + m, Math.min(s.az, s.bz) - m, Math.max(s.az, s.bz) + m);
      }
    });
    for (const a of data.areas) {
      const p = bounds(a.ring);
      if (near(p)) this.areas.add({ ...p, kind: a.kind }, p.minX, p.maxX, p.minZ, p.maxZ);
    }
    const sq = data.square;
    this.basin = sq.fountain.basin;
    for (const t of sq.trees) this.obstacles.push({ x: t.x, z: t.z, r: TRUNK_R, kind: 'tree' });
    if (sq.memorial) this.obstacles.push({ x: sq.memorial.x, z: sq.memorial.z, r: 2.2, kind: 'feature' });
    if (sq.drinkingFountain) this.obstacles.push({ x: sq.drinkingFountain.x, z: sq.drinkingFountain.z, r: 0.8, kind: 'feature' });
    for (const l of sq.lamps) this.obstacles.push({ x: l.x, z: l.z, r: 0.45, kind: 'feature' });
    const d = data.doy;
    if (d) {
      this.doyRings = data.areas.filter((a) => DOY_PLAZA_AREAS.includes(a.id ?? '')).map((a) => a.ring);
      if (d.forecourt) this.doyRings.push(d.forecourt.ring);
      for (const t of d.trees) this.doyObstacles.push({ x: t.x, z: t.z, r: 1.1, kind: 'tree' });
      if (d.statue) this.doyObstacles.push({ x: d.statue.x, z: d.statue.z, r: 1.6, kind: 'feature' });
      if (d.fountain) this.doyBoxes.push({ x: d.fountain.x, z: d.fountain.z, u: DOY_KR, hu: 4.6, hv: 3.0, kind: 'water' });
      for (const be of d.benches) {
        if ('pts' in be) this.doyLines.push({ pts: be.pts, r: 0.75, kind: 'feature' });
        else { const long = (be.seats ?? 0) >= 8; this.doyBoxes.push({ x: be.x, z: be.z, u: long ? DOY_GU : DOY_KR, hu: (long ? 6 : 1.9) / 2 + 0.4, hv: 0.75, kind: 'feature' }); }
      }
      for (const c of d.cycleStands) if (c.kind !== 'bollard') this.doyBoxes.push({ x: c.x, z: c.z, u: DOY_KR, hu: Math.min(12, Math.max(1, Math.round(c.capacity / 2))) * 0.45 + 0.5, hv: 1.1, kind: 'feature' });
      for (const w of d.walls) if ((w.h ?? 0) >= 3.5) this.doyLines.push({ pts: w.pts, r: 1.0, kind: 'building' });
      for (const f of d.fences) this.doyLines.push({ pts: f.pts, r: 0.6, kind: 'feature' });
      if (d.forecourt) {
        // railing along the forecourt's outer edge (from the gallery's south-east end back to the wall)
        const r = d.forecourt.ring;
        const pts: number[] = [];
        let on = false;
        for (let i = 0; i < r.length; i += 2) { if (on && i < r.length - 2) pts.push(r[i], r[i + 1]); if (Math.hypot(r[i] - 95.1, r[i + 1] - 93.8) < 1.5) on = true; }
        pts.push(14, 27);
        this.doyLines.push({ pts, r: 0.6, kind: 'feature' });
      }
      if (d.track) this.doyTrack = d.track.outer[0];
      this.doyGates = d.gates;
      // clipped hedge along the gallery's south-west front (from the forecourt's gallery corners)
      if (d.forecourt) {
        const r = d.forecourt.ring;
        const k = r.findIndex((_, i) => i % 2 === 0 && Math.hypot(r[i] - 95.1, r[i + 1] - 93.8) < 1.5);
        if (k >= 2) this.doyLines.push({ pts: [r[k - 2], r[k - 1], r[k], r[k + 1]], r: 1.9, kind: 'garden' });
      }
      if (this.doyRings.length) {
        const all = this.doyRings.flat();
        const xs = all.filter((_, i) => i % 2 === 0), zs = all.filter((_, i) => i % 2 === 1);
        (this as { doyBounds: NavField['doyBounds'] }).doyBounds = { minX: Math.min(...xs) - DOY_ZONE_M, maxX: Math.max(...xs) + DOY_ZONE_M, minZ: Math.min(...zs) - DOY_ZONE_M, maxZ: Math.max(...zs) + DOY_ZONE_M };
      }
    }
    const k = data.kr;
    if (k) {
      const line: [number, number][] = [];
      for (let i = 0; i + 1 < k.line.length; i += 2) line.push([k.line[i], k.line[i + 1]]);
      const cum = [0];
      for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
      this.kr = { line, cum, sStart: k.sStart, sEnd: k.sEnd, hw: k.roadW / 2, hwv: line.map((_, i) => (k.w?.[i] ?? k.roadW) / 2) };
      const add = (o: { x: number; z: number; r: number; kind: NavClass }) => this.krObstacles.add(o, o.x - o.r, o.x + o.r, o.z - o.r, o.z + o.r);
      for (const t of k.trees) add({ x: t.x, z: t.z, r: TRUNK_R, kind: 'tree' });
      for (const l of k.lamps) add({ x: l.x, z: l.z, r: 0.35, kind: 'feature' });
      for (const b of k.bollards) add({ x: b.x, z: b.z, r: 0.3, kind: 'feature' });
      for (const b of k.postBoxes) add({ x: b.x, z: b.z, r: 0.5, kind: 'feature' });
      for (const c of k.crossings) { const q = this.krNear(c.x, c.z); this.krCrossings.push({ x: q.p[0], z: q.p[1], tx: q.t[0], tz: q.t[1] }); }
      const pts = line.filter((_, i) => cum[i] >= k.sStart - 20 && cum[i] <= k.sEnd + 20);
      const m = this.kr.hw + KR_BAND;
      (this as { krBounds: NavField['krBounds'] }).krBounds = { minX: Math.min(...pts.map((p) => p[0])) - m, maxX: Math.max(...pts.map((p) => p[0])) + m, minZ: Math.min(...pts.map((p) => p[1])) - m, maxZ: Math.max(...pts.map((p) => p[1])) + m };
    }
  }

  /** Nearest point on the King's Road centreline: distance, chainage, point and direction. */
  krNear(x: number, z: number): { d: number; s: number; p: [number, number]; t: [number, number] } {
    let best = { d: Infinity, s: 0, p: [0, 0] as [number, number], t: [1, 0] as [number, number] };
    const k = this.kr;
    if (!k) return best;
    for (let i = 0; i + 1 < k.line.length; i++) {
      const a = k.line[i], b = k.line[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = k.cum[i + 1] - k.cum[i];
      if (L < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (L * L)));
      const p: [number, number] = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(x - p[0], z - p[1]);
      if (d < best.d) best = { d, s: k.cum[i] + t * L, p, t: [dx / L, dz / L] };
    }
    return best;
  }

  /** Half-width of the King's Road carriageway at chainage s. */
  krHw(s: number): number {
    const k = this.kr;
    if (!k) return 0;
    for (let i = 0; i + 1 < k.cum.length; i++) if (s <= k.cum[i + 1]) { const f = Math.max(0, (s - k.cum[i]) / ((k.cum[i + 1] - k.cum[i]) || 1)); return k.hwv[i] + (k.hwv[i + 1] - k.hwv[i]) * f; }
    return k.hwv[k.hwv.length - 1];
  }

  /** Inside the King's Road corridor zone (pavements both sides between its start and its end). */
  inKrZone(x: number, z: number): boolean {
    const k = this.kr, b = this.krBounds;
    if (!k || !b || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    const q = this.krNear(x, z);
    return q.d <= this.krHw(q.s) + KR_BAND && q.s >= k.sStart && q.s <= k.sEnd;
  }

  /** Just beyond the end of the reconstruction (the King's Road corridor past the Markham Square junction). */
  pastKrEnd(x: number, z: number): boolean {
    const k = this.kr;
    if (!k) return false;
    const q = this.krNear(x, z);
    return q.d <= this.krHw(q.s) + KR_BAND + 4 && q.s > k.sEnd && q.s < k.sEnd + 120;
  }

  /** Within KR_END_WARN of the end of the reconstruction (for the end-of-area message). */
  nearKrEnd(x: number, z: number): boolean {
    const k = this.kr;
    if (!k || !this.inKrZone(x, z)) return false;
    return this.krNear(x, z).s > k.sEnd - KR_END_WARN;
  }

  private krClass(x: number, z: number): NavClass | null {
    for (const o of this.krObstacles.at(x, z)) if (Math.hypot(x - o.x, z - o.z) < o.r) return o.kind;
    const q = this.krNear(x, z);
    const hw = this.krHw(q.s);
    if (q.d < hw + 0.3) {
      // the carriageway: only at a mapped crossing (a 3 m wide strip straight across the road)
      const onCrossing = this.krCrossings.some((c) => { const dx = x - c.x, dz = z - c.z; return Math.abs(dx * c.tx + dz * c.tz) < 1.6 && Math.abs(-dx * c.tz + dz * c.tx) < hw + 0.5; });
      return onCrossing ? 'ok' : 'carriageway';
    }
    return null;
  }

  /** Inside one of Duke of York Square's paved public areas (plaza or forecourt). */
  inDoy(x: number, z: number): boolean {
    return this.doyRings.some((r) => pointInRing(x, z, r));
  }

  private inDoyZone(x: number, z: number): boolean {
    const b = this.doyBounds;
    if (!b || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    return this.inDoy(x, z) || this.doyRings.some((r) => ringDist(x, z, r) <= DOY_ZONE_M);
  }

  private doyObstacle(x: number, z: number): NavClass | null {
    if (this.doyTrack && pointInRing(x, z, this.doyTrack)) return 'not-public';
    for (const o of this.doyObstacles) if (Math.hypot(x - o.x, z - o.z) < o.r) return o.kind;
    for (const bx of this.doyBoxes) {
      const dx = x - bx.x, dz = z - bx.z;
      if (Math.abs(dx * bx.u[0] + dz * bx.u[1]) < bx.hu && Math.abs(-dx * bx.u[1] + dz * bx.u[0]) < bx.hv) return bx.kind;
    }
    const atGate = this.doyGates.some((g) => Math.hypot(x - g.x, z - g.z) < 1.25);
    for (const l of this.doyLines) {
      if (atGate && l.kind !== 'garden') continue; // gateways through the wall and railings stay open
      for (let i = 0; i + 3 < l.pts.length; i += 2) if (segDist(x, z, l.pts[i], l.pts[i + 1], l.pts[i + 2], l.pts[i + 3]) < l.r) return l.kind;
    }
    return null;
  }

  inZone(x: number, z: number): boolean {
    return pointInRing(x, z, this.square.ring) || ringDist(x, z, this.square.ring) <= ZONE_M || this.inDoyZone(x, z) || this.inKrZone(x, z);
  }

  inSquare(x: number, z: number): boolean {
    return pointInRing(x, z, this.square.ring);
  }

  /** Building whose footprint contains the point (courtyard holes excluded), if any. */
  buildingAt(x: number, z: number): { id: string; h: number } | null {
    for (const b of this.buildings.at(x, z)) {
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (!pointInRing(x, z, b.ring)) continue;
      if (b.holes.some((h) => pointInRing(x, z, h))) continue;
      return b;
    }
    return null;
  }

  /** Within FACADE_CLEARANCE of a building footprint (outside it). */
  nearFacade(x: number, z: number): boolean {
    for (const b of this.buildings.at(x, z)) {
      const c = b.c;
      if (x < b.minX - c || x > b.maxX + c || z < b.minZ - c || z > b.maxZ + c) continue;
      if (ringDist(x, z, b.ring) < c) return true;
    }
    return false;
  }

  /** Why a point is or is not walkable. */
  classify(x: number, z: number): NavClass {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return 'outside';
    if (!this.inZone(x, z)) return this.pastKrEnd(x, z) ? 'end' : 'outside';
    if (this.buildingAt(x, z) || this.nearFacade(x, z)) return 'building';
    const inKr = this.kr !== null && this.inKrZone(x, z) && !this.inSquare(x, z) && !(this.doyRings.length && this.inDoy(x, z));
    if (inKr) {
      const c = this.krClass(x, z);
      if (c) return c;
    }
    if (this.doyRings.length && this.inDoyZone(x, z)) {
      const ob = this.doyObstacle(x, z);
      if (ob) return ob;
      if (this.inDoy(x, z)) return 'ok';
    }
    if (this.inSquare(x, z)) {
      if (pointInRing(x, z, this.basin) || ringDist(x, z, this.basin) < 0.6) return 'water';
      for (const o of this.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r) return o.kind;
      return 'ok';
    }
    let plaza = false;
    for (const a of this.areas.at(x, z)) {
      if (x < a.minX || x > a.maxX || z < a.minZ || z > a.maxZ || !pointInRing(x, z, a.ring)) continue;
      if (a.kind === 'carriageway' || a.kind === 'parking') return 'carriageway';
      if (a.kind === 'green') return 'garden';
      plaza = true;
    }
    let nearCarriageway = false;
    for (const s of this.carriageways.at(x, z)) {
      const d = segDist(x, z, s.ax, s.az, s.bx, s.bz);
      // side streets meeting King's Road are crossed at their mouths (the pavement line continues across)
      // (King's Road itself is classified above, with its fitted width)
      if (d < s.hw + 0.25 && (!inKr || (s.main && !s.kr))) return 'carriageway';
      if (d <= s.hw + PAVEMENT_BAND) nearCarriageway = true;
    }
    if (plaza || nearCarriageway) return 'ok';
    for (const s of this.footways.at(x, z)) if (segDist(x, z, s.ax, s.az, s.bx, s.bz) <= s.hw + FOOTWAY_BAND) return 'ok';
    return 'not-public';
  }

  isWalkable(x: number, z: number): boolean {
    return this.classify(x, z) === 'ok';
  }

  /** Map height of the walking surface at a walkable point. */
  groundY(x: number, z: number): number {
    if (this.inSquare(x, z)) return SQUARE_GROUND;
    if (this.doyRings.length && this.inDoy(x, z)) return DOY_GROUND;
    return this.kr && this.inKrZone(x, z) ? KR_GROUND : STREET_GROUND;
  }

  /**
   * True when the straight line between two map-space points passes through a building mass
   * (sampled every 0.5 m). `ignore` skips one building, e.g. the landmark being looked at.
   */
  lineBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number, ignore?: string): boolean {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / 0.5));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = ay + (by - ay) * t;
      const b = this.buildingAt(x, z);
      if (b && b.id !== ignore && y < b.h) return true;
    }
    return false;
  }

  /** Nearest walkable point within `maxR` metres (spiral search on a 0.5 m lattice), or null. */
  nearestWalkable(x: number, z: number, maxR = 6): { x: number; z: number } | null {
    if (this.isWalkable(x, z)) return { x, z };
    for (let r = 0.5; r <= maxR; r += 0.5) {
      const n = Math.max(8, Math.round((2 * Math.PI * r) / 0.5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (this.isWalkable(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }
}
