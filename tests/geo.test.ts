// Geographic integrity of the bundled OpenStreetMap extract (kept from the city-builder; no gameplay).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OSM } from '../src/map/osmMap';

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

type Pt = [number, number];
const inPoly = (p: Pt, poly: Pt[]) => {
  let r = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) r = !r;
  }
  return r;
};
const segDist = (p: Pt, a: Pt, b: Pt) => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const ring = (flat: number[]): Pt[] => { const o: Pt[] = []; for (let i = 0; i < flat.length; i += 2) o.push([flat[i], flat[i + 1]]); return o; };

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

test('the app source makes no network requests for map data', () => {
  const files: string[] = [];
  const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.ts$/.test(p)) files.push(p); } };
  walk('src');
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.ok(!/\bfetch\(|XMLHttpRequest|overpass|tile\.openstreetmap|api\.openstreetmap/i.test(src), f);
  }
});

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

