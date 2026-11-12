// Step 2 of the map import: turn the raw OSM extract into the compact, bundled game map.
// Usage: node scripts/osm/process.mjs [data/osm/raw.json] [src/map/osm/chelsea-osm.json]
// Deterministic: the same raw extract always produces the same output.
import { Corridor, chainLine } from './corridor.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  Grid, clipPolyline, clipRing, makeProjection, pointInPolygon, polySegDist, polygonsOverlap, ringArea, round1,
  simplify, simplifyRing, triangulate, trisArea,
} from './geo.mjs';

const positional = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const inFile = positional[0] ?? 'data/osm/raw.json';
const outFile = positional[1] ?? 'src/map/osm/chelsea-osm.json';

// ---- Map definition -------------------------------------------------------------------------
export const MAP_ID = 'chelsea-osm';
export const MAP_VERSION = 2;
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
// Geographic correction (documented in docs/square-buildings.md): the main extract returned some building
// multipolygons without member geometry, so they were silently missing from the map (a hole on the south
// side of Sloane Square: Wyndham House and Wellesley House). Fill member geometry from the focused
// square extract (data/osm/square-buildings.json) when available.
const SQUARE_BUILDINGS_FILE = 'data/osm/square-buildings.json';
let squareBuildingsRaw = null;
try { squareBuildingsRaw = JSON.parse(readFileSync(SQUARE_BUILDINGS_FILE, 'utf8')); } catch { /* optional */ }
const restoredRelations = [];
if (squareBuildingsRaw) {
  for (const r of rels) {
    if (r.members?.some((m) => m.geometry)) continue;
    const full = squareBuildingsRaw.elements.find((e) => e.type === 'relation' && e.id === r.id);
    if (full?.members?.some((m) => m.geometry)) { r.members = full.members; restoredRelations.push(r.id); }
  }
}
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
// Landmarks with custom models (stable ids). Their footprints are protected from plot generation and
// the generic extrusion is replaced in game by the custom model.
const CUSTOM_LANDMARKS = {
  w28682626: { id: 'landmark:peter-jones', model: 'peter-jones' },
  // Sloane Square perimeter reconstruction (see docs/square-buildings.md). Keys are OSM type+id.
  w532074737: { id: 'square:15-16', model: 'square:15-16' },
  w532074738: { id: 'square:sloane-st-143-144', model: 'square:sloane-st-143-144' },
  w532074739: { id: 'square:sloane-st-141-142', model: 'square:sloane-st-141-142' },
  w532097385: { id: 'square:13-14', model: 'square:13-14' },
  w532097377: { id: 'landmark:sloane-square-hotel', model: 'square:hotel' },
  w898482966: { id: 'square:1-6', model: 'square:1-6' },
  w899130386: { id: 'square:52-56', model: 'square:52-56' },
  w532635270: { id: 'landmark:colbert-48-51', model: 'square:48-51' },
  w147249460: { id: 'landmark:royal-court-theatre', model: 'square:royal-court' },
  w140334697: { id: 'landmark:sloane-square-station', model: 'square:station' },
  w532635263: { id: 'square:station-kiosk', model: 'square:station-kiosk' },
  r12224305: { id: 'landmark:wyndham-house', model: 'square:wyndham' },
  r12224306: { id: 'landmark:wellesley-house', model: 'square:wellesley' },
  w532534277: { id: 'square:33-lurgan-mansions', model: 'square:lurgan' },
  w532534279: { id: 'square:28-31', model: 'square:28-31' },
  w223451081: { id: 'landmark:holy-trinity', model: 'square:holy-trinity' },
  // Duke of York Square and the Saatchi Gallery (see docs/duke-of-york-square.md).
  w5317958: { id: 'landmark:saatchi-gallery', model: 'doy:saatchi' },
  w124030230: { id: 'landmark:doy-chapel', model: 'doy:chapel' },
  w124030215: { id: 'doy:vardo', model: 'doy:vardo' },
  w124032943: { id: 'doy:corner-block', model: 'doy:corner' },
  w124030228: { id: 'doy:queripel', model: 'doy:queripel' },
  w124030204: { id: 'doy:left-wing-west', model: 'doy:left-wing' },
  w124030200: { id: 'doy:left-wing-east', model: 'doy:left-wing' },
  w124030209: { id: 'doy:grocer', model: 'doy:grocer' },
  w753511834: { id: 'doy:ticket-kiosk', model: 'doy:kiosk' },
  w899802879: { id: 'doy:canopy', model: 'doy:canopy' },
};
// Other footprints that belong to a protected landmark (Historic England lists 25 Cadogan Gardens as part of Peter Jones).
const PROTECTED_WAYS = new Set([28682626, 1186000571, 12224305, 12224306]); // + listed Wyndham/Wellesley House (relations)
// ---- Street corridors: King's Road, Sloane Street, Lower Sloane Street -----------------------------------
// Each corridor is rebuilt building by building (see scripts/osm/corridor.mjs). Centrelines come from the
// main extract; chainage 0 is the Sloane Square end. Newer footprints from each focused extract replace the
// main extract's along the line (e.g. 120 King's Road, completed 2023, replaced the Kings Walk mall).
// King's Road ends at KR_END_S, just west of the Markham Square junction's west corner (docs/kings-road.md).
/** End of the King's Road reconstruction (chainage, m). */
const KR_END_S = 562;
const corridorKr = new Corridor({
  id: 'kr', prefix: 'kr', name: "King's Road",
  line: chainLine(ways, P, "King's Road", (q) => q[0]).filter((q) => q[0] > -450),
  startS: 0, endS: KR_END_S, rawFile: 'data/osm/kr-raw.json', buildingsFile: 'data/osm/kr-buildings.json',
});
const keepLandmark = (e) => !!CUSTOM_LANDMARKS[`${e.type[0]}${e.id}`];
corridorKr.replaceBuildings(ways, rels, P, keepLandmark, report);
const krNear = (x, z) => corridorKr.near(x, z);
// Sloane Street, north from Sloane Square to the junction with Cadogan Gardens (SS_END_S): the last cross
// street before the map's north edge, beyond which footprints are cut by the edge (docs/sloane-streets.md).
// Lower Sloane Street, south from Sloane Square to its end at the Pimlico Road / Chelsea Bridge Road /
// Royal Hospital Road junction (LS_END_S).
const SS_END_S = Number(process.env.SS_END_S ?? 182), LS_END_S = Number(process.env.LS_END_S ?? 326);
const corridorSs = new Corridor({
  id: 'ss', prefix: 'ss', name: 'Sloane Street',
  line: chainLine(ways, P, 'Sloane Street', [156.6, -168]).filter((q) => q[1] > -420),
  startS: 0, endS: SS_END_S, rawFile: 'data/osm/ss-raw.json', buildingsFile: 'data/osm/ss-buildings.json', replaceFrom: 0, frontFrom: 0,
  maxShift: 4, minPave: 3.5, fitFrom: 0,
  // the raised corridor pavement starts after the square's own models (141–144 Sloane Street, Holy Trinity)
  paveFrom: 46,
});
const corridorLs = new Corridor({
  id: 'ls', prefix: 'ls', name: 'Lower Sloane Street',
  line: chainLine(ways, P, 'Lower Sloane Street', [168.6, -118.5], () => true, [223318349, 223318350]),
  startS: 0, endS: LS_END_S, rawFile: 'data/osm/ss-raw.json', buildingsFile: 'data/osm/ss-buildings.json', replaceFrom: 0, frontFrom: 0, frontD: 26, fitFrom: 0, paveFrom: 18,
  // the Sloane Gardens west terrace backs onto the street across its communal garden (rear elevation)
  include: ['w899154922'],
});
corridorSs.replaceBuildings(ways, rels, P, keepLandmark, report);
corridorLs.replaceBuildings(ways, rels, P, keepLandmark, report);
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
  for (const [k, o] of outs.entries()) {
    const holes = ins.filter((hh) => pointInPolygon(hh[0], o));
    const tris = triangulate(o, holes);
    const a = Math.abs(ringArea(o)) - holes.reduce((n, hh) => n + Math.abs(ringArea(hh)), 0);
    if (Math.abs(trisArea(tris) - a) > 0.03 * a + 0.5) {
      triFail++;
      report.warnings.push(`building ${e.type}/${e.id} triangulation mismatch (${trisArea(tris).toFixed(1)} vs ${a.toFixed(1)})`);
    }
    const custom = CUSTOM_LANDMARKS[`${e.type[0]}${e.id}`];
    buildings.push({
      // a multipolygon with several outer rings gives several footprints: the second and later get a suffix
      id: `${e.type[0]}${e.id}${k ? `-${k + 1}` : ''}`,
      osmId: e.id,
      ...(custom ? { custom: custom.model, landmarkId: custom.id } : {}),
      h: Math.round(h * 10) / 10,
      hSrc: src,
      type: t.building,
      name: t.name ?? null,
      protected: PROTECTED_TAGS(t) || PROTECTED_WAYS.has(e.id),
      rings: [o, ...holes].map((r) => r.flatMap((p) => [round1(p[0]), round1(p[1])])),
      tris: tris.map(round1),
      area: Math.round(a),
    });
  }
}

// King's Road frontages: every building with an edge facing the road between the Sloane Square end and
// KR_END_S gets its own model ('kr:<id>', configured in src/map/landmarks/kingsRoadSpecs.ts).
corridorKr.detectFrontages(buildings, ringArea, round1);
report.kingsRoad = { frontages: corridorKr.frontages.length, replaced: corridorKr.replaced };
// The OSM centreline west of Royal Avenue runs about 2.5 m nearer the south frontage than the north, and
// the default 12 m carriageway then reaches the south façades: re-centre and narrow it between the lines.
report.kingsRoad.carriageway = corridorKr.fitCarriageway(buildings, areas, roads, round1);
// Sloane Street and Lower Sloane Street frontages ('ss:<id>', 'ls:<id>', src/map/landmarks/sloaneStreetSpecs.ts)
// footprints cut by the map's north edge stay plain massing (they cannot be completed within the map)
const touchesEdge = (bl) => bl.rings[0].some((v) => Math.abs(v) >= HALF - 0.5);
corridorSs.detectFrontages(buildings, ringArea, round1, (bl) => !touchesEdge(bl));
corridorLs.detectFrontages(buildings, ringArea, round1);
// Sloane Street's OSM centreline runs about 3.5 m east of the middle between the building lines (east
// footprints ≈ 7.5 m from it, west ≈ 14.5 m), and Lower Sloane Street's reaches the Sloane Gardens garden
// railings: both are re-centred between the lines like King's Road (docs/sloane-streets.md).
const ssFit = corridorSs.fitCarriageway(buildings, areas, roads, round1);
const lsFit = corridorLs.fitCarriageway(buildings, areas, roads, round1);
report.sloaneStreets = { fit: { ss: ssFit, ls: lsFit }, ss: { frontages: corridorSs.frontages.length, parts: corridorSs.parts, replaced: corridorSs.replaced }, ls: { frontages: corridorLs.frontages.length, parts: corridorLs.parts, replaced: corridorLs.replaced } };

// ---- Custom landmark model data: Peter Jones -------------------------------------------------
// Footprint = OSM way 28682626 (unsimplified). Parts used: 532097395 (white 7-storey upper block with
// the rounded drum). The facade run is the contiguous set of outline edges fronting King's Road and
// Sloane Square; the recessed storey outline is that run offset inward (computed here, offline).
const landmarkModels = [];
report.restoredRelations = restoredRelations;
{
  const way = ways.find((w) => w.id === 28682626);
  const upperWay = ways.find((w) => w.id === 532097395);
  if (!way || !upperWay) report.warnings.push('Peter Jones footprint or parts missing');
  else {
    let ring = openRing(way.geometry.map(P));
    if (ringArea(ring) > 0) ring = ring.reverse(); // negative orientation: outward normal = left of travel… (see renderer)
    const segsOf = (names) => roads.filter((r) => names.includes(r.name) && r.cls === 'main').flatMap((r) => { const o = []; for (let i = 0; i + 3 < r.pts.length; i += 2) o.push([[r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]]); return o; });
    const front = segsOf(["King's Road", 'Sloane Square']);
    const distTo = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
    const n = ring.length;
    const isFront = ring.map((a, i) => {
      const b = ring[(i + 1) % n];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return Math.min(...front.map(([p, q]) => distTo(m, p, q))) < 16;
    });
    // longest cyclic run of fronting edges
    let best = { start: 0, len: 0 };
    for (let i = 0; i < n; i++) {
      if (!isFront[i] || isFront[(i + n - 1) % n]) continue;
      let k = 0;
      while (k < n && isFront[(i + k) % n]) k++;
      if (k > best.len) best = { start: i, len: k };
    }
    // Trim tiny jogs (< 3 m) at either end of the run: they belong to the side walls.
    while (best.len > 2) {
      const a = ring[best.start % n], b = ring[(best.start + 1) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 3) break;
      best.start++; best.len--;
    }
    while (best.len > 2) {
      const a = ring[(best.start + best.len - 1) % n], b = ring[(best.start + best.len) % n];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) >= 3) break;
      best.len--;
    }
    const facade = [];
    for (let k = 0; k <= best.len; k++) facade.push(ring[(best.start + k) % n]);
    // Smooth the curved corner (Chaikin on vertices that turn > 6°); straight runs and ends untouched.
    let f = facade;
    for (let it = 0; it < 3; it++) {
      const out = [f[0]];
      for (let i = 1; i < f.length - 1; i++) {
        const a = f[i - 1], b = f[i], c = f[i + 1];
        const t1 = Math.atan2(b[1] - a[1], b[0] - a[0]), t2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        let turn = Math.abs(t2 - t1); if (turn > Math.PI) turn = 2 * Math.PI - turn;
        if (turn < (6 * Math.PI) / 180) { out.push(b); continue; }
        out.push([0.75 * b[0] + 0.25 * a[0], 0.75 * b[1] + 0.25 * a[1]], [0.75 * b[0] + 0.25 * c[0], 0.75 * b[1] + 0.25 * c[1]]);
      }
      out.push(f[f.length - 1]);
      f = out;
    }
    // Inward offset of the facade (miter, per vertex) for the recessed fifth storey.
    const interior = (p) => pointInPolygon(p, ring);
    const offsetLine = (line, d) => line.map((p, i) => {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      let nx = -dz / l, nz = dx / l;
      if (!interior([p[0] + nx * 1.5, p[1] + nz * 1.5])) { nx = -nx; nz = -nz; } // point inward
      return [p[0] + nx * d, p[1] + nz * d];
    });
    const RECESS = 2.6;
    const inset = offsetLine(f, RECESS);
    const back = [];
    for (let k = best.len + 1; k < n; k++) back.push(ring[(best.start + k) % n]);
    const recessRing = [...inset, ...back];
    const upper = openRing(upperWay.geometry.map(P));
    const fl = (r) => r.flatMap((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]);
    landmarkModels.push({
      id: 'landmark:peter-jones',
      name: 'Peter Jones',
      model: 'peter-jones',
      osm: { footprint: 'way/28682626', parts: ['way/532097395', 'way/532534275', 'way/532097394'], alsoProtected: ['way/1186000571'] },
      ring: fl(ring),
      ringTris: triangulate(ring).map(round1),
      facade: fl(f),
      recessRing: fl(recessRing),
      recessTris: triangulate(recessRing).map(round1),
      upperRing: fl(upper),
      upperTris: triangulate(upper).map(round1),
    });
    const fLen = f.reduce((s2, p, i) => (i ? s2 + Math.hypot(p[0] - f[i - 1][0], p[1] - f[i - 1][1]) : 0), 0);
    report.peterJones = { facadeVertices: f.length, facadeLength: Math.round(fLen * 10) / 10, start: f[0].map(round1), end: f[f.length - 1].map(round1) };
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

// ---- Development sites (map version 2) ---------------------------------------------------------
// Fictional redevelopment sites made from selected ordinary building footprints. The selection is a
// deliberate, versioned list (data/osm/sites-v2.json), so the same map version always yields the same
// sites. `node scripts/osm/process.mjs --propose` regenerates a proposal from the rules below.
const SITES_FILE = 'data/osm/sites-v2.json';
const SITE_TYPES = new Set(['house', 'terrace', 'residential', 'yes', 'apartments', 'semidetached_house', 'retail', 'commercial']);
const FIT = { townhouse: { w: 6, d: 6 }, shop: { w: 7, d: 6 }, park: { w: 8, d: 8 } };
const streets = roads.filter((r) => r.cls === 'street' || r.cls === 'main');
const streetSegs = streets.flatMap((r) => { const o = []; for (let i = 0; i + 3 < r.pts.length; i += 2) o.push({ a: [r.pts[i], r.pts[i + 1]], b: [r.pts[i + 2], r.pts[i + 3]], half: r.w / 2, name: r.name }); return o; });
const pathSegs = roads.filter((r) => r.cls === 'path').flatMap((r) => { const o = []; for (let i = 0; i + 3 < r.pts.length; i += 2) o.push({ a: [r.pts[i], r.pts[i + 1]], b: [r.pts[i + 2], r.pts[i + 3]], half: r.w / 2 }); return o; });
function rectPoly(cx, cz, angle, w, d) {
  const c = Math.cos(angle), sn = Math.sin(angle);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => [cx + x * c + z * sn, cz - x * sn + z * c]);
}
const allSegs = roads.filter((r) => r.cls !== 'path').flatMap((r) => { const o = []; for (let i = 0; i + 3 < r.pts.length; i += 2) o.push({ a: [r.pts[i], r.pts[i + 1]], b: [r.pts[i + 2], r.pts[i + 3]], half: r.w / 2 }); return o; });
const segD = (p, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz); };
// ---- Sloane Square central space (protected public space) ------------------------------------
// Detail comes from a focused extract (scripts/osm/fetch-square.mjs → data/osm/square-raw.json):
// the kerb ways that ring the square, sourced trees, benches, lamps, the Venus Fountain basin, the
// war memorial and the drinking fountain. Positions are OSM's; sizes/shapes are documented estimates.
const SQUARE_FILE = 'data/osm/square-raw.json';
const VENUS_NODE = 8354000193;
let square = null;
try {
  const sq = JSON.parse(readFileSync(SQUARE_FILE, 'utf8'));
  const els = sq.elements;
  const venusEl = els.find((e) => e.id === VENUS_NODE);
  const V = proj.toXZ(venusEl.lat, venusEl.lon);
  const P = (g) => proj.toXZ(g.lat, g.lon);
  // Chain kerb ways (any kerb type) by shared end points, closing small gaps, into rings.
  const kerbs = els.filter((e) => e.type === 'way' && e.tags?.barrier === 'kerb').map((e) => e.geometry.map(P)).filter((pts) => pts.some((q) => Math.hypot(q[0] - V[0], q[1] - V[1]) < 90));
  const same = (a, b, tol) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;
  const rings = [];
  const pool = kerbs.map((k) => k.slice());
  while (pool.length) {
    let chain = pool.shift();
    for (let grow = true; grow;) {
      grow = false;
      if (chain.length > 2 && same(chain[0], chain[chain.length - 1], 0.05)) break;
      for (const tol of [0.05, 1.5]) {
        const end = chain[chain.length - 1];
        const k = pool.findIndex((w) => same(w[0], end, tol) || same(w[w.length - 1], end, tol));
        if (k >= 0) { let w = pool.splice(k, 1)[0]; if (!same(w[0], end, tol)) w = w.reverse(); chain = chain.concat(w.slice(1)); grow = true; break; }
      }
    }
    if (chain.length > 4 && same(chain[0], chain[chain.length - 1], 1.5)) rings.push(chain.slice(0, -1));
  }
  const enclosing = rings.filter((r) => pointInPolygon(V, r)).sort((a, b) => Math.abs(ringArea(a)) - Math.abs(ringArea(b)));
  if (!enclosing.length) throw new Error('no kerb ring encloses the Venus Fountain');
  const ringPts = simplifyRing(enclosing[0], 0.15);
  const ring = ringPts.flat().map(round1);
  const inside = (q, m = 0) => pointInPolygon(q, ringPts) && (m === 0 || polySegDistRing(ringPts, q) >= m);
  function polySegDistRing(poly, q) { let d = Infinity; for (let k = 0; k < poly.length; k++) { const a = poly[k], b = poly[(k + 1) % poly.length]; const dx = b[0] - a[0], dz = b[1] - a[1], l = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dz) / l)); d = Math.min(d, Math.hypot(q[0] - a[0] - t * dx, q[1] - a[1] - t * dz)); } return d; }
  const nodes = (pred) => els.filter((e) => e.type === 'node' && pred(e.tags ?? {})).map((e) => ({ id: e.id, p: P(e), tags: e.tags, ts: e.timestamp })).filter((n) => inside(n.p));
  // principal axis of the square (long side) for orienting furniture
  let best = { len: 0, ang: 0 };
  for (let k = 0; k < ringPts.length; k++) { const a = ringPts[k], b = ringPts[(k + 1) % ringPts.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len > best.len) best = { len, ang: Math.atan2(b[1] - a[1], b[0] - a[0]) }; }
  let axis = best.ang; if (Math.cos(axis) < 0) axis += Math.PI;
  const basinEl = els.find((e) => e.id === 554693845);
  const basin = basinEl.geometry.map(P);
  const bc = basin.slice(0, -1).reduce((acc, q, _, arr) => [acc[0] + q[0] / arr.length, acc[1] + q[1] / arr.length], [0, 0]);
  const memorial = nodes((t) => t.historic === 'memorial')[0];
  const drinking = nodes((t) => t['amenity:disused'] === 'drinking_water' || t.amenity === 'drinking_water')[0];
  const cycle = nodes((t) => t.amenity === 'bicycle_parking');
  square = {
    name: 'Sloane Square',
    source: `OpenStreetMap (${SQUARE_FILE}, retrieved ${sq.retrieved}, OSM data as of ${sq.osm_base})`,
    ring,
    tris: triangulate(ringPts).map(round1),
    area: Math.round(Math.abs(ringArea(ringPts))),
    axis: +axis.toFixed(4),
    fountain: { osm: `way/${basinEl.id}`, x: round1(bc[0]), z: round1(bc[1]), basin: basin.slice(0, -1).flat().map(round1), statue: [round1(V[0]), round1(V[1])] },
    memorial: memorial && { osm: `node/${memorial.id}`, x: round1(memorial.p[0]), z: round1(memorial.p[1]) },
    drinkingFountain: drinking && { osm: `node/${drinking.id}`, x: round1(drinking.p[0]), z: round1(drinking.p[1]) },
    trees: nodes((t) => t.natural === 'tree').map((n) => ({ osm: `node/${n.id}`, x: round1(n.p[0]), z: round1(n.p[1]), edited: n.ts?.slice(0, 10) ?? null })),
    benches: nodes((t) => t.amenity === 'bench').map((n) => ({ osm: `node/${n.id}`, x: round1(n.p[0]), z: round1(n.p[1]) })),
    lamps: nodes((t) => t.highway === 'street_lamp').map((n) => ({ osm: `node/${n.id}`, x: round1(n.p[0]), z: round1(n.p[1]) })),
    cycleStands: cycle.map((n) => ({ osm: `node/${n.id}`, x: round1(n.p[0]), z: round1(n.p[1]), capacity: +(n.tags.capacity ?? 6) })),
  };
  report.square = { area: square.area, trees: square.trees.length, benches: square.benches.length, lamps: square.lamps.length, cycleStands: square.cycleStands.length, memorial: !!memorial, drinkingFountain: !!drinking, kerbWays: kerbs.length, rings: rings.length };
} catch (e) {
  report.warnings.push(`Sloane Square detail unavailable: ${e.message}`);
}

// ---- Duke of York Square and the Saatchi Gallery grounds --------------------------------------
// Detail from a focused extract (scripts/osm/fetch-square.mjs --area doy → data/osm/doy-raw.json):
// trees, the listed curved wall and gates, fences, benches, the splash-pad fountain, the Hans Sloane
// statue, kerbs, footways (with surfaces), the running track and pitch. Positions are OSM's; sizes
// and shapes are documented estimates (docs/duke-of-york-square.md).
const DOY_FILE = 'data/osm/doy-raw.json';
const DOY_BOX = { x0: -85, x1: 165, z0: -50, z1: 140 };
let doy = null;
try {
  const dr = JSON.parse(readFileSync(DOY_FILE, 'utf8'));
  const els = dr.elements;
  const Pd = (g) => proj.toXZ(g.lat, g.lon);
  const inBox = (q) => q[0] > DOY_BOX.x0 && q[0] < DOY_BOX.x1 && q[1] > DOY_BOX.z0 && q[1] < DOY_BOX.z1;
  const r1 = (q) => [round1(q[0]), round1(q[1])];
  const nodesD = (pred) => els.filter((e) => e.type === 'node' && pred(e.tags ?? {})).map((e) => ({ osm: `node/${e.id}`, p: Pd(e), tags: e.tags })).filter((n) => inBox(n.p));
  const waysD = (pred) => els.filter((e) => e.type === 'way' && e.geometry && pred(e.tags ?? {})).map((e) => ({ osm: `way/${e.id}`, pts: e.geometry.map(Pd), tags: e.tags })).filter((w) => w.pts.some(inBox));
  const pt = (n, extra = {}) => ({ osm: n.osm, x: round1(n.p[0]), z: round1(n.p[1]), ...extra });
  const line = (w, extra = {}) => ({ osm: w.osm, pts: w.pts.flatMap(r1), ...extra });
  const track = els.find((e) => e.type === 'relation' && e.tags?.leisure === 'track');
  const trackRings = track ? track.members.filter((m) => m.geometry).map((m) => ({ role: m.role, pts: m.geometry.map(Pd) })) : [];
  // chain the track's outer/inner member ways into rings
  const chainRings = (parts) => {
    const pool = parts.map((p) => p.slice()); const out = [];
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
    while (pool.length) {
      let c = pool.shift();
      for (let grow = true; grow;) {
        grow = false;
        if (c.length > 2 && same(c[0], c[c.length - 1])) break;
        const end = c[c.length - 1];
        const k = pool.findIndex((w) => same(w[0], end) || same(w[w.length - 1], end));
        if (k >= 0) { let w = pool.splice(k, 1)[0]; if (!same(w[0], end)) w = w.reverse(); c = c.concat(w.slice(1)); grow = true; }
      }
      if (c.length > 3) out.push(simplifyRing(c.slice(0, -1), 0.2));
    }
    return out;
  };
  const trackOuter = chainRings(trackRings.filter((m) => m.role === 'outer').map((m) => m.pts));
  const trackInner = chainRings(trackRings.filter((m) => m.role === 'inner').map((m) => m.pts));
  const pitchW = waysD((t) => t.leisure === 'pitch')[0];
  const statue = nodesD((t) => t.tourism === 'artwork' && /Sloane/.test(t.name ?? ''))[0];
  const fountain = nodesD((t) => t.amenity === 'fountain')[0];
  doy = {
    source: `OpenStreetMap (${DOY_FILE}, retrieved ${dr.retrieved}, OSM data as of ${dr.osm_base})`,
    trees: nodesD((t) => t.natural === 'tree').map((n) => pt(n)),
    walls: waysD((t) => t.barrier === 'wall').map((w) => line(w, { h: w.tags.height ? +w.tags.height : null })),
    fences: waysD((t) => t.barrier === 'fence').map((w) => line(w, { h: w.tags.height ? +w.tags.height : null })),
    gates: nodesD((t) => t.barrier === 'gate').map((n) => pt(n)),
    benches: [...nodesD((t) => t.amenity === 'bench').map((n) => pt(n, { seats: n.tags.seats ? +n.tags.seats : null, backrest: n.tags.backrest ?? null })),
      ...waysD((t) => t.amenity === 'bench').map((w) => line(w, { material: w.tags.material ?? null }))],
    cycleStands: nodesD((t) => t.amenity === 'bicycle_parking').map((n) => pt(n, { capacity: +(n.tags.capacity ?? 6), kind: n.tags.bicycle_parking ?? null })),
    lamps: nodesD((t) => t.highway === 'street_lamp').map((n) => pt(n)),
    fountain: fountain ? pt(fountain, { kind: fountain.tags.fountain ?? null }) : null,
    statue: statue ? pt(statue, { name: statue.tags.name }) : null,
    kerbs: waysD((t) => t.barrier === 'kerb').map((w) => line(w)),
    footways: waysD((t) => ['footway', 'pedestrian', 'steps'].includes(t.highway)).map((w) => line(w, { hw: w.tags.highway, surface: w.tags.surface ?? null, name: w.tags.name ?? null })),
    track: trackOuter.length ? { osm: `relation/${track.id}`, outer: trackOuter.map((r) => r.flatMap(r1)), inner: trackInner.map((r) => r.flatMap(r1)) } : null,
    pitch: pitchW ? { osm: pitchW.osm, ring: simplifyRing(pitchW.pts.slice(0, -1), 0.2).flatMap(r1) } : null,
    entrances: nodesD((t) => !!t.entrance).map((n) => pt(n, { kind: n.tags.entrance })),
  };
  // Track surface (outer ring minus the inner field) and the field inside it, triangulated here.
  if (doy.track) {
    const toQ = (f) => { const q = []; for (let i = 0; i < f.length; i += 2) q.push([f[i], f[i + 1]]); return q; };
    const outer = toQ(doy.track.outer[0]), inner = doy.track.inner.map(toQ);
    doy.track.tris = triangulate(outer, inner).map(round1);
    doy.track.innerTris = inner.length ? triangulate(inner[0]).map(round1) : [];
  }
  // Gallery forecourt: inside the listed curved wall, along the buildings' south-west faces and the
  // gallery front, out to the far edge of the footpath in front of the gallery (path centreline + 2.5 m).
  {
    const wall = doy.walls.find((w) => w.h === 4);
    const path = doy.footways.find((f) => f.osm === 'way/124031663');
    const gal = buildings.find((bb) => bb.id === 'w5317958');
    const left = buildings.find((bb) => bb.id === 'w124030204');
    const quer = buildings.find((bb) => bb.id === 'w124030228');
    if (wall && path && gal && left && quer) {
      const Q = (f) => { const q = []; for (let i = 0; i < f.length; i += 2) q.push([f[i], f[i + 1]]); return q; };
      const wq = Q(wall.pts); // (43.8,12.9) … (13.4,23.6)
      const near = (ring, p) => Q(ring).reduce((bst, q) => (Math.hypot(q[0] - p[0], q[1] - p[1]) < Math.hypot(bst[0] - p[0], bst[1] - p[1]) ? q : bst));
      const gq = Q(gal.rings[0]);
      // gallery front corners: the extreme points along the front direction among the south-west-most vertices
      const U = [0.619, 0.785], V = [0.785, -0.619];
      const sOf = (q) => q[0] * U[0] + q[1] * U[1], wOf = (q) => q[0] * V[0] + q[1] * V[1];
      const front = gq.filter((q) => wOf(q) < Math.min(...gq.map(wOf)) + 7);
      const nw = front.reduce((m, q) => (sOf(q) < sOf(m) ? q : m)), se = front.reduce((m, q) => (sOf(q) > sOf(m) ? q : m));
      const pq = Q(path.pts).filter((q) => sOf(q) <= sOf(se) + 8);
      const off = pq.map((q, i) => {
        const a = pq[Math.max(0, i - 1)], b = pq[Math.min(pq.length - 1, i + 1)];
        let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        if (nx * -V[0] + nz * -V[1] < 0) { nx = -nx; nz = -nz; } // away from the gallery (south-west)
        return [q[0] + nx * 2.5, q[1] + nz * 2.5];
      });
      const ring = [...wq.slice().reverse().filter((_, i) => i > 0), wq[0]] // wall from its south end round to the north-east end
        .concat([near(quer.rings[0], [55.1, 26.9]), near(left.rings[0], [62.7, 35.7]), nw, se])
        .concat(off.slice().reverse())
        .concat([wq[wq.length - 1]]);
      // drop duplicates
      const clean = ring.filter((q, i) => i === 0 || Math.hypot(q[0] - ring[i - 1][0], q[1] - ring[i - 1][1]) > 0.2);
      const pr = simplifyRing(clean, 0.1);
      doy.forecourt = { ring: pr.flatMap((q) => [round1(q[0]), round1(q[1])]), tris: triangulate(pr).map(round1) };
    } else report.warnings.push('Duke of York Square: forecourt inputs missing');
  }
  report.doy = Object.fromEntries(Object.entries(doy).map(([k, v]) => [k, Array.isArray(v) ? v.length : !!v]));
} catch (e) {
  report.warnings.push(`Duke of York Square detail unavailable: ${e.message}`);
}

// ---- Corridor street detail ------------------------------------------------------------------------
const kr = corridorKr.streetData({ P, round1, areas, roads, square, report, exclAreaIds: ['w5318345', 'w900260769'] });
delete kr.id; delete kr.name;
const corridors = [corridorSs, corridorLs].map((c) => c.streetData({ P, round1, areas, roads, square, report }));
report.kingsRoad.street = { trees: kr.trees.length, lamps: kr.lamps.length, bollards: kr.bollards.length, crossings: kr.crossings.length, postBoxes: kr.postBoxes.length, rails: kr.rails.length, mouths: kr.mouths.length };

const blockedAreas = areas.filter((a) => a.kind !== 'parking').map((a) => { const q = []; for (let i = 0; i < a.ring.length; i += 2) q.push([a.ring[i], a.ring[i + 1]]); return q; });
// The square is protected public space: no development site may touch it.
if (square) { const q = []; for (let i = 0; i < square.ring.length; i += 2) q.push([square.ring[i], square.ring[i + 1]]); blockedAreas.push(q); }

/** Analyse one footprint as a potential site: street frontage, oriented inscribed rectangle, fit. */
function analyseSite(b) {
  const r = b.rings[0];
  const poly = []; for (let i = 0; i < r.length; i += 2) poly.push([r[i], r[i + 1]]);
  const A = Math.abs(ringArea(poly));
  // frontage edge: the longest edge that runs parallel to, and close beside, a street
  let best = null;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 5) continue;
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    for (const sg of streetSegs) {
      const gap = segD(mid, sg.a, sg.b) - sg.half;
      if (gap > 12 || gap < -0.5) continue;
      const ang = Math.abs(Math.atan2(c[1] - a[1], c[0] - a[0]) - Math.atan2(sg.b[1] - sg.a[1], sg.b[0] - sg.a[0])) % Math.PI;
      const par = Math.min(ang, Math.PI - ang);
      if (par > 0.35) continue;
      // Thin sites have both long edges near a street; prefer the edge that actually touches it.
      const score = len - 2 * Math.max(0, gap);
      if (!best || score > best.score) best = { a, c, len, street: sg.name, mid, score };
    }
  }
  if (!best) return null;
  const ux = (best.c[0] - best.a[0]) / best.len, uz = (best.c[1] - best.a[1]) / best.len;
  // local frame: u along frontage, v away from the street (into the plot)
  const cen = poly.reduce((s2, p) => [s2[0] + p[0] / poly.length, s2[1] + p[1] / poly.length], [0, 0]);
  let vx = -uz, vz = ux;
  if ((cen[0] - best.mid[0]) * vx + (cen[1] - best.mid[1]) * vz < 0) { vx = -vx; vz = -vz; }
  const U = poly.map((p) => (p[0] - cen[0]) * ux + (p[1] - cen[1]) * uz), V = poly.map((p) => (p[0] - cen[0]) * vx + (p[1] - cen[1]) * vz);
  let [u0, u1, v0, v1] = [Math.min(...U), Math.max(...U), Math.min(...V), Math.max(...V)];
  const rectA = (u1 - u0) * (v1 - v0);
  const rectangularity = A / rectA;
  // shrink the oriented box until it lies inside the footprint (with a 0.5 m margin)
  const toWorld = (u, v) => [cen[0] + ux * u + vx * v, cen[1] + uz * u + vz * v];
  const inside = (q) => pointInPolygon(q, poly);
  let m = 0.5, ok = false;
  for (let k = 0; k < 40; k++) {
    const corners = [[u0 + m, v0 + m], [u1 - m, v0 + m], [u1 - m, v1 - m], [u0 + m, v1 - m]].map(([u, v]) => toWorld(u, v));
    const mids = [[(u0 + u1) / 2, v0 + m], [(u0 + u1) / 2, v1 - m], [u0 + m, (v0 + v1) / 2], [u1 - m, (v0 + v1) / 2]].map(([u, v]) => toWorld(u, v));
    if ([...corners, ...mids].every(inside)) { ok = true; break; }
    m += 0.4;
  }
  if (!ok) return null;
  const w = u1 - u0 - 2 * m, d = v1 - v0 - 2 * m;
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
  const [cx, cz] = toWorld(cu, cv);
  // front (local +z) faces the street: direction −v
  const angle = Math.atan2(-vx, -vz);
  return { poly, A, rectangularity, w, d, cx, cz, angle, street: best.street };
}

// Footprints attached to a protected landmark are never used (keeps landmark settings intact).
const protectedPolys = buildings.filter((b) => b.protected).map((b) => { const r = b.rings[0], q = []; for (let i = 0; i < r.length; i += 2) q.push([r[i], r[i + 1]]); return q; });
const touchesProtected = (poly) => protectedPolys.some((q) => q.some((a) => poly.some((c) => Math.hypot(a[0] - c[0], a[1] - c[1]) < 1.5)) || polygonsOverlap(poly, q));
const bGridSites = new Grid(30);
for (const b of buildings) {
  const r = b.rings[0], poly = []; for (let i = 0; i < r.length; i += 2) poly.push([r[i], r[i + 1]]);
  const xs = poly.map((p) => p[0]), zs = poly.map((p) => p[1]);
  bGridSites.insert({ id: b.id, poly }, Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs));
}
const ordinary = (b) => !b.protected && !b.name && SITE_TYPES.has(b.type) && b.rings.length === 1;
function siteValid(b, s2) {
  if (!s2 || (b.members ? !b.members.every(ordinary) : !ordinary(b))) return false;
  if (s2.A < 140 || s2.A > 1000 || s2.rectangularity < 0.72 || s2.w < FIT.townhouse.w || s2.d < FIT.townhouse.d || s2.w > 40) return false;
  if (touchesProtected(s2.poly)) return false;
  // No other (non-member) building may intrude into the site: sample its interior on a 1 m grid.
  const own = new Set(b.members ? b.members.map((m) => m.id) : [b.id]);
  const xs = s2.poly.map((p) => p[0]), zs = s2.poly.map((p) => p[1]);
  const nearby = bGridSites.query(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)).filter((o) => !own.has(o.id));
  for (let x = Math.min(...xs) + 0.5; x < Math.max(...xs); x += 1)
    for (let z = Math.min(...zs) + 0.5; z < Math.max(...zs); z += 1) {
      if (!pointInPolygon([x, z], s2.poly)) continue;
      if (nearby.some((o) => pointInPolygon([x, z], o.poly))) return false;
    }
  if (s2.poly.some(([x, z]) => Math.abs(x) > HALF - 12 || Math.abs(z) > HALF - 12)) return false;
  for (const ba of blockedAreas) if (polygonsOverlap(s2.poly, ba)) return false;
  // footprint must not sit on any road or footpath centreline buffer (OSM occasionally overlaps them)
  for (const sg of allSegs) if (polySegDist(s2.poly, sg.a, sg.b) < sg.half * 0.5) return false;
  // pedestrian routes: the site's building rectangle must stay fully clear of every footway buffer
  const rp = rectPoly(s2.cx, s2.cz, s2.angle, s2.w, s2.d);
  for (const sg of pathSegs) if (polySegDist(rp, sg.a, sg.b) < sg.half) return false;
  for (const sg of allSegs) if (polySegDist(rp, sg.a, sg.b) < sg.half) return false; // drawn carriageway (estimated width)
  return true;
}

const siteCandidates = [];
for (const b of buildings) {
  const s2 = analyseSite(b);
  if (siteValid(b, s2)) siteCandidates.push({ b, ...s2 });
}
const groupStats = { tried: 0, ok: 0 };
// Groups of 2–4 adjacent small footprints (terraced houses sharing party walls) on one frontage.
// Boundary = convex hull of the group, accepted only when the hull is almost exactly their union.
function hull(pts) {
  const P2 = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P2) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P2.reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
{
  const small = buildings.filter((b) => ordinary(b)).map((b) => {
    const r = b.rings[0], poly = []; for (let i = 0; i < r.length; i += 2) poly.push([r[i], r[i + 1]]);
    return { b, poly, A: Math.abs(ringArea(poly)) };
  }).filter((x) => x.A >= 35 && x.A < 320);
  const shareEdge = (p, q) => { let n = 0; for (const a of p) if (q.some((c) => Math.hypot(a[0] - c[0], a[1] - c[1]) < 0.35)) n++; return n >= 2; };
  const seen = new Set();
  for (const seed of small) {
    let group = [seed];
    for (let step = 0; step < 3; step++) {
      const next = small.find((x) => !group.includes(x) && group.some((g) => shareEdge(g.poly, x.poly)));
      if (!next) break;
      group = [...group, next];
      const H = hull(group.flatMap((g) => g.poly));
      const sum = group.reduce((n, g) => n + g.A, 0);
      if (Math.abs(ringArea(H)) > sum * 1.1) { group.pop(); break; }
      if (sum >= 180 && group.length >= 2) {
        const key = group.map((g) => g.b.id).sort().join('+');
        if (seen.has(key)) break;
        seen.add(key);
        const pseudo = { id: key, rings: [H.flatMap((p) => [p[0], p[1]])], members: group.map((g) => g.b), type: 'terrace' };
        const s2 = analyseSite(pseudo);
        groupStats.tried++;
        if (siteValid(pseudo, s2)) { siteCandidates.push({ b: pseudo, ...s2 }); groupStats.ok++; }
        if (sum >= 260) break;
      }
    }
  }
}

// Proposal: compact neighbourhood clusters seeded on real streets (map metres), spread over the map.
const SITE_CLUSTERS = [
  { key: 'blacklands', label: 'Blacklands Terrace', size: 6, seed: [-80, -40] },
  { key: 'cadogan', label: 'Cadogan Gardens', size: 8, seed: [-10, -275], compact: 135 },
  { key: 'royal-avenue', label: "King's Road & Royal Avenue", size: 5, seed: [-160, 110] },
  { key: 'lower-sloane', label: 'Holbein Place & Mews', size: 7, seed: [280, 62], compact: 100 },
  { key: 'markham', label: 'Markham Square & Bywater Street', size: 3, seed: [-285, 30] },
  { key: 'draycott', label: 'Draycott Avenue', size: 3, seed: [-215, -150] },
];
// Grouped sites are listed by all their member footprints.
if (process.argv.includes('--propose')) {
  const chosen = [];
  const near = (c, q) => Math.hypot(c.cx - q.cx, c.cz - q.cz);
  for (const cl of SITE_CLUSTERS) {
    const pool = siteCandidates.filter((c) => !chosen.some((x) => x.c === c)).map((c) => ({ c, d: Math.hypot(c.cx - cl.seed[0], c.cz - cl.seed[1]) })).filter((x) => x.d < (cl.pool ?? 135)).sort((a, b) => a.d - b.d);
    const picked = [];
    for (const { c } of pool) {
      if (picked.length >= cl.size) break;
      if (picked.some((q) => near(c, q) > (cl.compact ?? 125))) continue; // compact: within reach of shops/parks
      const ids = (x) => (x.b.members ? x.b.members.map((m) => m.id) : [x.b.id]);
      if ([...picked, ...chosen.map((x) => x.c)].some((q) => ids(q).some((id) => ids(c).includes(id)) || polygonsOverlap(q.poly, c.poly))) continue;
      if (picked.some((q) => near(c, q) < 9)) continue; // not two halves of one terrace
      picked.push(c);
    }
    if (picked.length < cl.size) report.warnings.push(`site cluster ${cl.key}: ${picked.length}/${cl.size}`);
    for (const c of picked) chosen.push({ c, cl });
  }
  const list = {
    mapVersion: 2,
    note: 'Curated fictional development sites (OSM building footprints cleared for gameplay). Edit deliberately; bump the map version when changing.',
    sites: chosen.map(({ c, cl }) => ({ osm: c.b.members ? c.b.members.map((m) => m.id) : [c.b.id], cluster: cl.key, area: cl.label, street: c.street })),
  };
  writeFileSync(SITES_FILE, JSON.stringify(list, null, 1));
  console.log(`Proposed ${list.sites.length} sites from ${siteCandidates.length} candidates → ${SITES_FILE}`);
}
if (process.env.SITE_DEBUG) console.log('groups', JSON.stringify(groupStats));
if (process.env.WHY) {
  const [wx, wz] = process.env.WHY.split(',').map(Number);
  const reasons = {};
  for (const b of buildings) {
    const r = b.rings[0]; let cx = 0, cz = 0; for (let i = 0; i < r.length; i += 2) { cx += r[i]; cz += r[i + 1]; } cx /= r.length / 2; cz /= r.length / 2;
    if (Math.hypot(cx - wx, cz - wz) > 90) continue;
    let why;
    if (!ordinary(b)) why = `not ordinary (${b.type}${b.name ? ', named' : ''}${b.protected ? ', protected' : ''})`;
    else {
      const s2 = analyseSite(b);
      if (!s2) why = 'no street frontage / rect';
      else if (s2.A < 140) why = 'area < 140'; else if (s2.A > 1000) why = 'area > 1000';
      else if (s2.rectangularity < 0.72) why = 'not rectangular'; else if (s2.w < 6 || s2.d < 8) why = `too small rect ${s2.w.toFixed(1)}x${s2.d.toFixed(1)}`;
      else if (s2.w > 30) why = 'frontage > 30'; else if (touchesProtected(s2.poly)) why = 'touches protected';
      else if (!siteValid(b, s2)) why = 'blocked (road/park/edge)'; else why = 'OK';
    }
    reasons[why] = (reasons[why] ?? 0) + 1;
  }
  console.log('WHY', JSON.stringify(reasons));
}
if (process.env.DUMP_CANDIDATES) writeFileSync(process.env.DUMP_CANDIDATES, JSON.stringify(siteCandidates.map((c) => [round1(c.cx), round1(c.cz)])));

const siteList = JSON.parse(readFileSync(SITES_FILE, 'utf8'));
const plots = [];
siteList.sites.forEach((entry, i) => {
  const members = entry.osm.map((id) => buildings.find((x) => x.id === id));
  if (members.some((m) => !m)) { report.warnings.push(`site ${entry.osm} missing from data`); return; }
  const b = members.length === 1 ? members[0] : { id: entry.osm.join('+'), rings: [hull(members.flatMap((m) => { const r = m.rings[0], q = []; for (let k = 0; k < r.length; k += 2) q.push([r[k], r[k + 1]]); return q; })).flatMap((p) => [p[0], p[1]])], members, type: 'terrace' };
  const s2 = analyseSite(b);
  if (!siteValid(b, s2)) { report.warnings.push(`site ${entry.osm} no longer valid`); return; }
  const allowed = Object.entries(FIT).filter(([, f]) => s2.w >= f.w && s2.d >= f.d).map(([t]) => t);
  const restrictions = {};
  for (const [t, f] of Object.entries(FIT)) if (!allowed.includes(t)) restrictions[t] = `Too small for a ${t}: needs ${f.w} × ${f.d} m (site is ${s2.w.toFixed(0)} × ${s2.d.toFixed(0)} m).`;
  plots.push({
    id: `k${String(i + 1).padStart(2, '0')}`,
    number: i + 1,
    x: round1(s2.cx), z: round1(s2.cz),
    w: Math.round(s2.w * 10) / 10, d: Math.round(s2.d * 10) / 10,
    angle: +s2.angle.toFixed(4),
    area: entry.area,
    street: s2.street ?? null,
    boundary: s2.poly.flatMap((p) => [round1(p[0]), round1(p[1])]),
    boundaryTris: triangulate(s2.poly).map(round1),
    allowed,
    restrictions,
    replaces: entry.osm,
  });
});

// Save migration tables (deterministic): map v1 plot → v2 site (nearest unused, by v1 order), and
// legacy plot → v2 site via v1.
const v1 = JSON.parse(readFileSync('data/osm/plots-v1.json', 'utf8'));
const previousPlotMap = {};
{
  const used = new Set();
  for (const o of v1.plots) {
    const cand = plots.filter((p) => !used.has(p.id)).map((p) => ({ p, d: Math.hypot(p.x - o.x, p.z - o.z) })).sort((a, b) => a.d - b.d || a.p.id.localeCompare(b.p.id))[0];
    if (cand) { previousPlotMap[o.id] = cand.p.id; used.add(cand.p.id); }
  }
}
const legacyPlotMap = Object.fromEntries(Object.entries(v1.legacyPlotMap).map(([old, g]) => [old, previousPlotMap[g]]).filter(([, k]) => k));

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
// Site clearances (independent re-check of each site's building rectangle)
let plotRoadViolations = 0, plotOverlap = 0;
for (const p of plots) {
  const poly = rectPoly(p.x, p.z, p.angle, p.w, p.d);
  for (const r of roads) for (let i = 0; i + 3 < r.pts.length; i += 2) if (polySegDist(poly, [r.pts[i], r.pts[i + 1]], [r.pts[i + 2], r.pts[i + 3]]) < r.w / 2) plotRoadViolations++;
  for (const q of plots) if (q !== p && polygonsOverlap(poly, rectPoly(q.x, q.z, q.angle, q.w, q.d))) plotOverlap++;
}

const stats = {
  roads: roads.length, roadsWithOsmWidth: roads.filter((r) => r.widthSource === 'osm').length, junctionVertices: junctionNodes,
  areas: areas.length, buildings: buildings.length, heightFromOsm, heightFromLevels, heightEstimated, triangulationWarnings: triFail,
  landmarks: landmarks.length, labels: labels.length, siteCandidates: siteCandidates.length, plots: plots.length,
  restoredFootprints: new Set(plots.flatMap((p) => p.replaces)).size, plotRoadViolations, plotOverlap,
};

// ---- Sloane Square perimeter: roof insets for the custom façade models --------------------------
// For each reconstructed building, the footprint inset by d metres (holes grown by d), triangulated, so
// the runtime can build mansard / pitched roofs whose slopes meet a flat lid without overlaps.
function offsetRing(r, d) {
  // r: [[x,z]...] any orientation; positive d moves edges inward
  const A = ringArea(r) > 0 ? 1 : -1;
  const n = r.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = r[(i - 1 + n) % n], p = r[i], b = r[(i + 1) % n];
    const e1 = [p[0] - a[0], p[1] - a[1]], e2 = [b[0] - p[0], b[1] - p[1]];
    const l1 = Math.hypot(...e1) || 1, l2 = Math.hypot(...e2) || 1;
    // inward normals (for A>0 rings inward is left-hand: (-ez, ex))
    const n1 = [(-e1[1] / l1) * A, (e1[0] / l1) * A], n2 = [(-e2[1] / l2) * A, (e2[0] / l2) * A];
    const m = [n1[0] + n2[0], n1[1] + n2[1]], ml = Math.hypot(...m) || 1;
    const cos = (m[0] / ml) * n1[0] + (m[1] / ml) * n1[1];
    const k = d / Math.max(0.35, cos);
    out.push([p[0] + (m[0] / ml) * k, p[1] + (m[1] / ml) * k]);
  }
  return out;
}
const squareRoofs = {};
for (const bl of buildings) {
  if (!bl.custom?.startsWith('square:') && !bl.custom?.startsWith('doy:') && !bl.custom?.startsWith('kr:')) continue;
  const toPts = (fr) => { const q = []; for (let i = 0; i < fr.length; i += 2) q.push([fr[i], fr[i + 1]]); return q; };
  const outer = toPts(bl.rings[0]), holes = bl.rings.slice(1).map(toPts);
  const insets = {};
  for (const d of [0.6, 1.2, 2.0, 3.0]) {
    const o = offsetRing(outer, d);
    const hs = holes.map((h) => offsetRing(h, d)); // a hole's "inward" (its own interior) is outward for the building; flip:
    const hsGrow = holes.map((h) => offsetRing(h, -d));
    if (Math.sign(ringArea(o)) !== Math.sign(ringArea(outer)) || Math.abs(ringArea(o)) < Math.abs(ringArea(outer)) * 0.2) continue;
    void hs;
    let tris; try { tris = triangulate(o, hsGrow); } catch { continue; }
    insets[d] = { ring: o.flatMap((p) => [round1(p[0]), round1(p[1])]), holes: hsGrow.map((h) => h.flatMap((p) => [round1(p[0]), round1(p[1])])), tris: tris.map(round1) };
  }
  squareRoofs[bl.id] = insets;
}

const formerSiteIds = new Set(plots.flatMap((p) => p.replaces));
const out = {
  kr,
  corridors,
  meta: {
    mapId: MAP_ID,
    mapVersion: MAP_VERSION,
    title: 'Chelsea Explorer: Sloane Square, King\'s Road & Duke of York Square',
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
  // Footprints that the old city-builder cleared for its fictional sites are ordinary buildings
  // again; `formerSite` only records that their mass is a generic extrusion (see docs/explorer.md).
  buildings: buildings.map(({ poly, osmId, area, ...b }) => (formerSiteIds.has(b.id) ? { ...b, formerSite: true } : b)),
  landmarks,
  labels,
  landmarkModels,
  square,
  squareRoofs,
  doy,
};
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(out));
// Gameplay data is archived separately and never loaded by the explorer. It documents what the old
// city-builder saves refer to (site ids k01…k22 and the save-migration tables); see docs/explorer.md.
if (!process.argv.includes('--no-archive')) {
  mkdirSync('data/legacy', { recursive: true });
  writeFileSync('data/legacy/game-sites-v2.json', JSON.stringify({
    note: 'Archived gameplay data from Chelsea Mini City (map v2). Not used at runtime. Fictional development sites and save-migration tables.',
    mapVersion: MAP_VERSION, plots, legacyPlotMap, previousPlotMap,
  }, null, 1));
}
console.log('peterJones', JSON.stringify(report.peterJones));
console.log(JSON.stringify({ stats, checks, orientation: orient, legacyPlotMap, warnings: report.warnings.slice(0, 15), warningCount: report.warnings.length }, null, 1));
console.log(`Wrote ${outFile} (${(JSON.stringify(out).length / 1024).toFixed(0)} KiB)`);
