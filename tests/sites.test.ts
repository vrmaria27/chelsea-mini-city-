// Acceptance tests for the curated development sites (map version 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OSM, osmMap } from '../src/map/osmMap';
import { BUILDINGS, type BuildingType } from '../src/sim/rules';
import { BACKUP_KEY, SAVE_KEY, type KeyValueStore } from '../src/sim/save';
import { Game } from '../src/game/game';
import { buildingMesh, plotBuilding, siteBoundary } from '../src/game/cityModel';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const newGame = (store = new MemoryStore()) => ({ g: new Game(osmMap, store, () => 0), store });
const plotFor = (g: Game, t: BuildingType) => g.freeSites(t)[0];

test('the site list is deliberate and versioned: same file, same sites', () => {
  const list = JSON.parse(readFileSync('data/osm/sites-v2.json', 'utf8'));
  assert.equal(list.mapVersion, 2);
  assert.equal(OSM.meta.mapVersion, 2);
  assert.equal(list.sites.length, osmMap.plots.length);
  osmMap.plots.forEach((p, i) => assert.deepEqual(OSM.plots[i].replaces, list.sites[i].osm, `${p.id} replaces exactly its listed footprints`));
});

test('a new game has 20–24 empty sites, and each building type has somewhere to go', () => {
  const { g } = newGame();
  const free = g.freeSites();
  assert.ok(free.length >= 20 && free.length <= 24);
  for (const t of ['townhouse', 'shop', 'park'] as BuildingType[]) assert.ok(g.freeSites(t).length >= 6, `${t}: ${g.freeSites(t).length}`);
  assert.match(g.siteSummary(), /free sites/);
});

test('a player can place a townhouse, a shop and a park; each charges exactly once; occupied sites refuse', () => {
  const { g } = newGame();
  for (const t of ['townhouse', 'shop', 'park'] as BuildingType[]) {
    const site = plotFor(g, t);
    g.select(t);
    const before = g.state.money;
    assert.ok(g.place(site.id), `place ${t}`);
    assert.equal(before - g.state.money, BUILDINGS[t].cost);
    assert.ok(!g.place(site.id), 'second placement on the same site is refused');
    assert.equal(before - g.state.money, BUILDINGS[t].cost, 'no second charge');
    assert.ok(!g.freeSites().some((p) => p.id === site.id), 'site no longer listed as free');
  }
});

test('a type that does not fit is refused with an explanation before purchase', () => {
  const { g } = newGame();
  const small = osmMap.plots.find((p) => !p.allowed!.includes('park'));
  assert.ok(small, 'map has at least one site too small for a park');
  g.select('park');
  const pv = g.preview(small!.id)!;
  assert.equal(pv.ok, false);
  assert.match(pv.text, /Too small for a park/);
  const before = g.state.money;
  assert.equal(g.place(small!.id), false);
  assert.equal(g.state.money, before);
  assert.match(g.message.text, /Too small for a park/);
});

test('undo restores the empty site and refunds exactly', () => {
  const { g } = newGame();
  const site = plotFor(g, 'shop');
  g.select('shop');
  g.place(site.id);
  assert.ok(g.undo());
  assert.equal(g.state.money, 10000);
  assert.ok(g.freeSites().some((p) => p.id === site.id));
  assert.equal(g.undo(), false, 'nothing further to undo');
  assert.equal(g.state.money, 10000);
});

test('save and reload preserve buildings and the remaining vacant sites', () => {
  const store = new MemoryStore();
  const { g } = newGame(store);
  g.select('townhouse'); g.place(plotFor(g, 'townhouse').id);
  g.select('park'); g.place(plotFor(g, 'park').id);
  const g2 = new Game(osmMap, store, () => 0);
  assert.deepEqual(g2.state.buildings, g.state.buildings);
  assert.deepEqual(g2.freeSites().map((p) => p.id), g.freeSites().map((p) => p.id));
});

test('shop and park effects use real map distances between site centres', () => {
  const { g } = newGame();
  const [a, b] = osmMap.plots;
  assert.equal(g.sim.distance(a.id, b.id), Math.hypot(a.x - b.x, a.z - b.z));
  const park = plotFor(g, 'park');
  const near = osmMap.plots.filter((p) => p.id !== park.id && g.sim.inRange(p.id, park.id) && g.sim.fits(p.id, 'townhouse'));
  assert.ok(near.length >= 2, 'housing sites fall within park reach');
});

test('building models stay inside their site and are sized (not stretched) per site', () => {
  for (const p of osmMap.plots) {
    for (const t of p.allowed!) for (const lvl of [1, 2] as const) {
      const m = buildingMesh(t, p.number, lvl, p.w, p.d);
      for (let i = 0; i < m.data.length; i += 9) {
        assert.ok(Math.abs(m.data[i]) <= p.w / 2 + 0.05 && Math.abs(m.data[i + 2]) <= p.d / 2 + 0.05, `${t} L${lvl} leaves ${p.id} (${m.data[i].toFixed(2)}, ${m.data[i + 2].toFixed(2)} vs ${p.w}×${p.d})`);
      }
    }
  }
});

test('the hover preview uses exactly the final building mesh', () => {
  const p = osmMap.plots[0];
  const a = plotBuilding(p, 'townhouse', 1), b = plotBuilding(p, 'townhouse', 1);
  assert.equal(a, b, 'same cached mesh object for preview and placement');
  assert.deepEqual(a.data, buildingMesh('townhouse', p.number % 5, 1, p.w, p.d).data);
});

test('the building rectangle lies inside the site boundary', () => {
  for (const p of osmMap.plots) {
    const ring = siteBoundary(p);
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    for (const [x, z] of [[-p.w / 2, -p.d / 2], [p.w / 2, -p.d / 2], [p.w / 2, p.d / 2], [-p.w / 2, p.d / 2]]) {
      const X = p.x + x * c + z * s, Z = p.z - x * s + z * c;
      let inside = false;
      for (let i = 0, j = ring.length / 2 - 1; i < ring.length / 2; j = i++) {
        const xi = ring[i * 2], zi = ring[i * 2 + 1], xj = ring[j * 2], zj = ring[j * 2 + 1];
        if (zi > Z !== zj > Z && X < ((xj - xi) * (Z - zi)) / (zj - zi) + xi) inside = !inside;
      }
      assert.ok(inside, `${p.id} rectangle corner outside its site`);
    }
  }
});

test('Peter Jones and protected landmarks can never become sites', () => {
  const protectedIds = new Set(OSM.buildings.filter((b) => b.protected).map((b) => b.id));
  for (const p of OSM.plots) for (const id of p.replaces) assert.ok(!protectedIds.has(id), `${p.id} would remove protected ${id}`);
  assert.ok(!OSM.plots.some((p) => p.replaces.includes('w28682626')));
  const { g } = newGame();
  assert.equal(g.sim.hasPlot('w28682626'), false);
});

test('a map-version-1 save moves onto the new sites with a backup, no duplicates and no refunds', () => {
  const store = new MemoryStore();
  const raw = JSON.stringify({
    version: 3, map: { id: 'chelsea-osm', version: 1 },
    state: { money: 2222, buildings: { g13: { type: 'park', level: 2 }, g12: { type: 'park', level: 1 }, g8: { type: 'shop', level: 1 }, g14: { type: 'townhouse', level: 2 }, g7: { type: 'townhouse', level: 1 } }, lastAction: { kind: 'place', plotId: 'g7', type: 'townhouse', cost: 1000 }, chapter: 1, ticks: 9 },
    prefs: { reducedMotion: false, lowDetail: false },
  });
  store.setItem(SAVE_KEY, raw);
  const g = new Game(osmMap, store, () => 0);
  assert.equal(g.pendingChoice, null);
  assert.equal(g.state.money, 2222, 'money unchanged: nothing refunded');
  assert.equal(g.state.chapter >= 1, true);
  const types = Object.values(g.state.buildings).map((b) => b.type + b.level).sort();
  assert.deepEqual(types, ['park1', 'park2', 'shop1', 'townhouse1', 'townhouse2']);
  assert.equal(new Set(Object.keys(g.state.buildings)).size, 5, 'no duplicates');
  for (const [id, b] of Object.entries(g.state.buildings)) assert.ok(g.sim.fits(id, b.type));
  assert.equal(store.getItem(BACKUP_KEY), raw, 'backup of the original save');
  assert.equal(JSON.parse(store.getItem(SAVE_KEY)!).map.version, 2);
  // undo refunds the townhouse placed last, once
  assert.ok(g.undo());
  assert.equal(g.state.money, 3222);
  assert.equal(g.undo(), false);
});

test('if a saved building cannot be placed, the save is kept and the player is asked', () => {
  const store = new MemoryStore();
  // 25 buildings cannot fit on ≤ 24 sites
  const buildings = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`g${i + 1}`, { type: 'townhouse', level: 1 }]));
  const raw = JSON.stringify({ version: 3, map: { id: 'chelsea-osm', version: 1 }, state: { money: 1, buildings, lastAction: null, chapter: 0, ticks: 0 } });
  store.setItem(SAVE_KEY, raw);
  const g = new Game({ ...osmMap, previousPlotMap: Object.fromEntries(Object.keys(buildings).map((k, i) => [k, osmMap.plots[i % osmMap.plots.length].id])) }, store, () => 0);
  assert.ok(g.pendingChoice);
  assert.equal(g.pendingChoice!.fromLegacy, false);
  g.update(60);
  assert.equal(store.getItem(SAVE_KEY), raw, 'original untouched until the player decides');
  assert.equal(store.getItem(BACKUP_KEY), raw);
});
