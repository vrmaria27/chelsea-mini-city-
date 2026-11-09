// The legacy (Milestone 1–2) Chelsea-inspired map: approximate, hand-authored layout.
// Only used when a returning player chooses to keep playing on it.
import {
  BLOCKS, DUKE_OF_YORK_SQUARE, GALLERY, LABELS, LAYOUT_NOTE, MAP_HALF, PLOTS, ROADS, ROAD_LABEL_COLOR, SLOANE_SQUARE,
  facingAngle, reservedRects, type Facing, type Rect,
} from './chelsea';
import type { GameMap, LifePath, MapLabelDef } from './types';
import { MeshBuilder, rng } from '../engine/geometry';
import { compose, mat4 } from '../engine/math';
import { P, PAVE_Y, SETBACK, bench, chimney, fountain, terraceHouse, tree } from '../game/cityModel';

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
const inside = (a: Rect, b: Rect) => a.x0 >= b.x0 && a.x1 <= b.x1 && a.z0 >= b.z0 && a.z1 <= b.z1;

// ---------------------------------------------------------------------------------------------
// Static scenery: plinth, roads, blocks, decorative terraces, landmarks, trees (one merged mesh)

function buildStaticCity(): MeshBuilder {
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


function legacyLabels(): MapLabelDef[] {
  const out: MapLabelDef[] = [];
  for (const rd of ROADS) {
    const t = rd.labelAt ?? 0.5;
    out.push({
      text: rd.name, x: rd.x0 + (rd.x1 - rd.x0) * t, z: rd.z0 + (rd.z1 - rd.z0) * t, y: 0.12,
      angle: rd.x0 === rd.x1 ? Math.PI / 2 : 0, size: Math.min(rd.width * 0.8, 10),
      color: ROAD_LABEL_COLOR, outline: 'rgba(60,62,70,0.85)', tier: 'major',
    });
  }
  for (const l of LABELS) {
    const onPlinth = l.z > MAP_HALF;
    out.push({
      text: l.text, x: l.x, z: l.z, y: onPlinth ? 0.05 : PAVE_Y + 0.4, angle: l.angle, size: l.size, color: l.color,
      outline: onPlinth ? 'rgba(70,45,30,0.9)' : 'rgba(255,255,255,0.85)', bold: true, tier: onPlinth ? 'plinth' : 'major',
    });
  }
  return out;
}

/** Pavement loops just inside each block and the old fixed road lanes. */
const loop = (b: Rect, inset: number): number[] => {
  const r = { x0: b.x0 + inset, z0: b.z0 + inset, x1: b.x1 - inset, z1: b.z1 - inset };
  return [r.x0, r.z0, r.x1, r.z0, r.x1, r.z1, r.x0, r.z1, r.x0, r.z0];
};
const walkPaths: LifePath[] = BLOCKS.map((b) => ({ pts: loop(b, 2.4), y: PAVE_Y }));
const drivePaths: LifePath[] = [
  { pts: [-200, -20, 200, -20], y: 0 },
  { pts: [170, -11, 170, 200], y: 0 },
  { pts: [30, -11, 30, 200], y: 0 },
];

export const legacyMap: GameMap = {
  id: 'legacy',
  version: 1,
  title: 'Chelsea Mini City (legacy approximate layout)',
  half: MAP_HALF,
  baseScale: 0.0025,
  plots: PLOTS,
  buildStatic: buildStaticCity,
  labels: legacyLabels,
  walkPaths,
  drivePaths,
  attribution: null,
  notes: LAYOUT_NOTE + '. Hand-authored for Milestones 1–2; not geographically accurate.',
};

