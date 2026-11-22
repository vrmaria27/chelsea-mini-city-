// Sloane Square perimeter reconstruction: integration, coverage and safety checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSM } from '../src/map/osmMap';
import { MeshBuilder } from '../src/engine/geometry';
import { SQUARE_MODELS, buildSquareBuildings } from '../src/map/landmarks/squareBuildings';
import { distToRing, pointInRing } from '../src/map/landmarks/sloaneSquare';

type B = (typeof OSM.buildings)[number];
const square = OSM.square!;
const sqRing: [number, number][] = [];
for (let i = 0; i < square.ring.length; i += 2) sqRing.push([square.ring[i], square.ring[i + 1]]);
const ringPts = (r: number[]) => { const o: [number, number][] = []; for (let i = 0; i < r.length; i += 2) o.push([r[i], r[i + 1]]); return o; };
const custom = OSM.buildings.filter((b) => b.custom?.startsWith('square:'));

function buildOne(bl: B) {
  const b = new MeshBuilder();
  buildSquareBuildings(b, [bl as never], (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs, square.ring, OSM.buildings as never);
  return b.data;
}

test('every surveyed perimeter frontage has its own model, and the inventory is complete', () => {
  const expected = ['square:royal-court', 'square:station', 'square:station-kiosk', 'square:hotel', 'square:13-14', 'square:15-16', 'square:sloane-st-143-144', 'square:sloane-st-141-142', 'square:1-6', 'square:52-56', 'square:48-51', 'square:wyndham', 'square:wellesley', 'square:lurgan', 'square:28-31', 'square:holy-trinity'];
  assert.deepEqual(custom.map((b) => b.custom).sort(), expected.slice().sort());
  assert.deepEqual(SQUARE_MODELS.slice().sort(), expected.slice().sort());
  // Every building within 20 m of the square's kerb is Peter Jones or a reconstructed model (no generic façade left facing the square).
  for (const b of OSM.buildings) {
    const d = Math.min(...ringPts(b.rings[0]).map((p) => distToRing(p[0], p[1], sqRing)));
    if (d < 20) assert.ok(b.custom, `${b.id} (${b.name ?? 'unnamed'}) faces the square but has no dedicated model`);
  }
});

test('Wyndham House and Wellesley House are restored to the map (missing multipolygons) and protected', () => {
  for (const id of ['r12224305', 'r12224306']) {
    const b = OSM.buildings.find((x) => x.id === id);
    assert.ok(b, `${id} present`);
    assert.equal(b!.protected, true);
  }
});

test('no duplicate geometry: reconstructed footprints get no generic extrusion, and each model is built once', () => {
  const b = new MeshBuilder();
  const r = buildSquareBuildings(b, OSM.buildings as never, (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs, square.ring);
  assert.equal(new Set(r.built).size, r.built.length);
  assert.equal(r.built.filter((id) => custom.some((c) => c.id === id)).length, custom.length);
  // Peter Jones keeps its own model
  assert.equal(OSM.buildings.find((x) => x.id === 'w28682626')?.custom, 'peter-jones');
});

test('models stay on their footprints: nothing reaches the carriageway or the central square', () => {
  const roads = OSM.roads.filter((r) => r.cls === 'main' || r.cls === 'street' || r.cls === 'service');
  const segD = (x: number, z: number, a: number[], b: number[]) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };
  const roadClear = (x: number, z: number) => Math.min(...roads.flatMap((r) => { const o: number[] = []; for (let i = 0; i + 3 < r.pts.length; i += 2) o.push(segD(x, z, [r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]) - r.w / 2); return o; }));
  for (const bl of custom) {
    const d = buildOne(bl);
    const fp = bl.rings.map(ringPts);
    let maxOut = 0, onRoad = 0;
    for (let i = 0; i < d.length; i += 9) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      assert.ok(y > -0.01 && y < 45, `${bl.custom}: vertex height ${y}`);
      assert.ok(!pointInRing(x, z, sqRing), `${bl.custom}: geometry inside the central square`);
      const inside = pointInRing(x, z, fp[0]);
      if (inside) continue;
      const out = Math.min(...fp[0].map((p, k) => { const q = fp[0][(k + 1) % fp[0].length]; return segD(x, z, p, q); }));
      maxOut = Math.max(maxOut, out);
      if (out > 0.6 && roadClear(x, z) < -0.3 && y < 2.3) onRoad++; // 0.6 m: pilasters and plinths may project slightly // headroom: awnings and canopies start above 2.3 m
    }
    assert.ok(maxOut < 3.0, `${bl.custom}: geometry ${maxOut.toFixed(2)} m outside its footprint`);
    assert.equal(onRoad, 0, `${bl.custom}: ${onRoad} low vertices on the carriageway`);
  }
});

test('heights and storeys match the documented inventory (map metres, before tabletop scale)', () => {
  const top = (bl: B) => { const d = buildOne(bl); let m = 0; for (let i = 1; i < d.length; i += 9) m = Math.max(m, d[i]); return m; };
  const byModel = (m: string) => custom.find((b) => b.custom === m)!;
  const t = (m: string) => top(byModel(m));
  // Royal Court is lower than its neighbours (CAA 3.87); station block and Peter Jones are the tall curtain-wall buildings
  assert.ok(t('square:royal-court') < t('square:48-51'));
  assert.ok(t('square:royal-court') < t('square:station'));
  assert.ok(t('square:station') > 25 && t('square:station') < 30);
  assert.ok(t('square:hotel') > 20 && t('square:hotel') < 30);
  assert.ok(t('square:holy-trinity') > 28 && t('square:holy-trinity') < 36, `Holy Trinity turrets ${t('square:holy-trinity').toFixed(1)}`);
  assert.ok(t('square:wyndham') > 22 && t('square:wyndham') < 30);
});

test('former game sites are ordinary buildings again (generic masses, or street-corridor reconstructions)', () => {
  const former = OSM.buildings.filter((b) => b.formerSite);
  assert.equal(former.length, 32);
  for (const b of former) {
    // sites on King's Road are now rebuilt from their own references like their neighbours
    assert.ok(!b.custom || /^(kr|ss|ls|sd):/.test(b.custom), `${b.id} replaced a landmark reconstruction`);
    assert.ok(!b.protected, `${b.id} is protected`);
    assert.ok(Math.min(...ringPts(b.rings[0]).map((q) => distToRing(q[0], q[1], sqRing))) > 30, `${b.id} near the square`);
  }
});

test('the reconstruction stays within a sensible triangle budget', () => {
  const b = new MeshBuilder();
  const r = buildSquareBuildings(b, OSM.buildings as never, (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs, square.ring);
  const total = Object.entries(r.triangles).filter(([m]) => m.startsWith('square:')).reduce((n, [, t]) => n + t, 0);
  console.log(`  perimeter models: ${total} triangles; ${JSON.stringify(Object.fromEntries(Object.entries(r.triangles).filter(([m]) => m.startsWith('square:'))))}`);
  assert.ok(total < 60000);
  for (const [m, n] of Object.entries(r.triangles)) if (m.startsWith('square:')) assert.ok(n < 12000, `${m}: ${n}`);
});
