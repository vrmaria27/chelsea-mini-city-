// Buildings around Sloane Square: individual reconstructions replacing the generic OSM extrusions.
// Footprints are OpenStreetMap's (ODbL); façade composition, storey heights, materials and features
// come from the RBKC Sloane Square Conservation Area Appraisal (2017), Historic England list entries
// and openly licensed photographs (see docs/square-buildings.md for the inventory, references and
// confidence of each frontage). Heights not given by a source are estimates from photographs.
import { MeshBuilder, hex, shade, type RGB } from '../../engine/geometry';
import { F, K, chimney, edgesOf, latheAt, prismAt, toPts, turret, type Front, type Pt } from './facadeKit';

import { bays, facing, flatLid, fronts, longest, plainGrid, sign, slopedRoof, walls, type Ctx, type RoofInsets, type SignQuad, type SquareBuildingFootprint } from './buildingKit';
import { DOY_BUILDERS } from './dukeOfYork';
import { buildKr } from './kingsRoad';
import { KR_SPECS } from './kingsRoadSpecs';
import { KR_HOOKS } from './kingsRoadHooks';
export type { RoofInsets, SignQuad, SquareBuildingFootprint } from './buildingKit';

// ---- Royal Court Theatre (Walter Emden & Bertie Crewe, 1888; Grade II) ---------------------------------
// Listing + CAA: red brick, stone dressings, free Italianate, four storeys, three main bays; central bay
// with pediment on applied Corinthian columns, name in gold on a ribbon; outer bays with richly carved
// cambered pediments above a bracketed frieze; bottle-balustrade parapet; painted ground floor; round-
// headed windows on the first and top floors; entrance up four steps. Proportions from photos 2025–26.
function royalCourt(c: Ctx): void {
  const brick = hex('#bb5537'), stone = hex('#dccba6'), paint = hex('#ebe4d3');
  const E = 16.2;
  walls(c, E, brick);
  slopedRoof(c, E, 1.2, 1.2, K.slate);
  const front = longest(fronts(c));
  const fr = new F(c.b, front);
  const L = fr.len, bw = L * 0.3, cw = L - bw * 2; // outer bays and centre
  const uL = bw / 2, uC = L / 2, uR = L - bw / 2;
  // ground floor: painted stone with pilasters, central entrance up four steps
  fr.box(-0.1, L + 0.1, 0, 4.4, 0, 0.2, paint);
  for (const u of [0.25, bw - 0.2, bw + cw * 0.22, L - bw - cw * 0.22, L - bw + 0.2, L - 0.25]) fr.box(u - 0.28, u + 0.28, 0, 4.2, 0.2, 0.42, shade(paint, 0.97));
  fr.wall(uC - 2.0, uC + 2.0, 0.6, 3.6, K.glassLight, 0.21);
  for (let s = 0; s < 4; s++) fr.box(uC - 2.6, uC + 2.6, s * 0.15, (s + 1) * 0.15, 0.2 + 1.4 - s * 0.35, 0.2 + 1.4 - s * 0.35 + 0.36, K.portlandShade);
  for (const u of [uL - 1.2, uL + 1.2, uR - 1.2, uR + 1.2]) fr.wall(u - 0.6, u + 0.6, 0.5, 3.4, K.black, 0.21); // display cases / doors
  fr.cornice(4.2, stone, 0.5, 0.4);
  // first floor: round-headed windows (2 | 3 | 2) with stone surrounds and keystones
  for (const u of [uL - 1.1, uL + 1.1, uR - 1.1, uR + 1.1]) fr.window(u, 5.0, 1.25, 2.6, { frame: stone, head: 'round', keystone: stone, bars: 1 });
  for (const u of bays(bw + 0.6, L - bw - 0.6, 3)) fr.window(u, 5.0, 1.15, 2.6, { frame: stone, head: 'round', keystone: stone, bars: 1 });
  // carved stone frieze between first and second floors
  fr.band(8.3, 8.9, stone, 0.14);
  // second floor: square-headed windows, two per outer bay, three in the centre
  for (const u of [uL - 1.0, uL + 1.0, uR - 1.0, uR + 1.0]) fr.window(u, 9.3, 1.0, 1.6, { frame: stone, bars: 1 });
  for (const u of bays(bw + 0.6, L - bw - 0.6, 3)) fr.window(u, 9.3, 0.95, 1.6, { frame: stone, bars: 1 });
  // bracketed frieze across the whole front
  fr.cornice(11.4, stone, 0.45, 0.55);
  for (const u of bays(0.2, L - 0.2, 18)) fr.box(u - 0.07, u + 0.07, 11.1, 11.45, 0.05, 0.35, stone);
  // outer bays: richly carved cambered pediments, oval windows above
  for (const u of [uL, uR]) { fr.segPediment(u, 11.95, bw - 0.6, 1.8, stone, shade(stone, 0.92), 0.3); fr.box(u - 0.7, u + 0.7, 14.1, 15.1, 0.02, 0.06, K.glass); fr.archRing(u, 14.6, 0.75, 0.5, 0.18, 0.16, stone); fr.archRing(u, 14.6, -0.75, -0.5, 0.18, 0.16, stone); }
  // centre top storey: three round-headed windows between four Corinthian columns, balustrade below
  fr.balustrade(bw + 0.2, L - bw - 0.2, 12.0, 0.75, stone, 0, 0.3);
  const cols = bays(bw - 0.1, L - bw + 0.1, 3).map((u, i, a) => (i === 0 ? u - (a[1] - a[0]) / 2 : u)).concat([]);
  void cols;
  const cu = [bw + 0.15, bw + cw / 3, bw + (2 * cw) / 3, L - bw - 0.15];
  for (const u of cu) fr.column(u, 12.75, 15.5, 0.42, stone, 0.32);
  for (const u of bays(bw + 0.4, L - bw - 0.4, 3)) fr.window(u, 13.0, 1.05, 2.2, { frame: stone, head: 'round', bars: 0, sill: false });
  // entablature, central pediment with the theatre's name on a ribbon, bottle balustrades to the sides
  fr.box(bw - 0.2, L - bw + 0.2, 15.5, 16.2, 0, 0.5, stone, true);
  fr.pediment(uC, 16.2, cw + 0.6, 2.2, stone, 0.5);
  sign(c, fr, uC - cw * 0.3, uC + cw * 0.3, 16.45, 17.05, 0.53, 'ROYAL COURT THEATRE', '#d8c59d', '#b48a2e', { font: 'serif', weight: 600, spacing: 1.1 });
  for (const [u0, u1] of [[0, bw - 0.25], [L - bw + 0.25, L]]) { fr.balustrade(u0, u1, 16.2, 0.8, stone, 0, 0.3); }
  for (const u of [0.2, bw - 0.35, L - bw + 0.35, L - 0.2]) fr.box(u - 0.3, u + 0.3, 16.2, 17.3, 0, 0.4, stone); // parapet piers
  // permanent identifying sign: white letters on a black frame across the centre bay at first-floor level
  fr.box(uC - cw * 0.42, uC + cw * 0.42, 4.55, 5.25, 0.2, 0.32, K.black);
  sign(c, fr, uC - cw * 0.4, uC + cw * 0.4, 4.6, 5.2, 0.335, 'ROYAL COURT', '#16181b', '#f4f4f2', { weight: 700, spacing: 1.0 });
}

// ---- Sloane Square Underground station and Sloane Square House (c.1951 / late 1950s) ------------------
// CAA: painted reinforced-concrete ground floor with a projecting slab canopy wrapping the building;
// corrugated metal cladding above with a projecting Underground sign over the entrance flanked by two
// grilles; seven storeys of metal and glass curtain walling above; open concrete roof frame.
// Photos 2024–25: white walls, blue entrance panels, black band, ribbon glazing, rounded north-west corner.
function station(c: Ctx): void {
  const top = 26.6;
  walls(c, top, K.concrete);
  flatLid(c.b, c.bl.tris, top, K.concrete);
  const fs = fronts(c, (f, to) => f.n[0] * to[0] + f.n[1] * to[1] > 0.3 && f.len > 2.5);
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    // ground floor: white painted concrete, canopy slab, black corrugated band
    fr.box(0, L, 0, 3.3, 0, 0.12, K.whitePaint);
    fr.box(-0.3, L + 0.3, 3.3, 3.65, 0, 1.6, K.whitePaint, true);
    fr.box(0, L, 3.65, 6.3, 0, 0.18, hex('#202326'));
    for (const u of bays(0.2, L - 0.2, Math.max(1, Math.round(L / 0.5)))) fr.box(u - 0.06, u + 0.06, 3.65, 6.3, 0.18, 0.24, hex('#2a2e32'), false, false);
    // curtain wall: ribbon glazing and pale spandrels, seven storeys
    for (let s = 0; s < 6; s++) {
      const y = 6.3 + s * 3.35;
      fr.box(0, L, y, y + 1.1, 0, 0.2, K.curtainFrame);
      fr.wall(0, L, y + 1.1, y + 3.35, K.curtainGlass, 0.06);
      for (const u of bays(0, L, Math.max(1, Math.round(L / 1.6)))) fr.box(u - 0.05, u + 0.05, y + 1.1, y + 3.35, 0.06, 0.16, K.curtainFrame, false, false);
    }
    fr.box(0, L, 26.4, 27.1, 0, 0.25, K.concrete);
  }
  // main entrance on the front that faces the square most directly (photos 2024–25: entrance faces west
  // onto the square, the bakery unit to its right): opening, blue panels, sign, projecting roundel
  const facingScore = (f: Front) => { const m: Pt = [(f.a[0] + f.b[0]) / 2, (f.a[1] + f.b[1]) / 2]; const d = Math.hypot(c.centre[0] - m[0], c.centre[1] - m[1]) || 1; return (f.n[0] * (c.centre[0] - m[0]) + f.n[1] * (c.centre[1] - m[1])) / d + Math.min(f.len, 18) / 60; };
  const main = fs.slice().sort((a, b) => facingScore(b) - facingScore(a))[0];
  const fr = new F(c.b, main);
  const u = main.len * 0.45;
  fr.wall(u - 2.6, u + 2.6, 0, 3.2, hex('#141619'), 0.13);
  fr.box(u - 4.2, u - 2.6, 0.2, 3.2, 0.12, 0.2, hex('#24408e'));
  fr.box(u + 2.6, u + 4.2, 0.2, 3.2, 0.12, 0.2, hex('#24408e'));
  sign(c, fr, u - 2.4, u + 2.4, 2.85, 3.25, 0.22, 'SLOANE SQUARE STATION', '#24408e', '#ffffff', { weight: 700 });
  sign(c, fr, u - 2.2, u + 2.2, 3.33, 3.62, 1.62, 'SLOANE SQUARE STATION', '#f2f0ea', '#24408e', { weight: 700 });
  // projecting roundel above the canopy (two faces) and the two flanking grilles
  const P = fr.P(u, 5.2, 0.9);
  const roundel = (dir: number) => c.signs.push({ corners: [fr.P(u - 0.09 * dir, 4.5, 0.25), fr.P(u - 0.09 * dir, 4.5, 1.6), fr.P(u - 0.09 * dir, 5.9, 1.6), fr.P(u - 0.09 * dir, 5.9, 0.25)].map((q, i, a) => (dir > 0 ? q : a[[1, 0, 3, 2][i]])), text: '⊖UNDERGROUND', bg: '#f4f4f2', fg: '#dc241f' });
  fr.box(u - 0.06, u + 0.06, 4.4, 6.0, 0.2, 1.7, hex('#d7d7d5'));
  roundel(1); roundel(-1);
  void P;
  for (const g of [u - 2.4, u + 2.4]) fr.box(g - 0.8, g + 0.8, 4.3, 5.2, 0.18, 0.26, hex('#3a3e42'));
}

/** The small unit beside the station entrance (bakery kiosk in 2025): same ground-floor treatment. */
function stationKiosk(c: Ctx): void {
  walls(c, 6.3, K.whitePaint);
  flatLid(c.b, c.bl.tris, 6.3, K.concrete);
  for (const f of fronts(c, (f, to) => f.n[0] * to[0] + f.n[1] * to[1] > 0.2 && f.len > 2)) {
    const fr = new F(c.b, f);
    fr.wall(0.4, fr.len - 0.4, 0.8, 2.9, K.glassLight, 0.13);
    fr.box(-0.3, fr.len + 0.3, 3.3, 3.65, 0, 1.6, K.whitePaint, true);
    fr.box(0, fr.len, 3.65, 6.3, 0, 0.18, hex('#202326'));
  }
}

// ---- Sloane Square Hotel, 7–12 Sloane Square (1895) ---------------------------------------------------
// CAA: five storeys, red brick with light beige terracotta bands and moulded dressings; alternating bays
// of paired bow windows under pitched slate roofs with canted dormers, and paired canted bays up to the
// second floor with a Dutch gable at the fourth; central entrance with a projecting clock; eastern end
// terminated with a turret and cupola; timber shopfronts in channelled stucco pilasters with awnings.
// Photos 2019 (whole front) and 2025 (east end: The Botanist, navy awnings, black fascia).
function hotel(c: Ctx): void {
  const brick = hex('#b24c33'), terra = hex('#dcc3a0'), stucco = hex('#e9e1cf');
  const E = 17.8, sh = 3.3;
  walls(c, E, brick);
  slopedRoof(c, E, 4.2, 3, K.slate, K.slateDark);
  // square-facing fronts (the hotel faces south onto the square; the east part angles toward Sedding Street)
  const fs = fronts(c, (f) => f.n[1] > 0.6 && f.len > 5);
  fs.sort((a, b) => a.a[0] - b.a[0]); // west → east
  const all = fs.reduce((s, f) => s + f.len, 0);
  let unit = 0;
  const kinds: ('gable' | 'dormer')[] = ['gable', 'dormer', 'gable', 'dormer', 'gable', 'dormer'];
  const per = all / kinds.length;
  let uStart = 0;
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    // terracotta string courses at each floor and the ground-floor stucco pilasters + black fascia
    for (let s = 1; s <= 4; s++) fr.band(4.6 + s * sh - 0.25, 4.6 + s * sh, terra, 0.1);
    fr.box(0, L, 0, 4.6, 0, 0.12, stucco);
    for (const u of bays(0, L, Math.max(2, Math.round(L / 3.2)))) fr.box(u - 0.35, u + 0.35, 0, 3.8, 0.12, 0.35, stucco);
    fr.cornice(E - 0.1, terra, 0.5, 0.5);
    for (let u = 0; u + 0.01 < L; u += per) {
      const k = kinds[Math.min(kinds.length - 1, unit)];
      const uc = u + per / 2;
      if (uc > L) break;
      // windows: two per unit on each floor
      if (k === 'gable') {
        for (const d of [-per * 0.24, per * 0.24]) fr.bay(uc + d, 2.0, 4.6, 4.6 + 2 * sh, 0.7, 'canted', brick, 2, terra, K.lead);
        for (const d of [-per * 0.24, per * 0.24]) for (let s = 2; s < 4; s++) fr.window(uc + d, 4.6 + s * sh + 0.6, 1.25, 2.0, { frame: terra, bars: 1 });
        fr.gable(uc, E + 0.4, per * 0.82, 4.6, brick, terra, 'dutch', 0.3);
        for (const d of [-0.8, 0.8]) fr.window(uc + d, E + 1.2, 0.8, 1.6, { frame: terra, head: 'round', bars: 0, depth: 0.35 + 0.1 });
      } else {
        for (const d of [-per * 0.24, per * 0.24]) {
          fr.bay(uc + d, 2.1, 4.6, E - 0.3, 0.75, 'bow', brick, 4, terra, null);
          // canted dormer on the slate roof above each bow
          fr.box(uc + d - 1.0, uc + d + 1.0, E + 0.5, E + 2.6, -1.4, -0.3, K.slateDark);
          fr.window(uc + d, E + 0.8, 1.2, 1.5, { frame: K.frameWhite, depth: -0.25, sill: false, frameW: 0.1 });
        }
      }
      // ground-floor shopfront glazing between the pilasters
      fr.wall(u + 0.6, u + per - 0.6, 0.5, 3.4, K.glassLight, 0.13);
      unit++;
    }
    // black fascia with awnings
    fr.box(-0.1, L + 0.1, 3.8, 4.55, 0, 0.4, K.black, true);
    uStart += L;
  }
  void uStart;
  // ground-floor tenants along the main front, as photographed 2019–2025 (west → east):
  // Côte (grey-striped awnings), the hotel entrance (green awnings), The Botanist (navy awnings, east corner)
  const main = longest(fs);
  const fw = new F(c.b, main);
  const ML = main.len;
  const seg = (t0: number, t1: number, col: RGB, label: string, fg: string, val?: RGB, font: 'serif' | 'sans' = 'serif', spacing = 1) => {
    const u0 = ML * t0, u1 = ML * t1;
    const n = Math.max(1, Math.round((u1 - u0) / 2.6));
    for (const u of bays(u0 + 0.3, u1 - 0.3, n)) fw.awning(u - (u1 - u0) / n / 2 + 0.15, u + (u1 - u0) / n / 2 - 0.15, 3.75, 1.1, 1.7, col, val ?? col);
    sign(c, fw, u0 + 0.4, u1 - 0.4, 3.9, 4.45, 0.42, label, '#24272b', fg, { font, weight: 600, spacing });
  };
  seg(0, 0.34, hex('#d6d6d0'), 'CÔTE', '#f1efe7', hex('#4b4f54'), 'sans', 1.3);
  seg(0.34, 0.74, K.green, 'Sloane Square Hotel', '#f1efe7');
  seg(0.74, 1, K.navy, 'THE  BOTANIST', '#d9c27a', undefined, 'serif', 1.3);
  const east = fs[fs.length - 1];
  if (east !== main) {
    // The Botanist wraps the angled corner front, with "No. 7" under the turret (photos 2024–25)
    const fe = new F(c.b, east);
    for (const u of bays(0.3, east.len - 1.6, Math.max(1, Math.round((east.len - 1.9) / 2.6)))) fe.awning(u - 1.15, u + 1.15, 3.75, 1.1, 1.8, K.navy);
    sign(c, fe, 0.4, east.len - 2.0, 3.9, 4.45, 0.42, 'THE  BOTANIST', '#24272b', '#d9c27a', { font: 'serif', weight: 600, spacing: 1.3 });
  }
  // projecting clock at the centre of the frontage
  const fm = fw;
  const uc = ML * 0.62;
  fm.box(uc - 0.45, uc + 0.45, 5.5, 6.6, 0.1, 0.95, K.black);
  c.signs.push({ corners: [fm.P(uc - 0.4, 5.6, 0.96), fm.P(uc + 0.4, 5.6, 0.96), fm.P(uc + 0.4, 6.5, 0.96), fm.P(uc - 0.4, 6.5, 0.96)], text: '◷', bg: '#24272b', fg: '#f4f1e6' });
  // east end: corner turret with cupola over a full-height rounded corner (Sedding Street)
  const corner = east.b;
  const n2: Pt = [east.n[0] + east.t[0] * 0.8, east.n[1] + east.t[1] * 0.8];
  const nl = Math.hypot(n2[0], n2[1]);
  const tx = corner[0] - (n2[0] / nl) * 1.2, tz = corner[1] - (n2[1] / nl) * 1.2;
  {
    const fe = new F(c.b, east);
    sign(c, fe, east.len - 1.6, east.len - 0.2, 3.9, 4.45, 0.42, 'No. 7', '#24272b', '#d9c27a', { font: 'serif', weight: 600 });
  }
  prismAt(c.b, tx, tz, 2.1, 4.6, E, 10, brick, 0, false);
  for (let s = 1; s <= 4; s++) prismAt(c.b, tx, tz, 2.18, 4.6 + s * sh - 0.25, 4.6 + s * sh, 10, terra, 0, false);
  turret(c.b, tx, tz, 2.0, E, E + 3.0, { body: brick, band: terra, cupola: K.lead, cupolaH: 2.6, sides: 10 });
  // tall chimney stacks along the rear ridge
  const back = edgesOf(c.bl.rings[0]).sort((a, b) => b.len - a.len).find((f) => f.n[1] < -0.6);
  if (back) for (const t of [0.15, 0.4, 0.62, 0.85]) chimney(c.b, back.a[0] + back.t[0] * back.len * t - back.n[0] * 3.2, back.a[1] + back.t[1] * back.len * t - back.n[1] * 3.2, 1.6, 0.8, E, E + 7.0, hex('#a8462f'), Math.atan2(back.t[1], back.t[0]), 4);
  // Sedding Street return: windows grid
  for (const f of fronts(c, facing([1, -0.15], 0.85))) { const fr = new F(c.b, f); for (let s = 1; s <= 4; s++) fr.band(4.6 + s * sh - 0.25, 4.6 + s * sh, terra, 0.1); plainGrid(fr, 4.6, sh, 4, 2.6, 1.2, terra, 1.9); }
}

// ---- 13–14 Sloane Square: former bank, 1890s, Portland stone --------------------------------------------
// CAA: four storeys; ashlar pilasters to first and second floors supporting a frieze and dentilled
// cornice; mansard set back behind a bottle balustrade with urns; two gables, on the canted corner (round
// window in a pilaster surround, pedimented top, "BANK") and on Sloane Street (tripartite window,
// segmental pediment); first-floor French casements with pediments, oriel over the corner entrance; tall
// round-arched ground-floor openings between pilasters. Photo 2019 (left edge) confirms stone and arches.
function bank1314(c: Ctx): void {
  const st = K.portland, sd = K.portlandShade;
  const E = 12.4;
  walls(c, E, st);
  slopedRoof(c, E + 0.9, 2.8, 2, K.slate, K.slateDark);
  flatLid(c.b, c.bl.tris, E + 0.9, sd);
  const fs = fronts(c, (f, to) => (f.n[0] * to[0] + f.n[1] * to[1] > 0.3 || f.n[0] < -0.8) && f.len > 2);
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    const corner = L < 6;
    const nb = corner ? 1 : Math.max(2, Math.round(L / 4.4));
    fr.box(0, L, 0, 5.2, 0, 0.15, sd);
    for (const u of bays(0, L, nb)) fr.window(u, 0.6, corner ? 1.8 : 2.0, 4.0, { frame: st, head: 'round', depth: 0.3, frameW: 0.3, sill: false, keystone: st, base: 0.15 });
    for (let i = 0; i <= nb; i++) fr.box((i * L) / nb - 0.35, (i * L) / nb + 0.35, 0, 5.0, 0, 0.35, st);
    fr.cornice(5.0, st, 0.4, 0.4);
    for (let i = 0; i <= nb; i++) fr.box((i * L) / nb - 0.3, (i * L) / nb + 0.3, 5.4, 11.6, 0, 0.3, st); // ashlar pilasters
    for (const u of bays(0, L, nb)) {
      if (corner) fr.bay(u, 1.8, 5.6, 8.6, 0.6, 'bow', st, 1, st, K.lead);
      else fr.window(u, 5.8, 1.4, 2.4, { frame: st, head: 'pediment', depth: 0.2 });
      fr.window(u, 9.2, 1.3, 1.9, { frame: st, depth: 0.15 });
    }
    fr.band(11.6, 12.0, st, 0.25);
    fr.cornice(12.0, st, 0.55, 0.45);
    for (const u of bays(0.1, L - 0.1, Math.max(4, Math.round(L / 0.5)))) fr.box(u - 0.06, u + 0.06, 12.0, 12.2, 0.4, 0.5, st); // dentils
    fr.balustrade(0, L, 12.45, 0.8, st, 0, 0.3);
    for (const u of [0.3, L - 0.3]) latheAt(c.b, ...pick(fr.P(u, 13.25, 0.15)), [[0.18, 13.25], [0.26, 13.5], [0.2, 13.8], [0.05, 14.0]], 6, st); // urns
    if (!corner) for (const u of bays(0.5, L - 0.5, Math.max(2, Math.round(L / 3)))) { fr.box(u - 0.7, u + 0.7, 13.3, 15.0, -1.6, -1.0, K.slateDark); fr.window(u, 13.5, 0.9, 1.2, { frame: st, depth: -0.95, sill: false, frameW: 0.1 }); }
    // gables
    if (corner || f.n[0] < -0.8) {
      fr.box(L / 2 - (corner ? 1.6 : 2.4), L / 2 + (corner ? 1.6 : 2.4), 12.45, 15.4, 0, 0.35, st);
      if (corner) { fr.window(L / 2, 13.0, 1.2, 1.7, { frame: st, head: 'round', depth: 0.45 }); fr.pediment(L / 2, 15.4, 3.6, 1.0, st, 0.4); sign(c, fr, L / 2 - 1.0, L / 2 + 1.0, 12.5, 12.9, 0.47, 'BANK', '#e4dfcf', '#6b655a', { font: 'serif', weight: 600, spacing: 1.3 }); }
      else { for (const d of [-0.9, 0, 0.9]) fr.window(L / 2 + d, 13.0, 0.7, 1.6, { frame: st, depth: 0.45, sill: d === 0 }); fr.segPediment(L / 2, 15.4, 5.0, 1.2, st, sd, 0.4); }
    }
  }
}

// ---- 15–16 Sloane Square and 145 Sloane Street, 1890s ---------------------------------------------------
// CAA (no openly licensed photo found): balanced composition, four storeys with two attic storeys in a
// double-height mansard; yellow stock brick with red brick dressings to window reveals and bays and
// channelled brickwork at street level; sash windows except French casements on the second floor onto
// bracketed iron balconies; dentilled eaves; pedimented red-brick dormers below, round-headed leaded
// dormers above; principal entrance on Sloane Square with a columned surround and segmental pediment.
function block1516(c: Ctx): void {
  const yel = K.yellowStock, red = hex('#a9472f');
  const E = 14.6;
  walls(c, E, yel);
  slopedRoof(c, E, 5.4, 2, K.slate, K.slateDark);
  const fs = fronts(c, (f) => (f.n[1] > 0.9 || f.n[0] > 0.9) && f.len > 5);
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    const n = Math.max(3, Math.round(L / 3.1));
    fr.box(0, L, 0, 4.4, 0, 0.12, shade(yel, 0.95));
    for (let y = 0.4; y < 4.3; y += 0.45) fr.band(y, y + 0.06, shade(yel, 0.82), 0.13); // channelled brick
    for (const u of bays(0, L, n)) fr.wall(u - 1.1, u + 1.1, 0.4, 3.6, K.glassLight, 0.14);
    fr.band(4.4, 4.75, red, 0.15);
    for (const u of bays(0, L, n)) {
      fr.window(u, 5.4, 1.2, 2.1, { frame: red, bars: 1 });
      fr.window(u, 8.7, 1.2, 2.3, { frame: red, bars: 1 });
      fr.railing(u - 0.9, u + 0.9, 8.6, 0.55, 0.9);
      fr.window(u, 12.0, 1.1, 1.8, { frame: red, bars: 1 });
    }
    fr.cornice(E - 0.2, K.cream, 0.4, 0.4);
    for (const u of bays(0.1, L - 0.1, Math.round(L / 0.55))) fr.box(u - 0.07, u + 0.07, E - 0.4, E - 0.2, 0.2, 0.3, K.cream);
    for (const u of bays(0, L, n)) { fr.box(u - 0.85, u + 0.85, E + 0.3, E + 2.5, -1.3, -0.6, red); fr.pediment(u, E + 2.5, 1.9, 0.6, red, -0.6); fr.window(u, E + 0.6, 0.9, 1.4, { frame: K.cream, depth: -0.55, sill: false, frameW: 0.08 }); }
    for (const u of bays(1.5, L - 1.5, Math.max(2, n - 1))) { fr.box(u - 0.55, u + 0.55, E + 3.4, E + 4.8, -3.0, -2.5, K.slateDark); fr.window(u, E + 3.5, 0.6, 1.0, { frame: K.cream, head: 'round', depth: -2.45, sill: false, frameW: 0.07 }); }
    if (f.n[1] > 0.9) {
      // principal entrance on the Sloane Square side, near the corner
      const u = L - 6.5;
      for (const d of [-1.3, 1.3]) fr.column(u + d, 0, 3.8, 0.4, K.cream, 0.4);
      fr.wall(u - 0.8, u + 0.8, 0, 3.0, K.black, 0.16);
      fr.segPediment(u, 3.8, 3.4, 1.1, K.cream, shade(K.cream, 0.9), 0.5);
      fr.bay(u, 2.0, 4.9, 7.8, 0.7, 'bow', red, 1, K.cream, K.lead);
    }
  }
}

/** 141–144 Sloane Street (CAA, no photo found): later Victorian, three storeys + gables, French casements. */
function sloaneStreet141(c: Ctx, allRed: boolean): void {
  const wall = allRed ? hex('#a9472f') : K.yellowStock, red = hex('#a9472f');
  const E = 11.6;
  walls(c, E, wall);
  slopedRoof(c, E, 3.2, 2, K.slate);
  for (const f of fronts(c, facing([0.98, -0.18], 0.85))) {
    const fr = new F(c.b, f);
    const L = fr.len;
    const n = 2;
    for (const u of bays(0, L, n)) {
      fr.shopfront(u - L / (2 * n) + 0.2, u + L / (2 * n) - 0.2, 4.0, { pilaster: shade(wall, 0.9), fascia: K.black, bays: 2 });
      fr.window(u - 1.0, 4.8, 1.0, 2.4, { frame: red, bars: 1 }); fr.window(u + 1.0, 4.8, 1.0, 2.4, { frame: red, bars: 1 });
      fr.railing(u - 2.0, u + 2.0, 4.7, 0.5, 0.9);
      fr.window(u - 1.0, 8.4, 1.0, 1.9, { frame: red, bars: 1 }); fr.window(u + 1.0, 8.4, 1.0, 1.9, { frame: red, bars: 1 });
      fr.gable(u, E, L / n - 1.0, 3.2, wall, red, allRed ? 'stepped' : 'dutch', 0.25);
      fr.window(u, E + 0.6, 1.0, 1.4, { frame: red, bars: 1, depth: 0.35 });
    }
    fr.cornice(E - 0.3, red, 0.3, 0.3);
  }
}

// ---- 1–6 Sloane Square and Sedding Street (late 1960s, Harrison & West) ------------------------------------
// CAA: six storeys, brown brick in stretcher bond; cladding oversails the shopfronts on concrete columns;
// four projecting bays, canted on first and second floors with squared bays above; windows single-paned
// or with a central mullion, many with simple iron Juliet balconies. Photo 2024 (shopfronts hoarded).
function block16(c: Ctx): void {
  const brick = K.brownBrick, white = hex('#ecebe6');
  const E = 19.4;
  walls(c, E, brick, 3.6); // the ground floor is recessed behind columns under the oversailing upper floors
  walls(c, 3.6, hex('#3a3d40'));
  flatLid(c.b, c.bl.tris, E, K.concrete);
  for (const f of fronts(c, (f, to) => f.n[0] * to[0] + f.n[1] * to[1] > 0.25 && f.len > 6)) {
    const fr = new F(c.b, f);
    const L = fr.len;
    fr.wall(0, L, 0, 3.6, K.glassLight, 0.02);
    fr.box(0, L, 3.6, 4.2, -1.3, 0.3, white, true);
    for (const u of bays(0, L, Math.max(2, Math.round(L / 4.2)))) fr.box(u - 0.25, u + 0.25, 0, 3.6, -0.25, 0.25, white);
    const nb = L > 20 ? 4 : 2;
    const bayU = bays(0, L, nb);
    for (const u of bayU) {
      fr.bay(u, 2.6, 4.2, 10.2, 0.9, 'canted', white, 2, white, null);
      fr.box(u - 1.3, u + 1.3, 10.2, E - 0.2, 0, 0.9, white);
      for (let s = 0; s < 3; s++) fr.wall(u - 1.0, u + 1.0, 10.6 + s * 3.0, 12.6 + s * 3.0, K.glass, 0.92);
    }
    for (let i = 0; i + 1 < bayU.length; i++) {
      const u = (bayU[i] + bayU[i + 1]) / 2;
      for (let s = 0; s < 5; s++) { fr.window(u, 4.9 + s * 3.0, 1.6, 1.9, { frame: white, bars: 0, frameW: 0.09 }); fr.box(u - 0.9, u + 0.9, 5.1 + s * 3.0, 5.15 + s * 3.0 + 0.9, 0.12, 0.16, K.ironBlack, false, false); }
    }
    fr.box(-0.05, L + 0.05, E - 0.4, E + 0.2, 0, 0.25, white);
  }
}

// ---- Nos. 52–56 Sloane Square (late 19th century terrace of shops) -------------------------------------
// CAA: three storeys with attic; ground and first floors red terracotta, second and attic red brick;
// first floor full-height pilasters between tall side-hung casements, paired at party walls, supporting
// an entablature across the front; six-over-one sashes on the second floor; two brick Dutch gables with
// terracotta; corner turret with cupola and finial in terracotta; clay-tiled mansard with flat-roofed
// dormers; original timber shopfronts with terracotta stall risers and built-in awnings.
function terrace5256(c: Ctx): void {
  const terra = hex('#b3553a'), brick = hex('#a2432d');
  const E = 11.6;
  walls(c, 7.8, terra);
  walls(c, E, brick, 7.8);
  slopedRoof(c, E, 3.0, 1.2, K.roofTile);
  // street fronts: onto the square (west) and Cliveden Place (north-west); the south side is a party wall
  const fs = fronts(c, (f, to) => f.n[0] * to[0] + f.n[1] * to[1] > -0.25 && f.len > 4);
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    const n = Math.max(2, Math.round(L / 4.4));
    for (const u of bays(0, L, n)) fr.shopfront(u - L / (2 * n) + 0.25, u + L / (2 * n) - 0.25, 4.0, { pilaster: terra, fascia: hex('#3b2a22'), riser: terra, bays: 2, y: 0 });
    for (const u of bays(0, L, n)) fr.awning(u - L / (2 * n) + 0.4, u + L / (2 * n) - 0.4, 3.3, 0.6, 1.2, hex('#3f4a3c'));
    for (let i = 0; i <= n; i++) fr.box((i * L) / n - 0.3, (i * L) / n + 0.3, 4.2, 7.6, 0.05, 0.4, shade(terra, 1.06));
    for (const u of bays(0, L, n * 2)) fr.window(u, 4.7, 0.95, 2.5, { frame: terra, bars: 1, depth: 0.15 });
    fr.cornice(7.6, terra, 0.45, 0.45);
    for (const u of bays(0, L, n * 2)) fr.window(u, 8.6, 0.95, 1.9, { frame: hex('#c27a5c'), bars: 1 });
    fr.cornice(E - 0.35, terra, 0.35, 0.35);
    for (const u of bays(0, L, n)) { fr.box(u - 0.8, u + 0.8, E + 0.4, E + 2.2, -1.1, -0.5, K.roofTile); fr.window(u, E + 0.6, 0.9, 1.2, { frame: K.frameWhite, depth: -0.45, sill: false, frameW: 0.08 }); }
  }
  // the two Dutch gables on the longest front, and the terracotta corner turret at its far end
  const main = longest(fs);
  if (main) {
    const fr = new F(c.b, main);
    for (const t of [0.3, 0.7]) { fr.gable(main.len * t, E, 4.2, 3.6, brick, terra, 'dutch', 0.35); fr.window(main.len * t, E + 0.5, 1.2, 1.7, { frame: terra, bars: 1, depth: 0.45 }); }
    const end = main.a;
    turret(c.b, end[0] + main.n[0] * 0.2, end[1] + main.n[1] * 0.2, 1.4, 4.2, E + 2.2, { body: terra, band: hex('#d6a184'), bands: 3, cupola: K.copper, cupolaH: 2.4, sides: 8 });
  }
}

// ---- Nos. 48–51 Sloane Square: Court Lodge (48–50) and the former King's Arms (51, 1899/1908) -----------
// One OSM footprint covers both buildings; they are modelled separately along the frontage (split at
// about 58 % from the theatre end, estimated from photographs). Colbert occupies 50–52 in 2025–26.
// CAA (48–50): highly ornate red brick with stone banding, decorative window surrounds, central canted
// bays; top storeys with columned surrounds, outer windows pedimented, wider central window carrying a
// Dutch gable; polished red and grey granite shopfront pilasters; entrance with segmental pediment.
// CAA (51): turns the corner with a turret and cupola and ornate Dutch gables against grey slate; red
// brick with painted stone dressings; polished red granite pub frontage; main entrance pediment (1899).
function block4851(c: Ctx): void {
  const brick = hex('#b04b33'), white = hex('#efebe2'), granite = K.granitePink;
  const E = 17.6, sh = 3.25;
  walls(c, E, brick);
  slopedRoof(c, E, 4.0, 2, K.slate, K.slateDark);
  const main = longest(fronts(c, (f, to) => f.n[0] * to[0] + f.n[1] * to[1] > 0.5 && f.len > 10));
  const fr = new F(c.b, main);
  const L = main.len;
  // left = north end (turret), right = south end (theatre)
  const split = L * 0.42;
  // ---- 48–50 (u from split to L): stone banding every course pair
  for (let y = 4.8; y < E; y += 0.8) fr.box(split, L, y, y + 0.32, 0, 0.06, white, false, false);
  const cw = L - split;
  fr.bay(split + cw / 2, 3.4, 4.6, 4.6 + 3 * sh, 0.85, 'canted', brick, 3, white, K.lead);
  for (const u of [split + 1.6, L - 1.6]) for (let s = 0; s < 3; s++) fr.window(u, 5.2 + s * sh, 1.2, 2.1, { frame: white, head: s === 0 ? 'segment' : 'flat', bars: 1 });
  for (const u of [split + 1.6, L - 1.6]) { fr.column(u - 0.85, 14.4, 17.2, 0.28, white, 0.2); fr.column(u + 0.85, 14.4, 17.2, 0.28, white, 0.2); fr.window(u, 14.7, 1.1, 2.0, { frame: white, head: 'pediment' }); }
  fr.window(split + cw / 2, 14.7, 2.0, 2.0, { frame: white, bars: 2 });
  fr.cornice(E - 0.2, white, 0.45, 0.45, split, L);
  fr.gable(split + cw / 2, E + 0.25, 5.6, 5.4, brick, white, 'dutch', 0.35);
  for (let y = E + 1.0; y < E + 4.0; y += 0.8) fr.box(split + cw / 2 - 1.7, split + cw / 2 + 1.7, y, y + 0.3, 0.36, 0.4, white, false, false);
  for (const d of [-0.75, 0.75]) fr.window(split + cw / 2 + d, E + 1.2, 0.8, 1.8, { frame: white, head: 'round', bars: 0, depth: 0.45 });
  latheAt(c.b, ...pick(fr.P(split + cw / 2, 0, 0.2)), [[0.25, E + 5.6], [0.12, E + 6.3], [0.02, E + 6.8]], 6, white);
  // shopfront: polished red and grey granite pilasters, Court Lodge entrance with segmental pediment
  fr.shopfront(split + 0.3, L - 0.2, 4.4, { pilaster: granite, fascia: white, bays: 3, pilW: 0.55, door: L - 1.8 });
  fr.segPediment(L - 1.8, 4.4, 2.4, 0.9, granite, shade(granite, 0.9), 0.45);
  // ---- 51, the former King's Arms (u from 0 to split): red brick, painted stone dressings
  for (let s = 0; s < 4; s++) fr.band(4.6 + s * sh + sh - 0.3, 4.6 + s * sh + sh, white, 0.1, 0, split);
  for (const u of bays(1.2, split - 0.6, 2)) for (let s = 0; s < 4; s++) fr.window(u, 5.2 + s * sh, 1.3, 2.0, { frame: white, bars: 2, head: s === 0 ? 'round' : 'flat' });
  fr.cornice(E - 0.2, white, 0.4, 0.4, 0, split);
  fr.gable(split * 0.55, E + 0.25, split * 0.6, 4.4, brick, white, 'dutch', 0.35);
  fr.window(split * 0.55, E + 0.9, 1.1, 1.6, { frame: white, bars: 1, depth: 0.45 });
  fr.shopfront(0.2, split - 0.2, 4.4, { pilaster: granite, fascia: hex('#2d1f1c'), bays: 3, pilW: 0.55 });
  // Colbert: main entrance pediment (1899) with the name, maroon awnings and outdoor tables kept to the
  // building line (about 1.4 m deep) so the pavement stays clear
  fr.pediment(split + 0.1, 4.45, 2.6, 0.9, white, 0.45);
  sign(c, fr, split - 0.9, split + 1.1, 3.75, 4.3, 0.47, 'COLBERT', '#efebe2', '#5c4a3a', { font: 'serif', weight: 600, spacing: 1.2 });
  const aw: [number, number][] = [[0.4, split * 0.5 - 0.2], [split * 0.5 + 0.2, split - 1.3], [split + 1.4, split + cw * 0.45]];
  for (const [u0, u1] of aw) { fr.awning(u0, u1, 3.9, 1.0, 1.6, K.maroon); sign(c, fr, u0 + 0.2, u1 - 0.2, 2.62, 2.88, 1.61, 'COLBERT', '#6c1f2b', '#f3ece0', { font: 'serif', weight: 600, spacing: 1.2 }); }
  // Tables only where the mapped pavement is at least 1.9 m wide (the estimated carriageway width
  // overlaps the pavement toward the north end of this front; see docs/square-buildings.md).
  for (const u of bays(L * 0.56, L - 0.8, 4)) { fr.box(u - 0.3, u + 0.3, 0.72, 0.76, 0.9, 1.5, hex('#c9a46a')); fr.box(u - 0.04, u + 0.04, 0, 0.72, 1.16, 1.24, K.ironBlack); for (const d of [-0.42, 0.42]) fr.box(u + d - 0.2, u + d + 0.2, 0, 0.85, 0.9, 1.35, hex('#b89a64')); }
  // corner turret with cupola and finial at the north end where the frontage turns
  const tp: Pt = [main.a[0] + main.n[0] * 0.3, main.a[1] + main.n[1] * 0.3];
  prismAt(c.b, tp[0], tp[1], 1.7, 4.6, E, 8, brick, Math.PI / 8, false);
  for (let s = 0; s < 4; s++) prismAt(c.b, tp[0], tp[1], 1.76, 4.6 + s * sh + sh - 0.3, 4.6 + s * sh + sh, 8, white, Math.PI / 8, false);
  turret(c.b, tp[0], tp[1], 1.55, E, E + 2.6, { body: brick, band: white, cupola: K.lead, cupolaH: 2.6, lantern: true });
  // the short north face continues the King's Arms treatment
  for (const f of fronts(c, (f, to) => f.n[0] * to[0] + f.n[1] * to[1] > 0.2 && f.len > 4 && f.len < 10)) {
    const fq = new F(c.b, f);
    for (let s = 0; s < 4; s++) fq.band(4.6 + s * sh + sh - 0.3, 4.6 + s * sh + sh, white, 0.1);
    for (let s = 0; s < 4; s++) fq.window(f.len / 2, 5.2 + s * sh, 1.3, 2.0, { frame: white, bars: 2 });
    fq.gable(f.len / 2, E + 0.25, Math.min(4.6, f.len - 0.6), 4.0, brick, white, 'dutch', 0.35);
    fq.shopfront(0.2, f.len - 0.2, 4.4, { pilaster: granite, fascia: hex('#2d1f1c'), bays: 1, pilW: 0.55 });
    fq.awning(0.4, f.len - 0.4, 3.9, 1.0, 1.6, K.maroon);
  }
}
const pick = (p: number[]): [number, number] => [p[0], p[2]];

// ---- Wyndham House, Wellesley House and 34–36 Sloane Square (early 20th century; Grade II) -------------
// Listing + CAA: six storeys, Portland stone, free classical; shops on the ground floor behind square
// block-columned pilasters with a continuous stone fascia; rusticated mezzanine; engaged Ionic order
// through the two storeys above; dentilled cornice below the third floor... pedimented corner pavilions;
// slated roof with flat-roofed dormers; tall slab chimneys of banded brick and stone; mullion-and-transom
// leaded casements in stone architraves with keystones and pediments; iron balconies. Photos 2024–25.
function mansions(c: Ctx, side: 'wyndham' | 'wellesley'): void {
  const st = K.portland, sd = K.portlandShade;
  const E = 17.8;
  walls(c, E, st);
  slopedRoof(c, E, 4.4, 2, K.slate, K.slateDark);
  const fs = fronts(c, (f) => (f.n[1] < -0.9 || Math.abs(f.n[0]) > 0.95) && f.len > 4);
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    const n = Math.max(2, Math.round(L / 3.2));
    // ground floor shops behind square columns, continuous fascia
    fr.wall(0, L, 0.5, 3.8, K.glassLight, 0.05);
    for (let i = 0; i <= n; i++) fr.box((i * L) / n - 0.35, (i * L) / n + 0.35, 0, 3.9, 0, 0.4, st);
    fr.box(-0.1, L + 0.1, 3.9, 4.6, 0, 0.45, st, true);
    // rusticated mezzanine
    fr.box(0, L, 4.6, 7.5, 0, 0.12, sd);
    for (let y = 4.9; y < 7.5; y += 0.5) fr.band(y, y + 0.06, shade(sd, 0.85), 0.14);
    for (const u of bays(0, L, n)) fr.window(u, 5.3, 1.3, 1.6, { frame: st, keystone: st, depth: 0.2, base: 0.14 });
    fr.band(7.5, 7.9, st, 0.3);
    // giant Ionic pilasters through two storeys, windows with balconies and pediments between
    for (let i = 0; i <= n; i++) fr.column((i * L) / n, 7.9, 14.2, 0.5, st, 0.25, false);
    for (const u of bays(0, L, n)) {
      fr.window(u, 8.3, 1.3, 2.3, { frame: st, head: 'pediment', depth: 0.18 });
      fr.railing(u - 0.9, u + 0.9, 8.2, 0.5, 0.85);
      fr.window(u, 11.6, 1.3, 2.0, { frame: st, depth: 0.15, keystone: st });
    }
    fr.cornice(14.2, st, 0.55, 0.55);
    for (const u of bays(0, L, n)) fr.window(u, 15.1, 1.2, 1.8, { frame: st, depth: 0.12 });
    fr.cornice(E - 0.3, st, 0.4, 0.4);
    // flat-roofed dormers
    for (const u of bays(0.8, L - 0.8, Math.max(1, n - 1))) { fr.box(u - 0.8, u + 0.8, E + 0.4, E + 2.4, -1.5, -0.8, K.slateDark); fr.window(u, E + 0.7, 1.0, 1.3, { frame: st, depth: -0.75, sill: false, frameW: 0.08 }); }
    // corner pavilions with curved (segmental) pediment gables on the square front
    if (f.n[1] < -0.9 && L > 10) {
      const u = side === 'wellesley' ? 4.2 : L - 4.2;
      fr.box(u - 3.4, u + 3.4, 4.6, E, 0.12, 0.35, st);
      fr.gable(u, E - 0.3, 7.0, 4.4, st, sd, 'segment', 0.4);
      fr.window(u, E + 1.0, 1.4, 1.4, { frame: sd, head: 'round', depth: 0.5 });
    }
  }
  // tall slab chimneys of banded brick and stone along the roof
  const ins = c.roofs['2'];
  if (ins) {
    const r = toPts(ins.ring);
    for (let i = 0; i < r.length; i += Math.max(1, Math.floor(r.length / 4))) {
      const [x, z] = r[i];
      // banded slab: brick stack with three stone bands (one box each) and pots
      chimney(c.b, x, z, 2.4, 0.7, E + 2.0, E + 8.6, hex('#a9472f'), 0, 4);
      for (let k = 0; k < 3; k++) prismAt(c.b, x, z, 1.27, E + 3.0 + k * 1.9, E + 3.6 + k * 1.9, 4, K.portland, Math.PI / 4, false);
    }
  }
}

// ---- No. 33 Sloane Square / Lurgan Mansions (late 19th century) -------------------------------------
// CAA: six storeys, ornate red brick with contrasting terracotta; turns the corner with a turret and cupola
// and finial; square front with mullion-and-transom windows in carved brick surrounds and a Dutch gable;
// plainer Lower Sloane Street front with sashes and a triple-height oriel at the southern corner;
// traditional timber shopfront with stallriser in brick and stone banded piers; entrance under the turret.
function lurgan(c: Ctx): void {
  const brick = hex('#ab4a31'), terra = hex('#dec4a0');
  const E = 20.4, sh = 3.2;
  walls(c, E, brick);
  slopedRoof(c, E, 3.6, 2, K.slate);
  const fs = fronts(c, (f) => (f.n[1] < -0.9 || f.n[0] > 0.9 || (f.n[0] > 0.3 && f.n[1] < -0.7)) && f.len > 1.5);
  for (const f of fs) {
    const fr = new F(c.b, f);
    const L = fr.len;
    for (let s = 1; s <= 5; s++) fr.band(4.4 + s * sh - 0.3, 4.4 + s * sh, terra, 0.1);
    for (let i = 0; i <= Math.max(1, Math.round(L / 4)); i++) { const u = (i * L) / Math.max(1, Math.round(L / 4)); fr.box(u - 0.3, u + 0.3, 0, 4.4, 0, 0.3, i % 2 ? terra : brick); }
    if (L > 5) {
      const n = Math.max(2, Math.round(L / 3.2));
      for (const u of bays(0, L, n)) for (let s = 0; s < 5; s++) fr.window(u, 5.0 + s * sh, 1.2, 1.9, { frame: terra, bars: f.n[1] < -0.9 ? 2 : 1 });
      fr.shopfront(0.3, L - 0.3, 4.4, { pilaster: terra, fascia: hex('#1f3a33'), bays: Math.max(1, n - 1) });
      if (f.n[1] < -0.9) { fr.gable(L * 0.45, E + 0.2, Math.min(5.4, L * 0.7), 4.6, brick, terra, 'dutch', 0.35); fr.window(L * 0.45, E + 0.8, 1.2, 1.7, { frame: terra, bars: 1, depth: 0.45 }); }
      if (f.n[0] > 0.9) fr.bay(L - 2.0, 2.2, 7.6, 7.6 + 3 * sh, 0.7, 'canted', brick, 3, terra, K.lead);
    }
    fr.cornice(E - 0.3, terra, 0.35, 0.35);
  }
  // turret at the north-east corner (the canted corner facing the square and Lower Sloane Street)
  const corner = fs.find((f) => f.len < 3);
  if (corner) {
    const m: Pt = [(corner.a[0] + corner.b[0]) / 2 + corner.n[0] * 0.2, (corner.a[1] + corner.b[1]) / 2 + corner.n[1] * 0.2];
    prismAt(c.b, m[0], m[1], 1.6, 4.4, E, 8, brick, Math.PI / 8, false);
    for (let s = 1; s <= 5; s++) prismAt(c.b, m[0], m[1], 1.66, 4.4 + s * sh - 0.3, 4.4 + s * sh, 8, terra, Math.PI / 8, false);
    turret(c.b, m[0], m[1], 1.5, E, E + 2.4, { body: brick, band: terra, cupola: K.lead, cupolaH: 2.8, lantern: true });
  }
}

// ---- Nos. 28–31 Sloane Square (originally one symmetrical building) ------------------------------------
// CAA (no openly licensed photo found): five storeys, ornate red brick with beige terracotta; the two end
// shops with gables with four attic windows, the two central units with canted flat-roofed dormers; bay
// windows with leaded mullion-and-transom windows on the first and second floors; No. 31 re-fronted in
// Portland stone on the ground and first floors (1920s bank); polished black granite plinths.
function block2831(c: Ctx): void {
  const brick = hex('#ad4a31'), terra = hex('#dcc5a3');
  const E = 14.3, sh = 3.3;
  walls(c, E, brick);
  slopedRoof(c, E, 3.8, 2, K.slate);
  const main = longest(fronts(c, (f) => f.n[1] < -0.9 && f.len > 10));
  const fr = new F(c.b, main);
  const L = main.len, uw = L / 4;
  for (let s = 1; s <= 3; s++) fr.band(4.4 + s * sh - 0.3, 4.4 + s * sh, terra, 0.1);
  for (let i = 0; i < 4; i++) {
    const uc = (i + 0.5) * uw;
    const no = 28 + i; // west → east: 28 … 31
    if (no === 31) {
      fr.box(i * uw, (i + 1) * uw, 0, 7.6, 0, 0.3, K.portland);
      for (const d of [-0.32, 0.32]) fr.column(uc + d * uw, 0.6, 7.4, 0.45, K.portland, 0.35);
      fr.window(uc, 4.8, 1.8, 2.4, { frame: K.portland, head: 'pediment', depth: 0.4, base: 0.3 });
      fr.wall(uc - 1.6, uc + 1.6, 0.6, 3.8, K.glassLight, 0.31);
    } else {
      fr.shopfront(i * uw + 0.3, (i + 1) * uw - 0.3, 4.4, { pilaster: brick, fascia: K.black, riser: K.black, bays: 2 });
      fr.bay(uc, 2.6, 4.4, 4.4 + 2 * sh, 0.65, 'canted', brick, 2, terra, K.lead);
    }
    fr.window(uc, 11.3, 1.4, 1.9, { frame: terra, bars: 2 });
    if (i === 0 || i === 3) { fr.gable(uc, E, uw - 0.8, 4.4, brick, terra, 'triangle', 0.3); for (const d of [-1.05, -0.35, 0.35, 1.05]) fr.window(uc + d, E + 0.7, 0.5, 1.2, { frame: terra, bars: 0, depth: 0.4, frameW: 0.07 }); }
    else { fr.bay(uc, 2.4, E + 0.2, E + 2.4, 0.2, 'canted', K.slateDark, 1, K.frameWhite, K.lead); }
  }
  fr.cornice(E - 0.3, terra, 0.35, 0.35);
}

// ---- Holy Trinity, Sloane Street (J. D. Sedding, 1888–90; Grade I) ---------------------------------------
// CAA + photos 2014–26: Arts and Crafts Gothic in red brick with stone bands; west front on Sloane Street
// with an eight-light traceried window between two tall octagonal turrets with open lanterns and spirelets,
// smaller turrets at the aisle ends, crenellated parapets, three pointed doorways; tall nave with a
// steep slate roof; aisles with lower roofs; side walls of stock brick with red bands.
function holyTrinity(c: Ctx): void {
  const red = hex('#a7442f'), stone = hex('#d9cba9'), stock = hex('#b9a47d');
  // church frame: long axis from the footprint's longest edge; west = toward Sloane Street (x smaller)
  const es = edgesOf(c.bl.rings[0]);
  const longE = es.slice().sort((a, b) => b.len - a.len)[0];
  let ax: Pt = [longE.t[0], longE.t[1]];
  if (ax[0] > 0) ax = [-ax[0], -ax[1]]; // ax points west
  const side: Pt = [-ax[1], ax[0]];
  const pts = toPts(c.bl.rings[0]);
  const proj = (p: Pt) => [p[0] * ax[0] + p[1] * ax[1], p[0] * side[0] + p[1] * side[1]];
  const ps = pts.map(proj);
  // west front plane: length-weighted average position of the west-facing edges (the front is staggered)
  let wsum = 0, wlen = 0;
  for (const e of es) if (e.n[0] * ax[0] + e.n[1] * ax[1] > 0.9) { const m = proj([(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]); wsum += m[0] * e.len; wlen += e.len; }
  const w0 = wlen ? wsum / wlen : Math.max(...ps.map((p) => p[0]));
  const e0 = Math.min(...ps.map((p) => p[0])) + 4.5; // east end kept inside the tapering footprint
  const s0 = Math.min(...ps.map((p) => p[1])), s1 = Math.max(...ps.map((p) => p[1]));
  const W = (a: number, s: number): Pt => [ax[0] * a + side[0] * s, ax[1] * a + side[1] * s]; // back to world
  const sm = (s0 + s1) / 2, len = w0 - e0;
  const aisle = Math.min(6.5, (s1 - s0 - 12.5) / 2 - 0.3); // aisle fronts fit the footprint width
  const nw = 12.5;
  const front: Front = (() => { const a = W(w0, sm + nw / 2), b = W(w0, sm - nw / 2); const t: Pt = [b[0] - a[0], b[1] - a[1]]; const l = Math.hypot(t[0], t[1]); const n: Pt = [ax[0], ax[1]]; const tt: Pt = [n[1], -n[0]]; const ok = (t[0] * tt[0] + t[1] * tt[1]) > 0; return { a: ok ? a : b, b: ok ? b : a, len: l, t: tt, n }; })();
  // walls: nave 17 m, aisles 8.5 m (box walls along the footprint plus clerestory)
  walls(c, 8.5, stock);
  flatLid(c.b, c.bl.tris, 8.5, K.slate);
  // aisle lean-to roofs and nave block (quads built in the church frame)
  const quadW = (p: [number, number, number][], col: RGB) => { const q = p.map(([a, y, s]) => { const w = W(a, s); return [w[0], y, w[1]]; }); c.b.quad(q[0], q[1], q[2], q[3], col); };
  const nL = e0 + 1.0, nR = w0 - 0.6;
  for (const sgn of [-1, 1]) {
    const sIn = sm + sgn * nw / 2, sOut = sIn + sgn * Math.min(5, aisle);
    // lean-to slope from the aisle wall (8.5 m) up to the nave wall (11.5 m)
    const A: [number, number, number][] = [[nL, 8.5, sOut], [nR, 8.5, sOut], [nR, 11.5, sIn], [nL, 11.5, sIn]];
    const n = (() => { const a = W(A[0][0], A[0][2]), b = W(A[1][0], A[1][2]), d = W(A[3][0], A[3][2]); const ux = b[0] - a[0], uz = b[1] - a[1], vx = d[0] - a[0], vz = d[1] - a[1]; return uz * vx - ux * vz; })();
    quadW(n > 0 ? A : [A[1], A[0], A[3], A[2]], K.slate);
    // nave side wall (clerestory) with banding and tall windows
    const wall: [number, number, number][] = [[nL, 11.5, sIn], [nR, 11.5, sIn], [nR, 17.5, sIn], [nL, 17.5, sIn]];
    const nn = (() => { const a = W(wall[0][0], wall[0][2]), b = W(wall[1][0], wall[1][2]); const ux = b[0] - a[0], uz = b[1] - a[1]; return ux * (sgn * side[1]) - uz * (sgn * side[0]); })();
    quadW(nn < 0 ? wall : [wall[1], wall[0], wall[3], wall[2]], stock);
    for (let a = nL + 3; a < nR - 2; a += 6) {
      const win: [number, number, number][] = [[a - 1.2, 12.3, sIn + sgn * 0.05], [a + 1.2, 12.3, sIn + sgn * 0.05], [a + 1.2, 16.4, sIn + sgn * 0.05], [a - 1.2, 16.4, sIn + sgn * 0.05]];
      quadW(nn < 0 ? win : [win[1], win[0], win[3], win[2]], K.glass);
    }
  }
  // steep nave roof (ridge 27 m) with gable ends
  for (const sgn of [-1, 1]) {
    const sIn = sm + sgn * nw / 2;
    const R: [number, number, number][] = [[nL, 17.5, sIn], [nR, 17.5, sIn], [nR, 27.0, sm], [nL, 27.0, sm]];
    const a = W(R[0][0], R[0][2]), b = W(R[1][0], R[1][2]), d = W(R[3][0], R[3][2]);
    const ny = (b[1] - a[1]) * (d[0] - a[0]) - (b[0] - a[0]) * (d[1] - a[1]);
    quadW(ny > 0 ? R : [R[1], R[0], R[3], R[2]], K.slate);
  }
  // east gable (plain brick)
  {
    const fe: Front = { a: W(nL, sm - nw / 2), b: W(nL, sm + nw / 2), len: nw, t: [0, 0], n: [-ax[0], -ax[1]] };
    fe.t = [fe.n[1], -fe.n[0]];
    if ((fe.b[0] - fe.a[0]) * fe.t[0] + (fe.b[1] - fe.a[1]) * fe.t[1] < 0) [fe.a, fe.b] = [fe.b, fe.a];
    const fr = new F(c.b, fe);
    fr.wall(0, nw, 8.5, 17.5, stock);
    fr.gable(nw / 2, 17.5, nw, 9.5, stock, stone, 'triangle', 0.1);
  }
  // ---- west front on Sloane Street
  const fr = new F(c.b, front);
  const L = front.len;
  // banded lower stage: red brick with stone stripes
  fr.box(-aisle, L + aisle, 0, 9.0, 0, 0.3, red);
  const HB = 0.3; // windows and doors sit on the 0.3 m-proud lower stage and screen
  for (let y = 0.6; y < 9; y += 0.9) fr.box(-aisle, L + aisle, y, y + 0.38, 0.3, 0.34, stone, false, false);
  // central gable screen (diapered red brick) with the great traceried window
  fr.box(0, L, 9.0, 24.5, 0, 0.3, red);
  for (let y = 10; y < 24; y += 1.2) fr.box(0, L, y, y + 0.12, 0.3, 0.33, shade(stone, 0.95), false, false);
  fr.window(L / 2, 10.0, 8.0, 12.0, { frame: stone, glass: hex('#39424c'), head: 'pointed', bars: 7, depth: 0.45, frameW: 0.4, sill: true, base: HB });
  // tracery suggestion in the head
  for (let k = -3; k <= 3; k++) fr.box(L / 2 + k * 1.0 - 0.06, L / 2 + k * 1.0 + 0.06, 17.5, 20.5 - Math.abs(k) * 0.6, 0.34, 0.42, stone, false, false);
  fr.pediment(L / 2, 24.5, L + 0.6, 2.4, red, 0.32);
  for (const u of bays(0, L, 9)) fr.box(u - 0.4, u + 0.4, 24.3, 25.1, 0.25, 0.45, stone); // crenellation
  // doorways: big central pointed arch and two in the aisle fronts
  fr.window(L / 2, 0.0, 3.4, 5.6, { frame: stone, glass: hex('#3b2b22'), head: 'pointed', bars: 0, depth: 0.55, frameW: 0.45, sill: false, base: HB });
  for (const u of [-3.3, L + 3.3]) fr.window(u, 0.0, 2.2, 4.0, { frame: stone, glass: hex('#3b2b22'), head: 'pointed', bars: 0, depth: 0.45, frameW: 0.35, sill: false, base: HB });
  // aisle fronts: sloping crenellated parapets
  for (const [u0, u1] of [[-aisle, 0], [L, L + aisle]]) { for (const u of bays(u0, u1, 5)) fr.box(u - 0.35, u + 0.35, 9.0, 9.8, 0.25, 0.45, stone); }
  // great octagonal turrets flanking the gable, smaller ones at the aisle ends
  for (const u of [-0.2, L + 0.2]) {
    const p = fr.P(u, 0, 0.5);
    turret(c.b, p[0], p[2], 1.6, 0, 26.5, { body: red, band: stone, bands: 9, cupola: K.lead, cupolaH: 4.2, lantern: true, spire: true });
  }
  for (const u of [-aisle - 0.1, L + aisle + 0.1]) {
    const p = fr.P(u, 0, 0.4);
    turret(c.b, p[0], p[2], 0.9, 0, 14.5, { body: red, band: stone, bands: 5, cupola: K.lead, cupolaH: 2.2, lantern: true, spire: true });
  }
  // railings along the Sloane Street forecourt
  // forecourt railings (photos 2022–26), 1.8 m in front of the west front
  for (const u of bays(-aisle, L + aisle, 40)) fr.wall(u - 0.025, u + 0.025, 0, 1.4, K.ironBlack, 1.8);
  fr.box(-aisle, L + aisle, 1.3, 1.4, 1.75, 1.85, K.ironBlack, false, false);
  void len;
}

const BUILDERS: Record<string, (c: Ctx) => void> = {
  'square:royal-court': royalCourt,
  'square:station': station,
  'square:station-kiosk': stationKiosk,
  'square:hotel': hotel,
  'square:13-14': bank1314,
  'square:15-16': block1516,
  'square:sloane-st-143-144': (c) => sloaneStreet141(c, false),
  'square:sloane-st-141-142': (c) => sloaneStreet141(c, true),
  'square:1-6': block16,
  'square:52-56': terrace5256,
  'square:48-51': block4851,
  'square:wyndham': (c) => mansions(c, 'wyndham'),
  'square:wellesley': (c) => mansions(c, 'wellesley'),
  'square:lurgan': lurgan,
  'square:28-31': block2831,
  'square:holy-trinity': holyTrinity,
  ...DOY_BUILDERS,
};

export const SQUARE_MODELS = Object.keys(BUILDERS).filter((k) => k.startsWith('square:'));
export const DOY_MODELS = Object.keys(DOY_BUILDERS);

/** Builds every reconstructed perimeter building into `b`; returns the sign quads for the atlas. */
export function buildSquareBuildings(b: MeshBuilder, buildings: SquareBuildingFootprint[], roofs: Record<string, RoofInsets>, squareRing: number[], all: SquareBuildingFootprint[] = buildings): { signs: SignQuad[]; built: string[]; triangles: Record<string, number> } {
  const bbox = (o: SquareBuildingFootprint) => { const r = o.rings[0]; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < r.length; i += 2) { x0 = Math.min(x0, r[i]); x1 = Math.max(x1, r[i]); z0 = Math.min(z0, r[i + 1]); z1 = Math.max(z1, r[i + 1]); } return [x0, x1, z0, z1]; };
  const near = (o: SquareBuildingFootprint, p: SquareBuildingFootprint) => { const a = bbox(o), q = bbox(p); return a[0] < q[1] + 3 && a[1] > q[0] - 3 && a[2] < q[3] + 3 && a[3] > q[2] - 3; };
  const centre = toPts(squareRing).reduce((s, p, _, a) => [s[0] + p[0] / a.length, s[1] + p[1] / a.length], [0, 0] as Pt);
  const signs: SignQuad[] = [];
  const built: string[] = [];
  const triangles: Record<string, number> = {};
  for (const bl of buildings) {
    const krSpec = bl.custom?.startsWith('kr:') ? KR_SPECS[bl.custom.slice(3).replace(/-\d+$/, '')] : undefined;
    const fn = bl.custom ? (krSpec ? (c: Ctx) => { buildKr(c, krSpec, KR_HOOKS); } : BUILDERS[bl.custom]) : undefined;
    if (!fn) continue;
    const before = b.vertexCount;
    const others = all.filter((o) => o.id !== bl.id && near(o, bl)).map((o) => o.rings[0]);
    fn({ b, bl, roofs: roofs[bl.id] ?? {}, centre, signs, others });
    const key = bl.custom!.startsWith('kr:') ? 'kr' : bl.custom!;
    triangles[key] = (triangles[key] ?? 0) + (b.vertexCount - before) / 3;
    built.push(bl.id);
  }
  return { signs, built, triangles };
}

/** Packs the sign quads into one atlas canvas and textured mesh data (browser only). */
export function squareSignDecal(signs: SignQuad[]): { canvas: HTMLCanvasElement; data: Float32Array } | null {
  if (!signs.length) return null;
  const W = 1024, RH = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = RH * signs.length;
  const g = canvas.getContext('2d')!;
  const data: number[] = [];
  signs.forEach((s, i) => {
    const y = i * RH;
    const [p0, p1, , p3] = s.corners;
    const wm = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), hm = Math.hypot(p3[0] - p0[0], p3[1] - p0[1], p3[2] - p0[2]) || 0.5;
    const pw = Math.min(W, Math.max(64, Math.round((RH * wm) / hm)));
    g.fillStyle = s.bg;
    g.fillRect(0, y, pw, RH);
    g.fillStyle = s.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const font = s.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    let size = RH * 0.72;
    g.font = `${s.weight ?? 500} ${size}px ${font}`;
    const tw = g.measureText(s.text).width * (s.spacing ?? 1);
    if (tw > pw * 0.92) { size *= (pw * 0.92) / tw; g.font = `${s.weight ?? 500} ${size}px ${font}`; }
    if (s.text === '⊖UNDERGROUND') {
      // Underground roundel: red ring, blue bar (drawn, not a font glyph)
      const cx = pw / 2, cy = y + RH / 2, r = RH * 0.4;
      g.fillStyle = '#dc241f'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = s.bg; g.beginPath(); g.arc(cx, cy, r * 0.62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0019a8'; g.fillRect(cx - r * 1.25, cy - r * 0.2, r * 2.5, r * 0.4);
    } else if (s.text === '◷') {
      const cx = pw / 2, cy = y + RH / 2, r = RH * 0.42;
      g.fillStyle = '#f4f1e6'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#24272b'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - r * 0.7); g.moveTo(cx, cy); g.lineTo(cx + r * 0.5, cy + r * 0.1); g.stroke();
    } else if ((s.spacing ?? 1) !== 1) {
      const chars = [...s.text];
      const cw = (g.measureText(s.text).width * (s.spacing ?? 1)) / chars.length;
      chars.forEach((ch, k) => g.fillText(ch, pw / 2 + (k - (chars.length - 1) / 2) * cw, y + RH * 0.54));
    } else g.fillText(s.text, pw / 2, y + RH * 0.54);
    const u1 = pw / W, v0 = y / canvas.height, v1 = (y + RH) / canvas.height;
    const [a, b2, cq, d] = s.corners;
    data.push(a[0], a[1], a[2], 0, v1, b2[0], b2[1], b2[2], u1, v1, cq[0], cq[1], cq[2], u1, v0);
    data.push(a[0], a[1], a[2], 0, v1, cq[0], cq[1], cq[2], u1, v0, d[0], d[1], d[2], 0, v0);
  });
  return { canvas, data: new Float32Array(data) };
}
