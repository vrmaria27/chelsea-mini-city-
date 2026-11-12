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
    description: 'Contemporary art gallery in the Duke of York’s Headquarters, a building of 1801 by John Sanders: yellow brick, three storeys, with a stone pedimented Roman Doric portico. The gallery moved here in 2008. Grade II* listed.',
    x: 87, z: 58.5, pinY: 22, street: { x: -22, z: 64, yaw: -1.609 }, pitch: 0.06,
    sources: [HE(1266717, "Duke of York's Headquarters"), WIKI('Saatchi_Gallery'), { title: 'Saatchi Gallery (Britain Express)', url: 'https://www.britainexpress.com/London/saatchi-gallery.htm' }],
  },
  {
    id: 'way/5317958#entrance', name: 'Saatchi Gallery: the portico',
    description: 'The entrance portico: four Roman Doric columns in stone under a pediment, with the building’s name, Duke of York’s Headquarters, on the frieze.',
    x: 74.5, z: 67.7, pinY: 16, street: { x: 68.6, z: 72.4, yaw: -0.903 }, pitch: 0.42,
    sources: [HE(1266717, "Duke of York's Headquarters")],
  },
  {
    id: 'way/5318345', name: 'Duke of York Square',
    description: 'Pedestrian square off King’s Road on part of the former Duke of York’s Headquarters site, which was sold by the Ministry of Defence in 2000. A statue of Sir Hans Sloane stands in the square.',
    x: -22, z: 24, pinY: 10, street: { x: -28, z: 36, yaw: -0.753 }, pitch: 0.05,
    sources: [{ title: 'Saatchi Gallery, Chelsea (urban75)', url: 'https://www.urban75.org/blog/out-of-focus-photography-exhibition-at-the-saatchi-gallery-chelsea/' }, { title: 'Duke of York Square revisited (Studio PDP)', url: 'https://studiopdp.com/blog/news-duke-of-york-square-revisited' }],
  },
  {
    id: 'way/5318345#kings-road', name: 'Duke of York Square from King’s Road',
    description: 'The square opens directly off the south side of King’s Road, with the curved listed wall of the gallery grounds beyond.',
    x: -20, z: 15, pinY: 8, street: { x: -36, z: 10, yaw: -1.79 }, pitch: 0.02,
    sources: [{ title: 'Duke of York Square revisited (Studio PDP)', url: 'https://studiopdp.com/blog/news-duke-of-york-square-revisited' }, { title: "Nex's King's Road café pavilion (RIBA Journal)", url: 'https://ribaj.com/buildings/kings-road-cafe-pavilion-duke-of-yorks-square-public-private-space-nex-jan-carlos-kucharek' }],
  },
  {
    id: 'kings-road#terrace', name: 'King’s Road',
    description: 'Looking west along the north side: the listed mid-19th-century stucco terrace at Nos 74–108, with shops below, and Whitelands House (1930s) across the road. The street is reconstructed as far as the Markham Square junction.',
    x: -102, z: 41, pinY: 14, street: { x: -75.1, z: 19.4, yaw: 2.244 }, pitch: 0.04,
    sources: [{ title: 'Nos 74–108 King’s Road (Historic England 1224735)', url: 'https://historicengland.org.uk/listing/the-list/list-entry/1224735' }, { title: 'Royal Hospital Conservation Area Appraisal (RBKC)', url: 'https://www.rbkc.gov.uk/planning-and-building-control/conservation-areas' }],
  },
  {
    id: 'kings-road#markham-square', name: 'King’s Road at Markham Square',
    description: 'The end of the current reconstruction. No. 138A on the east corner of Markham Square (early 19th century, with a full-height bow) and the former Markham Arms at No. 138. Beyond the junction the buildings are plain massing.',
    x: -287, z: 205, pinY: 14, street: { x: -287.0, z: 217.4, yaw: -0.414 }, pitch: 0.08,
    sources: [{ title: '138A King’s Road (Historic England 1225025)', url: 'https://historicengland.org.uk/listing/the-list/list-entry/1225025' }, { title: 'Markham Arms, Chelsea (Wikipedia)', url: 'https://en.wikipedia.org/wiki/Markham_Arms,_Chelsea' }],
  },
  {
    id: 'sloane-street#square', name: 'Sloane Street',
    description: 'Looking north up Sloane Street from Sloane Square: Nos 139–140 and the stucco shopfront of Nos 136–138 on the left, Holy Trinity and Nos 147–149 on the right. The street is reconstructed as far as Cadogan Gardens and Ellis Street.',
    x: 133.6, z: -236.8, pinY: 14, street: { x: 139.3, z: -207.3, yaw: 0.19 }, pitch: 0.06,
    sources: [{ title: 'OpenStreetMap (Sloane Street footprints and addresses)', url: 'https://www.openstreetmap.org/#map=18/51.4934/-0.1580' }],
  },
  {
    id: 'sloane-street#wilbraham-place', name: 'Sloane Street at Wilbraham Place',
    description: 'Across Sloane Street to George House (Nos 127–135), a late-20th-century block with terracotta-coloured piers, from the east pavement by the red-brick mansion blocks of Nos 150–161.',
    x: 127.5, z: -296, pinY: 14, street: { x: 141.5, z: -281.8, yaw: 0.778 }, pitch: 0.1,
    sources: [{ title: 'OpenStreetMap (Sloane Street footprints and addresses)', url: 'https://www.openstreetmap.org/#map=18/51.4938/-0.1581' }],
  },
  {
    id: 'lower-sloane-street#square', name: 'Lower Sloane Street',
    description: 'Looking south down the west side of Lower Sloane Street: red-brick Queen Anne houses with shaped gables, canted bays and porches; across the road, the Sloane Gardens communal garden.',
    x: 169.5, z: -60, pinY: 14, street: { x: 165.1, z: -89.7, yaw: -2.994 }, pitch: 0.06,
    sources: [{ title: 'OpenStreetMap (Lower Sloane Street footprints and addresses)', url: 'https://www.openstreetmap.org/#map=18/51.4912/-0.1572' }],
  },
  {
    id: 'lower-sloane-street#turks-row', name: 'Lower Sloane Street at Turks Row',
    description: 'Gwynn House (No. 94, with the Rose & Crown on its corner) and the Sloane Court East mansion blocks, looking south towards the end of the street at Pimlico Road.',
    x: 221.6, z: 123.4, pinY: 14, street: { x: 219.6, z: 98.5, yaw: -3.062 }, pitch: 0.1,
    sources: [{ title: 'OpenStreetMap (Lower Sloane Street footprints and addresses)', url: 'https://www.openstreetmap.org/#map=18/51.4900/-0.1567' }],
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
