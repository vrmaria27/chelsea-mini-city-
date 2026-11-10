import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OSM, osmMap } from '../src/map/osmMap';
import { PLOTS as LEGACY_PLOTS } from '../src/map/chelsea';
import { BUILDINGS, type BuildingType } from '../src/sim/rules';
import { BACKUP_KEY, SAVE_KEY, loadGame, type KeyValueStore, type MapContext } from '../src/sim/save';
import { Simulation, createInitialState, type GameState } from '../src/sim/simulation';
import { CHAPTER_COUNT } from '../src/sim/chapters';
import { Game } from '../src/game/game';

const sim = new Simulation(osmMap.plots);
const legacySim = new Simulation(LEGACY_PLOTS);
const ctx: MapContext = { id: 'chelsea-osm', version: 2, sim, legacyPlotMap: OSM.legacyPlotMap, legacySim, previousPlotMap: OSM.previousPlotMap };

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

// Same local projection as scripts/osm/process.mjs
const R = 6371008.8;
const proj = (lat: number, lon: number): [number, number] => {
  const { lat: lat0, lon: lon0 } = OSM.meta.centre;
  const k = (Math.PI / 180) * R;
  return [(lon - lon0) * k * Math.cos((lat0 * Math.PI) / 180), -(lat - lat0) * k];
};
const haversine = (a: [number, number], b: [number, number]) => {
  const toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ---- Source data & projection --------------------------------------------------------------------

test('bundled map records its source, licence, retrieval date, centre and bounding box', () => {
  const m = OSM.meta;
  assert.equal(m.attribution, '© OpenStreetMap contributors');
  assert.equal(m.copyrightUrl, 'https://www.openstreetmap.org/copyright');
  assert.match(String(m.licence), /ODbL/);
  assert.match(m.retrieved, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(m.half * 2, 700, 'map is 700 m across');
  assert.ok(m.bbox.south < m.centre.lat && m.centre.lat < m.bbox.north);
  assert.ok(m.bbox.west < m.centre.lon && m.centre.lon < m.bbox.east);
});

test('projection is not mirrored, swapped or stretched (known OSM coordinates)', () => {
  // Sloane Square station node 15026054 is north-east of the map centre.
  const [sx, sz] = proj(51.49223, -0.15588);
  assert.ok(sx > 0, 'east is +x');
  assert.ok(sz < 0, 'north is −z');
  // Distances match great-circle distances to within 0.1 %.
  const a: [number, number] = [51.49223, -0.15588], b: [number, number] = [51.4907, -0.15875]; // station, Saatchi Gallery
  const pa = proj(...a), pb = proj(...b);
  const d = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
  assert.ok(Math.abs(d - haversine(a, b)) / haversine(a, b) < 0.001, `${d} vs ${haversine(a, b)}`);
  // North–south and east–west scales are equal (no stretch): 100 m north and 100 m east have equal length.
  const n = proj(OSM.meta.centre.lat + 100 / ((Math.PI / 180) * R), OSM.meta.centre.lon);
  assert.ok(Math.abs(Math.abs(n[1]) - 100) < 0.01);
});

test('importer connectivity and orientation checks all pass', () => {
  for (const [k, v] of Object.entries(OSM.meta.checks as Record<string, boolean>)) assert.equal(v, true, k);
  for (const [k, v] of Object.entries(OSM.meta.orientation as Record<string, boolean>)) assert.equal(v, true, k);
});

test('at least five identifiable landmarks are present at their real relative positions', () => {
  const lm = Object.fromEntries(OSM.landmarks.map((l) => [l.name, l]));
  for (const name of ['Sloane Square station', 'Royal Court Theatre', 'Peter Jones', 'Saatchi Gallery', 'Duke of York Square', 'Holy Trinity Church', 'Burton Court']) assert.ok(lm[name], name);
  assert.ok(lm['Royal Court Theatre'].x > lm['Peter Jones'].x, 'Royal Court is on the east side of Sloane Square, Peter Jones on the west');
  assert.ok(lm['Saatchi Gallery'].x > lm['Duke of York Square'].x, 'Saatchi Gallery lies east of the square');
  assert.ok(lm['Holy Trinity Church'].z < lm['Royal Court Theatre'].z, 'Holy Trinity (Sloane Street) is north of the Royal Court');
  assert.ok(lm['Burton Court'].z > lm['Saatchi Gallery'].z, 'Burton Court is south of the Saatchi Gallery');
});

test("King's Road runs south-west to north-east into Sloane Square", () => {
  const kr = OSM.roads.filter((r) => r.name === "King's Road" && r.cls === 'main');
  const pts = kr.flatMap((r) => { const o: [number, number][] = []; for (let i = 0; i < r.pts.length; i += 2) o.push([r.pts[i], r.pts[i + 1]]); return o; });
  const west = pts.reduce((a, b) => (b[0] < a[0] ? b : a)), east = pts.reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(east[1] < west[1], 'the eastern end is further north');
  const bearing = (Math.atan2(east[0] - west[0], -(east[1] - west[1])) * 180) / Math.PI; // degrees from north, clockwise
  assert.ok(bearing > 45 && bearing < 75, `bearing ${bearing.toFixed(1)}°`);
});

// ---- Plots ----------------------------------------------------------------------------------------

type Pt = [number, number];
const rect = (p: { x: number; z: number; w: number; d: number; angle: number }): Pt[] => {
  const c = Math.cos(p.angle), s = Math.sin(p.angle);
  return ([[-p.w / 2, -p.d / 2], [p.w / 2, -p.d / 2], [p.w / 2, p.d / 2], [-p.w / 2, p.d / 2]] as Pt[]).map(([x, z]) => [p.x + x * c + z * s, p.z - x * s + z * c]);
};
const cross = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segX = (a: Pt, b: Pt, c: Pt, d: Pt) => (cross(c, d, a) > 0) !== (cross(c, d, b) > 0) && (cross(a, b, c) > 0) !== (cross(a, b, d) > 0);
const inPoly = (p: Pt, poly: Pt[]) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) r = !r;
  }
  return r;
};
const overlap = (p: Pt[], q: Pt[]) => p.some((a, i) => q.some((c, j) => segX(a, p[(i + 1) % p.length], c, q[(j + 1) % q.length]))) || inPoly(p[0], q) || inPoly(q[0], p);
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const ring = (flat: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };

test('20–24 development sites with unique stable ids inside the map', () => {
  const n = osmMap.plots.length;
  assert.ok(n >= 20 && n <= 24, `${n} sites`);
  assert.equal(new Set(osmMap.plots.map((p) => p.id)).size, n);
  for (const p of osmMap.plots) {
    assert.match(p.id, /^k\d{2}$/);
    assert.ok(p.boundary && p.boundary.length >= 6, 'has a boundary');
    assert.ok(p.allowed && p.allowed.length >= 1, 'lists allowed types');
  }
  for (const p of osmMap.plots) for (const [x, z] of rect(p)) assert.ok(Math.abs(x) < OSM.meta.half && Math.abs(z) < OSM.meta.half, p.id);
});

test('plots stay clear of every road and footpath (carriageway half-width), each other, green spaces and plazas', () => {
  for (const p of osmMap.plots) {
    const poly = rect(p);
    for (const r of OSM.roads) {
      const pts = ring(r.pts);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const d = Math.min(...poly.map((c) => segDist(c, a, b)), ...[a, b].map((e) => (inPoly(e, poly) ? 0 : Infinity)), poly.some((c, k) => segX(c, poly[(k + 1) % 4], a, b)) ? 0 : Infinity);
        assert.ok(d >= r.w / 2, `${p.id} intrudes on ${r.name ?? r.hw} (${d.toFixed(2)} < ${r.w / 2})`);
      }
    }
    for (const q of osmMap.plots) if (q !== p) assert.ok(!overlap(poly, rect(q)), `${p.id} overlaps ${q.id}`);
    for (const a of OSM.areas) if (a.kind !== 'parking') assert.ok(!overlap(poly, ring(a.ring)), `${p.id} overlaps ${a.kind} ${a.name ?? a.id}`);
  }
});

test('plots never overlap a visible building or a protected landmark footprint', () => {
  const hidden = new Set(OSM.plots.flatMap((p) => p.replaces));
  for (const p of OSM.plots) {
    const poly = rect(p);
    for (const b of OSM.buildings) {
      if (!overlap(poly, ring(b.rings[0]))) continue;
      assert.ok(hidden.has(b.id), `${p.id} overlaps visible building ${b.id}`);
      assert.equal(b.protected, false, `${p.id} would hide protected ${b.name}`);
    }
  }
});

test('plots face their street (front edge is the edge nearest a road)', () => {
  for (const p of osmMap.plots) {
    const front: Pt = [p.x + Math.sin(p.angle) * (p.d / 2 + 5), p.z + Math.cos(p.angle) * (p.d / 2 + 5)];
    const back: Pt = [p.x - Math.sin(p.angle) * (p.d / 2 + 5), p.z - Math.cos(p.angle) * (p.d / 2 + 5)];
    const nearest = (q: Pt) => Math.min(...OSM.roads.filter((r) => r.cls === 'street' || r.cls === 'main').flatMap((r) => { const pts = ring(r.pts); return pts.slice(1).map((b, i) => segDist(q, pts[i], b) - r.w / 2); }));
    assert.ok(nearest(front) < nearest(back), `${p.id} faces away from its street`);
  }
});

test('simulation distances are geographic metres, independent of tabletop scale', () => {
  const [a, b] = osmMap.plots;
  assert.equal(sim.distance(a.id, b.id), Math.hypot(a.x - b.x, a.z - b.z));
  // The renderer's scale only affects drawing: the same plots under any scale give identical stats.
  const scaled = new Simulation(osmMap.plots.map((p) => ({ ...p }))); // simulation never sees baseScale/modelScale
  let s = { ...createInitialState(), money: 1e6 };
  for (const p of osmMap.plots.slice(0, 6)) s = (sim.place(s, p.id, p.number % 3 ? 'townhouse' : 'park') as { state: GameState }).state;
  assert.deepEqual(sim.stats(s), scaled.stats(s));
});

// ---- Chapters on the real map ---------------------------------------------------------------------

test('all three chapters are achievable on the real-map sites with legal, affordable actions', () => {
  // Exhaustive search over two upgraded parks and two shops; the five happiest remaining home sites are
  // upgraded (5 × 20 = 100 residents). Accept when the average happiness reaches 80 with both shops active.
  const ids = osmMap.plots.map((p) => p.id);
  const parks = ids.filter((i) => sim.fits(i, 'park')), shops = ids.filter((i) => sim.fits(i, 'shop'));
  let best = -1, plan: { id: string; t: BuildingType }[] | null = null;
  for (let i = 0; i < parks.length; i++) for (let j = i + 1; j < parks.length; j++) for (let a = 0; a < shops.length; a++) for (let b = a + 1; b < shops.length; b++) {
    const used = new Set([parks[i], parks[j], shops[a], shops[b]]);
    if (used.size < 4) continue;
    const homes = ids.filter((h) => !used.has(h) && sim.fits(h, 'townhouse'))
      .map((h) => ({ h, v: 50 + (sim.inRange(h, shops[a]) || sim.inRange(h, shops[b]) ? 10 : 0) + (sim.inRange(h, parks[i]) ? 15 : 0) + (sim.inRange(h, parks[j]) ? 15 : 0) }))
      .sort((x, y) => y.v - x.v).slice(0, 5);
    if (homes.length < 5 || !homes.some((x) => sim.inRange(x.h, shops[a])) || !homes.some((x) => sim.inRange(x.h, shops[b]))) continue;
    const avg = homes.reduce((t, x) => t + x.v, 0) / 5;
    if (avg > best) { best = avg; plan = [{ id: parks[i], t: 'park' }, { id: parks[j], t: 'park' }, { id: shops[a], t: 'shop' }, { id: shops[b], t: 'shop' }, ...homes.map((x) => ({ id: x.h, t: 'townhouse' as const }))]; }
  }
  assert.ok(plan && best >= 80, `best achievable average happiness ${best}`);

  let s = createInitialState();
  let ticks = 0;
  const afford = (cost: number) => { while (s.money < cost) { s = sim.tick(s); ticks++; assert.ok(ticks < 300); } };
  for (const { id, t } of plan!) {
    afford(BUILDINGS[t].cost);
    const before = s.money;
    const r = sim.place(s, id, t);
    assert.ok(r.ok, `place ${t} on ${id}`);
    if (r.ok) s = r.state;
    assert.equal(before - s.money, BUILDINGS[t].cost, 'charged exactly once');
  }
  for (const { id } of plan!.filter((x) => x.t !== 'shop')) {
    afford(BUILDINGS[s.buildings[id].type].upgradeCost);
    const r = sim.upgrade(s, id);
    assert.ok(r.ok);
    if (r.ok) s = r.state;
  }
  const st = sim.stats(s);
  assert.ok(st.residents >= 100 && (st.happiness ?? 0) >= 80 && st.activeShopCount >= 2, JSON.stringify({ r: st.residents, h: st.happiness, a: st.activeShopCount }));
  assert.equal(s.chapter, CHAPTER_COUNT, `chapters completed: ${s.chapter}`);
  console.log(`  real-map plan (avg ${best}): ${plan!.map((x) => x.t[0] + ':' + x.id).join(' ')}; waited ${ticks} ticks (${((ticks * 10) / 60).toFixed(1)} min)`);
});

test('every legacy plot maps to a distinct real-map site', () => {
  const m = OSM.legacyPlotMap;
  for (const p of LEGACY_PLOTS) assert.ok(sim.hasPlot(m[p.id]), `${p.id} → ${m[p.id]}`);
  assert.equal(new Set(Object.values(m)).size, LEGACY_PLOTS.length);
});

test('a Milestone 2 legacy save moves onto the real map with types, levels, money and chapters kept', () => {
  const v2 = {
    version: 2,
    state: {
      money: 4321,
      buildings: { p11: { type: 'park', level: 2 }, p8: { type: 'park', level: 1 }, p14: { type: 'shop', level: 1 }, p7: { type: 'townhouse', level: 2 }, p9: { type: 'townhouse', level: 1 } },
      lastAction: { kind: 'upgrade', plotId: 'p7', type: 'townhouse', cost: 1500 },
      chapter: 1,
      ticks: 33,
    },
    prefs: { reducedMotion: true, lowDetail: false },
  };
  const store = new MemoryStore();
  const raw = JSON.stringify(v2);
  store.setItem(SAVE_KEY, raw);
  const r = loadGame(store, ctx);
  assert.equal(r.status, 'loaded');
  if (r.status !== 'loaded') return;
  assert.equal(r.movedFromMap, 'legacy');
  assert.equal(r.state.money, 4321);
  assert.equal(r.state.ticks, 33);
  assert.ok(r.state.chapter >= 1, 'completed chapters are never lost');
  // Same buildings (type + level), each on a distinct site it fits; undo history follows the upgraded home.
  const sig = (bs: Record<string, { type: string; level: number }>) => Object.values(bs).map((b) => b.type + b.level).sort();
  assert.deepEqual(sig(r.state.buildings), sig(v2.state.buildings as Record<string, { type: string; level: number }>));
  for (const [id, b] of Object.entries(r.state.buildings)) assert.ok(sim.fits(id, b.type), `${b.type} on ${id} fits`);
  assert.equal(r.state.lastAction?.kind, 'upgrade');
  assert.deepEqual(r.state.buildings[r.state.lastAction!.plotId], { type: 'townhouse', level: 2 });
  assert.deepEqual(r.prefs, { reducedMotion: true, lowDetail: false, showSites: true });
  assert.equal(store.getItem(BACKUP_KEY), raw, 'original kept as a recoverable backup');
});

test('a v1 save also migrates (Milestone 1 → real map)', () => {
  const store = new MemoryStore();
  store.setItem(SAVE_KEY, JSON.stringify({ version: 1, state: { money: 100, buildings: { p1: 'townhouse', p20: 'park' }, lastPlacement: null, objectiveReached: true, ticks: 5 } }));
  const r = loadGame(store, ctx);
  assert.equal(r.status, 'loaded');
  assert.equal(r.state.chapter, 1);
  assert.equal(Object.values(r.state.buildings).filter((b) => b.type === 'townhouse').length, 1);
  assert.equal(Object.values(r.state.buildings).filter((b) => b.type === 'park').length, 1);
});

test('if a placement cannot be migrated: backup kept, player asked, nothing overwritten or reset silently', () => {
  const store = new MemoryStore();
  const raw = JSON.stringify({ version: 2, state: { money: 5000, buildings: { p1: { type: 'townhouse', level: 1 }, p2: { type: 'shop', level: 2 } }, lastAction: null, chapter: 1, ticks: 0 } });
  store.setItem(SAVE_KEY, raw);
  // No site on this map accepts a shop, so the saved shop has nowhere to go.
  const brokenMap = { ...osmMap, plots: osmMap.plots.map((p) => ({ ...p, allowed: ['townhouse', 'park'] as BuildingType[] })) };
  const g = new Game(brokenMap, store, () => 0);
  assert.ok(g.pendingChoice, 'the player is asked what to do');
  assert.equal(store.getItem(BACKUP_KEY), raw);
  g.update(30); // ticks must not overwrite the undecided save
  g.select('townhouse');
  g.place(osmMap.plots[0].id);
  assert.equal(store.getItem(SAVE_KEY), raw, 'original save untouched until the player decides');
  g.startNewMapFromChoice();
  assert.notEqual(store.getItem(SAVE_KEY), raw);
  assert.equal(store.getItem(BACKUP_KEY), raw, 'backup still available after starting fresh');
  assert.equal(JSON.parse(store.getItem(SAVE_KEY)!).map.id, 'chelsea-osm');
});

test('real-map saves round-trip with their map id and version', () => {
  const store = new MemoryStore();
  const g = new Game(osmMap, store, () => 0);
  g.select('park');
  assert.ok(g.place(osmMap.plots[3].id));
  const saved = JSON.parse(store.getItem(SAVE_KEY)!);
  assert.deepEqual(saved.map, { id: 'chelsea-osm', version: 2 });
  const g2 = new Game(osmMap, store, () => 0);
  assert.deepEqual(g2.state.buildings, g.state.buildings);
});

// ---- No live map requests -------------------------------------------------------------------------

test('the app source makes no network requests for map data', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(p)) files.push(p); } };
  walk('src');
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\bfetch\(|XMLHttpRequest|overpass|tile\.openstreetmap|api\.openstreetmap/i.test(src), f);
  }
});

// ---- Peter Jones landmark -------------------------------------------------------------------------

test('Peter Jones has a stable protected landmark id and its generic extrusion is replaced', () => {
  const b = OSM.buildings.find((x) => x.id === 'w28682626') as (typeof OSM.buildings)[number] & { custom?: string; landmarkId?: string };
  assert.ok(b, 'OSM way 28682626 present');
  assert.equal(b.custom, 'peter-jones');
  assert.equal(b.landmarkId, 'landmark:peter-jones');
  assert.equal(b.protected, true);
  assert.equal(OSM.buildings.find((x) => x.id === 'w1186000571')?.protected, true, '25 Cadogan Gardens (listed as part of the store) is protected');
  const m = OSM.landmarkModels.find((x) => x.id === 'landmark:peter-jones');
  assert.ok(m);
});

test('no development plot touches the Peter Jones footprint', () => {
  const pj = ring(OSM.buildings.find((x) => x.id === 'w28682626')!.rings[0]);
  const annex = ring(OSM.buildings.find((x) => x.id === 'w1186000571')!.rings[0]);
  for (const p of osmMap.plots) {
    assert.ok(!overlap(rect(p), pj), `${p.id} overlaps Peter Jones`);
    assert.ok(!overlap(rect(p), annex), `${p.id} overlaps 25 Cadogan Gardens`);
    assert.ok(!OSM.plots.find((q) => q.id === p.id)!.replaces.includes('w28682626'));
  }
});

test("the modelled frontage runs along King's Road, round the corner, to Sloane Square", () => {
  const m = OSM.landmarkModels[0];
  const f = ring(m.facade);
  const near = (pt: Pt, name: string) => Math.min(...OSM.roads.filter((r) => r.name === name && r.cls === 'main').flatMap((r) => { const q = ring(r.pts); return q.slice(1).map((b, i) => segDist(pt, q[i], b)); }));
  assert.ok(near(f[0], "King's Road") < 16, 'starts on King\'s Road');
  assert.ok(near(f[f.length - 1], 'Sloane Square') < 16, 'ends on Sloane Square');
  let len = 0;
  for (let i = 1; i < f.length; i++) len += Math.hypot(f[i][0] - f[i - 1][0], f[i][1] - f[i - 1][1]);
  assert.ok(len > 100 && len < 140, `frontage ${len.toFixed(1)} m`);
  // Corner smoothing keeps the frontage on the OSM outline (within 15 cm; measured max ≈ 9 cm).
  const outline = ring(m.ring);
  for (const p of f) assert.ok(Math.min(...outline.map((q, i) => segDist(p, q, outline[(i + 1) % outline.length]))) < 0.15);
});

test('Peter Jones canopy and slab overhang the pavement without entering another building', () => {
  const m = OSM.landmarkModels[0];
  const f = ring(m.facade);
  const others = OSM.buildings.filter((b) => b.id !== 'w28682626').map((b) => ring(b.rings[0]));
  for (let i = 0; i + 1 < f.length; i++) {
    const a = f[i], b = f[i + 1];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n: Pt = [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; // outward = left of travel
    const mid: Pt = [(a[0] + b[0]) / 2 + n[0] * 2.3, (a[1] + b[1]) / 2 + n[1] * 2.3];
    assert.ok(!inPoly(mid, ring(m.ring)), 'outward normal points out of the building');
    for (const o of others) assert.ok(!inPoly(mid, o), `canopy edge at segment ${i} would enter another building`);
  }
});
