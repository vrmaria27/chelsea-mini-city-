// King's Road, Sloane Square → Markham Square: one configuration per street-facing building, in walking
// order (south side odd numbers, north side even). Keys are OpenStreetMap ids. Each entry records its
// sources and confidence; docs/kings-road.md has the full inventory and the reference list.
//
// Sources (abbreviations used below):
//   HE nnnnnnn  Historic England list entry (via britishlistedbuildings.co.uk)
//   RH CAA      RBKC Royal Hospital Conservation Area Appraisal (March 2016), King's Road south side
//   BA 2024     Brick Development Association, Brick Awards 2024 shortlist: 120 King's Road
//   C:nnn       Wikimedia Commons photograph (references/kr/index.json on the references-kr branch)
import type { KrSpec } from './kingsRoad';

const H3 = [4.3, 3.6, 3.1]; // three-storey stucco terrace: tall ground floor with shops, piano nobile
const H4 = [4.3, 3.4, 3.2, 3.0];

/** The listed stucco terrace 74–108 (HE 1224735): one composition, with central and subsidiary features. */
function terrace74(addr: string, role: 'end' | 'plain' | 'sub' | 'centre', bays: number, doors: ('l' | 'r' | 'c')[] = ['r']): KrSpec {
  return {
    addr, side: 'N', floors: H3, wall: 'stucco', bays, edge: 0.7,
    win: [
      { head: 'flat', surround: 'arch', crown: role === 'centre' || role === 'sub' ? 'pediment' : 'hood', bars: 1, h: 0.66 },
      { head: 'flat', surround: 'arch', bars: 1, h: 0.56 },
    ],
    ground: { kind: 'shops', units: bays > 1 ? 2 : 1, fascia: 'paintBlack', pilaster: 'stucco', doors, consoles: true, recess: 0.7 },
    top: { kind: role === 'plain' || role === 'end' ? 'cornice' : 'blocking', h: role === 'centre' ? 1.2 : role === 'sub' ? 0.8 : 0.55 },
    bands: [1],
    pilasters: { from: 1, to: 2, at: 'ends', w: role === 'centre' || role === 'sub' ? 0.6 : 0.4 },
    chimneys: 1,
    extra: role === 'centre' ? 'attic' : undefined,
    src: 'HE 1224735 (mid C19 stucco terrace, 3 storeys, balanced composition with central and subsidiary features; cornices partly altered); C:033 (2025), C:078 (2022), C:099 (2022)',
    conf: 'partly',
    approx: role === 'centre' || role === 'sub' ? 'Position and form of the central/subsidiary features estimated from the listing and distant photographs' : 'Window rhythm estimated per house width; shopfront details generic',
  };
}

/** Red-brick "Queen Anne" range west of Sidney Smith Buildings, Nos 52–70 (OSM 4 storeys). */
function qa(addr: string, bays: number, gables: number, units: number): KrSpec {
  return {
    addr, side: 'N', floors: H4, wall: 'red', bays, edge: 0.6,
    win: [
      { head: 'flat', surround: 'stone', bars: 2, h: 0.6, pair: 1 },
      { head: 'flat', surround: 'stone', bars: 2, h: 0.58 },
      { head: 'flat', surround: 'stone', bars: 2, h: 0.55 },
    ],
    ground: { kind: 'shops', units, fascia: 'white', pilaster: 'portland', doors: ['c'], recess: 0.5 },
    top: { kind: 'parapet', h: 0.8, col: 'portland' },
    bands: [1, 2, 3], bandCol: 'portland',
    gables: gables ? { n: gables, style: 'dutch', h: 3.6, col: 'red', trim: 'portland' } : undefined,
    roof: gables ? { kind: 'pitched', h: 2.6, col: 'slate' } : { kind: 'flat' },
    chimneys: 2,
    src: 'C:032 (2025, looking east along the north side), C:158 (2015), OSM levels 4',
    conf: 'partly',
    approx: 'Gable count and window pairing estimated from oblique photographs; shopfronts generic',
  };
}

export const KR_SPECS: Record<string, KrSpec> = {
  // ================================ SOUTH SIDE (odd) ===============================================
  w899802872: {
    addr: '1–15 (shops 9–15; 27a Sloane Square)', side: 'S', floors: H4, wall: 'stock', base: 'stucco', bays: 12,
    win: [{ head: 'flat', surround: 'arch', crown: 'hood', bars: 1, h: 0.62 }, { head: 'flat', surround: 'arch', bars: 1, h: 0.58 }, { head: 'flat', surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 4, fascia: 'paintBlack', pilaster: 'stucco', doors: ['c'] },
    top: { kind: 'blocking', h: 0.7, col: 'stucco' }, bands: [1], bandCol: 'stucco', chimneys: 3,
    src: 'C:255 (2009) and C:127 (2019, under scaffolding); docs/square-buildings.md (shops at Nos 9–15)',
    conf: 'estimated',
    approx: 'No clear recent photograph after the 2019 works: stock brick with stucco dressings taken from the 2009 view',
  },
  w532534287: {
    addr: '17', side: 'S', floors: H4, wall: 'stock', base: 'stucco', bays: 1,
    win: [{ surround: 'arch', crown: 'hood', bars: 1 }, { surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco', doors: ['l'] },
    top: { kind: 'blocking', col: 'stucco' }, bands: [1], bandCol: 'stucco', roof: { kind: 'mansard', h: 2.4, dormers: 1 },
    src: 'C:255 (2009); OSM levels 4 + roof', conf: 'estimated', approx: 'Upper-floor details from a 2009 oblique view',
  },
  w532534288: {
    addr: '19', side: 'S', floors: H4, wall: 'stock', base: 'stucco', bays: 1,
    win: [{ surround: 'arch', crown: 'hood', bars: 1 }, { surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco', doors: ['r'] },
    top: { kind: 'blocking', col: 'stucco' }, bands: [1], bandCol: 'stucco', roof: { kind: 'mansard', h: 2.4, dormers: 1 },
    src: 'C:255 (2009); OSM levels 4 + roof', conf: 'estimated',
  },
  w532534289: {
    addr: '21–27', side: 'S', floors: H4, wall: 'stock', base: 'stucco', bays: 8,
    win: [{ surround: 'arch', crown: 'hood', bars: 1 }, { surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 4, fascia: 'paintBlack', pilaster: 'stucco', doors: ['l', 'r'] },
    top: { kind: 'blocking', col: 'stucco' }, bands: [1], bandCol: 'stucco', roof: { kind: 'mansard', h: 2.4, dormers: 4 }, chimneys: 3,
    src: 'C:255 (2009); OSM building=terrace, levels 4 + roof', conf: 'estimated',
  },
  w532534290: {
    addr: '29', side: 'S', floors: H4, wall: 'stock', base: 'stucco', bays: 2,
    win: [{ surround: 'arch', crown: 'pediment', bars: 1 }, { surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco' },
    top: { kind: 'blocking', col: 'stucco' }, bands: [1], bandCol: 'stucco',
    src: 'C:255 (2009); OSM levels 4', conf: 'estimated',
  },
  w532534291: {
    addr: '31 (corner of Duke of York Square lane)', side: 'S', floors: H4, wall: 'stock', base: 'stucco', bays: 2, returnBays: 2,
    win: [{ surround: 'arch', crown: 'pediment', bars: 1 }, { surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco' },
    top: { kind: 'blocking', col: 'stucco' }, bands: [1], bandCol: 'stucco',
    src: 'C:255 (2009); OSM levels 4', conf: 'estimated',
  },
  w899956695: {
    addr: '20 Duke of York Square (King\'s Road end)', side: 'S', floors: [4.4, 3.3, 2.9], wall: 'stock', base: 'portland', bays: 1,
    win: [{ surround: 'plain', bars: 0, h: 0.78, pair: 2 }, { surround: 'plain', bars: 0, h: 0.6 }],
    ground: { kind: 'glass', pilaster: 'portland' }, top: { kind: 'parapet', h: 0.6, col: 'portland' },
    src: 'RH CAA (Duke of York Square 2006: yellow stock brick, tall paired windows); C:031 (2025)', conf: 'partly',
  },
  w899956698: {
    addr: '18–21 Duke of York Square (King\'s Road end)', side: 'S', floors: [4.4, 3.3, 2.9], wall: 'stock', base: 'portland', bays: 1,
    win: [{ surround: 'plain', bars: 0, h: 0.78, pair: 2 }, { surround: 'plain', bars: 0, h: 0.6 }],
    ground: { kind: 'glass', pilaster: 'portland' }, top: { kind: 'parapet', h: 0.6, col: 'portland' },
    src: 'RH CAA (Duke of York Square 2006); C:031 (2025)', conf: 'partly',
  },
  w37754178: {
    addr: '35–47 (Royal Avenue House)', side: 'S', name: 'Royal Avenue House', floors: [4.2, 3.0, 3.0, 3.0, 3.0], wall: 'brown', base: 'concrete', bays: 12,
    win: [{ surround: 'none', bars: 2, h: 0.62, w: 2.2 }],
    ground: { kind: 'shops', units: 4, fascia: 'paintBlack', pilaster: 'concrete', doors: ['c'] },
    top: { kind: 'parapet', h: 0.9, col: 'concrete' }, bands: [1, 2, 3, 4], bandCol: 'white', returnBays: 4,
    src: 'C:080 (2022), C:175 (2014): brown brick with white concrete floor bands and wide windows, shops below; buildington.co.uk (5 storeys, 35–47 King\'s Road)',
    conf: 'partly', approx: 'Window widths and balcony arrangement at the Walpole Street corner simplified',
  },
  w455055799: {
    addr: '49 (former Chelsea Drugstore, corner of Royal Avenue)', side: 'S', floors: [4.6, 3.6, 3.4, 3.2], wall: 'redBright', base: 'travertine', bays: 2, returnBays: 4,
    win: [{ skip: true }, { head: 'flat', surround: 'stone', bars: 1, h: 0.6 }, { head: 'flat', surround: 'stone', bars: 1, h: 0.55 }],
    ground: { kind: 'stone', pilaster: 'travertine' },
    top: { kind: 'cornice', h: 0.6, col: 'portland' }, bands: [3], bandCol: 'portland', extra: 'drugstore',
    src: 'C:047 (2023): two-storey travertine-clad base with tall arched openings over a red-brick Victorian upper part with carved panels, stone dressings and a pedimented corner tower with finial',
    conf: 'observed', approx: 'Carved brick panels and the tower finial simplified; no McDonald\'s branding',
  },
  w901024029: {
    addr: '51', side: 'S', floors: [4.0, 3.2, 3.0], wall: 'stock', bays: 2,
    win: [{ surround: 'plain', archCol: 'buff', bars: 1 }, { surround: 'plain', archCol: 'buff', bars: 1 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco' }, top: { kind: 'parapet', h: 0.6, col: 'stucco' },
    roof: { kind: 'mansard', h: 2.5, dormers: 1 },
    src: 'RH CAA: London stock brick, yellow rubbed (gauged) arches, external secondary glazing; shared slate mansard with No. 53', conf: 'observed',
  },
  w901024031: {
    addr: '53', side: 'S', floors: [4.0, 3.2, 3.0], wall: 'stock', bays: 2,
    win: [{ surround: 'plain', archCol: 'redBright', bars: 1 }, { surround: 'plain', archCol: 'redBright', bars: 1 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco', fasciaH: 1.0 }, top: { kind: 'parapet', h: 0.6, col: 'stucco' },
    roof: { kind: 'mansard', h: 2.5, dormers: 1 },
    src: 'RH CAA: rebuilt with red rubbed arches; oversized fascia; shared slate mansard', conf: 'observed',
  },
  w901024032: {
    addr: '55–59', side: 'S', floors: [4.2, 3.8, 3.1], wall: 'stucco', bays: 3, edge: 1.2,
    win: [{ surround: 'arch', crown: 'hood', bars: 1, tall: true, balcony: 'balconette' }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 3, fascia: 'paintBlack', pilaster: 'stucco', consoles: true, doors: ['c'] },
    top: { kind: 'cornice', h: 0.55 }, bands: [1], extra: 'pedCentre',
    src: 'HE 1224691 (three houses of the Wellington Square development, early–mid C19, stucco, three storeys, one window each, symmetrical with the centre house advanced and pedimented); RH CAA (decorative shopfront pilasters retained); C:066 (2023)',
    conf: 'observed',
  },
  w223339597: {
    addr: 'Kiosk at Wellington Square', side: 'S', floors: [3.0], wall: 'green', bays: 0,
    win: [{}], ground: { kind: 'podium', pilaster: 'green' }, top: { kind: 'none' }, extra: 'kiosk',
    src: 'OSM (kiosk, shop=florist); C:066 (2023: green timber kiosk at the Wellington Square opening)', conf: 'partly', approx: 'No branding',
  },
  w901033329: {
    addr: '61–65', side: 'S', floors: [4.2, 3.8, 3.1], wall: 'stucco', bays: 3, edge: 1.2,
    win: [{ surround: 'arch', crown: 'hood', bars: 1, tall: true, balcony: 'balconette' }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 3, fascia: 'paintBlack', pilaster: 'stucco', doors: ['c'] },
    top: { kind: 'cornice', h: 0.55 }, bands: [1], extra: 'pedCentre',
    src: 'HE 1224629 (as Nos 55–59: symmetrical, centre house advanced and pedimented, iron balconies, C20 shops); RH CAA (plainer shopfronts)', conf: 'observed',
  },
  w901033331: {
    addr: '67–67a', side: 'S', floors: [4.0, 3.2, 3.0], wall: 'stock', bays: 3,
    win: [{ surround: 'plain', archCol: 'buff', bars: 1 }, { surround: 'plain', archCol: 'buff', bars: 1 }],
    ground: { kind: 'shops', units: 2, fascia: 'paintBlack', pilaster: 'stucco', consoles: true }, top: { kind: 'parapet', h: 0.5, col: 'stucco' },
    roof: { kind: 'mansard', h: 2.5, dormers: 2 },
    src: 'RH CAA: No. 67 London stock brick, No. 67a painted; two-over-two sashes, slate mansard, original fascia cornice, modern timber shopfronts', conf: 'observed',
    approx: 'No. 67a painted finish not separated from No. 67 (one OSM footprint)',
  },
  w901033332: {
    addr: '69 (former Wright\'s Dairy, corner of Smith Street)', side: 'S', floors: [4.2, 3.3, 3.2, 3.0], wall: 'red', bays: 2, returnBays: 2,
    win: [{ surround: 'stone', crown: 'segment', bars: 1 }, { surround: 'stone', bars: 1 }, { surround: 'stone', bars: 1, h: 0.52 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.6, col: 'portland' }, bands: [1], bandCol: 'portland', pilasters: { from: 1, to: 3, at: 'ends', col: 'red', w: 0.5 }, extra: 'dairy',
    src: 'RH CAA: four-storey red-brick corner building with pilasters, a cow\'s head on the canted corner and embossed panels with segmental pediments; modern shopfront', conf: 'partly',
    approx: 'Cow\'s head and embossed panels simplified',
  },
  w901124350: {
    addr: 'Smith Street (east side) end house', side: 'S', floors: [3.4, 3.1, 2.9], wall: 'stock', base: 'stucco', bays: 1,
    win: [{ surround: 'plain', bars: 1 }], ground: { kind: 'podium', pilaster: 'stucco' }, top: { kind: 'parapet', h: 0.6, col: 'stucco' },
    src: 'C:128 (2019), C:156 (2016): stock-brick terraces with stucco ground floors on Smith Street', conf: 'estimated',
    approx: 'Side-street terrace: only the end facing King\'s Road is treated; the rest of Smith Street is out of scope',
  },
  w903693755: {
    addr: 'Smith Street (west side) end house', side: 'S', floors: [3.4, 3.1, 2.9], wall: 'stock', base: 'stucco', bays: 1,
    win: [{ surround: 'plain', bars: 1 }], ground: { kind: 'podium', pilaster: 'stucco' }, top: { kind: 'parapet', h: 0.6, col: 'stucco' },
    src: 'C:128 (2019), C:156 (2016)', conf: 'estimated', approx: 'Side-street terrace end only',
  },
  w455055798: {
    addr: '69A (corner of Smith Street)', side: 'S', floors: [4.0, 3.3, 3.0, 2.8], wall: 'stucco', bays: 2, returnBays: 3,
    win: [{ surround: 'arch', crown: 'hood', bars: 2 }, { surround: 'arch', crown: 'hood', bars: 2 }, { surround: 'arch', bars: 2, h: 0.5 }],
    ground: { kind: 'shops', units: 1, fascia: 'white', pilaster: 'stucco' }, top: { kind: 'cornice', h: 0.5 },
    roof: { kind: 'mansard', h: 2.6, dormers: 2 }, bands: [1],
    src: 'RH CAA: mid-Victorian four-storey stucco building with mansard, six-over-six sashes with bracketed hoods (Smith Street side), modern shopfront; C:128 (2019), C:027 (2025)', conf: 'observed',
  },
  w903693763: {
    addr: '71', side: 'S', floors: [4.6], wall: 'stucco', bays: 0,
    win: [{}], ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco' }, top: { kind: 'parapet', h: 0.9 },
    src: 'OSM (one storey with a two-storey part behind); C:027 (2025, partly hidden)', conf: 'estimated', approx: 'Single-storey shop: frontage details not visible in available photographs',
  },
  w903693760: {
    addr: '73–77 (Atlantic Court)', side: 'S', name: 'Atlantic Court', floors: [4.4, 3.4, 3.4, 3.2], wall: 'brown', base: 'portland', bays: 6,
    win: [{ surround: 'none', bars: 1, h: 0.66 }],
    ground: { kind: 'glass', pilaster: 'portland' }, top: { kind: 'none' }, extra: 'atlantic',
    src: 'C:027 (2025): 1980s post-modern front with six giant stone-clad piers carrying a deep coved cornice, brown-brick gabled upper storeys with stone copings set back above; RH CAA (No. 77 broken pediment entrance to Lambard House)',
    conf: 'observed', approx: 'Gable and set-back arrangement above the cove simplified to two gables',
  },

  // ================================ NORTH SIDE (even) ==============================================
  w897420433: {
    addr: '34–46 (Sidney Smith Buildings)', side: 'N', name: 'Sidney Smith Buildings', floors: [4.4, 3.3, 3.2, 3.0], wall: 'red', bays: 11, edge: 0.8,
    win: [{ surround: 'stone', bars: 2, h: 0.62 }, { surround: 'stone', bars: 2, h: 0.6 }, { head: 'round', surround: 'stone', bars: 1, h: 0.62 }],
    ground: { kind: 'shops', units: 5, fascia: 'white', pilaster: 'portland', doors: ['c'] },
    top: { kind: 'cornice', h: 0.55, col: 'portland' }, bands: [1, 2, 3], bandCol: 'portland',
    gables: { n: 3, style: 'dutch', h: 4.2, col: 'red', trim: 'portland' }, roof: { kind: 'pitched', h: 3.0 }, chimneys: 3,
    src: 'C:158 (2015): red brick, four storeys with Dutch-gabled attics and stone dressings; C:049 (2023): gable with the "Kings Road" cartouche over three round-headed windows with shell tympana; C:218 (2012): canted corner shopfront at Cadogan Gardens',
    conf: 'observed', approx: 'Cartouche and shell tympana simplified; OSM levels (3 + 2 roof) differ from the four storeys seen',
  },
  w897420432: qa('52', 1, 0, 1),
  w897420431: qa('54', 1, 1, 1),
  w897420430: qa('56–58', 3, 1, 2),
  w897420429: qa('60–62', 3, 0, 2),
  w897420428: qa('64–66', 3, 1, 2),
  w897420427: {
    addr: '68–70 (corner of Blacklands Terrace)', side: 'N', floors: [4.4, 3.4, 3.2, 3.0], wall: 'red', base: 'portland', bays: 3, returnBays: 3,
    win: [{ surround: 'stone', bars: 2 }, { surround: 'stone', bars: 2 }, { surround: 'stone', bars: 2, h: 0.55 }],
    ground: { kind: 'shops', units: 2, fascia: 'paintBlack', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.55, col: 'portland' }, bands: [1, 3], bandCol: 'portland', quoins: 'portland', extra: 'pedBay',
    src: 'C:099 (2022) and C:032 (2025): red brick with stone quoins and dressings, a central bay with an iron balcony, arched window and pediment, stone ground floor; OSM levels 4',
    conf: 'observed',
  },
  w124038807: {
    addr: '72 (former Colville Tavern)', side: 'N', floors: [4.4, 3.5, 3.0], wall: 'stucco', bays: 3, returnBays: 2, edge: 1.0,
    win: [{ surround: 'arch', crown: 'alt', bars: 1, h: 0.64 }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'pub', units: 3, fascia: 'paintBlack', pilaster: 'redDeep', doors: ['c'] },
    top: { kind: 'cornice', h: 0.6, dentil: true }, pilasters: { from: 1, to: 2, at: 'bays', w: 0.5 }, extra: 'colville',
    src: 'HE 1224816 (formerly the Colville Tavern and Wine Stores; mid C19, stucco, three storeys, three bays, Doric pilasters to first and second storeys, plain east wing); C:134 (2017): Victorian pub front with arched windows and red granite piers, dentilled cornice, central attic blocking',
    conf: 'observed',
  },
  w120654470: terrace74('74', 'end', 1),
  w120654446: terrace74('76–78', 'sub', 2, ['l', 'r']),
  w120654494: terrace74('80', 'plain', 1),
  w120654475: terrace74('82', 'plain', 1),
  w896933677: terrace74('84–86', 'plain', 2, ['l', 'r']),
  w896933678: terrace74('88', 'plain', 1),
  w120654501: terrace74('90', 'centre', 2),
  w120654477: terrace74('92', 'centre', 2),
  w120654464: terrace74('94', 'plain', 1),
  w120654472: terrace74('96', 'plain', 1),
  w120654450: terrace74('98', 'plain', 1),
  w120654489: terrace74('100', 'plain', 1),
  w120654473: terrace74('102', 'plain', 1),
  w120654484: terrace74('104', 'plain', 1),
  w120654453: terrace74('106–108 (corner of Anderson Street)', 'sub', 2, ['l', 'r']),
  w781302179: {
    addr: '110–112 (corner of Anderson Street)', side: 'N', floors: H3, wall: 'stucco', bays: 3, returnBays: 2,
    win: [{ surround: 'arch', crown: 'hood', bars: 1, h: 0.64 }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 2, fascia: 'paintBlack', pilaster: 'stucco', consoles: true },
    top: { kind: 'cornice', h: 0.6 }, pilasters: { from: 1, to: 2, at: 'bays', w: 0.5 }, bands: [1],
    src: 'HE 1224736 (houses with shops below, mid C19, stucco, three storeys, five bays altogether, Doric pilasters to first and second storeys); C:235 (2010)',
    conf: 'observed', approx: 'Five bays split three to King\'s Road and two to Anderson Street (estimated)',
  },
  w806116008: {
    addr: '118 (part of 120 King\'s Road, 2023)', side: 'N', floors: [4.6, 3.6, 3.6, 3.6], wall: 'buff', base: 'brown', bays: 2,
    win: [{ head: 'round', surround: 'plain', bars: 0, h: 0.8, w: 1.6 }, { head: 'round', surround: 'plain', bars: 0, h: 0.78, w: 1.6 }, { head: 'flat', surround: 'plain', bars: 0, h: 0.7, w: 1.6 }],
    ground: { kind: 'glass', pilaster: 'brown' }, top: { kind: 'parapet', h: 0.7, col: 'buff' }, extra: 'oneTwenty',
    src: 'BA 2024 (Squire & Partners: reclaimed London stock in Flemish bond, arched brick openings, darker brick base, green tiles and dark metalwork, fully glazed shopfronts); planning PP/21/02928 (ground + 3 + set-back roof storey)',
    conf: 'partly', approx: 'Arch rhythm and set-back storey estimated (no openly licensed photograph found); OSM footprint predates the rebuild',
  },
  w806116007: {
    addr: '120 (120 King\'s Road, 2023, Tryon Street corner)', side: 'N', floors: [4.6, 3.6, 3.6, 3.6], wall: 'buff', base: 'brown', bays: 2, returnBays: 3,
    win: [{ head: 'round', surround: 'plain', bars: 0, h: 0.8, w: 1.6 }, { head: 'round', surround: 'plain', bars: 0, h: 0.78, w: 1.6 }, { head: 'flat', surround: 'plain', bars: 0, h: 0.7, w: 1.6 }],
    ground: { kind: 'glass', pilaster: 'brown' }, top: { kind: 'parapet', h: 0.7, col: 'buff' }, extra: 'oneTwenty',
    src: 'BA 2024; planning PP/21/02928', conf: 'partly', approx: 'As No. 118',
  },
  w755651495: {
    addr: '122 (120 King\'s Road, 2023; former Kings Walk)', side: 'N', floors: [4.6, 3.6, 3.6, 3.6], wall: 'buff', base: 'brown', bays: 6,
    win: [{ head: 'round', surround: 'plain', bars: 0, h: 0.8, w: 1.6 }, { head: 'round', surround: 'plain', bars: 0, h: 0.78, w: 1.6 }, { head: 'flat', surround: 'plain', bars: 0, h: 0.7, w: 1.6 }],
    ground: { kind: 'glass', pilaster: 'brown' }, top: { kind: 'parapet', h: 0.7, col: 'buff' }, extra: 'oneTwenty',
    src: 'BA 2024; planning PP/21/02928 (demolition of Kings Walk mall)', conf: 'partly', approx: 'As No. 118',
  },
  w896079929: {
    addr: '124 (Mitre House)', side: 'N', name: 'Mitre House', floors: [4.2, 3.0, 3.0, 3.0], wall: 'red', bays: 7,
    win: [{ surround: 'plain', bars: 2, h: 0.6 }],
    ground: { kind: 'shops', units: 3, fascia: 'paintBlack', pilaster: 'portland' }, top: { kind: 'parapet', h: 0.8, col: 'portland' }, bands: [1], bandCol: 'portland',
    src: 'OSM (apartments, 4 levels, 9 flats); C:066 (2023, distant): red brick block between 120 King\'s Road and No. 126', conf: 'estimated',
    approx: 'Only seen at a distance: window pattern and parapet estimated',
  },
  w896079928: {
    addr: '126', side: 'N', floors: H3, wall: 'stucco', bays: 2,
    win: [{ surround: 'arch', crown: 'pediment', bars: 1, h: 0.62 }, { surround: 'arch', crown: 'segment', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco' }, top: { kind: 'cornice', h: 0.55 }, roof: { kind: 'mansard', h: 2.3, dormers: 2 },
    src: 'C:066 (2023): white stucco, pedimented first-floor aedicules on columns, segmental hoods above', conf: 'partly',
  },
  w896079927: {
    addr: '128', side: 'N', floors: H3, wall: 'stuccoPink', bays: 1,
    win: [{ surround: 'arch', crown: 'pediment', bars: 1, h: 0.62 }, { surround: 'arch', crown: 'segment', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'paintBlack' }, top: { kind: 'cornice', h: 0.55 },
    src: 'C:066 (2023): pink-painted stucco with an aedicule first-floor window, black shopfront', conf: 'partly',
  },
  w896079926: {
    addr: '130', side: 'N', floors: [4.3, 3.2, 3.0, 2.8], wall: 'stucco', bays: 2,
    win: [{ surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.5 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'paintBlack' }, top: { kind: 'parapet', h: 0.6 }, roof: { kind: 'mansard', h: 2.2, dormers: 2 },
    src: 'C:066 (2023): taller white stucco house with plain architraves and dormers', conf: 'partly',
  },
  w896079924: {
    addr: '132 (corner of Bywater Street)', side: 'N', floors: H3, wall: 'stucco', bays: 1, returnBays: 2,
    win: [{ surround: 'arch', bars: 1 }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 1, fascia: 'stuccoGreen', pilaster: 'stuccoGreen' }, top: { kind: 'cornice', h: 0.5 },
    src: 'C:066 (2023): white stucco corner house with a pale green shopfront and the Bywater Street name plate', conf: 'partly',
  },
  w896079920: {
    addr: '134–136', side: 'N', floors: H3, wall: 'stuccoGrey', bays: 2,
    win: [{ surround: 'arch', crown: 'hood', bars: 1, h: 0.62 }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 2, fascia: 'paintBlack', pilaster: 'stucco', consoles: true },
    top: { kind: 'cornice', h: 0.5 }, pilasters: { from: 1, to: 2, at: 'ends', w: 0.55 },
    src: 'C:133 (2018): No. 136 painted brick with stucco pilasters, hooded first-floor window and a shopfront with scrolled consoles; No. 134 with an Ionic pilaster', conf: 'observed',
  },
  w104770625: {
    addr: '138A (Markham Square east corner)', side: 'N', floors: [3.9, 3.5, 3.1], wall: 'stock', base: 'stucco', bays: 2, returnBays: 2,
    win: [{ surround: 'plain', archCol: 'stock', bars: 2, h: 0.72 }, { surround: 'plain', archCol: 'stock', bars: 2, h: 0.58 }],
    ground: { kind: 'shops', units: 1, fascia: 'stuccoGreen', pilaster: 'stuccoGreen', doors: ['r'] },
    top: { kind: 'parapet', h: 0.9, col: 'stucco' }, chimneys: 2, extra: 'bow138a',
    src: 'HE 1225025 (early C19 brick house, three storeys, three bays, sashes, full-height bow to the right); C:040 (2024): stock brick, six-over-six sashes with gauged arches, stucco ground floor and parapet; Mary Quant plaque; C:133 (2018) shows the bow beside No. 138',
    conf: 'observed', approx: 'OSM tags this footprint "49 Markham Square"; the frontage is No. 138A',
  },
  r12200227: {
    addr: '138 (former Markham Arms)', side: 'N', name: 'Former Markham Arms', floors: [4.4, 3.5, 2.9], wall: 'stuccoWarm', bays: 5, edge: 0.5,
    win: [
      { head: 'round', surround: 'arch', bars: 1, h: 0.66, balcony: 'balcony' },
      { head: 'flat', surround: 'arch', bars: 1, h: 0.52 },
    ],
    ground: { kind: 'pub', units: 3, fascia: 'stuccoWarm', pilaster: 'stucco', doors: ['c'] },
    top: { kind: 'cornice', h: 0.6 }, bands: [1],
    src: 'OSM r12200227 (138 King\'s Road; Wikipedia: Markham Arms, Chelsea); C:133 (2018): painted former pub with round-headed first-floor windows behind a continuous cast-iron balcony, pub front with pilasters, canted front',
    conf: 'partly', approx: 'Balcony ironwork simplified; second-floor windows partly hidden in the photograph; no bank branding',
  },
  r12200265: {
    addr: '114–116', side: 'N', floors: [4.2, 3.2], wall: 'stucco', bays: 4,
    win: [{ surround: 'plain', bars: 1, h: 0.58 }],
    ground: { kind: 'shops', units: 2, fascia: 'paintBlack', pilaster: 'stucco' },
    top: { kind: 'parapet', h: 0.7 },
    src: 'OSM r12200265 (114–116 King\'s Road, levels 2 and 4)',
    conf: 'estimated', approx: 'Unresolved frontage: no openly licensed photograph found; two-storey street range from OSM levels, finish and windows assumed',
  },
  r12236014: {
    addr: 'Whitelands House (corner of Cheltenham Terrace)', side: 'S', name: 'Whitelands House', floors: [4.4, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 3.0], wall: 'red', base: 'portland', bays: 12, returnBays: 3, edge: 0.8,
    win: [{ surround: 'plain', archCol: 'redDeep', bars: 2, h: 0.55, w: 1.25 }],
    ground: { kind: 'shops', units: 6, fascia: 'paintBlack', pilaster: 'portland', doors: ['c'] },
    top: { kind: 'parapet', h: 0.8, col: 'portland' }, bands: [1, 9], bandCol: 'portland',
    roof: { kind: 'mansard', h: 3.0, col: 'lead', dormers: 6 },
    src: 'OSM r12236014 (apartments, 10 levels + roof level); C:176 (2014): 1930s red-brick block of nine storeys with a set-back grey roof storey, regular small-paned windows, shops under black fascias along King\'s Road, white corner shop at Cheltenham Terrace',
    conf: 'partly', approx: 'Balcony stack on the wing and the stepped massing simplified; no shop branding',
  },
  w104770550: {
    addr: 'Markham Square west corner (King\'s Road frontage)', side: 'N', floors: [4.0, 3.3, 3.0], wall: 'stucco', bays: 5, returnBays: 2,
    win: [{ surround: 'arch', crown: 'hood', bars: 1 }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 3, fascia: 'paintBlack', pilaster: 'stucco' }, top: { kind: 'cornice', h: 0.55 },
    src: 'OSM (retail, 3 levels); C:155 (2016, view into Markham Square)', conf: 'estimated',
    approx: 'End of the reconstruction: no clear photograph of this frontage; generic stucco treatment matching its neighbours',
  },
};
