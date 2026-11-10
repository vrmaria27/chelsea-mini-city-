// Procedural, original geometry for the Chelsea-inspired model. Everything is built in
// map metres; a single model matrix scales the city down onto the tabletop.
import type { MapLabelDef, PlotDef } from '../map/types';
import type { BuildingType, Level } from '../sim/rules';
import type { Building, Stats } from '../sim/simulation';
import { MeshBuilder, hex, rng, shade, type RGB } from '../engine/geometry';
import { compose, mat4, type Mat4 } from '../engine/math';
import { buildAtlas, pushFlatLabel, type LabelStyle } from '../engine/text';

// Shared plot-level and decorative geometry. Map-specific scenery lives in src/map/*Map.ts.

export const PAVE_Y = 0.3;
export const PLOT_Y = 0.42;
export const SETBACK = 3.5;

export const P = {
  road: hex('#8b8f97'),
  roadDash: hex('#efe9da'),
  pavement: hex('#ddd5c6'),
  lawn: hex('#a3c283'),
  lawnDark: hex('#8fb36f'),
  plaza: hex('#ece2cf'),
  plazaDark: hex('#d9ccb3'),
  water: hex('#8fc1d4'),
  stone: hex('#e6dccb'),
  plinth: hex('#7b5238'),
  plinthTop: hex('#8f6345'),
  bricks: ['#a9563f', '#b5664a', '#9b4c3a', '#b9775a', '#94604a'].map(hex),
  creams: ['#f0e7d4', '#e9ddc5', '#f4ecdc'].map(hex),
  pastels: ['#ebcdc4', '#cfdccf', '#ecdcac', '#d3dce6'].map(hex),
  stucco: hex('#f2ebdc'),
  slate: [hex('#5e6571'), hex('#686d77'), hex('#727069')],
  window: hex('#3d4855'),
  windowLit: hex('#55636f'),
  doors: ['#2f3e5c', '#7b3030', '#2f5a45', '#26262a'].map(hex),
  chimney: hex('#8a4e3c'),
  pot: hex('#b0684a'),
  trunk: hex('#6b4f3a'),
  greens: ['#6f9a55', '#5f8c4a', '#7ea860', '#58844a'].map(hex),
  hedge: hex('#4f7a40'),
  bench: hex('#6d5643'),
  gravel: hex('#e3d6b8'),
  padEdge: hex('#c8b48b'),
  post: hex('#fbf7ee'),
  sign: hex('#2f5a45'),
  glass: hex('#5c7f8a'),
  awnings: ['#2f6b5a', '#9c3d3d', '#2f4f7a', '#c08a2e', '#6b4f7a'].map(hex),
  goldStone: hex('#efe3c4'),
};

const tmpM = mat4();

// ---------------------------------------------------------------------------------------------
// Reusable pieces (local frame: front faces +z, front wall at z = 0, building extends to -depth)

export function terraceHouse(b: MeshBuilder, x0: number, x1: number, depth: number, h: number, wall: RGB, roof: RGB, door: RGB, brick: boolean, rich = false): void {
  const w = x1 - x0;
  b.box(x0, 0, -depth, x1, h, 0, wall);
  // Stucco ground floor on brick houses (a common London terrace look)
  if (brick) b.box(x0, 0, 0, x1, 3.4, 0.08, P.stucco);
  // Windows on the front: ground floor + upper floors
  const floors = Math.max(2, Math.round(h / 3.4));
  const cols = w > 7.5 ? 3 : 2;
  for (let f = 0; f < floors; f++) {
    const y0 = 1.2 + f * 3.3;
    if (y0 + 2 > h - 0.4) break;
    for (let c = 0; c < cols; c++) {
      if (f === 0 && c === 0) continue; // door slot
      const cx = x0 + (w * (c + 0.5)) / cols;
      const ww = f === 1 ? 1.25 : 1.05;
      const wh = f === 1 ? 2.2 : 1.8;
      b.quad([cx - ww / 2, y0, 0.12], [cx + ww / 2, y0, 0.12], [cx + ww / 2, y0 + wh, 0.12], [cx - ww / 2, y0 + wh, 0.12], f === 0 ? P.windowLit : P.window);
    }
  }
  const dx = x0 + w / (cols * 2);
  b.quad([dx - 0.6, 0, 0.14], [dx + 0.6, 0, 0.14], [dx + 0.6, 2.5, 0.14], [dx - 0.6, 2.5, 0.14], door);
  if (rich) {
    // Level 2: white columned porch, stucco cornice and flower-filled window boxes
    b.box(dx - 1.1, 3.0, 0, dx + 1.1, 3.4, 1.3, P.stucco);
    b.cylinder(dx - 0.85, 1.05, 0, 3.0, 0.16, 6, P.stucco, false);
    b.cylinder(dx + 0.85, 1.05, 0, 3.0, 0.16, 6, P.stucco, false);
    b.box(x0, h - 0.7, 0, x1, h - 0.2, 0.45, P.stucco);
    for (let c = 0; c < cols; c++) {
      const cx = x0 + (w * (c + 0.5)) / cols;
      b.box(cx - 0.75, 4.15, 0.1, cx + 0.75, 4.55, 0.6, P.bench);
      b.box(cx - 0.7, 4.55, 0.15, cx + 0.7, 4.85, 0.55, c % 2 ? FLOWER_A : FLOWER_B);
    }
  }
  // Pitched roof along the street, small eaves
  b.gable(x0 - 0.05, -depth - 0.3, x1 + 0.05, 0.3, h, 3.2, roof, true, wall);
}

export function chimney(b: MeshBuilder, x: number, z: number, h: number): void {
  b.box(x - 0.6, h + 1.2, z - 1.2, x + 0.6, h + 4.6, z + 1.2, P.chimney);
  b.box(x - 0.25, h + 4.6, z - 0.9, x + 0.25, h + 5.3, z - 0.4, P.pot);
  b.box(x - 0.25, h + 4.6, z + 0.4, x + 0.25, h + 5.3, z + 0.9, P.pot);
}

export function tree(b: MeshBuilder, x: number, z: number, y: number, s: number, col: RGB, twist = 0): void {
  b.cylinder(x, z, y, y + 3.2 * s, 0.35 * s, 4, P.trunk, false);
  b.blob(x, y + 5.4 * s, z, 3.1 * s, 3.0 * s, col, twist);
  b.blob(x + 0.6 * s, y + 7.4 * s, z - 0.4 * s, 2.1 * s, 2.2 * s, shade(col, 1.06), twist + 0.5);
}

export function bench(b: MeshBuilder, x: number, z: number, y: number, alongX: boolean): void {
  if (alongX) b.box(x - 1.2, y, z - 0.35, x + 1.2, y + 0.6, z + 0.35, P.bench);
  else b.box(x - 0.35, y, z - 1.2, x + 0.35, y + 0.6, z + 1.2, P.bench);
}

export function fountain(b: MeshBuilder, x: number, z: number, y: number, r: number): void {
  b.cylinder(x, z, y, y + 0.8, r, 12, P.stone);
  b.cylinder(x, z, y + 0.8, y + 0.85, r * 0.86, 12, P.water);
  b.cylinder(x, z, y + 0.8, y + 2.6, r * 0.18, 8, P.stone);
  b.cylinder(x, z, y + 2.6, y + 2.8, r * 0.38, 8, P.stone);
}

// ---------------------------------------------------------------------------------------------
// Plot buildings (local frame centred on the plot, front toward +z)

const FLOWER_A = hex('#e07a8f'), FLOWER_B = hex('#f2c14e'), FLOWER_C = hex('#a77bd6');
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Building model sized to a site: local frame centred on the site rectangle, x along the street
 * frontage (−W/2…W/2), z from the back (−D/2) to the street front (+D/2). Nothing leaves that box.
 * Parametric rather than stretched: terrace width, window and awning counts, trees and paths all
 * adapt to the site's real dimensions.
 */
export function buildingMesh(type: BuildingType, variant = 0, level: Level = 1, W = 24, D = 24): MeshBuilder {
  const b = new MeshBuilder();
  const l2 = level === 2;
  const r = rng(1000 + variant * 31 + (type === 'shop' ? 7 : type === 'park' ? 13 : 0));
  const hw = W / 2, hd = D / 2;
  if (type === 'townhouse') {
    b.flat(-hw, -hd, hw, hd, PLOT_Y, P.lawn);
    const brick = P.bricks[variant % P.bricks.length];
    const roof = P.slate[variant % P.slate.length];
    const fs = clamp(D * 0.14, 1.5, 2.5); // front area with railings (room for the Level 2 porch)
    const depth = clamp(D - fs - 1.2, Math.min(4.5, D - fs - 0.45), 13); // roof eaves overhang ~0.3 m
    const h = clamp(depth * 0.95, 7.5, 12.5) + (variant % 3) * 0.8 + (l2 ? 3.3 : 0); // Level 2 adds a storey
    const n = Math.max(1, Math.round(W / 7));
    const front = hd - fs;
    b.setTransform(compose(tmpM, 0, PLOT_Y, front));
    for (let i = 0; i < n; i++) {
      const x0 = -hw + (W * i) / n + 0.05, x1 = -hw + (W * (i + 1)) / n - 0.05;
      const wall = i % 2 === 1 && variant % 2 ? P.creams[variant % 3] : brick;
      terraceHouse(b, x0, x1, depth, h, wall, roof, P.doors[(variant + i) % P.doors.length], wall === brick, l2);
      if (i > 0) chimney(b, x0, -depth / 2, h);
    }
    b.box(-hw + 0.2, 0, Math.min(fs - 0.25, 1.6), hw - 0.2, 1.0, Math.min(fs - 0.05, 1.8), hex('#2b2b2e')); // front railings
    b.setTransform(null);
    if (l2 && fs > 1.9) for (let i = 0; i < n; i++) {
      const x = -hw + (W * (i + 0.5)) / n;
      b.box(x - 0.6, PLOT_Y, hd - 0.9, x + 0.6, PLOT_Y + 0.6, hd - 0.2, P.stucco);
      b.blob(x, PLOT_Y + 1.3, hd - 0.55, 0.55, 0.7, P.greens[3]);
    }
    const garden = D - fs - depth;
    if (garden > 4 && W > 6) { const ts = clamp(garden / 8, 0.45, 0.75); const tx = clamp(-hw + 3 + r() * (W - 6), -hw + 3.2 * ts, hw - 3.2 * ts); tree(b, tx, Math.max(-hd + 3.2 * ts, -hd + garden / 2), PLOT_Y, ts, P.greens[variant % 4], r()); }
  } else if (type === 'shop') {
    b.flat(-hw, -hd, hw, hd, PLOT_Y, P.plaza);
    const wall = variant % 2 ? P.creams[variant % 3] : P.pastels[variant % 4];
    const awning = P.awnings[variant % P.awnings.length];
    const fs = clamp(D * 0.22, 1.2, 3.5); // forecourt
    const w = hw - 0.3, d = clamp(D - fs - 0.3, 4.5, 16), h = 8.5;
    b.setTransform(compose(tmpM, 0, PLOT_Y, hd - fs));
    b.box(-w, 0, -d, w, h, 0, wall);
    b.box(-w, h, -d, w, h + 0.9, 0.2, shade(wall, 0.92)); // parapet
    if (d > 4) b.gable(-w + 0.8, -d + 0.8, w - 0.8, -0.8, h + 0.9, Math.min(2.2, d * 0.2), P.slate[0], true, wall);
    b.quad([-w + 0.8, 0.3, 0.1], [w - 0.8, 0.3, 0.1], [w - 0.8, 3.4, 0.1], [-w + 0.8, 3.4, 0.1], P.glass);
    b.box(-w, 3.5, 0, w, 4.4, 0.25, l2 ? hex('#d8b45a') : awning); // sign band (gilded at Level 2)
    const stripes = Math.max(2, Math.round((2 * w) / 2.5));
    const reach = Math.min(l2 ? 3.4 : 2.4, fs - 0.2), drop = l2 ? 2.5 : 2.8;
    for (let i = 0; i < stripes; i++) {
      const x0 = -w + (i * 2 * w) / stripes, x1 = -w + ((i + 1) * 2 * w) / stripes;
      const c = i % 2 ? awning : P.stucco;
      b.quad([x0, drop, reach], [x1, drop, reach], [x1, 3.5, 0.2], [x0, 3.5, 0.2], c);
      b.quad([x1, drop, reach], [x0, drop, reach], [x0, 3.5, 0.2], [x1, 3.5, 0.2], shade(c, 0.8));
      if (l2) b.box(x0, drop - 0.5, reach - 0.1, x1, drop, reach, i % 2 ? P.stucco : awning);
    }
    const wins = Math.max(1, Math.round((2 * w) / 4.5));
    for (let i = 0; i < wins; i++) {
      const cx = -w + ((i + 0.5) * 2 * w) / wins;
      b.quad([cx - 0.8, 5.3, 0.1], [cx + 0.8, 5.3, 0.1], [cx + 0.8, 7.6, 0.1], [cx - 0.8, 7.6, 0.1], P.window);
      if (l2) {
        b.box(cx - 1, 4.9, 0.1, cx + 1, 5.3, 0.6, P.bench);
        b.box(cx - 0.95, 5.3, 0.15, cx + 0.95, 5.6, 0.55, i % 2 ? FLOWER_A : FLOWER_C);
      }
    }
    b.setTransform(null);
    if (fs >= 1.8 && W >= 9) for (const x of [-hw + 1.2, hw - 1.2]) {
      b.box(x - 0.8, PLOT_Y, hd - 1.3, x + 0.8, PLOT_Y + 0.7, hd - 0.2, P.bench);
      b.blob(x, PLOT_Y + 1.4, hd - 0.75, 0.75, 0.8, P.greens[1]);
    }
    if (l2 && fs >= 2.4) for (let i = 0; i < Math.max(1, Math.floor((W - 4) / 5)); i++) {
      const x = -hw + 3 + i * 5;
      if (x > hw - 2) break;
      b.cylinder(x, hd - fs / 2, PLOT_Y, PLOT_Y + 2.8, 0.1, 4, P.bench, false);
      b.blob(x, PLOT_Y + 2.9, hd - fs / 2, Math.min(1.6, fs / 2 - 0.1), 0.4, i % 2 ? P.stucco : awning, 0.26);
    }
  } else {
    // Park: lawn, gravel paths, hedges, trees, benches and (when roomy) a fountain
    b.flat(-hw, -hd, hw, hd, PLOT_Y, P.lawn);
    const pw = clamp(Math.min(W, D) * 0.12, 1.2, 1.8);
    b.flat(-pw, -hd, pw, hd, PLOT_Y + 0.03, P.gravel);
    if (W >= 12) b.flat(-hw, -pw, hw, pw, PLOT_Y + 0.03, P.gravel);
    const hy = PLOT_Y, t = 0.9;
    // hedge border with an entrance gap on the street side and the paths' ends
    for (const [x0, x1] of [[-hw, -pw - 0.6], [pw + 0.6, hw]] as const) {
      b.box(x0, hy, hd - t, x1, hy + 1.0, hd, P.hedge);
      b.box(x0, hy, -hd, x1, hy + 1.0, -hd + t, P.hedge);
    }
    for (const x of [-hw, hw - t]) for (const [z0, z1] of (W >= 12 ? [[-hd + t, -pw - 0.6], [pw + 0.6, hd - t]] : [[-hd + t, hd - t]]) as [number, number][]) b.box(x, hy, z0, x + t, hy + 1.0, z1, P.hedge);
    const big = Math.min(W, D) >= 14;
    if (big) fountain(b, 0, 0, PLOT_Y + 0.03, Math.min(3.2, Math.min(W, D) * 0.14));
    // trees in the four lawn quadrants, sized to stay inside the hedge
    const qx = (hw + pw) / 2, qz = (hd + pw) / 2;
    const room = Math.min(hw - pw - 1.2, hd - pw - 1.2);
    const s = clamp(room / 3.4, 0.35, 0.95);
    const spots: [number, number][] = W >= 12 ? [[-qx, -qz], [qx, -qz], [-qx, qz], [qx, qz]] : [[-qx, -hd / 2], [qx, -hd / 2], [-qx, hd / 2], [qx, hd / 2]];
    // each canopy (radius ≈ 3.15 × scale) is shrunk if needed so it never overhangs the site edge
    spots.forEach(([x, z], i) => tree(b, x, z, PLOT_Y, Math.max(0.3, Math.min(s, (Math.min(hw - Math.abs(x), hd - Math.abs(z)) - 0.15) / 3.15)), P.greens[(i + variant) % 4], r() * 3));
    if (D >= 10) { bench(b, -pw - 1.4, Math.min(2.6, hd - 2), PLOT_Y, false); bench(b, pw + 1.4, -Math.min(2.6, hd - 2), PLOT_Y, false); }
    if (l2) {
      const beds: [number, number, RGB][] = [[-qx, 0, FLOWER_A], [qx, 0, FLOWER_B], [0, -qz, FLOWER_C], [0, qz, FLOWER_A]];
      for (const [x, z, c] of beds) {
        const bx = Math.min(1.4, Math.abs(qx) - 1), bz = 0.5;
        if (W >= 12 || x !== 0) b.box(x - bx, PLOT_Y, z - bz, x + bx, PLOT_Y + 0.45, z + bz, c);
      }
      for (const [x, z] of [[-pw - 0.4, -pw - 0.4], [pw + 0.4, pw + 0.4], [-pw - 0.4, pw + 0.4], [pw + 0.4, -pw - 0.4]]) {
        b.cylinder(x, z, PLOT_Y, PLOT_Y + 3.0, 0.1, 4, hex('#2b2b2e'), false);
        b.blob(x, PLOT_Y + 3.2, z, 0.32, 0.32, hex('#fff1c2'));
      }
      if (D >= 10) bench(b, 0, -hd + 1.6, PLOT_Y, true);
    }
  }
  return b;
}

/** Site boundary as a flat ring in map space (rectangle fallback for plots without one). */
export function siteBoundary(p: PlotDef): number[] {
  if (p.boundary) return p.boundary;
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  return ([[-p.w / 2, -p.d / 2], [p.w / 2, -p.d / 2], [p.w / 2, p.d / 2], [-p.w / 2, p.d / 2]] as [number, number][]).flatMap(([x, z]) => [p.x + x * c + z * s, p.z - x * s + z * c]);
}

function siteTris(p: PlotDef): number[] {
  if (p.boundaryTris) return p.boundaryTris;
  const r = siteBoundary(p);
  return [r[0], r[1], r[2], r[3], r[4], r[5], r[0], r[1], r[4], r[5], r[6], r[7]];
}

function flatTris(b: MeshBuilder, tris: number[], y: number, col: RGB): void {
  for (let i = 0; i + 5 < tris.length; i += 6) {
    const a = [tris[i], y, tris[i + 1]], c1 = [tris[i + 2], y, tris[i + 3]], c2 = [tris[i + 4], y, tris[i + 5]];
    const up = (c1[2] - a[2]) * (c2[0] - a[0]) - (c1[0] - a[0]) * (c2[2] - a[2]);
    if (up >= 0) b.tri(a, c1, c2, col);
    else b.tri(a, c2, c1, col);
  }
}

function pointInRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Thin wall along a closed ring (both faces), e.g. site hoarding or highlight outlines. */
export function ringWall(b: MeshBuilder, ring: number[], y0: number, y1: number, col: RGB, inset = 0): void {
  const n = ring.length / 2;
  let cx = 0, cz = 0;
  for (let i = 0; i < n; i++) { cx += ring[i * 2] / n; cz += ring[i * 2 + 1] / n; }
  const pt = (i: number): [number, number] => {
    const x = ring[(i % n) * 2], z = ring[(i % n) * 2 + 1];
    const l = Math.hypot(cx - x, cz - z) || 1;
    return [x + ((cx - x) / l) * inset, z + ((cz - z) / l) * inset];
  };
  for (let i = 0; i < n; i++) {
    const a = pt(i), c = pt(i + 1);
    b.quad([a[0], y0, a[1]], [c[0], y0, c[1]], [c[0], y1, c[1]], [a[0], y1, a[1]], col);
    b.quad([c[0], y0, c[1]], [a[0], y0, a[1]], [a[0], y1, a[1]], [c[0], y1, c[1]], col);
  }
}

/** Vacant development site: neat, lightly speckled ground, a low boundary hoarding and a small build marker. */
function vacantSite(b: MeshBuilder, p: PlotDef): void {
  const ring = siteBoundary(p);
  flatTris(b, siteTris(p), PLOT_Y - 0.02, hex('#efd9a2'));
  // light texture: deterministic gravel speckles inside the boundary
  const r = rng(p.number * 97 + 5);
  const xs = ring.filter((_, i) => i % 2 === 0), zs = ring.filter((_, i) => i % 2 === 1);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  const n = Math.min(40, Math.floor((x1 - x0) * (z1 - z0) / 12));
  for (let k = 0; k < n * 3 && k < 160; k++) {
    const x = x0 + r() * (x1 - x0), z = z0 + r() * (z1 - z0);
    if (!pointInRing(x, z, ring)) continue;
    const s2 = 0.25 + r() * 0.35;
    b.flat(x - s2, z - s2, x + s2, z + s2, PLOT_Y, r() < 0.5 ? hex('#e2c98f') : hex('#f6e6bd'));
  }
  ringWall(b, ring, PLOT_Y - 0.02, PLOT_Y + 0.55, hex('#fbf6ea'), 0.15); // subtle hoarding / kerb
  // small build marker: post with a gold "+" board at the street-front corner of the site
  b.setTransform(plotMatrix(p, tmpM));
  const mx = -p.w / 2 + 1.2, mz = p.d / 2 - 1.2;
  b.box(mx - 0.12, PLOT_Y, mz - 0.12, mx + 0.12, PLOT_Y + 3.4, mz + 0.12, P.post);
  b.box(mx - 1.1, PLOT_Y + 2.6, mz - 0.1, mx + 1.1, PLOT_Y + 4.6, mz + 0.1, hex('#2f5a45'));
  b.box(mx - 0.75, PLOT_Y + 3.5, mz + 0.1, mx + 0.75, PLOT_Y + 3.7, mz + 0.16, hex('#f2c94c'));
  b.box(mx - 0.1, PLOT_Y + 2.85, mz + 0.1, mx + 0.1, PLOT_Y + 4.35, mz + 0.16, hex('#f2c94c'));
  b.setTransform(null);
}

/** Small floating indicator above a building; colour shows happiness / shop activity. */
function badge(b: MeshBuilder, x: number, z: number, col: RGB, level: Level): void {
  b.blob(x, 27, z, 2.0, 2.4, col, 0.3);
  if (level === 2) b.blob(x, 31.2, z, 1.1, 1.3, hex('#e8b84a'), 0); // gold cap marks Level 2
}

function happinessColor(h: number): RGB {
  if (h >= 80) return hex('#4caf6a');
  if (h >= 70) return hex('#9ccc5a');
  if (h >= 60) return hex('#f2c94c');
  return hex('#f2994a');
}

const buildingCache = new Map<string, MeshBuilder>();
/** Same mesh for the hover preview and the final building (keyed by type, look, level and site size). */
export function cachedBuilding(type: BuildingType, variant: number, level: Level = 1, W = 24, D = 24): MeshBuilder {
  const key = `${type}:${variant % 5}:${level}:${W.toFixed(1)}:${D.toFixed(1)}`;
  let m = buildingCache.get(key);
  if (!m) {
    m = buildingMesh(type, variant % 5, level, W, D);
    buildingCache.set(key, m);
  }
  return m;
}

export function plotBuilding(p: PlotDef, type: BuildingType, level: Level = 1): MeshBuilder {
  return cachedBuilding(type, p.number, level, p.w, p.d);
}

/** Site transform (map space): centre of the site rectangle, local +z toward the street. No stretching. */
export function plotMatrix(p: PlotDef, out: Mat4 = mat4()): Mat4 {
  return compose(out, p.x, 0, p.z, p.angle);
}

/** Dynamic layer: vacant sites, placed buildings and status badges. Rebuilt only when the state changes. */
export function buildPlotsLayer(plots: readonly PlotDef[], buildings: Record<string, Building>, stats: Stats): MeshBuilder {
  const b = new MeshBuilder();
  const m = mat4();
  for (const p of plots) {
    const bld = buildings[p.id];
    if (!bld) {
      vacantSite(b, p);
      continue;
    }
    flatTris(b, siteTris(p), PLOT_Y - 0.02, P.pavement);
    b.setTransform(plotMatrix(p, m));
    b.append(plotBuilding(p, bld.type, bld.level));
    b.setTransform(null);
    if (bld.type === 'townhouse') badge(b, p.x, p.z, happinessColor(stats.homeHappiness[p.id] ?? 50), bld.level);
    else if (bld.type === 'shop') badge(b, p.x, p.z, stats.activeShops[p.id] ? hex('#e8b84a') : hex('#a8a29a'), bld.level);
    else if (bld.level === 2) badge(b, p.x, p.z, hex('#6fbf73'), 2);
  }
  return b;
}

/** Outline that follows a site's boundary (drawn tinted & unlit for hover / highlight). */
export function siteOutline(p: PlotDef, height = 1.4): MeshBuilder {
  const b = new MeshBuilder();
  const ring = siteBoundary(p);
  ringWall(b, ring, PLOT_Y, PLOT_Y + height, P.post, -0.4);
  ringWall(b, ring, PLOT_Y, PLOT_Y + height, P.post, 1.2);
  // cap so the outline reads from above
  const n = ring.length / 2;
  for (let i = 0; i < n; i++) {
    const a = [ring[i * 2], ring[i * 2 + 1]], c = [ring[((i + 1) % n) * 2], ring[((i + 1) % n) * 2 + 1]];
    const l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
    const nx = (-(c[1] - a[1]) / l) * 0.8, nz = ((c[0] - a[0]) / l) * 0.8;
    const y = PLOT_Y + height;
    b.quad([a[0] - nx, y, a[1] - nz], [c[0] - nx, y, c[1] - nz], [c[0] + nx, y, c[1] + nz], [a[0] + nx, y, a[1] + nz], P.post);
    b.quad([a[0] - nx, y, a[1] - nz], [a[0] + nx, y, a[1] + nz], [c[0] + nx, y, c[1] + nz], [c[0] - nx, y, c[1] - nz], P.post);
  }
  return b;
}

/** Tall translucent beacon above a free site ("Show buildable sites"), visible across the table. */
export function siteBeacon(): MeshBuilder {
  const b = new MeshBuilder();
  b.cylinder(0, 0, PLOT_Y, 34, 1.6, 8, hex('#3d8f6a'), false); // green column: contrasts with cream paving and brick
  b.blob(0, 39, 0, 4.8, 5.2, hex('#f2b632'), 0.4); // gold diamond marker, readable from across the table
  return b;
}

export function radiusRing(radius: number, width = 1.6, segments = 64): MeshBuilder {
  const b = new MeshBuilder();
  const y = PLOT_Y + 1.2;
  const c = P.post;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2, a1 = ((i + 1) / segments) * Math.PI * 2;
    const r0 = radius - width / 2, r1 = radius + width / 2;
    const p = (a: number, r: number) => [Math.cos(a) * r, y, Math.sin(a) * r];
    b.quad(p(a0, r1), p(a0, r0), p(a1, r0), p(a1, r1), c);
  }
  return b;
}

// ---------------------------------------------------------------------------------------------
// Labels: all map labels plus plot numbers in one atlas (one texture).

export interface LabelData {
  canvas: HTMLCanvasElement;
  /** Always-visible labels (main streets, landmarks, plinth text). */
  major: Float32Array;
  /** Minor street labels, shown only when the view is close enough. */
  minor: Float32Array;
  /** Plot-number quads keyed by plot id; only vacant plots are drawn. */
  plotQuads: Map<string, number[]>;
}

export function buildLabelData(defs: MapLabelDef[], plots: readonly PlotDef[], plotLabelSize = 9): LabelData {
  const styles: LabelStyle[] = defs.map((d) => ({ text: d.text, color: d.color, outline: d.outline, bold: d.bold }));
  for (const p of plots) styles.push({ text: String(p.number), color: '#2f5a45', outline: 'rgba(255,255,255,0.95)', bold: true });
  const { canvas, entries } = buildAtlas(styles);
  const major: number[] = [], minor: number[] = [];
  defs.forEach((d, i) => pushFlatLabel(d.tier === 'minor' ? minor : major, entries[i], d.x, d.y ?? PAVE_Y + 0.4, d.z, d.size * 1.35, d.angle));
  const plotQuads = new Map<string, number[]>();
  plots.forEach((p, i) => {
    const q: number[] = [];
    pushFlatLabel(q, entries[defs.length + i], p.x, PLOT_Y + 0.05, p.z, plotLabelSize * 1.35, 0);
    plotQuads.set(p.id, q);
  });
  return { canvas, major: new Float32Array(major), minor: new Float32Array(minor), plotQuads };
}

export function vacantPlotLabels(labels: LabelData, plots: readonly PlotDef[], buildings: Record<string, Building>): Float32Array {
  const out: number[] = [];
  for (const p of plots) if (!buildings[p.id]) out.push(...labels.plotQuads.get(p.id)!);
  return new Float32Array(out);
}
