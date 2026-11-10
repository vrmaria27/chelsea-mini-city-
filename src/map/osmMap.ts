// The geographically grounded map, built from the bundled OpenStreetMap extract
// (src/map/osm/chelsea-osm.json, produced by scripts/osm/process.mjs). No runtime requests.
import data from './osm/chelsea-osm.json';
import type { GameMap, LifePath, MapLabelDef, PlotDef } from './types';
import { MeshBuilder, hex, rng, shade, type RGB } from '../engine/geometry';
import { P, tree } from '../game/cityModel';
import { UPPER_TOP, buildPeterJones, peterJonesDecals, type LandmarkModelData } from './landmarks/peterJones';

interface OsmRoad { id: number; name: string | null; hw: string; cls: 'main' | 'street' | 'service' | 'pedestrian' | 'path'; w: number; pts: number[]; sidewalk?: boolean }
interface OsmArea { id: string; kind: 'green' | 'plaza' | 'carriageway' | 'parking'; name: string | null; ring: number[]; tris: number[] }
interface OsmBuilding { id: string; h: number; hSrc: string; type: string; name: string | null; protected: boolean; rings: number[][]; tris: number[]; custom?: string; landmarkId?: string }
interface OsmData {
  meta: Record<string, unknown> & { half: number; mapVersion: number; title: string; attribution: string; copyrightUrl: string; retrieved: string; osmBase: string; centre: { lat: number; lon: number }; bbox: Record<string, number> };
  roads: OsmRoad[];
  areas: OsmArea[];
  buildings: OsmBuilding[];
  landmarks: { name: string; x: number; z: number }[];
  labels: { text: string; x: number; z: number; angle: number; maxLen: number; cls: string }[];
  plots: (PlotDef & { replaces: string[] })[];
  landmarkModels: (LandmarkModelData & { model: string; name: string })[];
  legacyPlotMap: Record<string, string>;
  previousPlotMap: Record<string, string>;
  walkPaths: number[][];
  drivePaths: { name: string; w: number; pts: number[] }[];
}

export const OSM = data as unknown as OsmData;
const HALF = OSM.meta.half;
const MARGIN = 16; // plinth margin around the map (metres)
const TITLE_MARGIN = 44; // extra plinth on the south (near) side for the title and attribution

// Layer heights (map metres) keep coplanar layers apart without z-fighting at tabletop scale.
const Y = { ground: 0, parking: 0.1, carriageway: 0.12, green: 0.15, plaza: 0.18, path: 0.22, pedestrian: 0.26, service: 0.3, street: 0.34, main: 0.38 };
const ROAD_COL: Record<OsmRoad['cls'], RGB> = {
  main: hex('#858991'), street: hex('#979ba2'), service: hex('#b2aea5'), pedestrian: hex('#e6d9bd'), path: hex('#d6c7a6'),
};
const AREA_COL: Record<OsmArea['kind'], RGB> = { green: hex('#a3c283'), plaza: hex('#ece2cf'), carriageway: hex('#979ba2'), parking: hex('#c6c1b6') };
const BRICKS = ['#a9563f', '#b5664a', '#9b4c3a', '#b9775a', '#94604a'].map(hex);
const CREAMS = ['#f0e7d4', '#e9ddc5', '#f4ecdc', '#e6dccb'].map(hex);
const PASTELS = ['#ebcdc4', '#cfdccf', '#ecdcac', '#d3dce6'].map(hex);
const ROOF = [hex('#6a6f78'), hex('#74737a'), hex('#7c7368')];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic, stylised façade colour by building type (not sourced). */
function wallColour(b: OsmBuilding): RGB {
  const h = hash(b.id);
  if (b.type === 'church' || b.type === 'chapel') return hex('#d8cfbf');
  if (b.type === 'retail' || b.type === 'commercial' || b.type === 'hotel' || b.type === 'office') return CREAMS[h % CREAMS.length];
  if (b.type === 'school' || b.type === 'apartments') return h % 4 === 0 ? CREAMS[h % CREAMS.length] : BRICKS[h % BRICKS.length];
  const r = h % 10;
  return r < 6 ? BRICKS[h % BRICKS.length] : r < 9 ? CREAMS[h % CREAMS.length] : PASTELS[h % PASTELS.length];
}

function ribbon(b: MeshBuilder, pts: number[], w: number, y: number, col: RGB): void {
  const hw = w / 2;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const nx = (-(bz - az) / len) * hw, nz = ((bx - ax) / len) * hw;
    // quad facing up: (a - n), (b - n), (b + n), (a + n) with upward winding
    const p0 = [ax - nx, y, az - nz], p1 = [bx - nx, y, bz - nz], p2 = [bx + nx, y, bz + nz], p3 = [ax + nx, y, az + nz];
    upQuad(b, p0, p1, p2, p3, col);
  }
  // round joins so bends and junctions have no gaps
  for (let i = 0; i < pts.length; i += 2) disc(b, pts[i], pts[i + 1], y, hw, col);
}

function upQuad(b: MeshBuilder, p0: number[], p1: number[], p2: number[], p3: number[], col: RGB): void {
  // ensure the face points up whichever way the segment runs
  const cy = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
  if (cy >= 0) b.quad(p0, p1, p2, p3, col);
  else b.quad(p0, p3, p2, p1, col);
}

function disc(b: MeshBuilder, x: number, z: number, y: number, r: number, col: RGB, n = 8): void {
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    b.tri([x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], col);
  }
}

function flatTris(b: MeshBuilder, tris: number[], y: number, col: RGB): void {
  for (let i = 0; i + 5 < tris.length; i += 6) b.tri([tris[i], y, tris[i + 1]], [tris[i + 2], y, tris[i + 3]], [tris[i + 4], y, tris[i + 5]], col);
}

/** Signed shoelace area in x/z. */
function ringArea(r: number[]): number {
  let a = 0;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += r[j * 2] * r[i * 2 + 1] - r[i * 2] * r[j * 2 + 1];
  return a / 2;
}

/** Extruded footprint: outward-facing walls for the outer ring and courtyard walls for holes; flat roof. */
function extrude(b: MeshBuilder, bl: OsmBuilding, hidden: boolean): void {
  if (hidden) return;
  const wall = wallColour(bl);
  const roof = shade(ROOF[hash(bl.id) % ROOF.length], 1);
  const h = bl.h;
  bl.rings.forEach((ring, ri) => {
    // outer ring needs negative shoelace orientation for outward normals; holes the opposite
    const wantNegative = ri === 0;
    const neg = ringArea(ring) < 0;
    const r = neg === wantNegative ? ring : reverse(ring);
    const n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ax = r[i * 2], az = r[i * 2 + 1], bx = r[j * 2], bz = r[j * 2 + 1];
      b.quad([ax, 0, az], [bx, 0, bz], [bx, h, bz], [ax, h, az], wall);
    }
  });
  flatTris(b, bl.tris, h, roof);
  // thin parapet line on the roof edge for a crisper silhouette
}

function reverse(r: number[]): number[] {
  const out: number[] = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i], r[i + 1]);
  return out;
}

function pointInRing(x: number, z: number, r: number[]): boolean {
  let inside = false;
  const n = r.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = r[i * 2], zi = r[i * 2 + 1], xj = r[j * 2], zj = r[j * 2 + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function northArrow(b: MeshBuilder, x: number, z: number, y: number): void {
  const s = 9;
  const dark = hex('#2f5a45'), light = hex('#f6efe2');
  disc(b, x, z, y, s * 1.25, hex('#5d4030'), 20);
  // two-tone arrowhead pointing north (−z)
  b.tri([x, y + 0.2, z - s], [x - s * 0.55, y + 0.2, z + s * 0.7], [x, y + 0.2, z + s * 0.3], dark);
  b.tri([x, y + 0.2, z - s], [x, y + 0.2, z + s * 0.3], [x + s * 0.55, y + 0.2, z + s * 0.7], light);
}

function buildStatic(): MeshBuilder {
  const b = new MeshBuilder();
  const H = HALF;
  const hidden = new Set(OSM.plots.flatMap((p) => p.replaces));
  // Plinth (wooden model base) and pavement-coloured ground
  b.box(-H - MARGIN, -16, -H - MARGIN, H + MARGIN, -0.02, H + TITLE_MARGIN, P.plinth);
  b.flat(-H - MARGIN, -H - MARGIN, H + MARGIN, H + TITLE_MARGIN, -0.01, P.plinthTop);
  b.box(-H, -1.5, -H, H, Y.ground, H, P.pavement);
  for (const a of OSM.areas) flatTris(b, a.tris, Y[a.kind], AREA_COL[a.kind]);
  // Roads: wider classes on top
  const order: OsmRoad['cls'][] = ['path', 'pedestrian', 'service', 'street', 'main'];
  for (const cls of order) for (const r of OSM.roads) if (r.cls === cls) ribbon(b, r.pts, r.w, Y[cls], ROAD_COL[cls]);
  // Buildings (footprints under development plots are hidden)
  // Landmarks with a custom model replace their generic extrusion (no duplicate façades).
  for (const bl of OSM.buildings) extrude(b, bl, hidden.has(bl.id) || !!bl.custom);
  for (const lm of OSM.landmarkModels) if (lm.model === 'peter-jones') buildPeterJones(b, lm);
  // Decorative trees inside green spaces (positions are not sourced; deterministic scatter)
  const rand = rng(51491);
  for (const a of OSM.areas) {
    if (a.kind !== 'green') continue;
    const xs = a.ring.filter((_, i) => i % 2 === 0), zs = a.ring.filter((_, i) => i % 2 === 1);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    const n = Math.min(40, Math.floor(Math.abs(ringArea(a.ring)) / 320));
    let placed = 0;
    for (let k = 0; k < n * 6 && placed < n; k++) {
      const x = x0 + rand() * (x1 - x0), z = z0 + rand() * (z1 - z0);
      if (!pointInRing(x, z, a.ring)) continue;
      tree(b, x, z, Y.green, 0.9 + rand() * 0.4, P.greens[Math.floor(rand() * 4)], rand() * 3);
      placed++;
    }
  }
  northArrow(b, H - 18, H + 22, 0);
  return b;
}

function labels(): MapLabelDef[] {
  const out: MapLabelDef[] = [];
  for (const l of OSM.labels) {
    const size = l.cls === 'main' ? 11 : l.cls === 'pedestrian' ? 6.5 : 7.5;
    // Visibility limit: shorten nothing, but skip labels that would overhang their street segment.
    if (l.text.length * size * 0.72 > l.maxLen * 2.2) continue;
    out.push({
      text: l.text, x: l.x, z: l.z, y: Y.main + 0.2, angle: l.angle, size,
      color: '#f7f2e8', outline: 'rgba(55,58,66,0.9)', tier: l.cls === 'main' ? 'major' : 'minor', bold: l.cls === 'main',
    });
  }
  for (const m of OSM.landmarks) {
    // Lay the name on the landmark's own roof, or on the ground for squares and parks.
    const roof = OSM.buildings.find((bl) => pointInRing(m.x, m.z, bl.rings[0]));
    const y = roof?.custom === 'peter-jones' ? UPPER_TOP + 1.3 : roof ? roof.h + 0.6 : Y.main + 0.4;
    out.push({ text: m.name, x: m.x, z: m.z, y, angle: 0, size: 9.5, color: '#2e2a26', outline: 'rgba(255,255,255,0.92)', bold: true, tier: 'major' });
  }
  const H = HALF;
  out.push({ text: 'Chelsea Mini City', x: -H + 120, z: H + 16, y: 0.05, angle: 0, size: 12, color: '#fbf3e6', outline: 'rgba(70,45,30,0.9)', bold: true, tier: 'plinth' });
  out.push({ text: '© OpenStreetMap contributors · ODbL', x: -H + 120, z: H + 33, y: 0.05, angle: 0, size: 6, color: '#f1e4cf', outline: 'rgba(70,45,30,0.9)', tier: 'plinth' });
  out.push({ text: 'N', x: H - 18, z: H + 5, y: 0.3, angle: 0, size: 9, color: '#fbf3e6', outline: 'rgba(70,45,30,0.9)', bold: true, tier: 'plinth' });
  out.push({ text: 'Development plots are fictional', x: H - 140, z: H + 22, y: 0.05, angle: 0, size: 6, color: '#f1e4cf', outline: 'rgba(70,45,30,0.9)', tier: 'plinth' });
  return out;
}

const walkPaths: LifePath[] = OSM.walkPaths.map((pts) => ({ pts, y: Y.path + 0.05 }));
const drivePaths: LifePath[] = OSM.drivePaths.map((d) => ({ pts: d.pts, y: Y.main + 0.05 }));

export const osmMap: GameMap = {
  id: 'chelsea-osm',
  version: OSM.meta.mapVersion,
  title: OSM.meta.title,
  half: HALF,
  baseScale: 0.0015, // 700 m → 1.05 m on the table
  plots: OSM.plots.map(({ replaces, ...p }) => p),
  buildStatic,
  labels,
  walkPaths,
  drivePaths,
  attribution: { text: OSM.meta.attribution, url: OSM.meta.copyrightUrl },
  plotLabelSize: 13,
  notes:
    `Streets, public spaces, building footprints and landmark positions come from OpenStreetMap (retrieved ${OSM.meta.retrieved.slice(0, 10)}). ` +
    'Road widths without a width tag, building heights without height/levels tags, façade colours and trees are stylised estimates. ' +
    'Development plots are fictional redevelopment opportunities, not claims that real properties are vacant or available.',
  legacyPlotMap: OSM.legacyPlotMap,
  previousPlotMap: OSM.previousPlotMap,
  decals: () => OSM.landmarkModels.filter((m) => m.model === 'peter-jones').flatMap((m) => peterJonesDecals(m)),
};
