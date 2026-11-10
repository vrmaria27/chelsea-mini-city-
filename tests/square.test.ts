// Sloane Square central space: geography, protection and asset sanity checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSM } from '../src/map/osmMap';
import { SQUARE_Y, buildSquareNature, distToRing, pointInRing, squareTrees, type SquareData } from '../src/map/landmarks/sloaneSquare';
import { planeSkeleton } from '../src/map/landmarks/planeTree';

const sq = OSM.square as SquareData;
const ring: [number, number][] = [];
for (let i = 0; i < sq.ring.length; i += 2) ring.push([sq.ring[i], sq.ring[i + 1]]);
const segDist = (p: [number, number], a: number[], b: number[]) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
const roadClearance = (x: number, z: number) => Math.min(...OSM.roads.filter((r) => r.cls !== 'path' && r.cls !== 'pedestrian').flatMap((r) => { const o: number[] = []; for (let i = 0; i + 3 < r.pts.length; i += 2) o.push(segDist([x, z], [r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]) - r.w / 2); return o; }));

test('the square outline comes from the OSM kerb and has the real size and orientation', () => {
  assert.ok(sq, 'square data present');
  assert.ok(sq.area > 1900 && sq.area < 2700, `area ${sq.area} m²`);
  const xs = ring.map((p) => p[0]), zs = ring.map((p) => p[1]);
  const ca = Math.cos(sq.axis), sa = Math.sin(sq.axis);
  const u = ring.map((p) => p[0] * ca + p[1] * sa), v = ring.map((p) => -p[0] * sa + p[1] * ca);
  const L = Math.max(...u) - Math.min(...u), W = Math.max(...v) - Math.min(...v);
  assert.ok(L > 75 && L < 90 && W > 25 && W < 36, `long ${L.toFixed(1)} × ${W.toFixed(1)} m`);
  assert.ok(Math.abs(sq.axis + 0.18) < 0.1, `axis ${sq.axis}`);
  assert.ok(Math.min(...xs) > 130 && Math.max(...xs) < 230 && Math.min(...zs) > -180 && Math.max(...zs) < -120);
});

test('the fountain, memorial, drinking fountain, benches, lamps and trees are inside the square', () => {
  assert.ok(pointInRing(sq.fountain.x, sq.fountain.z, ring));
  assert.ok(distToRing(sq.fountain.x, sq.fountain.z, ring) > 4.5, 'pool clear of the kerb');
  for (const f of [sq.memorial!, sq.drinkingFountain!]) assert.ok(pointInRing(f.x, f.z, ring) && distToRing(f.x, f.z, ring) > 0.8);
  for (const t of sq.trees) assert.ok(pointInRing(t.x, t.z, ring) && distToRing(t.x, t.z, ring) > 0.6, `tree ${t.osm}`);
  for (const b of [...sq.benches, ...sq.lamps]) assert.ok(pointInRing(b.x, b.z, ring), b.osm);
  assert.equal(sq.trees.length, 14, 'sourced OSM trees');
});

test('nothing in the square sits on an estimated carriageway', () => {
  const pts = [sq.fountain, sq.memorial!, sq.drinkingFountain!, ...sq.trees, ...sq.benches, ...sq.lamps];
  for (const p of pts) assert.ok(roadClearance(p.x, p.z) > 0.5, `${(p as { osm?: string }).osm ?? 'feature'} clearance ${roadClearance(p.x, p.z).toFixed(2)} m`);
  // the kerb line itself is OSM's; report how far estimated road widths reach past it
  const intrusion = Math.max(0, ...ring.map((p) => -roadClearance(p[0], p[1])));
  console.log(`  estimated road width reaches up to ${intrusion.toFixed(2)} m past the OSM kerb`);
  assert.ok(intrusion < 2.5);
});

test('the square stays open: no building footprint reaches into it', () => {
  for (const b of OSM.buildings) {
    const r = b.rings[0];
    for (let i = 0; i < r.length; i += 2) assert.ok(!pointInRing(r[i], r[i + 1], ring) || distToRing(r[i], r[i + 1], ring) < 0.5, `${b.id} enters the square`);
  }
});

test('trees are visibly varied, deterministic and correctly proportioned', () => {
  const trees = squareTrees(sq);
  const heights = trees.map((t) => t.spec.height);
  assert.ok(Math.max(...heights) - Math.min(...heights) > 2, 'height variation');
  assert.ok(new Set(trees.map((t) => t.yaw.toFixed(2))).size === trees.length, 'each tree rotated differently');
  assert.ok(new Set(trees.map((t) => t.phase.toFixed(2))).size === trees.length, 'no two trees sway in step');
  for (const t of trees) {
    assert.ok(t.spec.height >= 18 && t.spec.height <= 24 && t.spec.spread >= 11 && t.spec.spread <= 16);
    const sk = planeSkeleton(t.spec);
    const top = Math.max(...sk.tips.map((q) => q.p[1]));
    assert.ok(top > t.spec.height * 0.85 && top < t.spec.height * 1.12, `crown top ${top.toFixed(1)} vs ${t.spec.height.toFixed(1)}`);
    assert.equal(sk.segments[0].depth, 0);
  }
  assert.deepEqual(squareTrees(sq), squareTrees(sq));
  const a = buildSquareNature(sq), b = buildSquareNature(sq);
  assert.deepEqual(a.stats, b.stats);
  assert.equal(a.cards.length, b.cards.length);
});

test('trunks never sway; only branch tips and leaves carry sway weight', () => {
  const n = buildSquareNature(sq);
  // vertex layout: 13 floats, sway weight at offset 11; trunk vertices are near the ground
  for (let i = 0; i < n.branches.length; i += 13) {
    const y = n.branches[i + 1];
    if (y < SQUARE_Y + 3) assert.equal(n.branches[i + 11], 0, `trunk vertex at y=${y.toFixed(2)} sways`);
  }
});

test('the nature layers stay within a standalone-VR budget', () => {
  const s = buildSquareNature(sq).stats;
  const full = s.branchTris + s.coreTris + s.cardTris + s.waterTris;
  console.log(`  square nature: ${JSON.stringify(s)} → ${full} tris (full), ${s.lowTris} tris (low detail)`);
  assert.ok(full < 80000, `${full} triangles`);
  assert.ok(s.lowTris < full * 0.6, 'low detail is substantially cheaper');
});
