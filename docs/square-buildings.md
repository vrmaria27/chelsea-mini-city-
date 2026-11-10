# Buildings around Sloane Square: inventory, references and coverage

Sixteen frontages around Sloane Square are rebuilt as individual models
(`src/map/landmarks/squareBuildings.ts`, using `facadeKit.ts`). Each model replaces only the
generic extrusion of its own OpenStreetMap footprint. Peter Jones, the central square, the fountain,
the trees and the streets are unchanged.

Sources:
- **Footprints:** OpenStreetMap (ODbL): `data/osm/raw.json`, plus `data/osm/square-buildings.json` for multipolygon member geometry.
- **Composition, storeys and materials:** the RBKC *Sloane Square Conservation Area Appraisal* (adopted 23 November 2017; "CAA" below) and Historic England list entries.
- **Proportions, colours and current shopfronts:** openly licensed photographs (Wikimedia Commons), viewed for reference only.

No photograph, texture or third-party model is embedded. All signs are drawn into one small texture at start-up.

## Geographic correction

The main OSM extract returned the multipolygons for **Wyndham House** (relation 12224305) and
**Wellesley House** (relation 12224306) without member geometry. The importer therefore dropped them,
leaving an empty block on the south side of the square. The importer now fills relation geometry from
the focused building extract, which restores them (and four other relations elsewhere on the map). No
street, junction or pavement was changed.

## Clockwise inventory, starting at Peter Jones

Confidence: **High** = consistent written source and recent photos; **Medium** = written source, plus older
or partial photos; **Low** = written source only, with layout and proportions estimated.

| # | Building / frontage | OSM | Storeys and roof (visible) | Main materials | Distinctive features | Confidence |
|---|---|---|---|---|---|---|
| 0 | Peter Jones (existing model, unchanged) | way 28682626 | 7, flat with setback | glass curtain wall | curved King's Road corner | — |
| 1 | Nos. 15–16 Sloane Square and 145 Sloane Street (1890s) | way 532074737 | 4 + 2 attic storeys in a double mansard | yellow stock brick, red brick dressings | channelled ground floor; bracketed iron balconies on the second floor; two tiers of dormers; columned entrance with segmental pediment | Low (CAA only) |
| 1a | Nos. 143–144 Sloane Street (adjoining) | way 532074738 | 3 + gables | yellow stock brick, red dressings | Dutch gables; French casements onto balconies | Low (CAA only) |
| 1b | Nos. 141–142 Sloane Street (adjoining) | way 532074739 | 3 + gables | red brick (No. 141 all red) | square gables | Low (CAA only) |
| 2 | Nos. 13–14 Sloane Square, former bank (1890s) | way 532097385 | 4 + mansard | Portland stone | tall round-arched ground-floor openings; ashlar pilasters; dentilled cornice; bottle balustrade with urns; corner gable with round window, pediment and "BANK"; Sloane Street gable with segmental pediment | Medium |
| 3 | Holy Trinity, Sloane Street (Sedding, 1888–90; Grade I), context on Sloane Street | way 223451081 | tall nave, aisles | red brick and stone bands; stock-brick sides | eight-light west window; two great octagonal turrets with open lanterns and spirelets; aisle turrets; crenellations; three pointed doorways; forecourt railings | High |
| 4 | Sloane Square Hotel, Nos. 7–12 (1895) | way 532097377 | 5 + slate roof | red brick, beige terracotta bands | alternating units of bow windows with dormers and canted bays with Dutch gables; projecting clock; east corner turret with cupola; tall stacks; Côte / hotel / The Botanist ground floor ("No. 7" at the corner) | High |
| 5 | Nos. 1–6 Sloane Square and 1–4 Sedding Street (late 1960s, Harrison & West) | way 898482966 | 6, flat | brown brick, white cladding | four projecting bays (canted on the 1st–2nd floors, square above); oversailing floors on columns; Juliet balconies | High |
| 6 | Nos. 52–56 Sloane Square (late 19th century) | way 899130386 | 3 + attic, clay-tiled mansard | red terracotta below, red brick above | paired terracotta pilasters; Dutch gables; terracotta corner turret with cupola; timber shopfronts with built-in awnings | Medium |
| 7 | Nos. 48–51: Court Lodge (48–50) and the former King's Arms (51, 1899/1908). Colbert occupies 50–52 | way 532635270 (one footprint for both) | 5 + slate roof with Dutch gables | red brick with white stone banding | central canted bays; columned top-floor windows; turret with cupola at the north corner; red and grey granite shopfront pilasters; Colbert awnings and terrace | High |
| 8 | Royal Court Theatre (Emden & Crewe, 1888; Grade II) | way 147249460 | 4, balustraded parapet | red brick, stone dressings, painted ground floor | three bays; central pediment on Corinthian columns with the name; carved cambered pediments to the outer bays; round-headed windows on the 1st and top floors; entrance up four steps; ROYAL COURT sign | High |
| 9 | Sloane Square Underground station and Sloane Square House (c.1951 / late 1950s) | way 140334697 | 7 storeys over the station | painted concrete, black corrugated band, curtain walling | wrapping slab canopy; projecting roundel over the entrance with two grilles; blue entrance panels | High |
| 9a | Kiosk unit beside the station entrance (a bakery in 2025) | way 532635263 | 1 | painted concrete | same canopy | Medium |
| 10 | Wyndham House, Sloane Gardens (Grade II, with 11) | relation 12224305 | 6 + slate roof with dormers | Portland stone | rusticated mezzanine; engaged order through two storeys; iron balconies; curved-pediment corner pavilion; tall banded brick-and-stone chimneys | High |
| 11 | Wellesley House and Nos. 34–36 (Grade II) | relation 12224306 | as above | as above | as above, with the Lower Sloane Street front | High |
| 12 | No. 33 Sloane Square / Lurgan Mansions | way 532534277 | 6 | red brick, terracotta | turret with cupola on the corner; Dutch gable to the square; triple-height oriel on Lower Sloane Street | Medium |
| 13 | Nos. 28–31 Sloane Square | way 532534279 | 5 | red brick, beige terracotta; No. 31 Portland stone (1920s bank) | gables with four attic windows at the ends; canted dormers in the centre; bay windows | Low (CAA only) |

The perimeter closes back at Peter Jones across King's Road. Every OSM building within 20 m of the
square's kerb has a dedicated model (checked by `tests/squareBuildings.test.ts`).

**Identities kept separate.** One OSM footprint (way 532635270) contains two architectural buildings
(Court Lodge and the King's Arms). It is modelled as two façades along one frontage, split at about 42 % from the
north end; the split is estimated from photographs. Colbert (50–52) is a tenant that spans the building
line. Businesses are not used as building names.

**Unresolved or approximate frontages, not disguised:**
- Nos. 15–16 / 145 Sloane Street, 141–144 Sloane Street and 28–31 Sloane Square: no openly licensed photograph was found, so these follow the CAA text only. Bay counts and proportions are estimated, and current shopfronts and signage are not shown.
- The King's Road terrace behind 28–31 (way 899802872, shops at Nos. 9–15 and 27a Sloane Square) is not a square frontage. It keeps its generic extrusion and needs references for a future pass.

## References

Written: [Historic England 1226628](https://historicengland.org.uk/listing/the-list/list-entry/1226628) (Royal Court Theatre);
[Historic England 1226627](https://historicengland.org.uk/listing/the-list/list-entry/1226627) (Wellesley/Wyndham House);
[RBKC Sloane Square Conservation Area Appraisal, 2017](https://planningconsult.rbkc.gov.uk/gf2.ti/f/995682/44969861.1/PDF/-/Sloane_Square_CAA__adopted__lowres.pdf)
(sections 3.72, 3.74–3.79, 3.84–3.99, 3.136, 3.141–3.142).

Photographs (Wikimedia Commons; reference only, not redistributed):

| Building | File | Author | Licence | Date |
|---|---|---|---|---|
| Royal Court | At London 2026 0320.jpg, 0321.jpg | Mike Peel | CC BY-SA 4.0 | 2026-04-15 |
| Royal Court | 1226628 II Royal Court Theatre … 20250611 0001/0002.jpg | Tilman2007 | CC BY-SA 4.0 | 2025-06-11 |
| Station | Sloane square station 2025.JPG | Geni | CC BY-SA 4.0 | May 2025 |
| Station | HELCH overlooking Sloane Square tube station … September 2024.jpg | No Swan So Fine | CC BY-SA 4.0 | 2024-09-13 |
| Hotel | The Botanist, Sloane Square 2025-08-21.jpg | Ewan Munro | CC BY-SA 4.0 | 2025-08-21 |
| Hotel | The Botanist, Sloane Square, Chelsea, September 2024.jpg | No Swan So Fine | CC BY-SA 4.0 | 2024-09-13 |
| Hotel | Sloane Square Hotel.jpg | LittleT889 | CC BY-SA 4.0 | 2019-02-23 |
| 48–51 / Colbert | The Royal Court Theatre and other businesses on Sloane Square … (53321…).jpg | Charles from Port Chester | CC BY 2.0 | 2023-09-01 |
| 48–51 / Colbert | Sloane Square Colbert.jpg | Thomon | CC BY-SA 4.0 | 2017-05-14 (layout only; cross-checked against 2023 and 2026 photos) |
| Holy Trinity | Holy Trinity church, Sloane Street, London.jpg | The wub | CC BY-SA 4.0 | 2026-01-30 |
| Holy Trinity | Holy Trinity Sloane Street from Sedding Street, September 2024.jpg | No Swan So Fine | CC BY-SA 4.0 | 2024-09-13 |
| 1–6 | 1-6 Sloane Square, Chelsea, September 2024.jpg | No Swan So Fine | CC BY-SA 4.0 | 2024-09-13 |
| 13–14 | A post Christmas scene of Sloane Street looking towards Sloane Square (geograph 7065566) | James Hamilton | CC BY-SA 2.0 | 2022-01-01 |
| Wyndham/Wellesley | 1226627 II WELLESLEY HOUSE WYNDHAM HOUSE … 20250611 0001.jpg | Tilman2007 | CC BY-SA 4.0 | 2025-06-11 |
| Wyndham/Wellesley | Wellesley House and Wyndham House, Sloane Square, Chelsea, September 2024.jpg | No Swan So Fine | CC BY-SA 4.0 | 2024-09-13 |
| No. 33 / Lurgan | Lower Sloane Street from Sloane Square (geograph 6227943) | Roy Hughes | CC BY-SA 2.0 | 2019-08-03 |

Temporary items excluded: production neon signs and posters on the Royal Court, the 2024 hoardings on
1–6, scaffolding, Christmas lights and festival displays.

## Coverage and resemblance

I compared each model with its references from similar angles; the screenshots are listed below. There is
no numeric "realism" score.

| Frontage | Status | Closely matched | Remaining approximations |
|---|---|---|---|
| Royal Court Theatre | Dedicated model | three-bay composition; 2/3/2 round-headed 1st-floor windows; 2/3/2 square 2nd-floor windows; carved frieze; cambered outer pediments with oval windows above; central columns, pediment and name; balustrades; painted ground floor and steps; ROYAL COURT sign; lower than its neighbours | carving is simple mouldings; brick colour is approximate |
| Station / Sloane Square House | Dedicated model | white canopy wrapping the building; black band; roundel over the entrance with two grilles; blue panels; seven-storey ribbon glazing; entrance facing the square | NW corner is square, not rounded; no concrete roof frame |
| Sloane Square Hotel | Dedicated model | five storeys of red brick with terracotta bands; alternating bow/canted units; Dutch gables and dormers; clock; east turret with cupola; tall stacks; Côte / hotel / Botanist awnings and "No. 7" | gables smaller than the real ones; bay glazing simplified |
| 13–14 (former bank) | Dedicated model | stone; arched ground floor; pilasters; balustrade with urns; corner and Sloane Street gables | oriel and pediments simplified |
| 15–16 / 145 Sloane St | Model from text | materials, storeys, double mansard with two dormer tiers, balconies, entrance | **no photo**: bay count and proportions estimated |
| 141–144 Sloane St | Model from text | 3 storeys + gables, materials | **no photo**: gable shapes estimated |
| 1–6 Sloane Square | Dedicated model | brown brick; four projecting bays (canted, then square); columns; Juliet balconies | cladding detail simplified |
| 52–56 | Dedicated model | terracotta/brick split; paired pilasters; Dutch gables; terracotta turret; tiled mansard; built-in awnings | shopfront ornament simplified |
| 48–51 (Court Lodge, King's Arms, Colbert) | Dedicated model | banded red-and-white upper floors; central canted bay; columned top windows and Dutch gable; north-corner turret; granite pilasters; Colbert awnings, pediment and terrace | split between the two buildings estimated; terrace seating limited to where the mapped pavement is ≥ 1.9 m wide |
| Wyndham House / Wellesley House | Dedicated models | Portland stone; rusticated mezzanine; giant pilasters; balconies; curved-pediment pavilion; slate roof and dormers; tall banded chimneys | Ionic capitals and keystones simplified |
| No. 33 / Lurgan Mansions | Dedicated model | red brick and terracotta; corner turret with cupola; Dutch gable; oriel | detail simplified |
| 28–31 | Model from text | 4 units, end gables with attic windows, central dormers, bays, No. 31 stone front | **no photo**: proportions estimated |
| Holy Trinity | Dedicated model | orientation; banded west front; great window; two great turrets with lanterns and spirelets; aisle turrets; crenellations; pointed doorways; nave roof; railings | tracery and turret detail simplified; side elevations plainer than the real ones |

## Former development sites

The city-builder's fictional sites never touched the square or any reconstructed footprint (all were more
than 30 m away). In Chelsea Explorer the sites are gone and their 32 footprints are plain masses again
(see [explorer.md](explorer.md#restored-development-sites)).

## Performance and level of detail

- **Measurements:**
  - The 16 models add about **46,600 triangles** and **16 sign quads**, all in the existing single static draw call, plus one textured draw for the signs.
  - The static scene went from 62.8k to 103.8k triangles (this includes the restored relation buildings elsewhere).
  - Frame time in SwiftShader (CPU rendering in headless Chrome, 1400 × 900) was 267 → 300 ms at the default tabletop view and 417 → 500 ms for a close-up of the square at 1.8× scale.
  - These numbers only compare the build before and after the change. **They are not Quest frame rates, which have not been measured.**
- **Detail:** materials are vertex colours from shared palettes. There are no window textures, transparent windows or reflections. Railings and balustrades use single front faces.
- **Level of detail:** there is no level-of-detail switching. At tabletop distance every model is in view at once, and silhouettes (turrets, gables, chimneys, pediments) carry the identity.

## Manual Quest review checklist (square buildings)

- [ ] From the tabletop, each side of the square is recognisable:
  - north: hotel and bank, with Holy Trinity's turrets behind;
  - east: the Colbert block's turret, the low Royal Court and the station tower;
  - south: the stone Wyndham and Wellesley Houses with tall chimneys;
  - west: Peter Jones.
- [ ] Leaning in, the window rhythms differ between neighbours. Signs are legible and none shows a production name.
- [ ] Nothing flickers (z-fighting) on façades, cornices or signs when moving your head. Check the Royal Court and the hotel fascia.
- [ ] Turrets and chimneys look right from both eyes and don't shimmer at the tabletop distance.
- [ ] Frame rate feels smooth looking across the square at the largest model size (use OVR Metrics for numbers).
- [ ] At street level, the façades hold up at eye height (see the Explorer checklist in [explorer.md](explorer.md#manual-quest-3-checklist)).
