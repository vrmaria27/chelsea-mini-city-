// Side streets connecting the reconstructed areas (docs/side-streets.md). Every street-facing building gets
// its own configuration, generated from:
//   1. the street side's profile (PROFILES below), drawn from the inspected photographs of that street
//      (references/sd/index.json on the references-sd branch, cited as C:nnn) — the shared character of a
//      terrace: materials, window treatment, roofline, entrances, railings;
//   2. the building's own OpenStreetMap data (data/osm/sd-buildings.json, 2026-11-13): storey count and roof
//      storeys, material and colour tags, building type, the shops mapped inside it, its frontage width and
//      address — so neighbouring buildings differ where the data says they do;
//   3. per-building overrides (OVERRIDES) where a photograph shows that building individually.
// The status recorded for each building says which of these applied: 'observed' (own photograph),
// 'partly' (street photographed, building from OSM), 'estimated' (no usable photograph of the street).
import data from '../osm/chelsea-osm.json';
import type { Ground, KrSpec, MatKey, Win } from './kingsRoad';

interface Frontage { id: string; s: number; d: number; len: number; right: boolean; addr: string | null; name: string | null; levels: number | null; roofLevels: number | null; material: string | null; colour: string | null; type: string | null; h: number; shops: number; shopAddr: string[] }
interface SideCorridor { id: string; name: string; line: number[]; frontages: Frontage[] }

/** Shared character of one side of a street (from its photographs). */
export interface Profile {
  wall: MatKey;
  base?: MatKey;
  /** Ground and upper storey heights (m). */
  ground?: number;
  upper?: number;
  win: Win[];
  /** Ground floor when the building has no mapped shops. */
  plain: Ground;
  /** Ground floor when it has shops. */
  shop?: Partial<Ground>;
  top: KrSpec['top'];
  roof?: KrSpec['roof'];
  bands?: number[];
  bandCol?: MatKey;
  chimneys?: number;
  extra?: string;
  /** Approximate house width for terraces (m) — sets the bay count with the frontage width. */
  bayW?: number;
  /** Shopfronts on every building of this side, mapped shops or not (a shopping street). */
  shopAlways?: boolean;
  /** Wall colours varied between neighbouring buildings (chosen per building, stable). */
  palette?: MatKey[];
  /** Dutch / triangular gables over the front, one per this many metres. */
  gables?: { per: number; style: 'dutch' | 'triangle' | 'segment'; h: number; col?: MatKey; trim?: MatKey };
  /** Further configuration shared by the side (railings, pilasters, painted houses, …). */
  spec?: Partial<KrSpec>;
  src: string;
  conf: 'partly' | 'estimated';
  note?: string;
}

export const sash = (h = 0.6, crown?: Win['crown']): Win => ({ surround: 'arch', bars: 1, h, crown });
export const brick = (h = 0.6, archCol: MatKey = 'rubbed'): Win => ({ surround: 'plain', archCol, bars: 1, h });
export const stoneW = (h = 0.6): Win => ({ surround: 'stone', bars: 1, h });
const RES: Ground = { kind: 'residential', pilaster: 'stucco' };

// Generic fallback for a street without usable photographs (stated as such in the coverage table).
const UNSEEN: Profile = {
  wall: 'stock', base: 'stucco', win: [brick(0.62), brick(0.56)], plain: RES, top: { kind: 'parapet', h: 0.6, col: 'stucco' }, bands: [1], bandCol: 'stucco',
  src: 'No usable photograph of this street found; London stock brick over a stucco ground floor assumed from the surrounding Chelsea terraces', conf: 'estimated',
};

// ---- profiles (photographs inspected 2026-11-13; C:nnn = references/sd/nnn.jpg) ----------------------
const RAIL: Ground = { kind: 'residential', pilaster: 'stucco' };
/** Georgian / early-Victorian terrace: London stock brick over a white stucco ground floor, iron balconettes
 *  to the first-floor drawing-room windows, plain parapet (Lincoln, Royal Avenue, Bourne, Cliveden, …). */
const georgian = (src: string, o: Partial<Profile> = {}): Profile => ({
  wall: 'stock', base: 'stucco', ground: 3.4, upper: 3.0, bayW: 4.2,
  win: [{ surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.7, tall: true, balcony: 'balconette' }, brick(0.6), brick(0.5)],
  plain: RAIL, top: { kind: 'parapet', h: 0.6, col: 'stock' }, bands: [1], bandCol: 'stucco', chimneys: 2, src, conf: 'partly', ...o,
});
/** Late-Victorian red-brick mansion terraces with stone dressings and Dutch gables ("Pont Street Dutch":
 *  Cadogan Gardens, Culford Gardens, Sloane Gardens, Blacklands Terrace, Draycott Place). */
const dutch = (src: string, o: Partial<Profile> = {}): Profile => ({
  wall: 'red', base: 'red', ground: 3.6, upper: 3.2,
  win: [stoneW(0.62), stoneW(0.6), stoneW(0.56)], plain: { kind: 'residential', pilaster: 'stone' },
  top: { kind: 'cornice', h: 0.5, col: 'stone' }, roof: { kind: 'pitched', h: 2.6, col: 'slate' }, bands: [1, 2], bandCol: 'stone',
  gables: { per: 7, style: 'dutch', h: 3.2, trim: 'stone' }, chimneys: 2, src, conf: 'partly', ...o,
});
/** Red-brick mansion blocks with white-painted bay windows (Burton Court, Sloane Court; C:197–C:201). */
const mansion = (src: string, o: Partial<Profile> = {}): Profile => ({
  wall: 'red', base: 'red', ground: 3.5, upper: 3.1,
  win: [{ surround: 'stone', bars: 1, h: 0.62, pair: 2 }, { surround: 'stone', bars: 1, h: 0.6, pair: 2 }], plain: { kind: 'residential', pilaster: 'white' },
  top: { kind: 'cornice', h: 0.5, col: 'white' }, roof: { kind: 'pitched', h: 2.8, col: 'slate' }, bands: [1, 3], bandCol: 'white',
  gables: { per: 11, style: 'triangle', h: 3, col: 'red', trim: 'white' }, chimneys: 2, src, conf: 'partly', ...o,
});

export const PROFILES: Record<string, { L?: Profile; R?: Profile; both?: Profile }> = {
  // P1 — around Peter Jones
  'sd-symons': { both: {
    wall: 'red', base: 'stucco', ground: 4.0, upper: 3.1, shopAlways: true,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.58 }],
    plain: RAIL, shop: { fascia: 'stucco', pilaster: 'stucco', consoles: true, riser: 'white', fasciaH: 0.75 },
    top: { kind: 'cornice', h: 0.5, col: 'stucco' }, bands: [1], bandCol: 'stucco', chimneys: 2,
    src: 'C:222–C:228 (Symons Street, April 2022): red-brick upper floors over a continuous run of Victorian shopfronts with stucco pilasters, console brackets and painted fascias',
    conf: 'partly', note: 'the banded black-and-white rustication of the shop pilasters is drawn as plain stucco pilasters' } },
  'sd-pavilion': { both: {
    wall: 'red', base: 'red', ground: 3.3, upper: 2.9, palette: ['red', 'stock', 'redDeep', 'stockGrey'],
    win: [brick(0.58)], plain: { kind: 'residential', pilaster: 'white', garages: true },
    shop: { fascia: 'paintBlack', pilaster: 'white', riser: 'paintBlack' },
    top: { kind: 'parapet', h: 0.5 }, chimneys: 1,
    src: 'C:002, C:026, C:151, C:203, C:358, C:359 (Pavilion Road): two- and three-storey brick mews buildings (red and yellow stock) with shop and restaurant fronts at the Symons Street end, mews houses with garage doors to the north; paved as a shared surface',
    conf: 'partly' } },
  'sd-cadogan-gdns': { both: dutch('C:041, C:078, C:080, C:237, C:306, C:343, C:370, C:371 (Cadogan Gardens): red-brick mansion terraces with stone-banded storeys and Dutch gables') },
  'sd-cadogan-gdns-n': { both: dutch('C:078, C:080, C:237, C:306, C:343, C:369–C:371, C:385–C:390 (Cadogan Gardens): red-brick mansion terraces with stone-banded storeys and Dutch gables') },
  'sd-culford': { both: dutch('C:382 (view up Culford Gardens from Blacklands Terrace): red-brick mansion blocks with gables; individual blocks not photographed', { gables: { per: 9, style: 'dutch', h: 2.8, trim: 'stone' } }) },
  // P2 — King's Road, Duke of York Square, Saatchi, Royal Avenue
  'sd-cheltenham': { both: georgian('C:123 (1–13 Cheltenham Terrace): stock-brick terrace over a white stucco ground floor with a continuous first-floor iron balcony and area railings', {
    win: [{ surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.72, tall: true, balcony: 'balcony' }, brick(0.6), brick(0.5)] }) },
  'sd-franklins': { both: mansion('C:197–C:199 (mansion blocks north-west of the Royal Hospital, Franklin\'s Row): red brick with white-painted bay windows, gables and corner turrets') },
  'sd-turks': { both: mansion('C:201 (Sloane Court, north-west of the Royal Hospital): red-brick mansion blocks with white bays; York House and the school not photographed') },
  'sd-sloane-ct-e': { both: mansion('C:201 (Sloane Court): red-brick mansion blocks with white bays and gables') },
  'sd-sloane-ct-w': { both: mansion('C:201 (Sloane Court): red-brick mansion blocks with white bays and gables') },
  'sd-royal-ave': { both: georgian('C:044, C:122, C:124, C:154, C:362 (Royal Avenue): four-storey stock-brick terraces over white stucco ground floors with arched doorcases, first-floor balconettes and area railings, facing the gravel avenue', { ground: 3.5 }) },
  'sd-doy-lane': { both: {
    wall: 'stock', base: 'stock', ground: 4.2, upper: 3.4, shopAlways: true, win: [{ surround: 'stone', bars: 1, h: 0.62, head: 'round' }],
    plain: RAIL, shop: { kind: 'glass', fascia: 'paintBlack', pilaster: 'stock' }, top: { kind: 'parapet', h: 0.6, col: 'portland' },
    src: 'C:020, C:038, C:039, C:065 (Duke of York Square): converted barrack ranges in yellow stock brick with round-headed windows and glazed shop fronts on the lane',
    conf: 'partly' } },
  // P3 — Sloane Square station, Lower Sloane Street
  'sd-holbein': { both: {
    wall: 'red', base: 'stock', ground: 3.6, upper: 3.0, palette: ['red', 'stock', 'redDeep'], win: [brick(0.6), brick(0.55)],
    plain: RAIL, shop: { fascia: 'paintBlack', pilaster: 'white' }, top: { kind: 'parapet', h: 0.6 }, bands: [1], bandCol: 'stone', chimneys: 1,
    src: 'C:189 (Holbein Place): red-brick mansion flats and brick walls along the railway; the shop and gallery fronts towards Pimlico Road are not individually photographed',
    conf: 'partly' } },
  'sd-sloane-gdns': { both: dutch('C:003, C:173, C:213 (Sloane Gardens): continuous red-brick terraces with stone-trimmed Dutch gables, canted bays and porches', { gables: { per: 6, style: 'dutch', h: 3.4, trim: 'stone' } }) },
  'sd-holbein-mews': { both: {
    wall: 'red', base: 'white', ground: 3.0, upper: 2.9, win: [stoneW(0.58)], plain: { kind: 'residential', pilaster: 'white', garages: true },
    top: { kind: 'eaves' }, roof: { kind: 'pitched', h: 2.6, col: 'slate' }, gables: { per: 9, style: 'dutch', h: 2.6, trim: 'stone' }, chimneys: 2,
    src: 'C:404 (Holbein Mews): red-brick mews houses with white-painted ground floors and garage doors, Dutch gables and dormers',
    conf: 'partly' } },
  'sd-bourne': { both: georgian('C:083, C:405 (Bourne Street): three-storey stock-brick terraces over white stucco ground floors with area railings and window boxes', {
    win: [brick(0.62), brick(0.55)], spec: {} }) },
  'sd-cliveden': { both: georgian('C:056, C:218–C:220, C:300 (Cliveden Place): four-storey stock-brick terraces over stucco ground floors with first-floor balconettes') },
  'sd-sedding': { both: {
    wall: 'red', base: 'red', ground: 3.6, upper: 3.1, win: [brick(0.6, 'stone')], plain: { kind: 'residential', pilaster: 'stone' },
    top: { kind: 'cornice', h: 0.5, col: 'stone' }, bands: [1], bandCol: 'stone', chimneys: 1,
    src: 'C:071, C:392 (Sedding Street): red-brick school and houses with stone dressings', conf: 'partly' } },
  'sd-sloane-tce': { both: {
    wall: 'red', base: 'red', ground: 3.6, upper: 3.2, win: [brick(0.6, 'stone')], plain: { kind: 'residential', pilaster: 'stone' },
    top: { kind: 'cornice', h: 0.5, col: 'stone' }, bands: [1], bandCol: 'stone', chimneys: 1,
    src: 'C:027, C:089, C:325 (Sloane Terrace): red-brick blocks and stucco houses beside Cadogan Hall', conf: 'partly' } },
  'sd-wilbraham': { both: {
    wall: 'brown', base: 'brown', ground: 3.8, upper: 3.1, win: [stoneW(0.6)], plain: { kind: 'residential', pilaster: 'stone' },
    top: { kind: 'cornice', h: 0.5, col: 'stone' }, bands: [1], bandCol: 'stone',
    src: 'C:072, C:016 (Wilbraham Place): brown-red brick mansion blocks with stone dressings and porched entrances', conf: 'partly' } },
  'sd-graham-tce': { both: georgian('C:094, C:096 (Graham Terrace): three-storey stock-brick terrace over white stucco ground floor with balconettes', { win: [{ surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.66, balcony: 'balconette' }, brick(0.55)] }) },
  'sd-ellis': { both: georgian('C:092, C:403 (Ellis Street): stock-brick and white stucco houses, some with garages') },
  // P4 — remaining King's Road side streets
  'sd-blacklands': { both: dutch('C:040, C:383 (Blacklands Terrace): red-brick mansion blocks with gables; a low stock-brick shop at the King\'s Road end', { gables: { per: 8, style: 'dutch', h: 3, trim: 'stone' } }) },
  'sd-lincoln': { both: georgian('C:121 (1–10 Lincoln Street): three-storey stock-brick terrace over a white stucco ground floor with area railings', { win: [brick(0.64), brick(0.56)] }) },
  'sd-anderson': { both: georgian('C:190, C:235, C:305 (Anderson Street): three-storey houses, white stucco and stock brick alternating, with area railings', {
    palette: ['stucco', 'stock', 'stucco', 'stuccoWarm'], win: [{ surround: 'arch', bars: 1, h: 0.64 }, brick(0.56)] }) },
  'sd-tryon': { both: georgian('C:413 (Tryon Street): two- and three-storey stock-brick and stucco houses, with a corner pub; narrow, walked on the carriageway', {
    palette: ['stock', 'stucco', 'stock'], win: [brick(0.62), brick(0.56)] }) },
  'sd-bywater': { both: {
    wall: 'stucco', base: 'stucco', ground: 3.2, upper: 2.9, win: [{ surround: 'arch', bars: 1, h: 0.6 }], plain: RAIL,
    top: { kind: 'parapet', h: 0.5, col: 'white' }, bands: [1], bandCol: 'white', chimneys: 3, bayW: 4.6,
    spec: { extra: 'painted', houses: { w: 4.6, cols: ['paintBlue', 'stuccoGreen', 'paintYellow', 'stuccoPink', 'paintMint', 'white', 'stuccoWarm'] } },
    src: 'C:271, C:345, C:376, C:377 (Bywater Street): two-storey terraced houses over basements, each painted a different pastel colour, with arched door heads and area railings',
    conf: 'partly', note: 'house colours are cycled, not matched house by house' } },
  'sd-smith': { both: georgian('C:008, C:181, C:293, C:381 (Smith Street): three- and four-storey stock-brick Georgian terraces, some with stucco ground floors; a corner pub at St Leonard\'s Terrace', { palette: ['stock', 'stock', 'stockDark'] }) },
  'sd-smith-tce': { both: georgian('C:161 (Woodfall Street, beside Smith Terrace): small stock-brick and stucco cottages', { win: [brick(0.6)], palette: ['stock', 'stucco'] }) },
};

/** Per-building overrides where a photograph shows the building itself. */
export const OVERRIDES: Record<string, Partial<KrSpec>> = {
  // Cadogan Hall (former First Church of Christ, Scientist, 1904–07): Portland stone, round-arched loggia,
  // tall paired round-headed windows above (C:016, C:333–C:335)
  w95437784: {
    wall: 'portland', base: 'portland', floors: [5.2, 4.6, 4.2], bays: 8, win: [{ surround: 'stone', bars: 0, h: 0.8, head: 'round', w: 0.8, pair: 2 }, { surround: 'stone', bars: 0, h: 0.55, head: 'round', w: 0.7 }],
    ground: { kind: 'arcade', arches: 5, pilaster: 'portland' }, top: { kind: 'parapet', h: 0.8, col: 'portland' }, roof: { kind: 'flat' }, bands: [1], bandCol: 'portland', chimneys: 0,
    src: 'C:016, C:333, C:334, C:335 (Cadogan Hall, Sloane Terrace front)', approx: 'Clock tower on Pont Street outside the map; window tracery simplified',
  },
  // Sedding telephone exchange: red brick over a stone ground floor (C:325, C:330)
  w531836276: {
    wall: 'red', base: 'portland', floors: [4.0, 3.3, 3.2, 3.0], win: [brick(0.6, 'stone')], ground: { kind: 'stone', units: 3, pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.6, col: 'portland' }, bands: [1, 3], bandCol: 'portland', chimneys: 0,
    src: 'C:325, C:330 (Sedding Telephone Exchange, Sloane Terrace)', approx: '',
  },
  // 3 Sloane Terrace: white stucco house with balconettes (C:089)
  w531836273: { wall: 'stucco', base: 'stucco', win: [{ surround: 'arch', bars: 1, h: 0.66, balcony: 'balconette' }, sash(0.58)], top: { kind: 'cornice', h: 0.5, col: 'stucco' }, src: 'C:089 (3 Sloane Terrace)' },
  // Cheval Phoenix House, 1 Wilbraham Place: red brick with stone porch (C:072)
  w531577232: { wall: 'red', base: 'stone', src: 'C:072 (1 Wilbraham Place entrance)', approx: 'Porch simplified to the stone ground floor' },
  // Eaton Mansions, Cliveden Place: red-brick mansion block with stone bands and a corner turret (C:217)
  w899130392: { wall: 'red', base: 'red', win: [stoneW(0.62)], bands: [1, 2, 3], bandCol: 'stone', top: { kind: 'cornice', h: 0.5, col: 'stone' }, roof: { kind: 'pitched', h: 3, col: 'slate' },
    gables: { n: 3, style: 'dutch', h: 3, trim: 'stone' }, src: 'C:217 (Eaton Mansions)', approx: 'Corner turret not drawn' },
  // the Tryon Street pub: stucco ground-floor pub front under stock brick (C:413)
  w781302184: { wall: 'stock', base: 'paintBlack', ground: { kind: 'pub', units: 2, fascia: 'paintBlack', pilaster: 'paintBlack' }, src: 'C:413 (Tryon Street, the corner pub)', approx: 'Pub name not shown' },
  // Holy Trinity primary school, Sedding Street: red brick with stone-dressed arched windows (C:071)
  w898482951: { wall: 'red', base: 'red', win: [{ surround: 'stone', bars: 2, h: 0.66, head: 'segment' }], top: { kind: 'parapet', h: 0.8, col: 'stone' }, src: 'C:071 (Holy Trinity C of E Primary School)' },
};

const corridors = ((data as unknown as { corridors?: SideCorridor[] }).corridors ?? []).filter((c) => c.id.startsWith('sd-'));

/** Compass side of a frontage (for the coverage table). */
function compass(c: SideCorridor, f: Frontage): 'N' | 'S' | 'E' | 'W' {
  const L = c.line;
  let best = 0, bd = Infinity, acc = 0, tx = 1, tz = 0;
  for (let i = 0; i + 3 < L.length; i += 2) {
    const len = Math.hypot(L[i + 2] - L[i], L[i + 3] - L[i + 1]);
    const d = Math.abs(acc + len / 2 - f.s);
    if (d < bd) { bd = d; best = i; tx = (L[i + 2] - L[i]) / (len || 1); tz = (L[i + 3] - L[i + 1]) / (len || 1); }
    acc += len;
  }
  void best;
  // right-hand normal of the direction of travel is (-tz, tx); north is -z
  const nx = f.right ? -tz : tz, nz = f.right ? tx : -tx;
  return Math.abs(nx) > Math.abs(nz) ? (nx > 0 ? 'E' : 'W') : nz > 0 ? 'S' : 'N';
}

function wallFromTags(f: Frontage, p: Profile): MatKey {
  const m = (f.material ?? '').toLowerCase(), col = (f.colour ?? '').toLowerCase();
  if (/plaster|stucco|render/.test(m) || /^(white|cream|#f)/.test(col)) return 'stucco';
  if (/brick/.test(m) && /red|brown|#[89ab]/.test(col)) return 'red';
  if (/brick/.test(m) && /yellow|buff|beige/.test(col)) return 'stock';
  if (/stone/.test(m)) return 'portland';
  return p.wall;
}

function specFor(c: SideCorridor, f: Frontage): KrSpec {
  const prof = PROFILES[c.id];
  const p = (f.right ? prof?.R : prof?.L) ?? prof?.both ?? UNSEEN;
  const total = f.levels ?? Math.max(1, Math.round((f.h - 1) / 3.2));
  const roofStoreys = f.roofLevels ?? 0;
  const n = Math.max(1, Math.round(total));
  const g = p.ground ?? 3.6, u = p.upper ?? 3.1;
  const floors = [g, ...Array.from({ length: n - 1 }, (_, i) => u - Math.min(0.4, i * 0.1))];
  const shops = p.shopAlways || f.shops > 0 || f.type === 'retail' || f.type === 'commercial';
  const units = Math.max(1, Math.min(f.shops || 1, Math.round(f.len / 4.5) || 1));
  const ground: Ground = shops ? { kind: 'shops', units, fascia: 'paintBlack', pilaster: p.base ?? 'stucco', doors: ['c'], ...p.shop } : p.plain;
  const bays = Math.max(1, Math.round(f.len / (p.bayW ? p.bayW / 2 : 2.7)));
  const roof: KrSpec['roof'] = roofStoreys >= 1 ? { kind: 'mansard', h: 2.6, dormers: Math.max(1, Math.round(f.len / 4)) } : p.roof;
  const hash = [...f.id].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const wall = p.palette && !f.material && !f.colour ? p.palette[hash % p.palette.length] : wallFromTags(f, p);
  const gables: KrSpec['gables'] = p.gables && n >= 3 && !roofStoreys && f.len >= p.gables.per * 0.6
    ? { n: Math.max(1, Math.round(f.len / p.gables.per)), style: p.gables.style, h: p.gables.h, col: p.gables.col, trim: p.gables.trim } : undefined;
  const spec: KrSpec = {
    addr: f.addr ?? f.name ?? `${c.name} (OSM ${f.id})`, side: compass(c, f), name: f.name ?? undefined,
    floors, wall, base: p.base, bays, edge: 0.5, win: p.win, ground, top: p.top, roof, bands: p.bands, bandCol: p.bandCol,
    chimneys: p.chimneys ?? (n <= 4 ? 1 : 0), extra: p.extra, gables, ...p.spec,
    src: `${p.src}; OSM ${f.id}${f.levels ? ` (${f.levels} levels${roofStoreys ? ` + ${roofStoreys} roof` : ''})` : ''}${f.material ? `, ${f.material}` : ''}${f.colour ? ` ${f.colour}` : ''}${f.shops ? `, ${f.shops} shop${f.shops > 1 ? 's' : ''} mapped` : ''}`,
    conf: p.conf,
    approx: p.conf === 'estimated' ? 'Street not photographed: façade treatment assumed; storeys, width and shops from OSM' : `Shares its street's photographed character; storeys, width and shops from OSM${p.note ? `; ${p.note}` : ''}`,
  };
  const o = OVERRIDES[f.id];
  return o ? { ...spec, ...o, src: o.src ?? spec.src, conf: o.conf ?? 'observed', approx: o.approx ?? '' } : spec;
}

export const SD_SPECS: Record<string, KrSpec> = {};
for (const c of corridors) for (const f of c.frontages) SD_SPECS[f.id.replace(/-\d+$/, '')] ??= specFor(c, f);
/** The side-street corridors with their frontages (for the docs generator). */
export const SIDE_CORRIDORS = corridors;
