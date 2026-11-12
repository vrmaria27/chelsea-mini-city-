// The geographically grounded map, built from the bundled OpenStreetMap extract
// (src/map/osm/chelsea-osm.json, produced by scripts/osm/process.mjs). No runtime requests.
import data from './osm/chelsea-osm.json';
import type { MapLabelDef, SceneMap } from './types';
import { MeshBuilder, hex, rng, shade, type RGB } from '../engine/geometry';
import { P, tree } from './palette';
import { UPPER_TOP, buildPeterJones, peterJonesDecals, type LandmarkModelData } from './landmarks/peterJones';
import { SQUARE_Y, buildSloaneSquare, buildSquareNature, type SquareData } from './landmarks/sloaneSquare';
import { buildSquareBuildings, squareSignDecal, type RoofInsets, type SignQuad } from './landmarks/squareBuildings';
import { DOY_PLAZA_IDS, addDoyNature, buildDukeOfYorkSquare, type DoyData } from './landmarks/dukeOfYorkSquare';
import { buildKrFurniture, buildKrStreet, krNearest, useCorridorLine, useKingsRoadLine, withCorridorLine, type KrData } from './landmarks/kingsRoad';
import { addKrNature } from './landmarks/kingsRoadNature';

export interface OsmRoad { id: number; name: string | null; hw: string; cls: 'main' | 'street' | 'service' | 'pedestrian' | 'path'; w: number; pts: number[]; sidewalk?: boolean; /** Per-vertex widths (King's Road, fitted between the building lines). */ wv?: number[] }
export interface OsmArea { id: string; kind: 'green' | 'plaza' | 'carriageway' | 'parking'; name: string | null; ring: number[]; tris: number[] }
export interface OsmBuilding {
  id: string; h: number; hSrc: string; type: string; name: string | null; protected: boolean; rings: number[][]; tris: number[];
  custom?: string; landmarkId?: string;
  /** Footprint that the old city-builder had cleared; now an approximate generic mass again. */
  formerSite?: boolean;
}
interface OsmData {
  meta: Record<string, unknown> & { half: number; mapVersion: number; title: string; attribution: string; copyrightUrl: string; retrieved: string; osmBase: string; centre: { lat: number; lon: number }; bbox: Record<string, number> };
  roads: OsmRoad[];
  areas: OsmArea[];
  buildings: OsmBuilding[];
  landmarks: { name: string; x: number; z: number }[];
  labels: { text: string; x: number; z: number; angle: number; maxLen: number; cls: string }[];
  landmarkModels: (LandmarkModelData & { model: string; name: string })[];
  square: SquareData | null;
  squareRoofs: Record<string, RoofInsets>;
  doy: DoyData | null;
  kr: KrData | null;
  /** Sloane Street and Lower Sloane Street corridors (same shape as King's Road). */
  corridors?: (KrData & { id: string; name: string })[];
}

export const OSM = data as unknown as OsmData;
// corridor centrelines for the frontage builders (King's Road also set in buildStatic)
if (OSM.kr) useKingsRoadLine(OSM.kr.line);
for (const c of OSM.corridors ?? []) useCorridorLine(c.id, c.line);
const HALF = OSM.meta.half;
const MARGIN = 16; // plinth margin around the map (metres)
const TITLE_MARGIN = 44; // extra plinth on the south (near) side for the title and attribution

// Layer heights (map metres) keep coplanar layers apart without z-fighting at tabletop scale.
export const Y = { ground: 0, parking: 0.1, carriageway: 0.12, green: 0.15, plaza: 0.18, path: 0.22, pedestrian: 0.26, service: 0.3, street: 0.34, main: 0.38 };
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

function ribbon(b: MeshBuilder, pts: number[], w: number, y: number, col: RGB, wv?: number[]): void {
  const hwAt = (k: number) => (wv ? wv[k] : w) / 2;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.01) continue;
    const ha = hwAt(i / 2), hb = hwAt(i / 2 + 1);
    const ux = -(bz - az) / len, uz = (bx - ax) / len;
    // quad facing up: (a - n), (b - n), (b + n), (a + n) with upward winding
    const p0 = [ax - ux * ha, y, az - uz * ha], p1 = [bx - ux * hb, y, bz - uz * hb], p2 = [bx + ux * hb, y, bz + uz * hb], p3 = [ax + ux * ha, y, az + uz * ha];
    upQuad(b, p0, p1, p2, p3, col);
  }
  // round joins so bends and junctions have no gaps
  for (let i = 0; i < pts.length; i += 2) disc(b, pts[i], pts[i + 1], y, hwAt(i / 2), col);
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

/** Distance (m) from Sloane Square within which plain masses get window rows and a cornice line. */
const DETAIL_RADIUS = 240;
const GLASS = hex('#46525e');
const SHOP_GLASS = hex('#39434d');
const MASSING = hex('#dcd6cb');

/**
 * Extruded footprint: outward-facing walls for the outer ring and courtyard walls for holes; flat
 * roof. Near the square (`detail`), street-facing walls get simple window rows, a darker ground
 * floor for shops and a pale cornice line so they do not read as blank boxes at eye level. Window
 * positions are generic (one per 3.4 m bay and 3.2 m storey), not surveyed.
 */
function extrude(b: MeshBuilder, bl: OsmBuilding, hidden: boolean, detail = false, isParty?: (x: number, z: number) => boolean, muted = false): void {
  if (hidden) return;
  // beyond the end of the King's Road reconstruction: a plain pale massing model (not a reconstruction)
  const wall = muted ? MASSING : wallColour(bl);
  if (muted) detail = false;
  const roof = muted ? shade(MASSING, 0.9) : shade(ROOF[hash(bl.id) % ROOF.length], 1);
  const cornice = shade(wall, 1.22);
  const h = bl.h;
  const shopType = bl.type === 'retail' || bl.type === 'commercial';
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
      if (!detail || ri !== 0) continue;
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 3.5) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len;
      // outward normal (quad winding faces outward); skip party walls against a neighbour
      let nx = uz, nz = -ux;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (pointInRing(mx + nx * 0.4, mz + nz * 0.4, ring)) { nx = -nx; nz = -nz; }
      if (isParty?.(mx + nx * 0.8, mz + nz * 0.8)) continue;
      const off = 0.06;
      const P = (t: number, y: number, o = off): number[] => [ax + ux * t + nx * o, y, az + uz * t + nz * o];
      const face = (t0: number, t1: number, y0: number, y1: number, col: RGB, o = off) => b.quad(P(t0, y0, o), P(t1, y0, o), P(t1, y1, o), P(t0, y1, o), col);
      // cornice line under the roof edge
      if (h > 6) face(0, len, h - 0.75, h - 0.3, cornice, 0.12);
      const bays = Math.floor((len - 1.2) / 3.4);
      if (bays < 1) continue;
      const m = (len - bays * 3.4) / 2;
      const floors = Math.max(1, Math.floor((h - 1.4) / 3.2));
      for (let f = 0; f < floors; f++) {
        const y0 = 1.0 + f * 3.2;
        if (f === 0 && shopType) {
          face(0.3, len - 0.3, 0.3, 3.0, SHOP_GLASS);
          continue;
        }
        if (y0 + 1.9 > h - 0.8) break;
        for (let k = 0; k < bays; k++) {
          const c = m + 3.4 * (k + 0.5);
          face(c - 0.62, c + 0.62, y0 + (f === 0 ? 0 : 0.2), y0 + 1.9, GLASS);
        }
      }
    }
  });
  flatTris(b, bl.tris, h, roof);
}

function reverse(r: number[]): number[] {
  const out: number[] = [];
  for (let i = r.length - 2; i >= 0; i -= 2) out.push(r[i], r[i + 1]);
  return out;
}

export function pointInRing(x: number, z: number, r: number[]): boolean {
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

let squareSigns: SignQuad[] = [];
/** Green areas that get no decorative scatter trees (the Duke of York's HQ playing field is open grass). */
const NO_SCATTER = new Set(['w1368124984']);
/** Triangle counts of the King's Road street layers (for checks and docs). */
export let krStats: Record<string, number> = {};
/** True beyond the end of the King's Road reconstruction (near the road, west of the Markham Square junction). */
export function beyondKrEnd(x: number, z: number, kr: KrData): boolean {
  const q = krNearest(x, z);
  return q.s > kr.sEnd + 2 && q.d < 60;
}
/** Every rebuilt street corridor: King's Road, then Sloane Street and Lower Sloane Street. */
const allCorridors = (): (KrData & { id: string })[] => [...(OSM.kr ? [{ ...OSM.kr, id: 'kr' }] : []), ...(OSM.corridors ?? [])];
/** Nearest point on a corridor's centreline. */
const corNear = (c: { id: string }, x: number, z: number) => withCorridorLine(c.id, () => krNearest(x, z));
/** Triangle counts of the Duke of York Square layers (for checks and docs). */
export let doyStats: Record<string, number> = {};
const doyPlaza = () => OSM.areas.filter((a) => DOY_PLAZA_IDS.includes(a.id)).map((a) => ({ ring: a.ring, tris: a.tris }));
/** Label heights just above each reconstructed landmark's own roofline (map metres). */
const SQUARE_LABEL_Y: Record<string, number> = { 'square:royal-court': 20.5, 'square:holy-trinity': 31.5, 'square:hotel': 26, 'square:station': 28, 'doy:saatchi': 16.5 };
/** Labels moved off a model onto open ground beside it (map metres). */
const LABEL_AT: Record<string, [number, number]> = { 'Duke of York Square': [-26, 27] };

/** Wooden model base, north arrow and lettering: miniature view only. */
function buildPlinth(): MeshBuilder {
  const b = new MeshBuilder();
  const H = HALF;
  b.box(-H - MARGIN, -16, -H - MARGIN, H + MARGIN, -1.52, H + TITLE_MARGIN, P.plinth);
  b.flat(-H - MARGIN, -H - MARGIN, H + MARGIN, H + TITLE_MARGIN, -0.01, P.plinthTop);
  northArrow(b, H - 18, H + 22, 0);
  return b;
}

function buildStatic(): MeshBuilder {
  const b = new MeshBuilder();
  const H = HALF;
  // Pavement-coloured ground (the plinth below it is drawn separately)
  b.box(-H, -1.5, -H, H, Y.ground, H, P.pavement);
  for (const a of OSM.areas) flatTris(b, a.tris, Y[a.kind], AREA_COL[a.kind]);
  // Roads: wider classes on top
  const order: OsmRoad['cls'][] = ['path', 'pedestrian', 'service', 'street', 'main'];
  for (const cls of order) for (const r of OSM.roads) if (r.cls === cls) ribbon(b, r.pts, r.w, Y[cls], ROAD_COL[cls], r.wv);
  // Buildings. Landmarks with a custom model replace their generic extrusion (no duplicate façades).
  // Every other footprint, including the former game sites, is an extruded mass at its OSM height.
  const sq = OSM.square;
  const cx = sq ? 177 : 0, cz = sq ? -150 : 0;
  const centre = (bl: OsmBuilding) => { const r = bl.rings[0]; let x = 0, z = 0; for (let i = 0; i < r.length; i += 2) { x += r[i]; z += r[i + 1]; } return [x / (r.length / 2), z / (r.length / 2)]; };
  const kr = OSM.kr;
  if (kr) useKingsRoadLine(kr.line);
  const cors = allCorridors();
  for (const c of cors) useCorridorLine(c.id, c.line);
  const near = OSM.buildings.filter((bl) => { const [x, z] = centre(bl); return Math.hypot(x - cx, z - cz) < DETAIL_RADIUS + 60 || cors.some((c) => corNear(c, x, z).d < 100); });
  const isParty = (x: number, z: number) => near.some((o) => pointInRing(x, z, o.rings[0]));
  for (const bl of OSM.buildings) {
    const [x, z] = centre(bl);
    // window rows near Sloane Square and in the background of the King's Road corridor (side-street returns)
    const nearKr = cors.some((c) => { const q = corNear(c, x, z); return q.d < 60 && q.s >= c.sStart && q.s <= c.sEnd; });
    // beyond the end of a reconstructed street (and not beside another): plain pale massing
    const beyond = !nearKr && cors.some((c) => { const q = corNear(c, x, z); return q.s > c.sEnd + 2 && q.d < 60; });
    extrude(b, bl, !!bl.custom, (!!sq && Math.hypot(x - cx, z - cz) < DETAIL_RADIUS) || nearKr, isParty, beyond);
  }
  for (const lm of OSM.landmarkModels) if (lm.model === 'peter-jones') buildPeterJones(b, lm);
  if (OSM.square) buildSloaneSquare(b, OSM.square);
  // Sloane Square perimeter: individual reconstructions replace the generic extrusions of their footprints
  if (OSM.square) squareSigns = buildSquareBuildings(b, OSM.buildings, OSM.squareRoofs ?? {}, OSM.square.ring).signs;
  // Duke of York Square and the gallery forecourt (the gallery and its neighbours are built above)
  if (OSM.doy) {
    const r = buildDukeOfYorkSquare(b, OSM.doy, doyPlaza(), OSM.buildings.find((x) => x.id === 'w5317958')?.rings[0]);
    squareSigns = squareSigns.concat(r.signs);
    doyStats = r.stats;
  }
  // King's Road: pavement and kerbs along both sides, street furniture from OSM
  if (cors.length) {
    const inB = (x: number, z: number) => OSM.buildings.some((bl) => { const r = bl.rings[0]; return x > -HALF && pointInRing(x, z, r); });
    krStats = {};
    for (const c of cors) {
      const st = buildKrStreet(b, c, OSM.roads, inB);
      const fu = withCorridorLine(c.id, () => buildKrFurniture(b, c, squareSigns));
      krStats[`${c.id}.pavement`] = st.tris; krStats[`${c.id}.furniture`] = fu.tris;
    }
    krStats.pavement = krStats['kr.pavement'] ?? 0; krStats.furniture = krStats['kr.furniture'] ?? 0;
  }
  // Decorative trees inside green spaces (positions are not sourced; deterministic scatter)
  const rand = rng(51491);
  for (const a of OSM.areas) {
    if (a.kind !== 'green') continue;
    if (NO_SCATTER.has(a.id)) continue; // playing field: open grass in photographs
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
    // reconstructed square buildings are taller than their footprint height (roofs, gables, turrets)
    let y = roof?.custom === 'peter-jones' ? UPPER_TOP + 1.3 : roof?.custom && SQUARE_LABEL_Y[roof.custom] ? SQUARE_LABEL_Y[roof.custom] : roof?.custom?.startsWith('square:') ? roof.h + 8 : roof ? roof.h + 0.6 : Y.main + 0.4;
    let { x, z } = m;
    if (LABEL_AT[m.name]) { [x, z] = LABEL_AT[m.name]; y = Y.main + 0.4; }
    // The fountain's name lies on the paving beside it rather than through the statue.
    let size = 9.5;
    if (m.name === 'Venus Fountain' && OSM.square) {
      const ax = OSM.square.axis;
      x += Math.cos(ax) * 14; z += Math.sin(ax) * 14; y = SQUARE_Y + 0.1; size = 2.2;
    }
    out.push({ text: m.name, x, z, y, angle: m.name === 'Venus Fountain' && OSM.square ? -OSM.square.axis : 0, size, color: '#2e2a26', outline: 'rgba(255,255,255,0.92)', bold: true, tier: 'major' });
  }
  const H = HALF;
  out.push({ text: 'Chelsea Explorer', x: -H + 120, z: H + 16, y: 0.05, angle: 0, size: 12, color: '#fbf3e6', outline: 'rgba(70,45,30,0.9)', bold: true, tier: 'plinth' });
  out.push({ text: '© OpenStreetMap contributors · ODbL', x: -H + 120, z: H + 33, y: 0.05, angle: 0, size: 6, color: '#f1e4cf', outline: 'rgba(70,45,30,0.9)', tier: 'plinth' });
  out.push({ text: 'N', x: H - 18, z: H + 5, y: 0.3, angle: 0, size: 9, color: '#fbf3e6', outline: 'rgba(70,45,30,0.9)', bold: true, tier: 'plinth' });
  return out;
}

export const osmMap: SceneMap = {
  id: 'chelsea-osm',
  version: OSM.meta.mapVersion,
  title: OSM.meta.title,
  half: HALF,
  baseScale: 0.0015, // 700 m → 1.05 m on the table
  buildStatic,
  buildPlinth,
  labels,
  attribution: { text: OSM.meta.attribution, url: OSM.meta.copyrightUrl },
  notes:
    `Streets, public spaces, building footprints and landmark positions come from OpenStreetMap (retrieved ${OSM.meta.retrieved.slice(0, 10)}). ` +
    'Road widths without a width tag, building heights without height/levels tags, façade colours and trees outside Sloane Square are stylised estimates.',
  nature: OSM.square ? () => buildSquareNature(OSM.square!, (n) => (OSM.doy ? addDoyNature(OSM.doy, doyPlaza(), n) : 0) + allCorridors().reduce((m, c) => m + withCorridorLine(c.id, () => addKrNature(c, n)), 0)) : undefined,
  decals: () => {
    const out = OSM.landmarkModels.filter((m) => m.model === 'peter-jones').flatMap((m) => peterJonesDecals(m));
    const sq = squareSignDecal(squareSigns);
    if (sq) out.push(sq);
    return out;
  },
};
