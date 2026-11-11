// Exploration: restored sites, walkable surfaces, landmark viewpoints, preferences and legacy saves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OSM, osmMap } from '../src/map/osmMap';
import { EYE_HEIGHT, NavField, SQUARE_GROUND, ZONE_M, ringDist, segDist, type NavData } from '../src/explore/nav';
import { LANDMARKS, DEFAULT_LANDMARK } from '../src/explore/landmarks';
import { Explorer, MAX_TELEPORT } from '../src/explore/explorer';
import { PREFS_KEY, PREFS_VERSION, SCALE_MAX, SCALE_MIN, defaultPrefs, loadPrefs, type KeyValueStore } from '../src/explore/prefs';
import { LEGACY_KEYS, exportLegacy, readLegacy } from '../src/explore/legacy';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  writes: string[] = [];
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.push(k); this.map.set(k, v); }
  removeItem(k: string) { this.writes.push(k); this.map.delete(k); }
}

const nav = new NavField(OSM as unknown as NavData);
const archive = JSON.parse(readFileSync('data/legacy/game-sites-v2.json', 'utf8')) as { plots: { id: string; replaces: string[] }[]; legacyPlotMap: Record<string, string> };
const sq = OSM.square!;
const LEGACY_SAVE = JSON.stringify({ version: 3, map: { id: 'chelsea-osm', version: 2 }, state: { money: 4200, buildings: { k01: { type: 'townhouse', level: 2 }, k05: { type: 'park', level: 1 } }, chapter: 1, ticks: 40 }, prefs: { reducedMotion: false } });

// ---- Geography is separate from gameplay ---------------------------------------------------------

test('the bundled scene data has no gameplay: no plots, sites or save-migration tables', () => {
  const keys = Object.keys(OSM);
  for (const k of ['plots', 'legacyPlotMap', 'previousPlotMap', 'walkPaths', 'drivePaths']) assert.ok(!keys.includes(k), `scene data still has ${k}`);
  assert.ok(!('plots' in osmMap));
  const json = readFileSync('src/map/osm/chelsea-osm.json', 'utf8');
  assert.ok(!/"replaces"|"boundaryTris"|"restrictions"/.test(json));
});

test('the app source contains no economy, build or progression code', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(p)) files.push(p); } };
  walk('src');
  assert.ok(!files.some((f) => /[\\/](sim|game)[\\/]/.test(f)), 'src/sim and src/game are removed');
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.ok(!/\b(money|income|residents|happiness|townhouse|chapter|celebrat|upgrade|simulation tick)\b/i.test(s), `${f} mentions gameplay`);
    assert.ok(!/setInterval\(/.test(s), `${f} runs a timer`);
  }
  const html = readFileSync('public/index.html', 'utf8');
  assert.ok(!/£|Residents|Happiness|Build|Undo|Chapter/.test(html), 'HUD has no economy or build UI');
  assert.match(html, /<title>Chelsea Explorer<\/title>/);
});

test('every former development site footprint is restored as a building, with its stable OSM id', () => {
  const ids = new Set(OSM.buildings.map((b) => b.id));
  const replaced = archive.plots.flatMap((p) => p.replaces);
  assert.equal(archive.plots.length, 22);
  assert.equal(new Set(replaced).size, 32, 'several footprints where one site replaced several');
  for (const id of replaced) {
    assert.ok(ids.has(id), `${id} missing`);
    const b = OSM.buildings.find((x) => x.id === id)!;
    assert.equal(b.formerSite, true);
    assert.ok(b.h > 5 && b.h < 25, `${id} height ${b.h}`);
    assert.ok(b.tris.length >= 6, `${id} has a roof`);
  }
  assert.equal(OSM.buildings.filter((b) => b.formerSite).length, 32, 'nothing else is flagged');
});

test('the static scene extrudes every non-custom footprint (no hidden footprints)', () => {
  const src = readFileSync('src/map/osmMap.ts', 'utf8');
  assert.ok(!/hidden\.has|replaces/.test(src));
  const tris = osmMap.buildStatic().toFloat32().length / 27;
  assert.ok(tris > 100_000 && tris < 200_000, `static triangles ${tris}`);
});

// ---- Walkable surfaces ---------------------------------------------------------------------------

test('the paved square is walkable, its features are not', () => {
  assert.ok(nav.isWalkable(147, -150));
  assert.equal(nav.classify(sq.fountain.x, sq.fountain.z), 'water');
  if (sq.memorial) assert.equal(nav.classify(sq.memorial.x, sq.memorial.z), 'feature');
  for (const t of sq.trees) assert.equal(nav.classify(t.x, t.z), 'tree', `tree ${t.osm}`);
  assert.equal(nav.groundY(147, -150), SQUARE_GROUND);
});

test('buildings, carriageways and the area beyond the zone are not walkable', () => {
  for (const b of OSM.buildings.filter((x) => x.custom)) {
    const r = b.rings[0];
    let cx = 0, cz = 0;
    for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; }
    cx /= r.length / 2; cz /= r.length / 2;
    if (nav.buildingAt(cx, cz)) assert.notEqual(nav.classify(cx, cz), 'ok', b.id);
  }
  // carriageway centrelines around the square
  for (const r of OSM.roads.filter((x) => x.cls === 'main' && x.name === 'Sloane Square')) {
    for (let i = 0; i < r.pts.length; i += 2) {
      const [x, z] = [r.pts[i], r.pts[i + 1]];
      if (nav.inZone(x, z) && !nav.inSquare(x, z)) assert.equal(nav.classify(x, z), 'carriageway', `${x},${z}`);
    }
  }
  assert.equal(nav.classify(-300, 200), 'outside', 'Wellington Square area is outside street level');
  assert.equal(nav.classify(NaN, 0), 'outside');
});

test('walkable points are on public surfaces within the bounded zone, with a reasonable area', () => {
  let ok = 0;
  const b = nav.zoneBounds;
  for (let x = b.minX; x <= b.maxX; x += 1) for (let z = b.minZ; z <= b.maxZ; z += 1) {
    if (!nav.isWalkable(x, z)) continue;
    ok++;
    assert.ok(nav.inSquare(x, z) || ringDist(x, z, sq.ring) <= ZONE_M + 1e-6);
    assert.equal(nav.buildingAt(x, z), null);
  }
  assert.ok(ok > 2500 && ok < 8000, `walkable area ${ok} m²`);
});

test('line of sight is blocked by building masses but not by open space', () => {
  const pj = OSM.buildings.find((x) => x.id === 'w28682626')!;
  const e = EYE_HEIGHT + SQUARE_GROUND;
  assert.equal(nav.lineBlocked(147, e, -150, 200, e, -150), false, 'across the square');
  assert.equal(nav.lineBlocked(147, e, -150, 40, e, -120), true, 'through Peter Jones');
  assert.equal(nav.lineBlocked(147, e, -150, 40, e, -120, pj.id), false, 'unless it is the target');
});

// ---- Landmarks and viewpoints ----------------------------------------------------------------------

test('landmarks have unique stable ids, names and short descriptions with sources', () => {
  const ids = new Set(LANDMARKS.map((l) => l.id));
  assert.equal(ids.size, LANDMARKS.length);
  for (const l of LANDMARKS) {
    assert.ok(l.name.length > 3 && l.description.length > 20 && l.description.length < 260, l.name);
    assert.ok(l.sources.length > 0 && l.sources.every((s) => /^https:\/\//.test(s.url)), `${l.name} sources`);
    assert.ok(Math.abs(l.x) < osmMap.half && Math.abs(l.z) < osmMap.half, `${l.name} inside the map`);
  }
  // OSM landmark names in the scene are all offered
  for (const m of OSM.landmarks) assert.ok(LANDMARKS.some((l) => l.name === m.name), `${m.name} in the menu`);
});

test('every street viewpoint is walkable, clear of obstacles and looks at its landmark', () => {
  for (const l of LANDMARKS) {
    if (!l.street) continue;
    const { x, z, yaw } = l.street;
    assert.ok(nav.isWalkable(x, z), `${l.name} viewpoint walkable`);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(nav.isWalkable(x + dx, z + dz), `${l.name} viewpoint has room`);
    const want = Math.atan2(-(l.x - x), -(l.z - z));
    const diff = Math.abs(Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw)));
    assert.ok(diff < 0.6, `${l.name} is in view (${diff.toFixed(3)} rad off centre)`);
    const d = Math.hypot(l.x - x, l.z - z);
    assert.ok(d > 5 && d < 120, `${l.name} viewing distance (to its centre) ${d.toFixed(0)} m`);
    const target = OSM.buildings.find((b) => l.id.split("#")[0] === `way/${b.id.slice(1)}`);
    const ey = nav.groundY(x, z) + EYE_HEIGHT;
    assert.ok(!nav.lineBlocked(x, ey, z, l.x, Math.max(2, (target?.h ?? 4) * 0.5), l.z, target?.id), `${l.name} visible`);
    // no tree trunk or lamp post right in front of the view
    const fx = x - Math.sin(yaw) * 12, fz = z - Math.cos(yaw) * 12;
    for (const t of sq.trees) assert.ok(segDist(t.x, t.z, x, z, fx, fz) > 1.5, `${l.name}: tree ${t.osm} blocks the view`);
  }
  assert.ok(DEFAULT_LANDMARK.street, 'the default start has a viewpoint');
  assert.ok(LANDMARKS.filter((l) => l.street).length >= 6);
});

test('landmarks outside the street-level area are shown on the miniature instead', () => {
  const ex = new Explorer(nav, new MemoryStore());
  ex.enterStreet();
  const r = ex.selectLandmark('way/5318737'); // Burton Court
  assert.deepEqual(r, { kind: 'highlight' });
  assert.equal(ex.mode, 'miniature');
  const r2 = ex.selectLandmark('way/147249460'); // Royal Court Theatre, from the miniature
  assert.equal(r2.kind, 'highlight');
  assert.deepEqual(ex.pick, LANDMARKS.find((l) => l.id === 'way/147249460')!.street);
  ex.enterStreet();
  const r3 = ex.selectLandmark('way/28682626'); // Peter Jones, at street level
  assert.equal(r3.kind, 'street');
  assert.deepEqual(ex.street, LANDMARKS.find((l) => l.id === 'way/28682626')!.street);
});

// ---- Explorer state ---------------------------------------------------------------------------------

test('the explorer opens on the curated scene in the miniature at a valid spot', () => {
  const ex = new Explorer(nav, new MemoryStore());
  assert.equal(ex.mode, 'miniature');
  assert.equal(ex.loadStatus, 'none');
  assert.ok(nav.isWalkable(ex.pick.x, ex.pick.z));
  assert.equal(ex.selected, null);
});

test('teleport only to walkable surfaces within reach; refusals explain why', () => {
  const ex = new Explorer(nav, new MemoryStore());
  assert.ok(ex.enterStreet());
  const start = { ...ex.street };
  assert.equal(ex.teleport(sq.fountain.x, sq.fountain.z), false);
  assert.match(ex.notice!.text, /fountain/);
  assert.equal(ex.teleport(78.7, -124.5), false); // inside Peter Jones
  assert.deepEqual(ex.street, start, 'refused teleports do not move');
  assert.equal(ex.teleport(start.x + MAX_TELEPORT + 30, start.z), false);
  assert.equal(ex.teleport(175, -152), true);
  assert.deepEqual([ex.street.x, ex.street.z], [175, -152]);
  assert.equal(ex.street.yaw, start.yaw, 'teleporting keeps the heading');
});

test('desktop walking slides along obstacles and never leaves walkable ground', () => {
  const ex = new Explorer(nav, new MemoryStore());
  ex.enterStreet({ x: 147, z: -150, yaw: Math.PI / 2 }); // facing west, toward Peter Jones
  for (let i = 0; i < 2000; i++) ex.walk(-0.1, 0.013);
  assert.ok(nav.isWalkable(ex.street.x, ex.street.z));
  assert.equal(nav.buildingAt(ex.street.x, ex.street.z), null);
});

test('snap turns wrap and are saved; switching views keeps the position', () => {
  const store = new MemoryStore();
  const ex = new Explorer(nav, store);
  ex.enterStreet({ x: 175, z: -152, yaw: 3 });
  ex.turn(Math.PI / 6);
  assert.ok(ex.street.yaw >= -Math.PI && ex.street.yaw <= Math.PI);
  ex.toMiniature();
  assert.equal(ex.mode, 'miniature');
  assert.deepEqual(ex.pick, ex.street, 'the miniature offers the spot just left');
  const saved = JSON.parse(store.map.get(PREFS_KEY)!);
  assert.deepEqual(saved.viewpoint, ex.street);
});

test('picking on the miniature rejects buildings and roads', () => {
  const ex = new Explorer(nav, new MemoryStore());
  const before = { ...ex.pick };
  assert.equal(ex.pickAt(256.1, -149.3), false); // Royal Court Theatre
  assert.deepEqual(ex.pick, before);
  assert.equal(ex.pickAt(190, -150, 1), true);
  assert.deepEqual(ex.pick, { x: 190, z: -150, yaw: 1 });
});

test('miniature scale stays within bounds', () => {
  const ex = new Explorer(nav, new MemoryStore());
  for (let i = 0; i < 20; i++) ex.scaleMiniature(true);
  assert.equal(ex.prefs.miniature.scale, SCALE_MAX);
  for (let i = 0; i < 40; i++) ex.scaleMiniature(false);
  assert.equal(ex.prefs.miniature.scale, SCALE_MIN);
});

// ---- Preferences --------------------------------------------------------------------------------------

test('preferences are versioned and stored under their own key', () => {
  const store = new MemoryStore();
  const ex = new Explorer(nav, store);
  ex.setPref('labels', false);
  ex.setSnapTurn(45);
  const saved = JSON.parse(store.map.get(PREFS_KEY)!);
  assert.equal(saved.version, PREFS_VERSION);
  assert.deepEqual(Object.keys(saved).sort(), Object.keys(defaultPrefs()).sort());
  const again = new Explorer(nav, store);
  assert.equal(again.prefs.labels, false);
  assert.equal(again.prefs.snapTurnDeg, 45);
  assert.equal(again.mode, 'miniature', 'always starts from the curated scene in the miniature');
});

test('restored viewpoints inside buildings, below ground or malformed are rejected', () => {
  const valid = (x: number, z: number) => nav.isWalkable(x, z);
  const put = (v: unknown) => { const s = new MemoryStore(); s.map.set(PREFS_KEY, typeof v === 'string' ? v : JSON.stringify(v)); return s; };
  const inBuilding = loadPrefs(put({ ...defaultPrefs(), viewpoint: { x: 78.7, z: -124.5, yaw: 0 } }), valid);
  assert.equal(inBuilding.prefs.viewpoint, null);
  assert.equal(inBuilding.status, 'invalid-viewpoint');
  assert.equal(loadPrefs(put({ ...defaultPrefs(), viewpoint: { x: 'a', z: 1, yaw: 0 } }), valid).prefs.viewpoint, null);
  assert.equal(loadPrefs(put('{not json'), valid).status, 'malformed');
  assert.equal(loadPrefs(put({ version: 99 }), valid).status, 'unsupported-version');
  const odd = loadPrefs(put({ version: 1, miniature: { scale: 50, yaw: 'x' }, labels: 'yes', snapTurnDeg: 7 }), valid).prefs;
  assert.equal(odd.miniature.scale, SCALE_MAX);
  assert.equal(odd.miniature.yaw, 0);
  assert.equal(odd.labels, true);
  assert.equal(odd.snapTurnDeg, 30);
  const good = loadPrefs(put({ ...defaultPrefs(), viewpoint: { x: 175, z: -152, yaw: 1 } }), valid);
  assert.deepEqual(good.prefs.viewpoint, { x: 175, z: -152, yaw: 1 });
  // the view height is never stored: it always comes from the walking surface
  assert.ok(!('y' in (good.prefs.viewpoint as object)));
});

// ---- Legacy saves -------------------------------------------------------------------------------------

test('legacy city-builder saves are never written, migrated or deleted', () => {
  const store = new MemoryStore();
  store.map.set('chelsea-mini-city.save', LEGACY_SAVE);
  store.map.set('chelsea-mini-city.save.backup', LEGACY_SAVE);
  store.map.set('chelsea-mini-city.map', 'chelsea-osm');
  const before = new Map(store.map);
  const ex = new Explorer(nav, store);
  ex.enterStreet();
  ex.teleport(175, -152);
  ex.setPref('lowDetail', true);
  ex.toMiniature();
  for (const k of LEGACY_KEYS) assert.equal(store.map.get(k), before.get(k), `${k} unchanged`);
  assert.ok(store.writes.every((k) => k === PREFS_KEY), `only ${PREFS_KEY} is written (${store.writes.join(', ')})`);
});

test('legacy saves can be recovered exactly as stored', () => {
  const store = new MemoryStore();
  store.map.set('chelsea-mini-city.save', LEGACY_SAVE);
  store.map.set('chelsea-mini-city.onboarded', '1');
  const s = readLegacy(store);
  assert.ok(s.found);
  assert.match(s.description, /v3, 2 buildings/);
  const out = JSON.parse(exportLegacy(s, '2026-11-10T00:00:00Z'));
  assert.equal(out.localStorage['chelsea-mini-city.save'], LEGACY_SAVE);
  assert.equal(out.localStorage['chelsea-mini-city.onboarded'], '1');
  const none = readLegacy(new MemoryStore());
  assert.equal(none.found, false);
  const broken = new MemoryStore();
  broken.map.set('chelsea-mini-city.save', '{oops');
  assert.match(readLegacy(broken).description, /kept as is/);
});

test('player-built structures are never turned into map features', () => {
  // The archived site ids a legacy save refers to do not appear anywhere in the scene data.
  const json = readFileSync('src/map/osm/chelsea-osm.json', 'utf8');
  for (const p of archive.plots) assert.ok(!json.includes(`"${p.id}"`), `${p.id} in scene data`);
  assert.ok(Object.keys(archive.legacyPlotMap).length > 0, 'migration tables are archived for reference');
});

// ---- Hosting ------------------------------------------------------------------------------------------

test('static hosting paths stay relative and the deployment workflow is unchanged', () => {
  const html = readFileSync('public/index.html', 'utf8');
  assert.match(html, /<script src="\.\/main\.js"><\/script>/);
  assert.ok(!/(src|href)="\/(?!\/)/.test(html), 'no root-absolute asset paths');
  const wf = readFileSync('.github/workflows/deploy.yml', 'utf8');
  assert.match(wf, /npm run build|npm run check/);
  assert.match(wf, /dist/);
});

test('visibility tiles keep every static triangle exactly once', async () => {
  const { splitTiles } = await import('../src/view/scene');
  const data = osmMap.buildStatic().toFloat32();
  const tiles = splitTiles(data, osmMap.half, 4);
  assert.equal(tiles.reduce((n, t) => n + t.data.length, 0), data.length);
  assert.ok(tiles.length > 8 && tiles.length <= 16);
  for (const t of tiles) assert.ok(t.min.every((v, i) => v <= t.max[i]));
});
