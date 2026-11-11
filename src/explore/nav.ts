// Walkable surfaces for street-level exploration (map metres: x east, z south).
// Pure geometry over the bundled map data, so it can be tested without a browser.
//
// A point is walkable when it is inside one of the bounded exploration zones (around Sloane Square,
// and Duke of York Square with the Saatchi Gallery forecourt) and is public pavement or open space: the paved square itself, mapped plazas, or a pavement band beside
// a carriageway or along a mapped footway. It is never walkable inside a building footprint, on a
// carriageway, in the fountain basin, at a tree trunk or memorial, or in a (possibly private)
// garden, or within 1.3 m of a façade (bays, columns and shopfronts project beyond the footprint).
// Courtyards and back gardens inside blocks are excluded because they are not pavement.

export interface NavRoad { cls: 'main' | 'street' | 'service' | 'pedestrian' | 'path'; w: number; pts: number[]; name?: string | null }
export interface NavArea { id?: string; kind: 'green' | 'plaza' | 'carriageway' | 'parking'; ring: number[] }
export interface NavBuilding { id: string; h: number; rings: number[][] }
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
export interface NavData { roads: NavRoad[]; areas: NavArea[]; buildings: NavBuilding[]; square: NavSquare; doy?: NavDoy | null }

/** The Duke of York Square plaza areas (OSM ids) that are public paved space. */
export const DOY_PLAZA_AREAS = ['w5318345', 'w900260769'];
/** Zone margin around Duke of York Square's paved areas (takes in the King's Road pavement). */
export const DOY_ZONE_M = 5;
export const DOY_GROUND = 0.32;
/** Directions used to place the square's furniture (see dukeOfYorkSquare.ts). */
const DOY_KR: [number, number] = [0.754, -0.658];
const DOY_GU: [number, number] = [0.619, 0.785];

export type NavClass =
  | 'ok' | 'outside' | 'building' | 'carriageway' | 'water' | 'tree' | 'feature' | 'garden' | 'not-public';

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
const CELL = 16;

interface Seg { ax: number; az: number; bx: number; bz: number; hw: number; ref: number }
interface Poly { ring: number[]; minX: number; maxX: number; minZ: number; maxZ: number }
interface Bldg extends Poly { id: string; h: number; holes: number[][] }

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

  constructor(data: NavData) {
    this.square = data.square;
    const zb = bounds(data.square.ring);
    this.zoneBounds = { minX: zb.minX - ZONE_M, maxX: zb.maxX + ZONE_M, minZ: zb.minZ - ZONE_M, maxZ: zb.maxZ + ZONE_M };
    const pad = 40;
    // Duke of York Square's extent (for prefiltering geometry): its paved areas, before they are set up below
    const doyAreas = data.doy ? [...data.areas.filter((a) => DOY_PLAZA_AREAS.includes(a.id ?? '')).map((a) => a.ring), ...(data.doy.forecourt ? [data.doy.forecourt.ring] : [])].map(bounds) : [];
    const boxes = [this.zoneBounds, ...doyAreas];
    const near = (p: Poly) => boxes.some((zb) => p.maxX > zb.minX - pad && p.minX < zb.maxX + pad && p.maxZ > zb.minZ - pad && p.minZ < zb.maxZ + pad);
    for (const b of data.buildings) {
      const p = bounds(b.rings[0]);
      if (!near(p)) continue;
      const item: Bldg = { ...p, id: b.id, h: b.h, holes: b.rings.slice(1) };
      const c = FACADE_CLEARANCE;
      this.buildings.add(item, p.minX - c, p.maxX + c, p.minZ - c, p.maxZ + c);
    }
    data.roads.forEach((r, ref) => {
      const target = r.cls === 'main' || r.cls === 'street' || r.cls === 'service' ? this.carriageways : this.footways;
      for (let i = 0; i + 3 < r.pts.length; i += 2) {
        const s: Seg = { ax: r.pts[i], az: r.pts[i + 1], bx: r.pts[i + 2], bz: r.pts[i + 3], hw: r.w / 2, ref };
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
    return pointInRing(x, z, this.square.ring) || ringDist(x, z, this.square.ring) <= ZONE_M || this.inDoyZone(x, z);
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
    const c = FACADE_CLEARANCE;
    for (const b of this.buildings.at(x, z)) {
      if (x < b.minX - c || x > b.maxX + c || z < b.minZ - c || z > b.maxZ + c) continue;
      if (ringDist(x, z, b.ring) < c) return true;
    }
    return false;
  }

  /** Why a point is or is not walkable. */
  classify(x: number, z: number): NavClass {
    if (!Number.isFinite(x) || !Number.isFinite(z) || !this.inZone(x, z)) return 'outside';
    if (this.buildingAt(x, z) || this.nearFacade(x, z)) return 'building';
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
      if (d < s.hw + 0.25) return 'carriageway';
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
    return this.inSquare(x, z) ? SQUARE_GROUND : this.doyRings.length && this.inDoy(x, z) ? DOY_GROUND : STREET_GROUND;
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
