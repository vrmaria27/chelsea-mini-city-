// Duke of York Square and the Saatchi Gallery: data integration, model placement and navigation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OSM } from '../src/map/osmMap';
import { MeshBuilder } from '../src/engine/geometry';
import { DOY_MODELS, buildSquareBuildings } from '../src/map/landmarks/squareBuildings';
import { DOY_PLAZA_IDS, buildDukeOfYorkSquare, doyTrees, pointIn } from '../src/map/landmarks/dukeOfYorkSquare';
import { NavField, type NavData } from '../src/explore/nav';
import { LANDMARKS } from '../src/explore/landmarks';

const doy = OSM.doy!;
const nav = new NavField(OSM as unknown as NavData);
type Pt = [number, number];
const pts = (f: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i < f.length; i += 2) o.push([f[i], f[i + 1]]); return o; };
const plaza = OSM.areas.filter((a) => DOY_PLAZA_IDS.includes(a.id)).map((a) => ({ ring: a.ring, tris: a.tris }));
const segD = (x: number, z: number, a: Pt, b: Pt) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l)); return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz); };

test('the focused OSM extract is bundled with its source, and every expected feature is present', () => {
  assert.match(doy.source, /doy-raw\.json.*retrieved 2026-/);
  assert.ok(doy.trees.length >= 15, 'trees');
  assert.ok(doy.walls.some((w) => w.osm === 'way/101938927' && w.h === 4), 'the listed curved wall (height 4 m)');
  assert.ok(doy.gates.length >= 2, 'gates');
  assert.equal(doy.statue?.osm, 'node/8595860926');
  assert.equal(doy.fountain?.kind, 'splash_pad');
  assert.ok(doy.track && doy.track.tris.length > 0 && doy.track.innerTris.length > 0, 'running track');
  assert.ok(doy.forecourt && doy.forecourt.tris.length > 0, 'gallery forecourt');
  assert.equal(plaza.length, 2, 'Duke of York Square plaza and market areas');
});

test('the gallery and the square-defining buildings have individual models with stable OSM ids', () => {
  const expected: Record<string, string> = {
    w5317958: 'doy:saatchi', w124030230: 'doy:chapel', w124030215: 'doy:vardo', w124032943: 'doy:corner',
    w124030228: 'doy:queripel', w124030204: 'doy:left-wing', w124030200: 'doy:left-wing', w124030209: 'doy:grocer',
    w753511834: 'doy:kiosk', w899802879: 'doy:canopy',
  };
  for (const [id, model] of Object.entries(expected)) assert.equal(OSM.buildings.find((b) => b.id === id)?.custom, model, id);
  assert.deepEqual(DOY_MODELS.slice().sort(), [...new Set(Object.values(expected))].sort());
  assert.equal(OSM.buildings.find((b) => b.id === 'w5317958')?.landmarkId, 'landmark:saatchi-gallery');
});

test('every Duke of York Square model stays on its footprint (portico, steps, chimneys and cornices aside)', () => {
  for (const bl of OSM.buildings.filter((b) => b.custom?.startsWith('doy:'))) {
    const b = new MeshBuilder();
    buildSquareBuildings(b, [bl as never], (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs, OSM.square!.ring, OSM.buildings as never);
    const fp = pts(bl.rings[0]);
    let maxOut = 0, maxY = 0;
    for (let i = 0; i < b.data.length; i += 9) {
      const x = b.data[i], y = b.data[i + 1], z = b.data[i + 2];
      maxY = Math.max(maxY, y);
      if (pointIn(x, z, fp)) continue;
      maxOut = Math.max(maxOut, Math.min(...fp.map((p, k) => segD(x, z, p, fp[(k + 1) % fp.length]))));
    }
    assert.ok(maxOut < 2.2, `${bl.custom} (${bl.id}): ${maxOut.toFixed(2)} m outside its footprint`);
    assert.ok(maxY < 20, `${bl.custom}: ${maxY.toFixed(1)} m high`);
  }
});

test('the gallery is three storeys with a portico: proportions within the documented estimates', () => {
  const bl = OSM.buildings.find((b) => b.id === 'w5317958')!;
  const b = new MeshBuilder();
  const r = buildSquareBuildings(b, [bl as never], (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs, OSM.square!.ring, OSM.buildings as never);
  let maxY = 0;
  for (let i = 1; i < b.data.length; i += 9) maxY = Math.max(maxY, b.data[i]);
  assert.ok(maxY > 14 && maxY < 17, `chimney tops at ${maxY.toFixed(1)} m`);
  assert.ok(r.signs.some((s) => /YORK/.test(s.text)) && r.signs.some((s) => s.text === 'HEADQUARTERS'), 'the frieze inscription');
  assert.ok(!r.signs.some((s) => /exhibition|£|tickets/i.test(s.text)), 'no exhibition or commercial signage on the architecture');
  assert.ok(r.triangles['doy:saatchi'] < 14000, `gallery ${r.triangles['doy:saatchi']} triangles`);
});

test('the public spaces: paving inside the square and forecourt, no geometry on the private pitch', () => {
  const b = new MeshBuilder();
  const r = buildDukeOfYorkSquare(b, doy, plaza, OSM.buildings.find((x) => x.id === 'w5317958')?.rings[0]);
  console.log(`  Duke of York Square layers: ${JSON.stringify(r.stats)}`);
  assert.ok(r.stats.paving > 3000 && r.stats.paving < 25000, `paving ${r.stats.paving}`);
  assert.ok(r.signs.some((s) => s.text === 'SAATCHI GALLERY'), 'gallery name pylons on the wall');
  assert.ok(r.signs.some((s) => s.text === 'SIR HANS SLOANE'), 'statue inscription');
  const total = Object.values(r.stats).reduce((a, c) => a + c, 0);
  assert.ok(total < 45000, `landscape triangles ${total}`);
  // no seasonal or temporary elements in the baseline scene
  const src = readFileSync('src/map/landmarks/dukeOfYorkSquare.ts', 'utf8');
  assert.ok(!/christmas|market stall|banner text/i.test(src.replace(/Exhibition banners[^\n]*|markets and seasonal[^\n]*|not exhibition banners/gi, '')));
});

test('trees come from OSM, sit on public ground and never inside a building', () => {
  const ts = doyTrees(doy, plaza);
  assert.ok(ts.length >= 12, `${ts.length} trees`);
  for (const t of ts) {
    assert.equal(nav.buildingAt(t.x, t.z), null, `${t.osm} inside a building`);
    assert.ok(t.spec.height >= 12 && t.spec.height <= 28, `${t.osm} height ${t.spec.height}`);
  }
  assert.ok(new Set(ts.map((t) => t.spec.seed)).size === ts.length, 'each tree is different');
  assert.ok(ts.filter((t) => t.grounds).length >= 4, 'mature planes in the gallery grounds');
});

test("navigation: the square and the forecourt are walkable; the pitch, track, Vardo, fountain and wall are not", () => {
  assert.equal(nav.classify(-28, 36), 'ok', 'the square');
  assert.equal(nav.classify(68.6, 72.4), 'ok', 'the path in front of the portico');
  assert.equal(nav.classify(-5.4, 15.2), 'building', 'Vardo');
  assert.equal(nav.classify(doy.fountain!.x, doy.fountain!.z), 'water', 'splash pad');
  assert.equal(nav.classify(doy.statue!.x, doy.statue!.z), 'feature', 'statue');
  assert.notEqual(nav.classify(40, 90), 'ok', 'the private playing field');
  assert.equal(nav.classify(75.3, 67.1), 'building', 'the gallery behind its portico');
  const w = pts(doy.walls.find((x) => x.h === 4)!.pts);
  const mid: Pt = [(w[3][0] + w[4][0]) / 2, (w[3][1] + w[4][1]) / 2];
  assert.notEqual(nav.classify(mid[0], mid[1]), 'ok', 'on the curved wall');
  // the main gateway through the wall stays open
  const gate = doy.gates.find((g) => Math.hypot(g.x - 33.2, g.z - 8.9) < 0.5)!;
  assert.equal(nav.classify(gate.x, gate.z), 'ok', 'through the gateway');
  assert.equal(nav.groundY(-28, 36), 0.32);
});

test('the four requested viewpoints exist and are valid', () => {
  for (const id of ['way/5318345#kings-road', 'way/5318345', 'way/5317958', 'way/5317958#entrance']) {
    const l = LANDMARKS.find((x) => x.id === id);
    assert.ok(l?.street, id);
    assert.ok(nav.isWalkable(l.street.x, l.street.z), `${id} walkable`);
  }
  // the gallery's façade view looks across the playing field from the square (no access implied)
  const g = LANDMARKS.find((x) => x.id === 'way/5317958')!;
  assert.ok(pointIn(g.street!.x, g.street!.z, pts(plaza[0].ring)) || pointIn(g.street!.x, g.street!.z, pts(plaza[1].ring)));
});
