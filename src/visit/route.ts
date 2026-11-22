// "Discover Chelsea": five optional stops and six postcards along a walk from Sloane Square to King's Road
// at Markham Square. Every statement in a story is supported by the sources listed with it (see also
// docs/visitor-route.md); where a fact could not be verified, the text describes what is visible instead.
// Positions are map metres (x east, z south); yaw 0 = facing north, positive = turning west. Viewpoints
// are checked by tests/visit.test.ts (walkable, inside the exploration zone, clear line of sight).

export interface Source { title: string; url: string }

export interface Stop {
  id: string;
  title: string;
  /** Where the visitor stands (validated viewpoint) and faces on arrival. */
  at: { x: number; z: number; yaw: number };
  /** Arrival radius (m). */
  radius: number;
  /** About 20–40 seconds to read or hear. */
  story: string;
  /** Optional detail to look for. */
  detail: string;
  sources: Source[];
}

export interface Postcard {
  id: string;
  place: string;
  clue: string;
  hint: string;
  /** A validated viewpoint: the postcard counts within `radius` of it. */
  at: { x: number; z: number };
  radius: number;
  /** What to frame (map metres; y is the height to aim at). */
  subject: { x: number; y: number; z: number };
  /** The building that is the subject (ignored by the sight-line check), if any. */
  subjectBuilding?: string;
  /** How far the heading may differ from the direction of the subject (radians). */
  tolerance: number;
}

const WIKI = (page: string, title = page.replace(/_/g, ' ')) => ({ title: `${title} (Wikipedia)`, url: `https://en.wikipedia.org/wiki/${page}` });

export const STOPS: readonly Stop[] = [
  {
    id: 'square', title: 'Sloane Square and the Venus Fountain',
    at: { x: 145, z: -147, yaw: -1.524 }, radius: 12,
    story: 'Welcome to Sloane Square. It takes its name from Sir Hans Sloane, the physician who bought the manor of Chelsea in 1712, and grew up from the 1770s as part of Henry Holland’s “Hans Town”. At its centre is the Venus Fountain by the sculptor Gilbert Ledward, unveiled in October 1953 and presented by the Royal Academy through its Leighton Fund. A kneeling bronze Venus sits on top of a great vase, and water spills from its rim into the basin.',
    detail: 'On the real fountain, a relief on the vase shows Charles II and Nell Gwynn seated by the Thames: he picks fruit from a tree while she fans herself. In this model it is only suggested by raised shapes.',
    sources: [
      WIKI('Sloane_Square'),
      { title: 'Hans Town, A History of the County of Middlesex vol. 12 (British History Online)', url: 'https://www.british-history.ac.uk/vch/middx/vol12/pp47-51' },
      { title: 'Sloane Square (London Gardens Trust inventory)', url: 'https://londongardenstrust.org/conservation/inventory/site-record/?ID=KAC134' },
      { title: 'The Venus Fountain (RBKC listed building record 494459)', url: 'https://www.rbkc.gov.uk/planning/listedbuildings/listeddetails.asp?ID=494459' },
      { title: 'The Venus Fountain (Historic England list entry 1391739)', url: 'https://historicengland.org.uk/listing/the-list/list-entry/1391739' },
      { title: 'Charles II – Sloane Square (London Remembers)', url: 'https://londonremembers.com/memorials/charles-ii-sloane-square' },
    ],
  },
  {
    id: 'peter-jones', title: 'Peter Jones',
    at: { x: 141, z: -134, yaw: 1.832 }, radius: 12,
    story: 'Across the road stands Peter Jones, a department store of the John Lewis Partnership. The building was designed by William Crabtree with Slater and Moberly and C. H. Reilly, and built in the 1930s, with the last part completed in 1939. Its glass curtain wall, a skin of glass hung in front of the structure, is regarded as the first modern-movement use of one in Britain, and the building is listed at Grade II*. See how the façade turns from the square onto King’s Road in one smooth curve.',
    detail: 'Look at the ground floor: plate-glass windows beneath a cantilevered canopy with bronze trim. Higher up, the words “Peter Jones” sit on white panels between the windows.',
    sources: [
      { title: 'Peter Jones Store (RBKC listed building record 423991)', url: 'https://www.rbkc.gov.uk/planning/listedbuildings/listeddetails.asp?ID=423991' },
      { title: 'Peter Jones Store (Historic England list entry 1226626)', url: 'https://historicengland.org.uk/listing/the-list/list-entry/1226626' },
      WIKI('Peter_Jones_%26_Partners', 'Peter Jones & Partners'),
      { title: 'Papers of William Crabtree (University of Liverpool archives)', url: 'https://sca-archives.liverpool.ac.uk/Record/131047/Description' },
    ],
  },
  {
    id: 'doy-square', title: 'Duke of York Square',
    at: { x: -28, z: 36, yaw: -0.753 }, radius: 14,
    story: 'This open square was made from part of the grounds of the Duke of York’s Headquarters, a former military site redeveloped by the Cadogan Estate in the 2000s. It has been described as the first new public square in London’s West End for more than a century. The figure on the tall plinth near the King’s Road entrance is Sir Hans Sloane, the same Sloane who gave his name to the square where you began. The statue, by Simon Smith, was unveiled in June 2007.',
    detail: 'Find the statue on its tall plinth near King’s Road. On the real plinth the inscription reads “Sir Hans Sloane 1660–1753”.',
    sources: [
      { title: 'Duke of York Square (New London Architecture)', url: 'https://nla.london/projects/duke-of-york-square' },
      { title: 'Sir Hans Sloane statue, Duke of York Square (London Remembers)', url: 'https://londonremembers.com/memorials/sir-hans-sloane-statue-duke-of-york-sq' },
      { title: 'Sir Hans Sloane (1660–1753) by Simon Smith (Art UK)', url: 'https://artuk.org/discover/artworks/sir-hans-sloane-16601753-302652' },
    ],
  },
  {
    id: 'saatchi', title: 'The Saatchi Gallery',
    at: { x: 62, z: 55, yaw: -2.364 }, radius: 10,
    story: 'The long yellow-brick building is the Duke of York’s Headquarters, completed in 1801 to designs by John Sanders, the first pupil of Sir John Soane. It was built as the Royal Military Asylum, a school for the children of soldiers, and in 1892 it was renamed the Duke of York’s Royal Military School. The school moved to Dover in 1909. Since October 2008 the building has housed the Saatchi Gallery of contemporary art.',
    detail: 'The entrance is a stone portico of four Roman Doric columns under a pediment, standing out against the yellow brick.',
    sources: [
      WIKI('Duke_of_York%27s_Headquarters', 'Duke of York’s Headquarters'),
      WIKI('John_Sanders_(architect)', 'John Sanders (architect)'),
      { title: 'Royal Military Asylum (Historic England educational images)', url: 'https://historicengland.org.uk/services-skills/education/educational-images/royal-military-asylum-kings-road-chelsea-london-10241' },
      { title: 'Duke of York’s Military School (FIBIS)', url: 'https://wiki.fibis.org/w/Duke_of_York%27s_Military_School' },
      { title: 'Saatchi Gallery opens at Duke of York’s HQ (Artdaily, 8 October 2008)', url: 'https://artdaily.com/news/26548/' },
      { title: 'Duke of York’s Headquarters (Historic England list entry 1266717)', url: 'https://historicengland.org.uk/listing/the-list/list-entry/1266717' },
    ],
  },
  {
    id: 'markham', title: 'King’s Road at Markham Square',
    at: { x: -287, z: 217.4, yaw: -0.414 }, radius: 14,
    story: 'You have walked along the King’s Road. It takes its name from its use as a private road by King Charles II. From around 1720 members of the public could use it if they paid for a token, and it became a public highway only in 1830. On this corner, at No. 138A, Mary Quant opened her boutique Bazaar in 1955; by the mid-1960s the street had become a centre of London fashion. This is where today’s walk ends: the model stops at the Markham Square junction.',
    detail: 'No. 138A, on the east corner of Markham Square, is an early 19th-century house with a full-height bow on its corner.',
    sources: [
      { title: 'The King’s (Private) Road (The National Archives blog)', url: 'https://blog.nationalarchives.gov.uk/the-kings-private-road/' },
      WIKI('King%27s_Road', 'King’s Road'),
      { title: 'King’s Road (Hidden London)', url: 'https://hidden-london.com/?p=43726' },
      { title: '138A King’s Road (Historic England list entry 1225025)', url: 'https://historicengland.org.uk/listing/the-list/list-entry/1225025' },
    ],
  },
];

export const POSTCARDS: readonly Postcard[] = [
  {
    id: 'fountain', place: 'The Venus Fountain',
    clue: 'Kneeling in bronze above falling water.',
    hint: 'Stand near the fountain’s basin and look at the figure on top.',
    at: { x: 152, z: -143 }, radius: 13, subject: { x: 161.9, y: 2.5, z: -146.9 }, tolerance: 0.6,
  },
  {
    id: 'peter-jones', place: 'Peter Jones’s curve',
    clue: 'A wall of glass that turns the corner.',
    hint: 'From the west edge of Sloane Square, look across to where the store curves round onto King’s Road.',
    at: { x: 141, z: -134 }, radius: 12, subject: { x: 114.8, y: 14, z: -127 }, subjectBuilding: 'w28682626', tolerance: 0.55,
  },
  {
    id: 'royal-court', place: 'The Royal Court Theatre',
    clue: 'A theatre front of red brick and stone, facing the square from the east.',
    hint: 'Walk to the east edge of Sloane Square, near the station, and face east.',
    at: { x: 212, z: -151 }, radius: 12, subject: { x: 233, y: 8, z: -149.5 }, tolerance: 0.55,
  },
  {
    id: 'hans-sloane', place: 'Sir Hans Sloane, Duke of York Square',
    clue: 'A gentleman on a tall plinth welcomes you off King’s Road.',
    hint: 'Just inside Duke of York Square from King’s Road, face the statue on its tall plinth.',
    at: { x: 5, z: 3 }, radius: 12, subject: { x: 13.3, y: 3, z: -7.5 }, tolerance: 0.6,
  },
  {
    id: 'saatchi', place: 'The Saatchi Gallery portico',
    clue: 'Four columns and a pediment in front of yellow brick.',
    hint: 'Walk along the gallery’s forecourt from Duke of York Square and look at the entrance portico.',
    at: { x: 64, z: 58 }, radius: 9, subject: { x: 74.5, y: 6, z: 67.7 }, subjectBuilding: 'w5317958', tolerance: 0.6,
  },
  {
    id: 'kings-road', place: 'King’s Road at Markham Square',
    clue: 'Where the walk ends: King’s Road at the Markham Square junction.',
    hint: 'Stand on the pavement at the Markham Square junction and look across King’s Road.',
    at: { x: -287, z: 217.4 }, radius: 14, subject: { x: -280, y: 6, z: 200 }, tolerance: 0.6,
  },
];

/** Where the visit starts and where "Return to Sloane Square" goes. */
export const HOME = STOPS[0].at;
