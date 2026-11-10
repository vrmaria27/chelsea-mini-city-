// Walkable surfaces for street-level exploration (map metres: x east, z south).
// Pure geometry over the bundled map data, so it can be tested without a browser.
//
// A point is walkable when it is inside the bounded exploration zone around Sloane Square and is
// public pavement or open space: the paved square itself, mapped plazas, or a pavement band beside
// a carriageway or along a mapped footway. It is never walkable inside a building footprint, on a
// carriageway, in the fountain basin, at a tree trunk or memorial, or in a (possibly private)
// garden, or within 1.3 m of a façade (bays, columns and shopfronts project beyond the footprint).
// Courtyards and back gardens inside blocks are excluded because they are not pavement.

export interface NavRoad { cls: 'main' | 'street' | 'service' | 'pedestrian' | 'path'; w: number; pts: number[]; name?: string | null }
export interface NavArea { kind: 'green' | 'plaza' | 'carriageway' | 'parking'; ring: number[] }
export interface NavBuilding { id: string; h: number; rings: number[][] }
export interface NavSquare {
  ring: number[];
  fountain: { x: number; z: number; basin: number[] };
  memorial?: { x: number; z: number };
  drinkingFountain?: { x: number; z: number };
  trees: { x: number; z: number }[];
  lamps: { x: number; z: number }[];
}
export interface NavData { roads: NavRoad[]; areas: NavArea[]; buildings: NavBuilding[]; square: NavSquare }

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
  private obstacles: { x: number; z: number; r: number; kind: NavClass }[] = [];

  constructor(data: NavData) {
    this.square = data.square;
    const zb = bounds(data.square.ring);
    this.zoneBounds = { minX: zb.minX - ZONE_M, maxX: zb.maxX + ZONE_M, minZ: zb.minZ - ZONE_M, maxZ: zb.maxZ + ZONE_M };
    const pad = 40;
    const near = (p: Poly) => p.maxX > this.zoneBounds.minX - pad && p.minX < this.zoneBounds.maxX + pad && p.maxZ > this.zoneBounds.minZ - pad && p.minZ < this.zoneBounds.maxZ + pad;
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
  }

  inZone(x: number, z: number): boolean {
    return pointInRing(x, z, this.square.ring) || ringDist(x, z, this.square.ring) <= ZONE_M;
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
    return this.inSquare(x, z) ? SQUARE_GROUND : STREET_GROUND;
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
