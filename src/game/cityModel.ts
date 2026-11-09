// Procedural, original geometry for the Chelsea-inspired model. Everything is built in
// map metres; a single model matrix scales the city down onto the tabletop.
import {
  BLOCKS, DUKE_OF_YORK_SQUARE, GALLERY, LABELS, MAP_HALF, PLOTS, ROADS, ROAD_LABEL_COLOR, SLOANE_SQUARE,
  facingAngle, reservedRects, type Facing, type PlotDef, type Rect,
} from '../map/chelsea';
import type { BuildingType, Level } from '../sim/rules';
import type { Building, Stats } from '../sim/simulation';
import { MeshBuilder, hex, rng, shade, type RGB } from '../engine/geometry';
import { compose, mat4 } from '../engine/math';
import { buildAtlas, pushFlatLabel, type LabelStyle } from '../engine/text';

export const PAVE_Y = 0.3;
export const PLOT_Y = 0.42;
const SETBACK = 3.5;

const P = {
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

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const inside = (a: Rect, b: Rect) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1;
const tmpM = mat4();

// ---------------------------------------------------------------------------------------------
// Reusable pieces (local frame: front faces +z, front wall at z = 0, building extends to -depth)

function terraceHouse(b: MeshBuilder, x0: number, x1: number, depth: number, h: number, wall: RGB, roof: RGB, door: RGB, brick: boolean, rich = false): void {
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

function chimney(b: MeshBuilder, x: number, z: number, h: number): void {
  b.box(x - 0.6, h + 1.2, z - 1.2, x + 0.6, h + 4.6, z + 1.2, P.chimney);
  b.box(x - 0.25, h + 4.6, z - 0.9, x + 0.25, h + 5.3, z - 0.4, P.pot);
  b.box(x - 0.25, h + 4.6, z + 0.4, x + 0.25, h + 5.3, z + 0.9, P.pot);
}

export function tree(b: MeshBuilder, x: number, z: number, y: number, s: number, col: RGB, twist = 0): void {
  b.cylinder(x, z, y, y + 3.2 * s, 0.35 * s, 4, P.trunk, false);
  b.blob(x, y + 5.4 * s, z, 3.1 * s, 3.0 * s, col, twist);
  b.blob(x + 0.6 * s, y + 7.4 * s, z - 0.4 * s, 2.1 * s, 2.2 * s, shade(col, 1.06), twist + 0.5);
}

function bench(b: MeshBuilder, x: number, z: number, y: number, alongX: boolean): void {
  if (alongX) b.box(x - 1.2, y, z - 0.35, x + 1.2, y + 0.6, z + 0.35, P.bench);
  else b.box(x - 0.35, y, z - 1.2, x + 0.35, y + 0.6, z + 1.2, P.bench);
}

function fountain(b: MeshBuilder, x: number, z: number, y: number, r: number): void {
  b.cylinder(x, z, y, y + 0.8, r, 12, P.stone);
  b.cylinder(x, z, y + 0.8, y + 0.85, r * 0.86, 12, P.water);
  b.cylinder(x, z, y + 0.8, y + 2.6, r * 0.18, 8, P.stone);
  b.cylinder(x, z, y + 2.6, y + 2.8, r * 0.38, 8, P.stone);
}

// ---------------------------------------------------------------------------------------------
// Plot buildings (local frame centred on the plot, front toward +z)

const FLOWER_A = hex('#e07a8f'), FLOWER_B = hex('#f2c14e'), FLOWER_C = hex('#a77bd6');

export function buildingMesh(type: BuildingType, variant = 0, level: Level = 1): MeshBuilder {
  const l2 = level === 2;
  const b = new MeshBuilder();
  const r = rng(1000 + variant * 31 + (type === 'shop' ? 7 : type === 'park' ? 13 : 0));
  const half = 12;
  if (type === 'townhouse') {
    b.flat(-half, -half, half, half, PLOT_Y, P.lawn);
    const brick = P.bricks[variant % P.bricks.length];
    const roof = P.slate[variant % P.slate.length];
    const h = 12.5 + (variant % 3) * 0.8 + (l2 ? 3.3 : 0); // Level 2 adds a storey
    const depth = 12;
    b.setTransform(compose(tmpM, 0, PLOT_Y, 9.5));
    const xs = [-11, -3.6, 3.6, 11];
    for (let i = 0; i < 3; i++) {
      const wall = i === 1 && variant % 2 ? P.creams[variant % 3] : brick;
      terraceHouse(b, xs[i], xs[i + 1], depth, h, wall, roof, P.doors[(variant + i) % P.doors.length], wall === brick, l2);
    }
    for (const cx of [-3.6, 3.6]) chimney(b, cx, -depth / 2, h);
    // front railings + steps
    b.box(-11, 0, 1.6, 11, 1.0, 1.8, hex('#2b2b2e'));
    b.setTransform(null);
    if (l2) {
      // front-garden planters and clipped bay trees
      for (const x of [-9.5, -1.8, 5.4]) {
        b.box(x - 0.8, PLOT_Y, 11.4, x + 0.8, PLOT_Y + 0.7, 12, P.stucco);
        b.blob(x, PLOT_Y + 1.6, 11.7, 0.75, 0.9, P.greens[3]);
      }
    }
    // back garden tree
    tree(b, -6 + r() * 12, -8.5, PLOT_Y, 0.7, P.greens[variant % 4], r());
  } else if (type === 'shop') {
    b.flat(-half, -half, half, half, PLOT_Y, P.plaza);
    const wall = variant % 2 ? P.creams[variant % 3] : P.pastels[variant % 4];
    const awning = P.awnings[variant % P.awnings.length];
    b.setTransform(compose(tmpM, 0, PLOT_Y, 6));
    const w = 10, d = 14, h = 9;
    b.box(-w, 0, -d, w, h, 0, wall);
    b.box(-w - 0.3, h, -d - 0.3, w + 0.3, h + 0.9, 0.3, shade(wall, 0.92)); // parapet
    b.gable(-w + 1, -d + 1, w - 1, -1, h + 0.9, 2.2, P.slate[0], true, wall);
    // shopfront glass and sign band
    b.quad([-w + 1, 0.3, 0.1], [w - 1, 0.3, 0.1], [w - 1, 3.4, 0.1], [-w + 1, 3.4, 0.1], P.glass);
    b.box(-w, 3.5, 0, w, 4.4, 0.3, l2 ? hex('#d8b45a') : awning); // gilded sign band at Level 2
    // striped awning, sloping down toward the street
    for (let i = 0; i < 8; i++) {
      const x0 = -w + (i * 2 * w) / 8, x1 = -w + ((i + 1) * 2 * w) / 8;
      const c = i % 2 ? awning : P.stucco;
      const reach = l2 ? 3.8 : 2.6, drop = l2 ? 2.5 : 2.8; // Level 2: deeper awning
      b.quad([x0, drop, reach], [x1, drop, reach], [x1, 3.5, 0.2], [x0, 3.5, 0.2], c);
      b.quad([x1, drop, reach], [x0, drop, reach], [x0, 3.5, 0.2], [x1, 3.5, 0.2], shade(c, 0.8));
      if (l2) b.box(x0, drop - 0.5, reach - 0.1, x1, drop, reach, i % 2 ? P.stucco : awning); // valance
    }
    // upper windows
    for (let i = 0; i < 4; i++) {
      const cx = -w + 2.5 + i * 5;
      b.quad([cx - 0.8, 5.3, 0.1], [cx + 0.8, 5.3, 0.1], [cx + 0.8, 7.6, 0.1], [cx - 0.8, 7.6, 0.1], P.window);
      if (l2) {
        b.box(cx - 1, 4.9, 0.1, cx + 1, 5.3, 0.6, P.bench);
        b.box(cx - 0.95, 5.3, 0.15, cx + 0.95, 5.6, 0.55, i % 2 ? FLOWER_A : FLOWER_C);
      }
    }
    b.setTransform(null);
    // planters + café tables on the forecourt
    for (const x of [-8, 8]) {
      b.box(x - 1, PLOT_Y, 9, x + 1, PLOT_Y + 0.8, 10.5, P.bench);
      b.blob(x, PLOT_Y + 1.6, 9.75, 1.0, 0.9, P.greens[1]);
    }
    for (const x of [-3, 3]) b.cylinder(x, 9.6, PLOT_Y, PLOT_Y + 1.0, 0.7, 6, P.stucco);
    if (l2) {
      // café umbrellas on the forecourt
      for (const x of [-5.5, 0, 5.5]) {
        b.cylinder(x, 10.6, PLOT_Y, PLOT_Y + 3.0, 0.12, 4, P.bench, false);
        b.blob(x, PLOT_Y + 3.1, 10.6, 1.9, 0.45, x === 0 ? P.stucco : awning, 0.26);
      }
    }
  } else {
    // Park: lawn, gravel paths, hedges, trees, fountain and benches
    b.flat(-half, -half, half, half, PLOT_Y, P.lawn);
    b.flat(-1.6, -half, 1.6, half, PLOT_Y + 0.03, P.gravel);
    b.flat(-half, -1.6, half, 1.6, PLOT_Y + 0.03, P.gravel);
    const hy = PLOT_Y;
    for (const [x0, z0, x1, z1] of [
      [-12, -12, -2.4, -11], [2.4, -12, 12, -11], [-12, 11, -2.4, 12], [2.4, 11, 12, 12],
      [-12, -11, -11, -2.4], [-12, 2.4, -11, 11], [11, -11, 12, -2.4], [11, 2.4, 12, 11],
    ]) b.box(x0, hy, z0, x1, hy + 1.1, z1, P.hedge);
    fountain(b, 0, 0, PLOT_Y + 0.03, 3.2);
    const spots = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
    spots.forEach(([x, z], i) => tree(b, x + (r() - 0.5) * 2, z + (r() - 0.5) * 2, PLOT_Y, 0.8 + r() * 0.25, P.greens[(i + variant) % 4], r() * 3));
    bench(b, -5, 2.6, PLOT_Y, true);
    bench(b, 5, -2.6, PLOT_Y, true);
    if (l2) {
      // Level 2: flower beds, extra benches and lamp posts
      const beds: [number, number, RGB][] = [[-6, -2.6, FLOWER_A], [6, 2.6, FLOWER_B], [-2.6, 6, FLOWER_C], [2.6, -6, FLOWER_A]];
      for (const [x, z, c] of beds) b.box(x - 1.6, PLOT_Y, z - 0.6, x + 1.6, PLOT_Y + 0.45, z + 0.6, c);
      bench(b, -2.6, -5, PLOT_Y, false);
      bench(b, 2.6, 5, PLOT_Y, false);
      for (const [x, z] of [[-2.2, -2.2], [2.2, 2.2], [-2.2, 2.2], [2.2, -2.2]]) {
        b.cylinder(x, z, PLOT_Y, PLOT_Y + 3.2, 0.1, 4, hex('#2b2b2e'), false);
        b.blob(x, PLOT_Y + 3.4, z, 0.35, 0.35, hex('#fff1c2'));
      }
    }
  }
  return b;
}

/** Vacant plot: gravel pad, dashed border and a small "for sale" signboard. */
function vacantPad(b: MeshBuilder, p: PlotDef): void {
  const h = p.size / 2;
  b.setTransform(compose(tmpM, p.x, 0, p.z, facingAngle(p.facing)));
  b.box(-h, PAVE_Y, -h, h, PLOT_Y - 0.02, h, P.gravel);
  const n = 6;
  const seg = (2 * h) / n;
  for (let i = 0; i < n; i++) {
    const a = -h + i * seg + seg * 0.15, c = a + seg * 0.7;
    b.box(a, PLOT_Y, -h, c, PLOT_Y + 0.25, -h + 0.6, P.post);
    b.box(a, PLOT_Y, h - 0.6, c, PLOT_Y + 0.25, h, P.post);
    b.box(-h, PLOT_Y, a, -h + 0.6, PLOT_Y + 0.25, c, P.post);
    b.box(h - 0.6, PLOT_Y, a, h, PLOT_Y + 0.25, c, P.post);
  }
  // sign at the front-left corner
  b.box(-h + 1.6, PLOT_Y, h - 2.2, -h + 2.0, PLOT_Y + 4.2, h - 1.8, P.post);
  b.box(-h + 0.6, PLOT_Y + 2.4, h - 2.1, -h + 4.6, PLOT_Y + 4.6, h - 1.9, P.sign);
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
export function cachedBuilding(type: BuildingType, variant: number, level: Level = 1): MeshBuilder {
  const key = `${type}:${variant % 5}:${level}`;
  let m = buildingCache.get(key);
  if (!m) {
    m = buildingMesh(type, variant % 5, level);
    buildingCache.set(key, m);
  }
  return m;
}

/** Plot transform (map space). */
export function plotMatrix(p: PlotDef, out = mat4()) {
  return compose(out, p.x, 0, p.z, facingAngle(p.facing));
}

/** Dynamic layer: vacant pads, placed buildings and status badges. Rebuilt only when the state changes. */
export function buildPlotsLayer(buildings: Record<string, Building>, stats: Stats): MeshBuilder {
  const b = new MeshBuilder();
  const m = mat4();
  for (const p of PLOTS) {
    const bld = buildings[p.id];
    if (!bld) {
      vacantPad(b, p);
      continue;
    }
    b.setTransform(compose(m, p.x, 0, p.z, facingAngle(p.facing)));
    b.box(-12, PAVE_Y, -12, 12, PLOT_Y - 0.02, 12, P.pavement);
    b.append(cachedBuilding(bld.type, p.number, bld.level));
    b.setTransform(null);
    if (bld.type === 'townhouse') badge(b, p.x, p.z, happinessColor(stats.homeHappiness[p.id] ?? 50), bld.level);
    else if (bld.type === 'shop') badge(b, p.x, p.z, stats.activeShops[p.id] ? hex('#e8b84a') : hex('#a8a29a'), bld.level);
    else if (bld.level === 2) badge(b, p.x, p.z, hex('#6fbf73'), 2);
  }
  return b;
}

/** Outline frame used for hover highlight (unit: plot size 24, drawn tinted & unlit). */
export function plotFrame(): MeshBuilder {
  const b = new MeshBuilder();
  const h = 13.2, t = 1.0, y0 = PLOT_Y, y1 = PLOT_Y + 0.9;
  b.box(-h, y0, -h, h, y1, -h + t, P.post);
  b.box(-h, y0, h - t, h, y1, h, P.post);
  b.box(-h, y0, -h + t, -h + t, y1, h - t, P.post);
  b.box(h - t, y0, -h + t, h, y1, h - t, P.post);
  return b;
}

/** Flat ring showing the 80 m effect radius of shops and parks. */
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
// Static scenery: plinth, roads, blocks, decorative terraces, landmarks, trees (one merged mesh)

export function buildStaticCity(): MeshBuilder {
  const b = new MeshBuilder();
  const r = rng(20251109);
  const H = MAP_HALF;
  // Plinth (wooden model base) with a front lip for the title
  b.box(-H - 14, -16, -H - 14, H + 14, -0.02, H + 34, P.plinth);
  b.flat(-H - 14, -H - 14, H + 14, H + 34, -0.01, P.plinthTop);
  // Road surface across the whole map
  b.box(-H, -2, -H, H, 0, H, P.road);
  // Centre dashes on King's Road (skip junctions)
  const kr = ROADS[0];
  const sideXs = ROADS.filter((rd) => rd.x0 === rd.x1).map((rd) => rd.x0);
  for (let x = -H + 4; x < H - 4; x += 12) {
    if (sideXs.some((sx) => Math.abs(sx - x - 3) < 10) || (x > SLOANE_SQUARE.x0 - 10)) continue;
    b.box(x, 0, kr.z0 - 0.35, x + 6, 0.06, kr.z0 + 0.35, P.roadDash);
  }
  // Zebra crossing near the square
  for (let i = 0; i < 6; i++) b.box(36 + i * 2.2, 0, -28, 37.2 + i * 2.2, 0.07, -12, P.roadDash);

  const reserved = reservedRects();
  const isReserved = (rc: Rect) => reserved.some((rs) => overlaps(rc, rs));

  for (const blk of BLOCKS) {
    b.box(blk.x0, 0, blk.z0, blk.x1, PAVE_Y, blk.z1, P.pavement);
    decorateBlock(b, blk, r, isReserved);
  }

  // Duke of York Square: paved plaza, plane trees, fountain, benches, lawn before the gallery
  const sq = DUKE_OF_YORK_SQUARE;
  b.flat(sq.x0, sq.z0, sq.x1, sq.z1, PAVE_Y + 0.02, P.plaza);
  for (let x = sq.x0 + 4; x < sq.x1; x += 8) b.flat(x, sq.z0 + 3, x + 4, sq.z1 - 3, PAVE_Y + 0.03, P.plazaDark);
  fountain(b, (sq.x0 + sq.x1) / 2, (sq.z0 + sq.z1) / 2 + 8, PAVE_Y, 5);
  for (let z = sq.z0 + 8; z < sq.z1 - 2; z += 11) {
    tree(b, sq.x0 + 5, z, PAVE_Y, 1.05, P.greens[0], r());
    tree(b, sq.x1 - 5, z, PAVE_Y, 1.05, P.greens[2], r());
  }
  bench(b, sq.x0 + 22, sq.z1 - 6, PAVE_Y, true);
  bench(b, sq.x1 - 22, sq.z1 - 6, PAVE_Y, true);
  b.flat(sq.x0, sq.z1, sq.x1, GALLERY.z0 - 2, PAVE_Y + 0.02, P.lawn);

  gallery(b);

  // Sloane Square (green square with trees and a fountain)
  const ss = SLOANE_SQUARE;
  b.flat(ss.x0, ss.z0, ss.x1, ss.z1, PAVE_Y + 0.02, P.plaza);
  b.flat(ss.x0 + 6, ss.z0 + 6, ss.x1 - 6, ss.z1 - 6, PAVE_Y + 0.04, P.lawnDark);
  b.flat(ss.x0 + 6, (ss.z0 + ss.z1) / 2 - 2.5, ss.x1 - 6, (ss.z0 + ss.z1) / 2 + 2.5, PAVE_Y + 0.06, P.plaza);
  fountain(b, (ss.x0 + ss.x1) / 2, (ss.z0 + ss.z1) / 2, PAVE_Y + 0.06, 5.5);
  for (let x = ss.x0 + 10; x < ss.x1 - 4; x += 12) {
    tree(b, x, ss.z0 + 10, PAVE_Y, 1.1, P.greens[(x | 0) % 4], r());
    tree(b, x, ss.z1 - 10, PAVE_Y, 1.1, P.greens[((x | 0) + 1) % 4], r());
  }

  // Street trees along King's Road pavements
  for (let x = -H + 8; x < H - 4; x += 16) {
    const north: Rect = { x0: x - 2, z0: -33, x1: x + 2, z1: -29 };
    const south: Rect = { x0: x - 2, z0: -11, x1: x + 2, z1: -7 };
    const onRoad = (rc: Rect) => !BLOCKS.some((bl) => inside(rc, bl));
    if (!onRoad(north) && !overlaps(north, SLOANE_SQUARE)) tree(b, x, -30.8, PAVE_Y, 0.85, P.greens[(x / 16) & 3], r());
    if (!onRoad(south) && !overlaps(south, DUKE_OF_YORK_SQUARE)) tree(b, x, -9.2, PAVE_Y, 0.85, P.greens[((x / 16) + 1) & 3], r());
  }
  return b;
}

function decorateBlock(b: MeshBuilder, blk: Rect, r: () => number, isReserved: (rc: Rect) => boolean): void {
  const m = mat4();
  const edges: { facing: Facing; len: number; start: number }[] = [
    { facing: 'N', start: blk.x0, len: blk.x1 - blk.x0 },
    { facing: 'S', start: blk.x0, len: blk.x1 - blk.x0 },
    { facing: 'W', start: blk.z0 + 16, len: blk.z1 - blk.z0 - 32 },
    { facing: 'E', start: blk.z0 + 16, len: blk.z1 - blk.z0 - 32 },
  ];
  for (const e of edges) {
    let t = 1.5;
    while (t < e.len - 6) {
      // Terrace run: shared colour, height and roof
      const count = 3 + Math.floor(r() * 4);
      const kind = r();
      const brick = kind < 0.58;
      const wall = brick ? P.bricks[Math.floor(r() * P.bricks.length)] : kind < 0.88 ? P.creams[Math.floor(r() * 3)] : P.pastels[Math.floor(r() * 4)];
      const h = 10 + Math.floor(r() * 3) * 2.2;
      const roof = P.slate[Math.floor(r() * 3)];
      const depth = 11 + r() * 2;
      const unitW = 6.6 + r() * 1.8;
      for (let i = 0; i < count && t + unitW < e.len - 1.5; i++) {
        const along = e.start + t + unitW / 2;
        let px: number, pz: number;
        if (e.facing === 'N') { px = along; pz = blk.z0 + SETBACK; }
        else if (e.facing === 'S') { px = along; pz = blk.z1 - SETBACK; }
        else if (e.facing === 'W') { px = blk.x0 + SETBACK; pz = along; }
        else { px = blk.x1 - SETBACK; pz = along; }
        // Footprint (axis aligned) to test against reserved areas
        const hw = unitW / 2;
        const fp: Rect =
          e.facing === 'N' ? { x0: px - hw, z0: pz, x1: px + hw, z1: pz + depth }
          : e.facing === 'S' ? { x0: px - hw, z0: pz - depth, x1: px + hw, z1: pz }
          : e.facing === 'W' ? { x0: px, z0: pz - hw, x1: px + depth, z1: pz + hw }
          : { x0: px - depth, z0: pz - hw, x1: px, z1: pz + hw };
        if (!isReserved(fp) && inside(fp, blk)) {
          b.setTransform(compose(m, px, PAVE_Y, pz, facingAngle(e.facing)));
          terraceHouse(b, -hw, hw, depth, h, wall, roof, P.doors[Math.floor(r() * 4)], brick);
          if (i % 2 === 0) chimney(b, -hw, -depth / 2, h);
          b.setTransform(null);
        }
        t += unitW;
      }
      t += r() < 0.25 ? 4 + r() * 5 : 0; // occasional mews gap
    }
  }
  // Back gardens / inner courtyards with trees
  const inset = SETBACK + 14;
  const g: Rect = { x0: blk.x0 + inset, z0: blk.z0 + inset, x1: blk.x1 - inset, z1: blk.z1 - inset };
  if (g.x1 - g.x0 > 6 && g.z1 - g.z0 > 6) {
    b.flat(g.x0, g.z0, g.x1, g.z1, PAVE_Y + 0.02, P.lawn);
    const n = Math.floor(((g.x1 - g.x0) * (g.z1 - g.z0)) / 700);
    for (let i = 0; i < n; i++) {
      const x = g.x0 + 4 + r() * (g.x1 - g.x0 - 8);
      const z = g.z0 + 4 + r() * (g.z1 - g.z0 - 8);
      if (isReserved({ x0: x - 3, z0: z - 3, x1: x + 3, z1: z + 3 })) continue;
      tree(b, x, z, PAVE_Y, 0.7 + r() * 0.4, P.greens[Math.floor(r() * 4)], r() * 3);
    }
  }
}

function gallery(b: MeshBuilder): void {
  const g = GALLERY;
  const cx = (g.x0 + g.x1) / 2;
  // Brick wings and a cream central block with a columned portico facing the square (north)
  b.box(g.x0, PAVE_Y, g.z0 + 6, g.x0 + 20, 13, g.z1, P.bricks[3]);
  b.box(g.x1 - 20, PAVE_Y, g.z0 + 6, g.x1, 13, g.z1, P.bricks[3]);
  b.box(g.x0 + 20, PAVE_Y, g.z0 + 2, g.x1 - 20, 17, g.z1, P.goldStone);
  b.box(g.x0 - 0.4, 13, g.z0 + 5.6, g.x1 + 0.4, 14, g.z1 + 0.4, P.stucco);
  b.gable(g.x0 + 20, g.z0 + 4, g.x1 - 20, g.z1 - 4, 17, 4, P.slate[0], true, P.goldStone);
  // Portico
  b.box(cx - 13, PAVE_Y, g.z0 - 5, cx + 13, 1.4, g.z0 + 2, P.stone);
  for (let i = 0; i < 6; i++) b.cylinder(cx - 11 + i * 4.4, g.z0 - 3.5, 1.4, 12.5, 0.75, 8, P.stucco);
  b.box(cx - 13, 12.5, g.z0 - 5, cx + 13, 14, g.z0 + 2, P.stucco);
  b.gable(cx - 13, g.z0 - 5, cx + 13, g.z0 + 2, 14, 4.5, P.slate[1], false, P.stucco); // pediment
  // Tall windows on the wings
  for (const x0 of [g.x0, g.x1 - 20]) {
    for (let i = 0; i < 4; i++) {
      const x = x0 + 3 + i * 4.6;
      for (const y of [2, 7.5]) b.quad([x, y, g.z0 + 5.9], [x + 2, y, g.z0 + 5.9], [x + 2, y + 3.4, g.z0 + 5.9], [x, y + 3.4, g.z0 + 5.9], P.window);
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Labels (street names, landmarks, plot numbers, layout note) in one atlas

export interface LabelData {
  canvas: HTMLCanvasElement;
  /** Street and landmark labels (never change). */
  staticData: Float32Array;
  /** Plot-number quads keyed by plot id; only vacant plots are drawn. */
  plotQuads: Map<string, number[]>;
}

export function buildLabels(): LabelData {
  const styles: LabelStyle[] = [];
  const placements: { x: number; z: number; y: number; size: number; angle: number }[] = [];
  for (const rd of ROADS) {
    const t = rd.labelAt ?? 0.5;
    const vertical = rd.x0 === rd.x1;
    styles.push({ text: rd.name, color: ROAD_LABEL_COLOR, outline: 'rgba(60,62,70,0.85)' });
    placements.push({
      x: rd.x0 + (rd.x1 - rd.x0) * t,
      z: rd.z0 + (rd.z1 - rd.z0) * t,
      y: 0.12,
      size: Math.min(rd.width * 0.8, 10),
      angle: vertical ? Math.PI / 2 : 0,
    });
  }
  for (const l of LABELS) {
    const onPlinth = l.z > MAP_HALF;
    styles.push({ text: l.text, color: l.color, outline: onPlinth ? 'rgba(70,45,30,0.9)' : 'rgba(255,255,255,0.85)', bold: true });
    placements.push({ x: l.x, z: l.z, y: onPlinth ? 0.05 : PAVE_Y + 0.4, size: l.size, angle: l.angle });
  }
  for (const p of PLOTS) {
    styles.push({ text: String(p.number), color: '#2f5a45', outline: 'rgba(255,255,255,0.95)', bold: true });
    placements.push({ x: p.x, z: p.z, y: PLOT_Y + 0.05, size: 9, angle: 0 });
  }
  const { canvas, entries } = buildAtlas(styles);
  const out: number[] = [];
  const plotQuads = new Map<string, number[]>();
  const firstPlot = ROADS.length + LABELS.length;
  entries.forEach((e, i) => {
    const pl = placements[i];
    if (i < firstPlot) {
      pushFlatLabel(out, e, pl.x, pl.y, pl.z, pl.size * 1.35, pl.angle);
    } else {
      const q: number[] = [];
      pushFlatLabel(q, e, pl.x, pl.y, pl.z, pl.size * 1.35, pl.angle);
      plotQuads.set(PLOTS[i - firstPlot].id, q);
    }
  });
  return { canvas, staticData: new Float32Array(out), plotQuads };
}

export function vacantPlotLabels(labels: LabelData, buildings: Record<string, Building>): Float32Array {
  const out: number[] = [];
  for (const p of PLOTS) if (!buildings[p.id]) out.push(...labels.plotQuads.get(p.id)!);
  return new Float32Array(out);
}
