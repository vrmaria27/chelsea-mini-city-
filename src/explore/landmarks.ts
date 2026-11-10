// Landmarks shown in the location menu. Names are the verified names of the places; each
// description is a short statement supported by the listed source (no unsupported facts).
// Positions are map metres (x east, z south). Street viewpoints face the landmark (yaw 0 = north,
// positive yaw turns toward the west) and are checked by tests/explore.test.ts: walkable, inside
// the exploration zone and with a clear line of sight.

export interface Viewpoint { x: number; z: number; yaw: number }

export interface Landmark {
  /** Stable id: the OSM element (or square model) the landmark refers to. */
  id: string;
  name: string;
  description: string;
  /** Where the landmark is (map metres), for highlighting in the miniature. */
  x: number;
  z: number;
  /** Height of the highlight pin above the ground (map metres). */
  pinY: number;
  /** A validated street-level viewpoint, or null when it lies outside the street-level area. */
  street: Viewpoint | null;
  /** Desktop camera pitch at the viewpoint (radians, up positive), framing the façade. */
  pitch?: number;
  sources: { title: string; url: string }[];
}

const WIKI = (page: string, title = page.replace(/_/g, ' ')) => ({ title: `${title} (Wikipedia)`, url: `https://en.wikipedia.org/wiki/${page}` });
const HE = (n: number, title: string) => ({ title: `${title} (Historic England list entry ${n})`, url: `https://historicengland.org.uk/listing/the-list/list-entry/${n}` });

export const LANDMARKS: readonly Landmark[] = [
  {
    id: 'square:sloane-square', name: 'Sloane Square',
    description: 'Square at the meeting of King’s Road, Sloane Street, Lower Sloane Street and Cliveden Place, laid out in 1771 and named after Sir Hans Sloane. The paved central area dates from the 1930s.',
    x: 177, z: -150, pinY: 10, street: { x: 212, z: -152, yaw: 1.62 }, pitch: 0,
    sources: [WIKI('Sloane_Square'), { title: 'Sloane Square (Gardenvisit)', url: 'https://www.gardenvisit.com/gardens/sloane_square_urban_garden' }],
  },
  {
    id: 'way/554693845', name: 'Venus Fountain',
    description: 'Bronze fountain by the sculptor Gilbert Ledward, inaugurated in October 1953. A relief on the basin shows Charles II and Nell Gwynn. Grade II listed.',
    x: 161.9, z: -146.9, pinY: 9, street: { x: 145, z: -147, yaw: -1.524 }, pitch: -0.02,
    sources: [HE(1391739, 'The Venus Fountain'), WIKI('Sloane_Square')],
  },
  {
    id: 'way/28682626', name: 'Peter Jones',
    description: 'A 1930s department store of the John Lewis Partnership, designed by William Crabtree with Slater and Moberly. Its glass curtain wall was the first modern-movement use of one in Britain. Grade II* listed.',
    x: 78.7, z: -124.5, pinY: 30, street: { x: 153, z: -146, yaw: 1.826 }, pitch: 0.22,
    sources: [WIKI('Peter_Jones_%26_Partners', 'Peter Jones & Partners'), HE(1226626, 'Peter Jones Store')],
  },
  {
    id: 'way/147249460', name: 'Royal Court Theatre',
    description: 'Theatre on the east side of the square, designed by Walter Emden and Bertie Crewe and opened in 1888. Home of the English Stage Company. Grade II listed.',
    x: 256.1, z: -149.3, pinY: 24, street: { x: 208, z: -151, yaw: -1.511 }, pitch: 0.15,
    sources: [HE(1226628, 'Royal Court Theatre'), WIKI('Royal_Court_Theatre'), { title: 'Day 74 – Sloane Square (Every Street in London)', url: 'https://everystreetinlondon.com/tag/nell-gwynne/' }],
  },
  {
    id: 'way/140334697', name: 'Sloane Square station',
    description: 'District and Circle line station, opened on 24 December 1868. The River Westbourne crosses above the platforms in a large iron pipe.',
    x: 266.8, z: -125.7, pinY: 34, street: { x: 209, z: -150, yaw: -1.964 }, pitch: 0.28,
    sources: [WIKI('Sloane_Square_tube_station')],
  },
  {
    id: 'way/532097377', name: 'Sloane Square Hotel',
    description: 'Red-brick hotel of 1895 on the north side of the square, with bow windows, Dutch gables and a projecting clock.',
    x: 201.1, z: -196.1, pinY: 27, street: { x: 192, z: -159, yaw: -0.04 }, pitch: 0.22,
    sources: [WIKI('Sloane_Square_Hotel'), { title: 'Sloane Square Conservation Area Appraisal (RBKC, 2017)', url: 'https://planningconsult.rbkc.gov.uk/gf2.ti/f/995682/44969861.1/PDF/-/Sloane_Square_CAA__adopted__lowres.pdf' }],
  },
  {
    id: 'way/223451081', name: 'Holy Trinity Church',
    description: 'Church on Sloane Street by John Dando Sedding, built 1888–90. Grade I listed.',
    x: 173.3, z: -215.4, pinY: 36, street: { x: 142, z: -194, yaw: -1.011 }, pitch: 0.27,
    sources: [WIKI('Holy_Trinity_Sloane_Street', 'Holy Trinity Sloane Street'), { title: 'Sloane Square Conservation Area Appraisal (RBKC, 2017)', url: 'https://planningconsult.rbkc.gov.uk/gf2.ti/f/995682/44969861.1/PDF/-/Sloane_Square_CAA__adopted__lowres.pdf' }, { title: 'Day 74 – Sloane Square (Every Street in London)', url: 'https://everystreetinlondon.com/tag/nell-gwynne/' }],
  },
  {
    id: 'way/95437784', name: 'Cadogan Hall',
    description: 'Concert hall in Sloane Terrace. Built as a Christian Science church (completed 1907) to designs by Robert Fellowes Chisholm; a concert hall since 2004.',
    x: 191.9, z: -289.3, pinY: 26, street: null,
    sources: [WIKI('Cadogan_Hall')],
  },
  {
    id: 'way/5317958', name: 'Saatchi Gallery',
    description: 'Contemporary art gallery in the Duke of York’s Headquarters, a building of 1801 by John Sanders. The gallery moved here in 2008.',
    x: 87, z: 58.5, pinY: 22, street: null,
    sources: [WIKI('Saatchi_Gallery'), { title: 'Saatchi Gallery (Britain Express)', url: 'https://www.britainexpress.com/London/saatchi-gallery.htm' }],
  },
  {
    id: 'way/5318345', name: 'Duke of York Square',
    description: 'Pedestrian square off King’s Road on part of the former Duke of York’s Headquarters site, which was sold by the Ministry of Defence in 2000.',
    x: -10.6, z: 16.6, pinY: 10, street: null,
    sources: [{ title: 'Saatchi Gallery, Chelsea (urban75)', url: 'https://www.urban75.org/blog/out-of-focus-photography-exhibition-at-the-saatchi-gallery-chelsea/' }],
  },
  {
    id: 'way/630720415', name: 'Royal Avenue',
    description: 'Gravel avenue between King’s Road and Burton Court, part of a scheme by Sir Christopher Wren, approved in 1681, to link the Royal Hospital with Kensington Palace.',
    x: -108.8, z: 197.7, pinY: 10, street: null,
    sources: [{ title: 'Royal Avenue (Royal Borough of Kensington and Chelsea)', url: 'https://www.rbkc.gov.uk/parks-leisure-and-culture/parks/royal-avenue' }, { title: 'Royal Avenue (London Gardens Trust)', url: 'https://londongardenstrust.org/conservation/inventory/site-record?ID=KAC123' }],
  },
  {
    id: 'way/5318737', name: 'Burton Court',
    description: 'Grassed court north of the Royal Hospital Chelsea, created by 1688. Royal Avenue leads to it from King’s Road.',
    x: 18.4, z: 319.8, pinY: 10, street: null,
    sources: [HE(1000353, 'Royal Hospital, Chelsea and Ranelagh Gardens'), { title: 'South-east Chelsea and the Royal Hospital (British History Online)', url: 'https://archive.british-history.ac.uk/node/21836' }],
  },
  {
    id: 'way/630720414', name: 'Wellington Square',
    description: 'Garden square off King’s Road (name and outline from OpenStreetMap).',
    x: -192.7, z: 211, pinY: 10, street: null,
    sources: [{ title: 'OpenStreetMap way 630720414', url: 'https://www.openstreetmap.org/way/630720414' }],
  },
  {
    id: 'way/104770651', name: 'Markham Square Gardens',
    description: 'Garden square off King’s Road (name and outline from OpenStreetMap).',
    x: -315.2, z: 161.5, pinY: 10, street: null,
    sources: [{ title: 'OpenStreetMap way 104770651', url: 'https://www.openstreetmap.org/way/104770651' }],
  },
];

export const DEFAULT_LANDMARK = LANDMARKS[0];
export const landmarkById = (id: string): Landmark | undefined => LANDMARKS.find((l) => l.id === id);
