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
  paveFrom?: number;
  /** Walkable band beyond the carriageway (m; default KR_BAND) — narrower on side streets. */
  band?: number;
  /** Narrow street walked on the carriageway. */
  shared?: boolean;
  trees: { x: number; z: number }[];
  lamps: { x: number; z: number }[];
  bollards: { x: number; z: number }[];
  postBoxes: { x: number; z: number }[];
  crossings: { x: number; z: number; kind: string | null }[];
}
export interface NavData { roads: NavRoad[]; areas: NavArea[]; buildings: NavBuilding[]; square: NavSquare; doy?: NavDoy | null; kr?: NavKr | null; corridors?: (NavKr & { id: string; name: string })[] }

/** The Duke of York Square plaza areas (OSM ids) that are public paved space. */
export const DOY_PLAZA_AREAS = ['w5318345', 'w900260769'];
/** Zone margin around Duke of York Square's paved areas (takes in the King's Road pavement). */
export const DOY_ZONE_M = 5;
export const DOY_GROUND = 0.32;
/** Corridor pavement height (King's Road, Sloane Street, Lower Sloane Street; matches KR_PAVE in kingsRoad.ts). */
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
  /** Street corridors rebuilt building by building: King's Road first, then Sloane Street and Lower Sloane Street. */
  readonly corridors: CorridorNav[] = [];
  private get kr(): CorridorNav | null { return this.corridors[0]?.id === 'kr' ? this.corridors[0] : null; }

  constructor(data: NavData) {
    this.square = data.square;
    const zb = bounds(data.square.ring);
    this.zoneBounds = { minX: zb.minX - ZONE_M, maxX: zb.maxX + ZONE_M, minZ: zb.minZ - ZONE_M, maxZ: zb.maxZ + ZONE_M };
    const pad = 40;
    // Duke of York Square's extent (for prefiltering geometry): its paved areas, before they are set up below
    const doyAreas = data.doy ? [...data.areas.filter((a) => DOY_PLAZA_AREAS.includes(a.id ?? '')).map((a) => a.ring), ...(data.doy.forecourt ? [data.doy.forecourt.ring] : [])].map(bounds) : [];
    const corData = [...(data.kr ? [{ ...data.kr, id: 'kr', name: "King's Road" }] : []), ...(data.corridors ?? [])];
    const corBoxes = corData.map((k) => { const xs = k.line.filter((_, i) => i % 2 === 0), zs = k.line.filter((_, i) => i % 2 === 1); return { minX: Math.min(...xs) - 30, maxX: Math.max(...xs) + 30, minZ: Math.min(...zs) - 30, maxZ: Math.max(...zs) + 30 }; });
    const corNames = corData.map((k) => k.name);
    const boxes = [this.zoneBounds, ...doyAreas, ...corBoxes];
    const near = (p: Poly) => boxes.some((zb) => p.maxX > zb.minX - pad && p.minX < zb.maxX + pad && p.maxZ > zb.minZ - pad && p.minZ < zb.maxZ + pad);
    for (const b of data.buildings) {
      const p = bounds(b.rings[0]);
      if (!near(p)) continue;
      // King's Road frontages project less (flush shopfronts, fascias ≤ 0.35 m) than the square's bays and porticos
      const c = /^(kr|ss|ls|sd):/.test(b.custom ?? '') ? KR_FACADE_CLEARANCE : FACADE_CLEARANCE;
      const item: Bldg = { ...p, id: b.id, h: b.h, holes: b.rings.slice(1), c };
      this.buildings.add(item, p.minX - c, p.maxX + c, p.minZ - c, p.maxZ + c);
    }
    data.roads.forEach((r, ref) => {
      const target = r.cls === 'main' || r.cls === 'street' || r.cls === 'service' ? this.carriageways : this.footways;
      for (let i = 0; i + 3 < r.pts.length; i += 2) {
        const w = r.wv ? Math.max(r.wv[i / 2], r.wv[i / 2 + 1]) : r.w;
        const s: Seg = { ax: r.pts[i], az: r.pts[i + 1], bx: r.pts[i + 2], bz: r.pts[i + 3], hw: w / 2, ref, main: r.cls === 'main', kr: corNames.includes(r.name ?? '') };
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
    for (const k of corData) this.corridors.push(new CorridorNav(k));
    // a street whose end runs on into another walkable area (another street, a square) has no end message
    for (const c of this.corridors) {
      const [x, z] = c.beyondEnd(6);
      c.open = this.corridors.some((o) => o !== c && o.inZone(x, z)) || pointInRing(x, z, this.square.ring) || ringDist(x, z, this.square.ring) <= ZONE_M || this.inDoyZone(x, z);
    }
  }

  /** Nearest point on the King's Road centreline: distance, chainage, point and direction. */
  krNear(x: number, z: number): { d: number; s: number; p: [number, number]; t: [number, number] } {
    return this.kr ? this.kr.near(x, z) : { d: Infinity, s: 0, p: [0, 0], t: [1, 0] };
  }

  /** Half-width of the King's Road carriageway at chainage s. */
  krHw(s: number): number {
    return this.kr ? this.kr.hw(s) : 0;
  }

  /** The corridor zone containing a point (pavements both sides between its start and its end), if any. */
  corridorAt(x: number, z: number): CorridorNav | null {
    return this.corridors.find((c) => c.inZone(x, z)) ?? null;
  }

  /** Inside any corridor zone (King's Road, Sloane Street, Lower Sloane Street). */
  inKrZone(x: number, z: number): boolean {
    return this.corridorAt(x, z) !== null;
  }

  /** Just beyond the end of a corridor's reconstruction. */
  pastKrEnd(x: number, z: number): boolean {
    return this.corridors.some((c) => c.pastEnd(x, z));
  }

  /** Within KR_END_WARN of the end of a corridor's reconstruction (for the end-of-area message). */
  nearKrEnd(x: number, z: number): boolean {
    return this.nearEndOf(x, z) !== null;
  }

  /** The id of the corridor whose end is within KR_END_WARN (or null). */
  nearEndOf(x: number, z: number): string | null {
    for (const c of this.corridors) if (c.nearEnd(x, z) && !this.inSquare(x, z)) return c.id;
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
    const cor = this.corridorAt(x, z);
    const inKr = cor !== null && !this.inSquare(x, z) && !(this.doyRings.length && this.inDoy(x, z));
    if (inKr) {
      // every street whose zone contains the point has a say (junctions overlap): an obstacle or a
      // carriageway in any of them wins, unless the point is on a mapped crossing of that street
      let crossing = false;
      const inMain = this.corridors.some((k) => !k.id.startsWith('sd-') && k.inZone(x, z));
      for (const k of this.corridors) {
        if (!k.inZone(x, z) && !(k.onCarriageway(x, z))) continue;
        const c = k.classify(x, z);
        // a side street's mouth is crossed along the main street's pavement
        if (c === 'carriageway' && inMain && k.id.startsWith('sd-')) continue;
        if (c === 'ok') crossing = true;
        else if (c) return c;
      }
      if (crossing) return 'ok';
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
    const c = this.corridorAt(x, z);
    return c ? c.groundY(x, z) : STREET_GROUND;
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

/** One street corridor's walkable zone: its pavements, obstacles, mapped crossings and end. */
export class CorridorNav {
  readonly id: string;
  readonly name: string;
  readonly sStart: number;
  readonly sEnd: number;
  /** Chainage where the raised pavement begins (ramping up from the street level over 3 m). */
  readonly paveFrom: number;
  /** Walkable band beyond the carriageway edge (m). */
  readonly band: number;
  /** True when the street continues into another walkable area at its end (no end-of-area message). */
  open = false;
  /** Narrow street walked on the carriageway (pavements too narrow to model or absent). */
  readonly shared: boolean;
  private line: [number, number][] = [];
  private cum = [0];
  private hwv: number[];
  private obstacles = new Buckets<{ x: number; z: number; r: number; kind: NavClass }>();
  private crossings: { x: number; z: number; tx: number; tz: number }[] = [];
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number };

  constructor(k: NavKr & { id: string; name: string }) {
    this.id = k.id; this.name = k.name; this.sStart = k.sStart; this.sEnd = k.sEnd; this.paveFrom = k.paveFrom ?? -Infinity; this.band = k.band ?? KR_BAND; this.shared = !!k.shared;
    for (let i = 0; i + 1 < k.line.length; i += 2) this.line.push([k.line[i], k.line[i + 1]]);
    for (let i = 1; i < this.line.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.line[i][0] - this.line[i - 1][0], this.line[i][1] - this.line[i - 1][1]));
    this.hwv = this.line.map((_, i) => (k.w?.[i] ?? k.roadW) / 2);
    const add = (o: { x: number; z: number; r: number; kind: NavClass }) => this.obstacles.add(o, o.x - o.r, o.x + o.r, o.z - o.r, o.z + o.r);
    for (const t of k.trees) add({ x: t.x, z: t.z, r: TRUNK_R, kind: 'tree' });
    for (const l of k.lamps) add({ x: l.x, z: l.z, r: 0.35, kind: 'feature' });
    for (const b of k.bollards) add({ x: b.x, z: b.z, r: 0.3, kind: 'feature' });
    for (const b of k.postBoxes) add({ x: b.x, z: b.z, r: 0.5, kind: 'feature' });
    for (const c of k.crossings) { const q = this.near(c.x, c.z); this.crossings.push({ x: q.p[0], z: q.p[1], tx: q.t[0], tz: q.t[1] }); }
    const pts = this.line.filter((_, i) => this.cum[i] >= k.sStart - 20 && this.cum[i] <= k.sEnd + 20);
    const m = Math.max(...this.hwv) + this.band;
    this.bounds = { minX: Math.min(...pts.map((p) => p[0])) - m, maxX: Math.max(...pts.map((p) => p[0])) + m, minZ: Math.min(...pts.map((p) => p[1])) - m, maxZ: Math.max(...pts.map((p) => p[1])) + m };
  }

  /** Nearest point on the centreline: distance, chainage, point and direction. */
  near(x: number, z: number): { d: number; s: number; p: [number, number]; t: [number, number] } {
    let best = { d: Infinity, s: 0, p: [0, 0] as [number, number], t: [1, 0] as [number, number] };
    for (let i = 0; i + 1 < this.line.length; i++) {
      const a = this.line[i], b = this.line[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = this.cum[i + 1] - this.cum[i];
      if (L < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (L * L)));
      const p: [number, number] = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(x - p[0], z - p[1]);
      if (d < best.d) best = { d, s: this.cum[i] + t * L, p, t: [dx / L, dz / L] };
    }
    return best;
  }

  /** Carriageway half-width at chainage s. */
  hw(s: number): number {
    for (let i = 0; i + 1 < this.cum.length; i++) if (s <= this.cum[i + 1]) { const f = Math.max(0, (s - this.cum[i]) / ((this.cum[i + 1] - this.cum[i]) || 1)); return this.hwv[i] + (this.hwv[i + 1] - this.hwv[i]) * f; }
    return this.hwv[this.hwv.length - 1];
  }

  inZone(x: number, z: number): boolean {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    const q = this.near(x, z);
    return q.d <= this.hw(q.s) + this.band && q.s >= this.sStart && q.s <= this.sEnd;
  }

  /** Walking-surface height at a point in the zone. */
  groundY(x: number, z: number): number {
    const q = this.near(x, z), s = q.s;
    if (this.shared && q.d < this.hw(s)) return STREET_GROUND;
    return KR_GROUND - (KR_GROUND - STREET_GROUND) * Math.max(0, Math.min(1, 1 - (s - this.paveFrom) / 3));
  }

  pastEnd(x: number, z: number): boolean {
    const q = this.near(x, z);
    return !this.open && q.d <= this.hw(q.s) + this.band + 4 && q.s > this.sEnd && q.s < this.sEnd + 120;
  }

  nearEnd(x: number, z: number): boolean {
    return !this.open && this.inZone(x, z) && this.near(x, z).s > this.sEnd - KR_END_WARN;
  }

  /** The point `ahead` metres beyond the end, along the line (to test whether the street runs on into another area). */
  beyondEnd(ahead: number): [number, number] {
    const n = this.line.length, a = this.line[n - 2], b = this.line[n - 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const q = this.near(b[0], b[1]);
    const extra = this.sEnd + ahead - q.s;
    return [b[0] + ((b[0] - a[0]) / L) * extra, b[1] + ((b[1] - a[1]) / L) * extra];
  }

  /** On this street's carriageway (within its start and end). */
  onCarriageway(x: number, z: number): boolean {
    const b = this.bounds;
    if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
    const q = this.near(x, z);
    return q.s >= this.sStart && q.s <= this.sEnd && q.d < this.hw(q.s) + 0.3;
  }

  /** Obstacles and the carriageway (walkable only at a mapped crossing: a 3 m strip straight across). */
  classify(x: number, z: number): NavClass | null {
    for (const o of this.obstacles.at(x, z)) if (Math.hypot(x - o.x, z - o.z) < o.r) return o.kind;
    const q = this.near(x, z);
    const hw = this.hw(q.s);
    if (q.d < hw + 0.3) {
      const onCrossing = this.crossings.some((c) => { const dx = x - c.x, dz = z - c.z; return Math.abs(dx * c.tx + dz * c.tz) < 1.6 && Math.abs(-dx * c.tz + dz * c.tx) < hw + 0.5; });
      return onCrossing || this.shared ? 'ok' : 'carriageway';
    }
    return null;
  }
}
