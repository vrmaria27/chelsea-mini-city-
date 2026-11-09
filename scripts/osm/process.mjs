// Step 2 of the map import: turn the raw OSM extract into the compact, bundled game map.
// Usage: node scripts/osm/process.mjs [data/osm/raw.json] [src/map/osm/chelsea-osm.json]
// Deterministic: the same raw extract always produces the same output.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  Grid, clipPolyline, clipRing, makeProjection, pointInPolygon, polySegDist, polygonsOverlap, ringArea, round1,
  simplify, simplifyRing, triangulate, trisArea,
} from './geo.mjs';

const inFile = process.argv[2] ?? 'data/osm/raw.json';
const outFile = process.argv[3] ?? 'src/map/osm/chelsea-osm.json';

// ---- Map definition -------------------------------------------------------------------------
export const MAP_ID = 'chelsea-osm';
export const MAP_VERSION = 1;
const CENTRE = { lat: 51.4912, lon: -0.16 }; // between Duke of York Square and King's Road west
const HALF = 350; // metres: a 700 m × 700 m square
const BOX = { x0: -HALF, z0: -HALF, x1: HALF, z1: HALF };

/** Documented width estimates (metres, kerb to kerb) when OSM has no width tag. */
export const ROAD_WIDTHS = {
  trunk: 14, primary: 12, secondary: 11, tertiary: 9, unclassified: 7.5, residential: 7, living_street: 6,
  service: 4.5, pedestrian: 6, footway: 2.2, path: 2, cycleway: 2.5, steps: 2.5, track: 3,
};
const ROAD_CLASS = {
  trunk: 'main', primary: 'main', secondary: 'main', tertiary: 'street', unclassified: 'street', residential: 'street',
  living_street: 'street', service: 'service', pedestrian: 'pedestrian', footway: 'path', path: 'path', cycleway: 'path', steps: 'path',
};
const LEVEL_H = 3.2;

// ---- Load & project -------------------------------------------------------------------------
const raw = JSON.parse(readFileSync(inFile, 'utf8'));
const proj = makeProjection(CENTRE.lat, CENTRE.lon);
const P = (g) => proj.toXZ(g.lat, g.lon);
const corners = [proj.toLatLon(-HALF, HALF), proj.toLatLon(HALF, -HALF)];
const bboxLatLon = { south: +corners[0][0].toFixed(6), west: +corners[0][1].toFixed(6), north: +corners[1][0].toFixed(6), east: +corners[1][1].toFixed(6) };

const ways = raw.elements.filter((e) => e.type === 'way' && e.geometry);
const rels = raw.elements.filter((e) => e.type === 'relation');
const report = { warnings: [] };

// Junction detection. Overpass `out geom` omits node ids, but a shared OSM node always has
// identical coordinates in every way that uses it, so the exact lat/lon pair identifies it.
const nodeKey = (g) => `${g.lat},${g.lon}`;
const nodeUse = new Map();
for (const w of ways) if (w.tags?.highway) for (const g of w.geometry) nodeUse.set(nodeKey(g), (nodeUse.get(nodeKey(g)) ?? 0) + 1);
const isJunction = (n) => n !== undefined && n !== null && (nodeUse.get(n) ?? 0) > 1;

// ---- Roads ----------------------------------------------------------------------------------
const roads = [];
let junctionNodes = 0;
for (const w of ways) {
  const t = w.tags;
  const hw = t.highway;
  if (!hw || !(hw in ROAD_CLASS) || t.area === 'yes') continue;
  if (hw === 'footway' && (t.footway === 'crossing' || t.footway === 'access_aisle')) continue;
  if (hw === 'service' && (t.service === 'parking_aisle' || t.access === 'private')) continue;
  const pts = w.geometry.map((g) => [...P(g), nodeKey(g)]);
  const width = parseFloat(t.width) > 0 && parseFloat(t.width) < 40 ? parseFloat(t.width) : ROAD_WIDTHS[hw];
  for (const part of clipPolyline(pts, BOX)) {
    const simp = simplify(part, hw === 'footway' ? 0.8 : 0.5, (p) => isJunction(p[2]));
    junctionNodes += simp.filter((p) => isJunction(p[2])).length;
    roads.push({
      id: w.id,
      name: t.name ?? null,
      hw,
      cls: ROAD_CLASS[hw],
      w: width,
      widthSource: parseFloat(t.width) > 0 ? 'osm' : 'estimate',
      sidewalk: hw === 'footway' && t.footway === 'sidewalk',
      pts: simp.flatMap((p) => [round1(p[0]), round1(p[1])]),
      nodes: simp.map((p) => p[2] ?? null),
    });
  }
}

// ---- Areas: pedestrian areas, squares, green spaces -----------------------------------------
const areas = [];
const ringsOf = (e) => {
  if (e.type === 'way') return { outer: [e.geometry.map(P)], inner: [] };
  const outer = [], inner = [];
  for (const m of e.members ?? []) if (m.type === 'way' && m.geometry) (m.role === 'inner' ? inner : outer).push(m.geometry.map(P));
  return { outer: joinRings(outer), inner: joinRings(inner) };
};
/** Joins multipolygon member ways into closed rings. */
function joinRings(parts) {
  const rings = [];
  const pool = parts.map((p) => p.slice());
  while (pool.length) {
    let r = pool.shift();
    let guard = 0;
    while ((r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) && guard++ < 500) {
      const end = r[r.length - 1];
      const i = pool.findIndex((p) => (p[0][0] === end[0] && p[0][1] === end[1]) || (p[p.length - 1][0] === end[0] && p[p.length - 1][1] === end[1]));
      if (i < 0) break;
      const nxt = pool.splice(i, 1)[0];
      r = r.concat(nxt[0][0] === end[0] && nxt[0][1] === end[1] ? nxt.slice(1) : nxt.reverse().slice(1));
    }
    rings.push(r);
  }
  return rings;
}
const openRing = (r) => (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r);
const clippedRings = (rs, tol) => rs.map((r) => simplifyRing(clipRing(openRing(r), BOX), tol)).filter((r) => r.length >= 3 && Math.abs(ringArea(r)) > 1);

function areaKind(t) {
  if (t.leisure === 'park' || t.leisure === 'garden' || t.leisure === 'common' || ['grass', 'village_green', 'recreation_ground'].includes(t.landuse)) return 'green';
  if (t.leisure === 'pitch' || t.leisure === 'playground') return 'green';
  if (t.place === 'square' || (t.highway === 'pedestrian' && t.area === 'yes') || t['area:highway'] === 'pedestrian' || t['area:highway'] === 'footway' || t.amenity === 'marketplace') return 'plaza';
  if (t['area:highway']) return 'carriageway';
  if (t.amenity === 'parking') return 'parking';
  return null;
}
for (const e of [...ways, ...rels]) {
  const t = e.tags ?? {};
  if (t.building) continue;
  const kind = areaKind(t);
  if (!kind) continue;
  if (e.type === 'way' && (e.geometry.length < 4 || e.nodes?.[0] !== e.nodes?.[e.nodes.length - 1])) continue;
  const { outer, inner } = ringsOf(e);
  const outs = clippedRings(outer, 0.4);
  const ins = clippedRings(inner, 0.4);
  for (const o of outs) {
    const holes = ins.filter((h) => pointInPolygon(h[0], o));
    const tris = triangulate(o, holes);
    const a = Math.abs(ringArea(o)) - holes.reduce((n, h) => n + Math.abs(ringArea(h)), 0);
    if (Math.abs(trisArea(tris) - a) > 0.03 * a + 1) report.warnings.push(`area ${e.type}/${e.id} triangulation mismatch`);
    areas.push({ id: `${e.type[0]}${e.id}`, kind, name: t.name ?? null, ring: o.flatMap((p) => [round1(p[0]), round1(p[1])]), tris: tris.map(round1) });
  }
}

// ---- Buildings ------------------------------------------------------------------------------
const buildings = [];
let heightFromOsm = 0, heightFromLevels = 0, heightEstimated = 0, triFail = 0;
function buildingHeight(t, id) {
  const h = parseFloat(t.height);
  if (h > 2 && h < 200) { heightFromOsm++; return { h, src: 'height' }; }
  const lv = parseFloat(t['building:levels']);
  const roof = parseFloat(t['roof:levels']) || 0;
  if (lv > 0 && lv < 60) { heightFromLevels++; return { h: (lv + roof * 0.6) * LEVEL_H + 1, src: 'levels' }; }
  heightEstimated++;
  // Deterministic estimate: typical Chelsea terrace 4 storeys; small outbuildings 1–2 storeys.
  const type = t.building;
  if (['garage', 'garages', 'shed', 'kiosk', 'roof', 'hut'].includes(type)) return { h: 3.5, src: 'estimate' };
  if (['church', 'chapel'].includes(type)) return { h: 18, src: 'estimate' };
  return { h: (3 + (id % 3)) * LEVEL_H + 1, src: 'estimate' }; // 3–5 storeys, from the OSM id
}
const PROTECTED_TAGS = (t) => !!(t.name && (t.building === 'church' || t.building === 'school' || t.building === 'retail' || t.tourism || t.amenity || t.historic)) || ['church', 'chapel', 'cathedral', 'train_station', 'transportation'].includes(t.building) || /Theatre|Gallery|Church|Hall|Station/.test(t.name ?? '');
for (const e of [...ways, ...rels]) {
  const t = e.tags ?? {};
  if (!t.building || t.building === 'no' || t['building:part']) continue;
  if (t.location === 'underground' || t.layer < 0) continue;
  if (e.type === 'relation' && t.type !== 'multipolygon') continue;
  const { outer, inner } = ringsOf(e);
  const outs = clippedRings(outer, 0.3);
  const ins = clippedRings(inner, 0.3);
  const { h, src } = buildingHeight(t, e.id);
  for (const o of outs) {
    const holes = ins.filter((hh) => pointInPolygon(hh[0], o));
    const tris = triangulate(o, holes);
    const a = Math.abs(ringArea(o)) - holes.reduce((n, hh) => n + Math.abs(ringArea(hh)), 0);
    if (Math.abs(trisArea(tris) - a) > 0.03 * a + 0.5) {
      triFail++;
      report.warnings.push(`building ${e.type}/${e.id} triangulation mismatch (${trisArea(tris).toFixed(1)} vs ${a.toFixed(1)})`);
    }
    buildings.push({
      id: `${e.type[0]}${e.id}`,
      osmId: e.id,
      h: Math.round(h * 10) / 10,
      hSrc: src,
      type: t.building,
      name: t.name ?? null,
      protected: PROTECTED_TAGS(t),
      rings: [o, ...holes].map((r) => r.flatMap((p) => [round1(p[0]), round1(p[1])])),
      tris: tris.map(round1),
      area: Math.round(a),
    });
  }
}

// ---- Landmarks (point labels) ---------------------------------------------------------------
const LANDMARKS = [
  ['Sloane Square station', (e) => e.tags?.railway === 'station' && e.tags.name === 'Sloane Square'],
  ['Royal Court Theatre', (e) => e.tags?.name === 'Royal Court Theatre'],
  ['Peter Jones', (e) => e.tags?.name === 'Peter Jones'],
  ['Saatchi Gallery', (e) => e.tags?.name === 'Saatchi Gallery'],
  ['Duke of York Square', (e) => e.tags?.name === 'Duke of York Square' && e.tags.place === 'square'],
  ['Holy Trinity Church', (e) => e.tags?.name === 'Holy Trinity Church'],
  ['Cadogan Hall', (e) => e.tags?.name === 'Cadogan Hall'],
  ['Venus Fountain', (e) => e.tags?.name === 'Venus Fountain'],
  ['Markham Square Gardens', (e) => e.tags?.name === 'Markham Square Gardens'],
  ['Wellington Square', (e) => e.tags?.name === 'Wellington Square' && e.tags.leisure],
  ['Royal Avenue', (e) => e.tags?.name === 'Royal Avenue' && e.tags.leisure],
  ['Burton Court', (e) => e.tags?.name === 'Burton Court' && e.tags.leisure],
];
function centroidOf(e) {
  if (e.type === 'node') return P(e);
  const pts = e.geometry ?? (e.members ?? []).filter((m) => m.role === 'outer').flatMap((m) => m.geometry ?? []);
  const xz = pts.map(P);
  // area-weighted centroid for closed rings, else mean
  const ring = openRing(xz);
  const A = ringArea(ring);
  if (Math.abs(A) > 1) {
    let cx = 0, cz = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      cx += (ring[j][0] + ring[i][0]) * f;
      cz += (ring[j][1] + ring[i][1]) * f;
    }
    return [cx / (6 * A), cz / (6 * A)];
  }
  return [xz.reduce((n, p) => n + p[0], 0) / xz.length, xz.reduce((n, p) => n + p[1], 0) / xz.length];
}
const landmarks = [];
for (const [name, match] of LANDMARKS) {
  const e = raw.elements.find(match);
  if (!e) { report.warnings.push(`landmark not found: ${name}`); continue; }
  const [x, z] = centroidOf(e);
  if (Math.abs(x) > HALF || Math.abs(z) > HALF) { report.warnings.push(`landmark outside map: ${name}`); continue; }
  const lat = e.lat ?? null;
  landmarks.push({ name, x: round1(x), z: round1(z), osm: `${e.type}/${e.id}`, lat: lat ?? +proj.toLatLon(x, z)[0].toFixed(6), lon: e.lon ?? +proj.toLatLon(x, z)[1].toFixed(6) });
}

// ---- Street labels --------------------------------------------------------------------------
// One label per named street per ~220 m of length, placed on its longest straight-ish stretch.
const labels = [];
const byName = new Map();
for (const r of roads) {
  if (!r.name || r.cls === 'path' || r.cls === 'service') continue;
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}
for (const [name, rs] of byName) {
  const segs = [];
  for (const r of rs) for (let i = 0; i + 3 < r.pts.length; i += 2) {
    const ax = r.pts[i], az = r.pts[i + 1], bx = r.pts[i + 2], bz = r.pts[i + 3];
    segs.push({ ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az), cls: r.cls });
  }
  const total = segs.reduce((n, s) => n + s.len, 0);
  if (total < 45) continue;
  const n = Math.max(1, Math.round(total / 220));
  const cls = rs.some((r) => r.cls === 'main') ? 'main' : rs.some((r) => r.cls === 'pedestrian') ? 'pedestrian' : 'street';
  const chosen = [];
  for (const s of [...segs].sort((a, b) => b.len - a.len)) {
    if (chosen.length >= n || s.len < 18) break;
    const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    if (chosen.some((c) => Math.hypot(c.x - mx, c.z - mz) < 120)) continue;
    let angle = Math.atan2(-(s.bz - s.az), s.bx - s.ax); // rotation about Y that maps +x onto the segment
    // keep text upright for a viewer in the south (reads left-to-right / bottom-to-top)
    if (angle > Math.PI / 2 + 0.01) angle -= Math.PI;
    if (angle < -Math.PI / 2 + 0.01) angle += Math.PI;
    chosen.push({ x: mx, z: mz, angle, maxLen: s.len });
  }
  for (const c of chosen) labels.push({ text: name, x: round1(c.x), z: round1(c.z), angle: +c.angle.toFixed(4), maxLen: round1(c.maxLen), cls });
}

// ---- Development plots ----------------------------------------------------------------------
// Fictional redevelopment sites fitted to real frontages. A candidate is a rectangle beside a
// street, facing it, clear of every road/footpath buffer, green space, plaza and protected
// landmark. Decorative footprints it covers are listed in `replaces` and hidden in game.
const PLOT_W = 20, PLOT_D = 16, SETBACK = 3; // metres
const roadGrid = new Grid(30);
roads.forEach((r, ri) => {
  for (let i = 0; i + 3 < r.pts.length; i += 2) {
    const s = { a: [r.pts[i], r.pts[i + 1]], b: [r.pts[i + 2], r.pts[i + 3]], half: r.w / 2, ri };
    roadGrid.insert(s, Math.min(s.a[0], s.b[0]) - 10, Math.min(s.a[1], s.b[1]) - 10, Math.max(s.a[0], s.b[0]) + 10, Math.max(s.a[1], s.b[1]) + 10);
  }
});
const bGrid = new Grid(30);
buildings.forEach((b) => {
  const r = b.rings[0];
  const xs = r.filter((_, i) => i % 2 === 0), zs = r.filter((_, i) => i % 2 === 1);
  b.poly = []; for (let i = 0; i < r.length; i += 2) b.poly.push([r[i], r[i + 1]]);
  bGrid.insert(b, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
});
const blocked = areas.filter((a) => a.kind !== 'parking').map((a) => { const p = []; for (let i = 0; i < a.ring.length; i += 2) p.push([a.ring[i], a.ring[i + 1]]); return p; });

function rectPoly(cx, cz, angle, w, d) {
  // local x along frontage, local z toward the street (front)
  const c = Math.cos(angle), s = Math.sin(angle);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
}

const candidates = [];
for (const r of roads) {
  if (!['street', 'main'].includes(r.cls)) continue;
  for (let i = 0; i + 3 < r.pts.length; i += 2) {
    const ax = r.pts[i], az = r.pts[i + 1], bx = r.pts[i + 2], bz = r.pts[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < PLOT_W) continue;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let t = PLOT_W / 2; t <= len - PLOT_W / 2; t += 5) {
      const px = ax + ux * t, pz = az + uz * t;
      for (const side of [1, -1]) {
        const nx = -uz * side, nz = ux * side; // unit normal away from the road
        const off = r.w / 2 + SETBACK + PLOT_D / 2;
        const cx = px + nx * off, cz = pz + nz * off;
        // front (local +z) faces the street: direction (-nx, -nz) = (sin a, cos a)
        const angle = Math.atan2(-nx, -nz);
        candidates.push({ cx, cz, angle, road: r, poly: rectPoly(cx, cz, angle, PLOT_W, PLOT_D) });
      }
    }
  }
}
function validCandidate(c) {
  const xs = c.poly.map((p) => p[0]), zs = c.poly.map((p) => p[1]);
  const [mnx, mnz, mxx, mxz] = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
  if (mnx < -HALF + 8 || mxx > HALF - 8 || mnz < -HALF + 8 || mxz > HALF - 8) return false;
  for (const s of roadGrid.query(mnx, mnz, mxx, mxz)) if (polySegDist(c.poly, s.a, s.b) < s.half + 0.8) return false;
  for (const b of blocked) if (polygonsOverlap(c.poly, b)) return false;
  const hits = bGrid.query(mnx, mnz, mxx, mxz).filter((b) => polygonsOverlap(c.poly, b.poly));
  if (hits.some((b) => b.protected || b.area > 1400)) return false;
  const covered = hits.reduce((n, b) => n + b.area, 0);
  if (covered > PLOT_W * PLOT_D * 3) return false;
  c.replaces = hits.map((b) => b.id);
  return true;
}
const valid = candidates.filter(validCandidate);
if (process.env.DUMP_CANDIDATES) writeFileSync(process.env.DUMP_CANDIDATES, JSON.stringify(valid.map((c) => [round1(c.cx), round1(c.cz)])));

// Four neighbourhood clusters seeded at real places; plots are the nearest valid,
// non-overlapping candidates. Cluster sizes mirror the legacy map (6 / 9 / 5) so old saves map 1:1.
// Seeds are in map metres (x east, z south of the centre), chosen on real streets after
// inspecting the extract (see the debug plot in README "Map data").
const CLUSTERS = [
  { key: 'blacklands', label: 'Blacklands Terrace & Bray Place', size: 6, seed: [-95, -35], legacy: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'] },
  { key: 'cadogan', label: 'Cadogan Gardens', size: 9, seed: [-25, -280], legacy: ['p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14', 'p15'] },
  { key: 'kingsroad', label: "King's Road & Royal Avenue", size: 5, seed: [-140, 115], legacy: ['p16', 'p17', 'p18', 'p19', 'p20'] },
];
const plots = [];
const plotPolys = [];
const free = (c) => !plotPolys.some((p) => polygonsOverlap(c.poly, p) || p.some((q) => Math.min(...c.poly.map((r) => Math.hypot(r[0] - q[0], r[1] - q[1]))) < 3));
for (const cl of CLUSTERS) {
  const [sx, sz] = cl.seed;
  const pool = valid
    .map((c) => ({ c, d: Math.hypot(c.cx - sx, c.cz - sz) }))
    .filter((x) => x.d < 95)
    .sort((a, b) => a.d - b.d || a.c.cx - b.c.cx);
  const picked = [];
  for (const { c } of pool) {
    if (picked.length >= cl.size) break;
    if (!free(c)) continue;
    // keep the cluster compact: every plot within 140 m of the others
    if (picked.some((p) => Math.hypot(p.cx - c.cx, p.cz - c.cz) > 140)) continue;
    picked.push(c);
    plotPolys.push(c.poly);
  }
  if (picked.length < cl.size) report.warnings.push(`cluster ${cl.key}: only ${picked.length}/${cl.size} plots`);
  cl.picked = picked;
}
// Number plots west→east within clusters for readability; ids are stable "g1".."g20".
let n = 0;
const legacyPlotMap = {};
for (const cl of CLUSTERS) {
  const cx = cl.picked.reduce((s, p) => s + p.cx, 0) / cl.picked.length, cz = cl.picked.reduce((s, p) => s + p.cz, 0) / cl.picked.length;
  const sorted = [...cl.picked].sort((a, b) => Math.hypot(a.cx - cx, a.cz - cz) - Math.hypot(b.cx - cx, b.cz - cz));
  cl.ordered = sorted;
  for (const c of [...cl.picked].sort((a, b) => a.cz - b.cz || a.cx - b.cx)) {
    n++;
    c.id = `g${n}`;
    plots.push({
      id: c.id, number: n, x: round1(c.cx), z: round1(c.cz), w: PLOT_W, d: PLOT_D, angle: +c.angle.toFixed(4),
      area: cl.label, street: c.road.name ?? null, replaces: c.replaces,
    });
  }
}
// Legacy mapping: the legacy cluster centre (p4 / p11 / p18 — the plot nearest the others) maps
// to the new plot nearest the new cluster centre, and so on outward, by legacy distance rank.
const LEGACY_POS = {
  p1: [-95, -150], p2: [-55, -150], p3: [-95, -110], p4: [-55, -110], p5: [-95, -70], p6: [-55, -70],
  p7: [-5, -150], p8: [35, -150], p9: [75, -150], p10: [-5, -105], p11: [35, -105], p12: [75, -105], p13: [-5, -60], p14: [35, -60], p15: [75, -60],
  p16: [-55, 25], p17: [5, 25], p18: [-55, 70], p19: [5, 70], p20: [-55, 115],
};
for (const cl of CLUSTERS) {
  const lc = cl.legacy.map((id) => LEGACY_POS[id]);
  const mx = lc.reduce((s, p) => s + p[0], 0) / lc.length, mz = lc.reduce((s, p) => s + p[1], 0) / lc.length;
  const legacyRanked = [...cl.legacy].sort((a, b) => Math.hypot(LEGACY_POS[a][0] - mx, LEGACY_POS[a][1] - mz) - Math.hypot(LEGACY_POS[b][0] - mx, LEGACY_POS[b][1] - mz) || a.localeCompare(b, 'en', { numeric: true }));
  legacyRanked.forEach((old, i) => { if (cl.ordered[i]) legacyPlotMap[old] = cl.ordered[i].id; });
}

// ---- Decorative life paths ------------------------------------------------------------------
// Pedestrians: OSM sidewalks and footways near the clusters (they already avoid buildings).
// Vehicles: King's Road, Sloane Street, Lower Sloane Street and Sloane Square carriageways.
const walkPaths = roads
  .filter((r) => (r.cls === 'path' && r.hw !== 'steps') || r.cls === 'pedestrian')
  .map((r) => r.pts)
  .filter((p) => {
    let len = 0;
    for (let i = 0; i + 3 < p.length; i += 2) len += Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
    return len > 40;
  });
const driveNames = new Set(["King's Road", 'Sloane Street', 'Lower Sloane Street', 'Sloane Square', 'Cheltenham Terrace', 'Royal Avenue']);
// OSM splits streets into many short ways; chain same-named ways end-to-end into continuous routes.
function chain(parts) {
  const pool = parts.map((p) => { const o = []; for (let i = 0; i < p.length; i += 2) o.push([p[i], p[i + 1]]); return o; });
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.6;
  const out = [];
  while (pool.length) {
    let cur = pool.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i++) {
        const q = pool[i];
        if (near(cur[cur.length - 1], q[0])) cur = cur.concat(q.slice(1));
        else if (near(cur[cur.length - 1], q[q.length - 1])) cur = cur.concat(q.slice(0, -1).reverse());
        else if (near(cur[0], q[q.length - 1])) cur = q.concat(cur.slice(1));
        else if (near(cur[0], q[0])) cur = q.slice().reverse().concat(cur.slice(1));
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    out.push(cur.flat());
  }
  return out;
}
const drivePaths = [];
for (const name of driveNames) {
  const parts = roads.filter((r) => r.name === name && ['main', 'street'].includes(r.cls)).map((r) => r.pts);
  for (const pts of chain(parts)) drivePaths.push({ name, w: roads.find((r) => r.name === name).w, pts });
}
drivePaths.sort((a, b) => b.pts.length - a.pts.length);

// ---- Validation -----------------------------------------------------------------------------
const named = (name) => roads.filter((r) => r.name === name);
const expectJoin = (a, b) => {
  const nodesA = new Set(named(a).flatMap((r) => r.nodes.filter((x) => x)));
  return named(b).some((r) => r.nodes.some((x) => x && nodesA.has(x)));
};
const checks = {
  "King's Road meets Sloane Square": expectJoin("King's Road", 'Sloane Square'),
  'Lower Sloane Street meets Sloane Square': expectJoin('Lower Sloane Street', 'Sloane Square'),
  "Cheltenham Terrace meets King's Road": expectJoin('Cheltenham Terrace', "King's Road"),
  "Blacklands Terrace meets King's Road": expectJoin('Blacklands Terrace', "King's Road"),
  'Turks Row meets Lower Sloane Street': expectJoin('Turks Row', 'Lower Sloane Street'),
};
const lm = Object.fromEntries(landmarks.map((l) => [l.name, l]));
const orient = {
  'Sloane Square station is east of Peter Jones': lm['Sloane Square station']?.x > lm['Peter Jones']?.x,
  'Saatchi Gallery is south of King\'s Road / Duke of York Square': lm['Saatchi Gallery']?.z > lm['Duke of York Square']?.z,
  'Holy Trinity Church is north of Sloane Square station': lm['Holy Trinity Church']?.z < lm['Sloane Square station']?.z,
  'Burton Court is the southernmost landmark': landmarks.every((l) => l.z <= lm['Burton Court']?.z),
  'Royal Avenue is west of the Saatchi Gallery': lm['Royal Avenue']?.x < lm['Saatchi Gallery']?.x,
};
// Plot clearances (independent re-check)
let plotRoadViolations = 0, plotOverlap = 0;
for (const p of plots) {
  const poly = rectPoly(p.x, p.z, p.angle, p.w, p.d);
  for (const r of roads) for (let i = 0; i + 3 < r.pts.length; i += 2) if (polySegDist(poly, [r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]) < r.w / 2) plotRoadViolations++;
  for (const q of plots) if (q !== p && polygonsOverlap(poly, rectPoly(q.x, q.z, q.angle, q.w, q.d))) plotOverlap++;
}

const stats = {
  roads: roads.length, roadsWithOsmWidth: roads.filter((r) => r.widthSource === 'osm').length, junctionVertices: junctionNodes,
  areas: areas.length, buildings: buildings.length, heightFromOsm, heightFromLevels, heightEstimated, triangulationWarnings: triFail,
  landmarks: landmarks.length, labels: labels.length, plotCandidates: candidates.length, validCandidates: valid.length, plots: plots.length,
  hiddenFootprints: new Set(plots.flatMap((p) => p.replaces)).size, plotRoadViolations, plotOverlap,
};

const out = {
  meta: {
    mapId: MAP_ID,
    mapVersion: MAP_VERSION,
    title: 'Chelsea: King\'s Road, Duke of York Square & Sloane Square',
    source: raw.source,
    endpoint: raw.endpoint,
    licence: 'Open Database License (ODbL) 1.0',
    attribution: '© OpenStreetMap contributors',
    copyrightUrl: 'https://www.openstreetmap.org/copyright',
    retrieved: raw.retrieved,
    osmBase: raw.osm_base,
    extractBbox: raw.bbox,
    centre: CENTRE,
    half: HALF,
    bbox: bboxLatLon,
    projection: 'Local equirectangular about the centre (x east, z south, metres); scale error < 0.01% over the map.',
    roadWidths: 'OSM width tag where present, otherwise estimates by class (see ROAD_WIDTHS in scripts/osm/process.mjs).',
    buildingHeights: `height tag, else building:levels × ${LEVEL_H} m + 1 m, else a deterministic 3–5 storey estimate from the OSM id.`,
    importCommand: 'node scripts/osm/fetch.mjs && node scripts/osm/process.mjs',
    stats,
    checks,
    orientation: orient,
  },
  roads: roads.map(({ nodes, ...r }) => r),
  areas,
  buildings: buildings.map(({ poly, osmId, area, ...b }) => b),
  landmarks,
  labels,
  plots,
  legacyPlotMap,
  walkPaths,
  drivePaths,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(out));
console.log(JSON.stringify({ stats, checks, orientation: orient, legacyPlotMap, warnings: report.warnings.slice(0, 15), warningCount: report.warnings.length }, null, 1));
console.log(`Wrote ${outFile} (${(JSON.stringify(out).length / 1024).toFixed(0)} KiB)`);
