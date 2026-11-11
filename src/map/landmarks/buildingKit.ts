// Shared helpers for individually reconstructed buildings (Sloane Square perimeter, Duke of York
// Square): plain body walls, sloped roofs from importer insets, party-wall detection, frontage
// selection, sign quads and window grids. All dimensions are map metres.
import { MeshBuilder, type RGB } from '../../engine/geometry';
import { F, edgesOf, mergeFronts, type Front, type Pt } from './facadeKit';

export interface SquareBuildingFootprint { id: string; h: number; rings: number[][]; tris: number[]; custom?: string }
export type RoofInsets = Record<string, { ring: number[]; holes: number[][]; tris: number[] }>;

/** A sign drawn into the shared signage atlas (positions computed without a DOM). */
export interface SignQuad { corners: number[][]; text: string; bg: string; fg: string; weight?: number; font?: 'sans' | 'serif'; spacing?: number }

export interface Ctx {
  b: MeshBuilder;
  bl: SquareBuildingFootprint;
  roofs: RoofInsets;
  centre: Pt;
  signs: SignQuad[];
  /** Other building footprints nearby (party walls are never given façades). */
  others: number[][];
}

// ---- shared body and roof ------------------------------------------------------------------------

/** Plain walls on every footprint edge (backs and party walls), up to `eaves`. */
export function walls(c: Ctx, eaves: number, col: RGB, y0 = 0): void {
  c.bl.rings.forEach((r) => { for (const e of edgesOf(r)) new F(c.b, e).wall(0, e.len, y0, eaves, col); });
}

export function flatLid(b: MeshBuilder, tris: number[], y: number, col: RGB): void {
  for (let i = 0; i < tris.length; i += 6) {
    const p = [tris[i], y, tris[i + 1]], q = [tris[i + 2], y, tris[i + 3]], r = [tris[i + 4], y, tris[i + 5]];
    const cross = (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]);
    if (cross < 0) b.tri(p, q, r, col); else b.tri(p, r, q, col);
  }
}

/** Sloped roof: each edge rises from the eaves to the inset ring at eaves + h, then a flat lid. */
export function slopedRoof(c: Ctx, eaves: number, h: number, inset: number, col: RGB, lid: RGB = col): void {
  const ins = c.roofs[String(inset)];
  if (!ins) { flatLid(c.b, c.bl.tris, eaves, col); return; }
  const pairs: [number[], number[]][] = [[c.bl.rings[0], ins.ring], ...c.bl.rings.slice(1).map((r, i) => [r, ins.holes[i]] as [number[], number[]])];
  for (const [outer, inner] of pairs) {
    if (!inner || inner.length !== outer.length) continue;
    const n = outer.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const A = [outer[i * 2], eaves, outer[i * 2 + 1]], B = [outer[j * 2], eaves, outer[j * 2 + 1]];
      const Cq = [inner[j * 2], eaves + h, inner[j * 2 + 1]], D = [inner[i * 2], eaves + h, inner[i * 2 + 1]];
      // face up/outward: check the normal's y
      const ux = B[0] - A[0], uz = B[2] - A[2], wx = D[0] - A[0], wy = D[1] - A[1], wz = D[2] - A[2];
      const ny = uz * wx - ux * wz;
      void wy;
      if (ny > 0) c.b.quad(A, B, Cq, D, col); else c.b.quad(B, A, D, Cq, col);
    }
  }
  flatLid(c.b, ins.tris, eaves + h, lid);
}

/** Fronts of this building that face the square (or satisfy `pred`), longest first. */
export function inRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** True when the edge is shared with a neighbouring building (a party wall). */
export function partyWall(c: Ctx, f: Front): boolean {
  let hits = 0;
  for (const t of [0.25, 0.5, 0.75]) {
    const x = f.a[0] + f.t[0] * f.len * t + f.n[0] * 1.2, z = f.a[1] + f.t[1] * f.len * t + f.n[1] * 1.2;
    if (c.others.some((r) => inRing(x, z, r))) hits++;
  }
  return hits >= 2;
}

export function fronts(c: Ctx, pred?: (f: Front, toCentre: Pt) => boolean, merge = true): Front[] {
  const fs = edgesOf(c.bl.rings[0]).filter((f) => !partyWall(c, f));
  const ok = fs.filter((f) => {
    const m: Pt = [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2];
    const d = Math.hypot(c.centre[0] - m[0], c.centre[1] - m[1]) || 1;
    const to: Pt = [(c.centre[0] - m[0]) / d, (c.centre[1] - m[1]) / d];
    return pred ? pred(f, to) : f.n[0] * to[0] + f.n[1] * to[1] > 0.55 && f.len > 2;
  });
  return merge ? mergeFronts(ok) : ok;
}
export const facing = (dir: Pt, min = 0.8) => (f: Front) => f.n[0] * dir[0] + f.n[1] * dir[1] > min && f.len > 1.5;
export const longest = (fs: Front[]) => fs.slice().sort((a, b) => b.len - a.len)[0];

/** Sign quad on a frontage plane. */
export function sign(c: Ctx, fr: F, u0: number, u1: number, y0: number, y1: number, v: number, text: string, bg: string, fg: string, o: Partial<SignQuad> = {}): void {
  c.signs.push({ corners: [fr.P(u0, y0, v), fr.P(u1, y0, v), fr.P(u1, y1, v), fr.P(u0, y1, v)], text, bg, fg, ...o });
}

/** Evenly spaced bay centres across [u0, u1]. */
export const bays = (u0: number, u1: number, n: number) => Array.from({ length: n }, (_, i) => u0 + ((i + 0.5) * (u1 - u0)) / n);

/** Plain upper windows on a side or return elevation. */
export function plainGrid(fr: F, y0: number, storeyH: number, storeys: number, every: number, w: number, frame: RGB, h = 1.7, u0 = 0.8, u1 = fr.len - 0.8): void {
  const n = Math.max(1, Math.floor((u1 - u0) / every));
  for (let s = 0; s < storeys; s++) for (const u of bays(u0, u1, n)) fr.window(u, y0 + s * storeyH + 0.8, w, h, { frame, bars: 1, frameW: 0.1 });
}

