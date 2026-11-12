// Sloane Street (north from Sloane Square to Cadogan Gardens / Ellis Street) and Lower Sloane Street (south
// to the Pimlico Road junction): one configuration per street-facing building, outward from the square.
// Keys are OpenStreetMap ids; addresses come from the OSM addr tags of the footprints and of the shop
// nodes inside them (data/osm/ss-buildings.json, 2026-11-12). docs/sloane-streets.md has the inventory.
//
// Sources (abbreviations):
//   C:nnn   Wikimedia Commons photograph (references/ss/index.json on the references-ss branch)
//   OSM     footprint tags: addr, building:levels / roof:levels, building:material / colour
// Several shops in one building are its units ("ground.units"), not separate buildings; shop polygons drawn
// inside a larger footprint (Saloni, No. 134; Escada, No. 129, inside George House) are merged into it.
import type { KrSpec } from './kingsRoad';

/** Queen Anne red-brick terrace houses on Lower Sloane Street's west side (C:213, C:168, C:233). */
function qaTerrace(addr: string, houses: number, floors: number[], conf: KrSpec['conf'], src: string, approx: string): KrSpec {
  return {
    addr, side: 'W', floors, wall: 'redDeep', bays: houses * 2, edge: 0.5,
    win: [{ head: 'flat', surround: 'stone', bars: 1, h: 0.6 }, { head: 'flat', surround: 'stone', bars: 1, h: 0.58 }, { head: 'flat', surround: 'stone', bars: 1, h: 0.52 }],
    ground: { kind: 'podium', pilaster: 'redDeep' },
    top: { kind: 'cornice', h: 0.45, col: 'portland' }, bands: [1, 2], bandCol: 'portland',
    gables: { n: houses, style: 'dutch', h: 3.4, col: 'redDeep', trim: 'portland' }, roof: { kind: 'pitched', h: 2.8, col: 'slate' }, chimneys: houses,
    extra: 'qaHouses', src, conf, approx,
  };
}

export const SS_SPECS: Record<string, KrSpec> = {
  // ============================ SLOANE STREET, WEST SIDE (numbers fall northward) ============================
  w532074742: {
    addr: '140 Sloane Street', side: 'W', floors: [4.3, 3.3, 3.0], wall: 'stock', base: 'stucco', bays: 2, edge: 0.6,
    win: [{ surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.66, balcony: 'balconette' }, { surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.58 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'stucco', doors: ['r'] },
    top: { kind: 'parapet', h: 0.7, col: 'stucco' }, roof: { kind: 'mansard', h: 2.4, dormers: 2 }, bands: [1], bandCol: 'stucco', chimneys: 1,
    src: 'OSM (No. 140, retail, 3 levels + roof, brown brick); C:147 (2022, looking south: stock-brick houses with iron balconettes next to No. 139)',
    conf: 'estimated', approx: 'Only seen obliquely: treated like No. 139 above a shopfront; shopfront details assumed',
  },
  w532074743: {
    addr: '139 Sloane Street', side: 'W', floors: [4.0, 3.4, 3.0], wall: 'stock', bays: 2, edge: 0.7,
    win: [{ surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.66, balcony: 'balconette' }, { surround: 'plain', archCol: 'rubbed', bars: 1, h: 0.6 }],
    ground: { kind: 'podium', pilaster: 'stock' },
    top: { kind: 'parapet', h: 0.7, col: 'stucco' }, roof: { kind: 'mansard', h: 2.4, dormers: 2 }, bands: [1], bandCol: 'stucco', chimneys: 1, extra: 'fanlights',
    src: 'C:042 (2024): London stock brick, red rubbed-brick flat arches, iron balconettes to the first floor, two arched ground-floor windows with radiating fanlights either side of a stepped entrance with railings, dormers; OSM (No. 139, 3 levels + roof)',
    conf: 'observed', approx: 'Fanlight glazing pattern simplified; estate-agent board omitted',
  },
  w532074746: {
    addr: '136–138 Sloane Street', side: 'W', floors: [4.4, 3.4, 3.2, 3.0], wall: 'stock', base: 'stucco', bays: 5, edge: 0.8,
    win: [{ surround: 'arch', bars: 1, h: 0.64, crown: 'hood' }, { surround: 'arch', bars: 1, h: 0.6 }, { surround: 'arch', bars: 1, h: 0.55 }],
    ground: { kind: 'shops', units: 2, fascia: 'stucco', pilaster: 'stucco', consoles: true, doors: ['c', 'r'], sideDoor: 'r' },
    top: { kind: 'cornice', h: 0.6, col: 'stucco' }, roof: { kind: 'mansard', h: 2.2, dormers: 3 }, chimneys: 2, extra: 'urns',
    src: 'C:143 (2022): four storeys of stock brick with white moulded window architraves and hoods, white stucco ground floor with Corinthian pilasters, consoles and a separate panelled door to the upper floors, urns on the parapet; OSM (Nos 136–138, retail, 4 levels + roof)',
    conf: 'observed', approx: 'Pilaster capitals simplified; shop name omitted',
  },
  r12217309: {
    addr: '127–135 Sloane Street (George House; includes Saloni, No. 134, and Escada, No. 129)', side: 'W', name: 'George House', floors: [4.6, 3.3, 3.3, 3.2, 3.0], wall: 'terracotta', bays: 14, edge: 0.4,
    win: [{ surround: 'none', bars: 1, h: 0.7, w: 2.6 }],
    ground: { kind: 'glass', pilaster: 'terracotta' },
    top: { kind: 'parapet', h: 0.8, col: 'terracotta' }, roof: { kind: 'flat' }, extra: 'georgeHouse',
    src: 'C:142, C:144, C:145 (2022) and C:183 (2018): late-20th-century block with deep terracotta-coloured stone piers framing large plate-glass windows, a grey fascia band over full-height shop glazing; OSM r12217309 (George House, Nos 127–135, commercial, 5 levels), shop nodes Nos 129 and 134',
    conf: 'partly', approx: 'Upper-floor window divisions and the set-back top level estimated; brands omitted',
  },
  w531359421: {
    addr: '125 Sloane Street (corner of Cadogan Gardens)', side: 'W', floors: [4.2, 3.2, 3.2, 3.0, 2.9], wall: 'red', base: 'portland', bays: 4, returnBays: 2, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.6 }, { surround: 'stone', bars: 1, h: 0.58 }, { surround: 'stone', bars: 1, h: 0.52 }],
    ground: { kind: 'residential', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, bands: [1, 3], bandCol: 'portland',
    gables: { n: 1, style: 'dutch', h: 4.0, col: 'red', trim: 'portland' }, roof: { kind: 'pitched', h: 2.8 }, chimneys: 2,
    src: 'C:041 (2024, No. 123 with No. 125 on its left): red brick with stone bands and a shaped Dutch gable; OSM (No. 125, apartments, 5 levels, brick)',
    conf: 'partly', approx: 'Seen only at the edge of a photograph of No. 123: bay count, entrance and the Cadogan Gardens return estimated',
  },
  w531359436: {
    addr: 'North corner of Cadogan Gardens (west side; number not tagged)', side: 'W', floors: [4.0, 3.2, 3.2, 3.0], wall: 'red', base: 'portland', bays: 3, returnBays: 3, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.6 }],
    ground: { kind: 'residential', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, roof: { kind: 'pitched', h: 2.6 }, bands: [1], bandCol: 'portland', chimneys: 2, extra: 'whiteBays',
    src: 'C:243 (2014): red-brick mansion block at a Sloane Street corner with a stack of white stucco bay windows and a stone entrance; OSM (4 levels incl. roof estimate)',
    conf: 'estimated', approx: 'End of the reconstruction: the photograph may show this corner or its neighbour; detail estimated',
  },

  // ============================ SLOANE STREET, EAST SIDE (numbers rise northward) ============================
  w531836269: {
    addr: '147 Sloane Street', side: 'E', floors: [4.2, 3.2, 3.0], wall: 'red', base: 'navy', bays: 2, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.56 }],
    ground: { kind: 'shops', units: 1, fascia: 'navy', pilaster: 'navy', doors: ['c'] },
    top: { kind: 'parapet', h: 0.7, col: 'portland' }, bands: [1], bandCol: 'portland',
    src: 'C:088 (2023) and C:124 (2022): red brick with stone dressings over a navy-painted shopfront between pilasters (jeweller); OSM (No. 147, 3 levels)',
    conf: 'partly', approx: 'Upper floors seen behind roadwork barriers; shop name omitted',
  },
  w531836270: {
    addr: '148 Sloane Street', side: 'E', floors: [4.2, 3.2, 3.0], wall: 'red', bays: 2, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.56 }],
    ground: { kind: 'shops', units: 1, fascia: 'paintBlack', pilaster: 'portland', doors: ['l'] },
    top: { kind: 'parapet', h: 0.7, col: 'portland' }, roof: { kind: 'mansard', h: 2.2, dormers: 1 }, bands: [1], bandCol: 'portland',
    src: 'C:088 (2023): red-brick house between No. 147 and the stucco corner; OSM (No. 148, apartments, 3 levels + roof)',
    conf: 'partly',
  },
  w531836271: {
    addr: '149 Sloane Street (corner of Sloane Terrace; Nos 149a–e)', side: 'E', floors: [4.2, 3.3, 3.0], wall: 'stucco', bays: 3, returnBays: 3, edge: 0.7,
    win: [{ surround: 'arch', crown: 'hood', bars: 1, h: 0.62 }, { surround: 'arch', bars: 1, h: 0.56 }],
    ground: { kind: 'shops', units: 3, fascia: 'paintBlack', pilaster: 'stucco', doors: ['c'] },
    top: { kind: 'cornice', h: 0.55 }, roof: { kind: 'mansard', h: 2.2, dormers: 2 }, bands: [1],
    src: 'OSM (No. 149, apartments, 3 levels + roof, white plaster); shop nodes Nos 149, 149a, 149b, 149e; C:088 (2023, white stucco corner)',
    conf: 'partly', approx: 'Window surrounds and the shop divisions on the Sloane Terrace return estimated',
  },
  r12221768: {
    addr: '150–155 Sloane Street (between Sloane Terrace and Wilbraham Place)', side: 'E', floors: [4.4, 3.2, 3.2, 3.1, 3.0], wall: 'red', base: 'portland', bays: 7, returnBays: 4, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.6 }, { surround: 'stone', bars: 1, h: 0.58 }, { surround: 'stone', bars: 1, h: 0.52 }],
    ground: { kind: 'shops', units: 4, fascia: 'paintBlack', pilaster: 'portland', consoles: true, doors: ['c'] },
    top: { kind: 'cornice', h: 0.55, col: 'portland' }, roof: { kind: 'mansard', h: 2.6, dormers: 5 }, bands: [1, 4], bandCol: 'portland', chimneys: 3,
    src: 'OSM r12221768 (apartments, 5 levels + roof, brick; shop nodes Nos 150, 151, 152–153); C:229 (2014, view along Wilbraham Place)',
    conf: 'estimated', approx: 'No frontal photograph: red-brick mansion block with shops below assumed from its neighbour Nos 156–161 and OSM tags',
  },
  r12221769: {
    addr: '156–161 Sloane Street (between Wilbraham Place and Ellis Street)', side: 'E', floors: [4.4, 3.2, 3.2, 3.1, 3.0], wall: 'red', base: 'paintBlack', bays: 7, returnBays: 4, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.6 }, { surround: 'stone', bars: 1, h: 0.58 }, { surround: 'stone', bars: 1, h: 0.52 }],
    ground: { kind: 'shops', units: 5, fascia: 'paintBlack', pilaster: 'paintBlack', consoles: true, doors: ['c'] },
    top: { kind: 'cornice', h: 0.55, col: 'portland' }, roof: { kind: 'mansard', h: 2.6, dormers: 5 }, bands: [1, 4], bandCol: 'portland', chimneys: 3,
    src: 'C:141 (2022, No. 157–158): red brick with white sashes over a black-painted shopfront with white consoles; C:140 (2022): black curved corner shopfront under red brick; OSM r12221769 (No. 156, apartments, 5 levels + roof; shop nodes Nos 157–161)',
    conf: 'partly', approx: 'Upper-floor rhythm and roof estimated; brands omitted',
  },

  // ============================ LOWER SLOANE STREET, WEST SIDE ============================
  w532635261: {
    addr: '2 Lower Sloane Street', side: 'W', floors: [3.8, 3.3, 3.1], wall: 'redDeep', bays: 2, edge: 0.4,
    win: [{ surround: 'stone', bars: 1, h: 0.6 }, { surround: 'stone', bars: 1, h: 0.56 }],
    ground: { kind: 'residential', pilaster: 'redDeep' },
    top: { kind: 'cornice', h: 0.45, col: 'portland' }, bands: [1, 2], bandCol: 'portland',
    gables: { n: 1, style: 'dutch', h: 3.6, col: 'redDeep', trim: 'portland' }, roof: { kind: 'pitched', h: 3.0 }, chimneys: 1,
    src: 'C:166 (2019): red brick with stone bands and a shaped gable beside Lurgan Mansions; OSM (No. 2, house, 3 levels + 2 roof levels, brick)',
    conf: 'partly',
  },
  w532635259: {
    addr: '4 Lower Sloane Street', side: 'W', floors: [3.8, 3.3, 3.1], wall: 'redDeep', bays: 2, edge: 0.4,
    win: [{ surround: 'stone', bars: 1, h: 0.6 }, { surround: 'stone', bars: 1, h: 0.56 }],
    ground: { kind: 'residential', pilaster: 'redDeep' },
    top: { kind: 'cornice', h: 0.45, col: 'portland' }, bands: [1, 2], bandCol: 'portland',
    gables: { n: 1, style: 'dutch', h: 3.6, col: 'redDeep', trim: 'portland' }, roof: { kind: 'pitched', h: 3.0 }, chimneys: 1,
    src: 'C:166 (2019); OSM (No. 4, 3 levels + 2 roof levels, brick)', conf: 'partly',
  },
  w532635258: qaTerrace('Lower Sloane Street, west terrace (south of No. 4)', 7, [3.6, 3.3, 3.1], 'partly',
    'C:213 (2015, looking south along the west side): red-brick Queen Anne terrace with shaped gables, two-storey canted bays, stone porches and basement railings; OSM (terrace, 3 levels + roof)',
    'House count estimated from the footprint length (≈7 m per house); individual gable shapes not distinguished'),
  w899839500: qaTerrace('Lower Sloane Street, west terrace (middle)', 6, [3.6, 3.3, 3.2, 3.0], 'partly',
    'C:168 (2019): red-brick (terracotta-dressed) houses with balustraded first-floor balconies and arched porches; C:213 (2015); OSM (terrace, 4 levels + roof)',
    'House count estimated; the balustraded balconies are represented by the bay tops'),
  w899839501: qaTerrace('Lower Sloane Street, west terrace (south end, to Sloane Gardens junction)', 8, [3.6, 3.3, 3.1], 'partly',
    'C:233 (2014, looking north): continuous gabled red-brick terrace; OSM (terrace, 3 levels + roof)', 'House count estimated'),
  r12231984: {
    addr: '52 Lower Sloane Street (The Sloane Club; Nos 54–56 shops)', side: 'W', name: 'The Sloane Club', floors: [4.2, 3.2, 3.2, 3.0], wall: 'red', base: 'portland', bays: 3, returnBays: 6, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.56 }],
    ground: { kind: 'shops', units: 2, fascia: 'paintBlack', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, roof: { kind: 'mansard', h: 2.4, dormers: 2 }, bands: [1], bandCol: 'portland',
    src: 'OSM r12231984 (The Sloane Club, No. 52, apartments, 4 levels + roof, brick; shop node Nos 54–56); C:158 (2020, garden front, red brick with arched windows)',
    conf: 'estimated', approx: 'The street front is short; its treatment follows the garden-front photograph and OSM tags',
  },
  w533042643: {
    addr: '62 Lower Sloane Street (Sloane Place Hotel; Nos 60–66 shops)', side: 'W', name: 'Sloane Place Hotel', floors: [4.2, 3.2, 3.2, 3.0], wall: 'red', base: 'portland', bays: 8, returnBays: 3, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.62 }, { surround: 'stone', bars: 1, h: 0.58 }, { surround: 'stone', bars: 1, h: 0.54 }],
    ground: { kind: 'shops', units: 4, fascia: 'paintBlack', pilaster: 'portland', doors: ['c'] },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, roof: { kind: 'mansard', h: 2.4, dormers: 4 }, bands: [1], bandCol: 'portland', chimneys: 2,
    src: 'OSM (Sloane Place Hotel, No. 62, 4 levels + roof, brick; shop nodes Nos 60, 66); C:233 (2014, distant)',
    conf: 'estimated', approx: 'No frontal photograph: brick mansion block with shops below assumed from OSM tags and neighbours',
  },
  w533042664: {
    addr: '94 Lower Sloane Street (Gwynn House; Rose & Crown at Nos 90–92)', side: 'W', name: 'Gwynn House', floors: [4.4, 3.2, 3.2, 3.1, 3.0, 2.9], wall: 'red', base: 'redDeep', bays: 5, returnBays: 4, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.6 }],
    ground: { kind: 'pub', units: 3, fascia: 'paintBlack', pilaster: 'redDeep', doors: ['c'] },
    top: { kind: 'parapet', h: 0.7, col: 'portland' }, bands: [1], bandCol: 'portland',
    src: 'OSM (Gwynn House, No. 94, apartments, 6 levels, brick; pub node Rose & Crown, Nos 90–92, at the Turks Row corner)',
    conf: 'estimated', approx: 'No photograph: brick block with a pub front assumed from OSM tags',
  },
  w900286433: {
    addr: '1a Sloane Court East (Artillery House)', side: 'W', name: 'Artillery House', floors: [3.6, 3.2, 3.0], wall: 'red', bays: 2, edge: 0.5,
    win: [{ surround: 'stone', bars: 1, h: 0.58 }],
    ground: { kind: 'residential', pilaster: 'red' }, top: { kind: 'parapet', h: 0.6, col: 'portland' },
    src: 'OSM (Artillery House, 1a Sloane Court East, 3 levels)', conf: 'estimated', approx: 'No photograph',
  },
  w533042648: {
    addr: '1–3 Sloane Court East (Lower Sloane Street front)', side: 'W', floors: [3.8, 3.2, 3.2, 3.1, 3.0], wall: 'red', base: 'portland', bays: 8, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.66 }, { surround: 'stone', bars: 1, h: 0.6 }],
    ground: { kind: 'residential', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, bands: [1], bandCol: 'portland', chimneys: 2,
    src: 'C:128 (2022, looking north on the west side): red-brick mansion blocks with tall windows and stone dressings; OSM (Nos 1–3 Sloane Court East, apartments, 5 levels, brick)',
    conf: 'partly', approx: 'Entrance positions estimated',
  },
  w533042647: {
    addr: '5 Sloane Court East (Lower Sloane Street front, to the junction)', side: 'W', floors: [3.8, 3.2, 3.2, 3.0], wall: 'red', base: 'portland', bays: 11, returnBays: 4, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.66 }, { surround: 'stone', bars: 1, h: 0.6 }],
    ground: { kind: 'residential', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, roof: { kind: 'mansard', h: 2.4, dormers: 6 }, bands: [1], bandCol: 'portland', chimneys: 3,
    src: 'C:128 (2022): red-brick mansion block on the west side at the south end; OSM (No. 5 Sloane Court East, apartments, 4 levels + roof, brick)',
    conf: 'partly', approx: 'Entrance positions and roof estimated',
  },

  // ============================ LOWER SLOANE STREET, EAST SIDE ============================
  w899154922: {
    addr: 'Sloane Gardens west terrace (rear elevation across the communal garden)', side: 'E', floors: [3.6, 3.2, 3.2, 3.0], wall: 'red', bays: 40, edge: 0.5, frontD: 40,
    win: [{ surround: 'plain', bars: 1, h: 0.56, w: 0.95 }],
    ground: { kind: 'podium', pilaster: 'red' },
    top: { kind: 'parapet', h: 0.6, col: 'red' }, roof: { kind: 'pitched', h: 2.6 }, chimneys: 8,
    src: 'OSM (terrace, w899154922; Sloane Gardens West Garden between it and the street); C:099 (2023) and C:129 (2022): Sloane Gardens red-brick terraces',
    conf: 'estimated', approx: 'Rear elevation: plain window grid; real rears have closet wings and varied windows',
  },
  w899360826: {
    addr: 'Sloane Gardens, south corner with Lower Sloane Street', side: 'E', floors: [3.8, 3.3, 3.2, 3.0], wall: 'red', base: 'portland', bays: 3, returnBays: 3, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.6 }, { surround: 'stone', bars: 1, h: 0.58 }],
    ground: { kind: 'residential', pilaster: 'portland' },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, bands: [1, 2], bandCol: 'portland',
    gables: { n: 2, style: 'dutch', h: 3.6, col: 'red', trim: 'portland' }, roof: { kind: 'pitched', h: 2.8 }, chimneys: 3,
    src: 'C:129 (2022, Sloane Gardens south corner): red brick, shaped gables, canted bays and balconies; OSM (terrace, 4 levels + roof)',
    conf: 'partly', approx: 'Its main front faces Sloane Gardens; the Lower Sloane Street end is a short return',
  },
  w533042678: {
    addr: '67 Lower Sloane Street (Bristol House; shops Nos 65–79)', side: 'E', name: 'Bristol House', floors: [4.4, 3.1, 3.1, 3.1, 3.1, 3.0, 2.9], wall: 'red', base: 'redDeep', bays: 9, returnBays: 4, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.6 }],
    ground: { kind: 'shops', units: 7, fascia: 'paintBlack', pilaster: 'redDeep', doors: ['c'] },
    top: { kind: 'cornice', h: 0.5, col: 'portland' }, bands: [1], bandCol: 'portland',
    gables: { n: 3, style: 'triangle', h: 4.0, col: 'red', trim: 'portland' }, roof: { kind: 'pitched', h: 3.2 }, chimneys: 6, extra: 'arcadeShops',
    src: 'C:247 (2014): tall red-brick mansion block with gabled attics, tall chimneys and round-arched shopfronts; OSM (Bristol House, No. 67, apartments, 9 levels; shop nodes Nos 65–79)',
    conf: 'partly', approx: 'Storey count above the shops taken from OSM; gable positions estimated',
  },
  w899389333: {
    addr: '81a–83 Lower Sloane Street', side: 'E', floors: [4.2, 3.2, 3.1, 3.0], wall: 'stock', base: 'paintBlack', bays: 7, edge: 0.6,
    win: [{ surround: 'plain', archCol: 'stockDark', bars: 1, h: 0.6 }],
    ground: { kind: 'shops', units: 3, fascia: 'paintBlack', pilaster: 'paintBlack' },
    top: { kind: 'parapet', h: 0.7, col: 'stucco' },
    src: 'OSM (terrace, 4 levels; shop nodes Nos 81a, 83)', conf: 'estimated', approx: 'No clear photograph',
  },
  w899389336: {
    addr: 'Garages behind Nos 81–85', side: 'E', floors: [3.2], wall: 'stockGrey', bays: 0,
    win: [{}], ground: { kind: 'podium', pilaster: 'stockGrey' }, top: { kind: 'parapet', h: 0.3 },
    src: 'OSM (building=garages, 3.5 m)', conf: 'estimated', approx: 'Garage doors not modelled',
  },
  r12227081: {
    addr: '85–95 Lower Sloane Street', side: 'E', floors: [4.0, 3.1, 3.1], wall: 'buffModern', base: 'marbleDark', bays: 9, edge: 0.4,
    win: [{ surround: 'none', bars: 2, h: 0.55, w: 1.6 }],
    ground: { kind: 'shops', units: 6, fascia: 'marbleDark', pilaster: 'marbleDark', doors: ['c'] },
    top: { kind: 'parapet', h: 0.5, col: 'buffModern' },
    src: 'C:127, C:128 (2022): post-war buff-brick block of three storeys with a deep flat fascia over continuous shopfronts and a set-back top floor; C:083 (2023): dark marble-clad shop piers; OSM r12227081 (Nos 85–95; shop nodes Nos 85–97)',
    conf: 'observed', approx: 'Set-back top storey not modelled; brands omitted',
  },
  w535769910: {
    addr: 'Holbein House (corner of Holbein Place, at the junction)', side: 'E', name: 'Holbein House', floors: [4.2, 3.1, 3.1, 3.0, 3.0, 2.9], wall: 'red', base: 'portland', bays: 2, returnBays: 4, edge: 0.6,
    win: [{ surround: 'stone', bars: 1, h: 0.58 }],
    ground: { kind: 'residential', pilaster: 'portland' }, top: { kind: 'parapet', h: 0.7, col: 'portland' }, bands: [1], bandCol: 'portland',
    src: 'OSM (Holbein House, Holbein Place, apartments, 6 levels + roof, brick)', conf: 'estimated', approx: 'No photograph: brick block assumed from OSM tags',
  },
};
