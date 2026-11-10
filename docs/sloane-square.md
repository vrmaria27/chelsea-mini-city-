# Sloane Square: references and modelling notes

The central public space of Sloane Square is modelled from OpenStreetMap geometry (positions) and
original procedural modelling informed by openly licensed photographs (shapes, proportions, colours).
No photograph, texture or third-party model is embedded in the app. The leaf texture is drawn
procedurally at start-up.

## Geographic data

| Item | Source | Notes |
|---|---|---|
| Square outline | OSM `barrier=kerb` ways around the square, chained into one ring | ≈ 2,260 m², about 83 × 29 m, long axis about 10.5° anticlockwise of east |
| Venus Fountain pool | OSM way 554693845 (`amenity=fountain`, `water=basin`) | octagon ≈ 7.9 m across |
| Venus statue position | OSM node 8354000193 | |
| Trees (14) | OSM `natural=tree` nodes (edited 2021–2023) | positions sourced; species, heights and spreads are not tagged |
| Benches (6), street lamps, bicycle stands | OSM nodes | bench orientation is not mapped and is estimated |
| War memorial | OSM node 5164151806 | |
| Drinking fountain (1882) | OSM node 5164152511 | |

Extract: `data/osm/square-raw.json` (fetched by `scripts/osm/fetch-square.mjs` through the
*Import Sloane Square OSM detail* GitHub Action, because this sandbox has no direct network).
Data © OpenStreetMap contributors, ODbL 1.0.

## Reference photographs (Wikimedia Commons)

Viewed for modelling only; not redistributed in the app.

| # | Shows | Author | Licence | Date |
|---|---|---|---|---|
| 1 | Fountain from the north-west, pool drained: octagonal coping, tiled pool, stepped plinth, bronze vase with relief, figure from behind; benches, lamps | Stephen McKay (geograph 8274663) | CC BY-SA 2.0 | 2026-03-19 |
| 2 | Venus figure close up: kneeling, conch held to the head, drapery cushion, drum pedestal; plane leaves behind | Doyle of London | CC BY-SA 4.0 | 2022-05-23 |
| 3 | Fountain running at night: water jet from the conch, sheet overflowing the vase rim | Tarquin Binary | CC BY-SA 2.5 | 2006-01-22 |
| 4 | Square from the south-east: rows of tall plane trees, bollards, memorial, lamps | Dylan Moore (geograph 7628676) | CC BY-SA 2.0 | 2023-10-13 |
| 5 | Square from the south in full leaf: crown shapes, trunk heights, kerb, bollards | Bryn Holmes (geograph 7916003) | CC BY-SA 2.0 | 2024-06-08 |
| 6 | Plane trees and fountain from the south | N Chadwick (geograph 7390763) | CC BY-SA 2.0 | 2022-10-30 |
| 7 | War memorial: octagonal three-step base, plinth, octagonal shaft, plain cross; Yorkstone flags | Doyle of London | CC BY-SA 4.0 | 2022-09-09 |
| 8 | Drinking fountain: granite bowl, urn finial, octagonal base | Doyle of London | CC BY-SA 4.0 | 2022-05-23 |
| 9 | Tree canopy and trunk detail in late spring (temporary displays ignored) | Matt Brown | CC BY 2.0 | 2024-05-22 |
| 10 | Square from the west, late summer | Philafrenzy | CC BY-SA 4.0 | 2021-10-24 |

File pages: see `references/sloane-square/index.json` on the `references` branch. Source pages: Commons
files `Sloane_Square_-_geograph.org.uk_-_8274663.jpg`, `Venus_Fountain,_Sloane_Square_with_Jubilee_Bunting.jpg`,
`Chelsea_sloane_square_fountain_1.jpg`, `Sloane_Square,_Chelsea_-_geograph.org.uk_-_7628676.jpg`,
`Sloane_Square,_Chelsea_-_geograph.org.uk_-_7916003.jpg`, `Sloane_Square_-_geograph.org.uk_-_7390763.jpg`,
`Sloane_Square_War_Memorial_(Northeast_View_-_01).jpg`, `Drinking_Fountain_in_Sloane_Square_(02).jpg`,
`Panorama_of_Chelsea_in_Bloom_in_Sloane_Square_2024-05-22.jpg`, `Sloane_Square_24_October_2021.jpg`.

Written sources:
- Historic England list entry 1391739 and RBKC listed-building record 494459 (Venus Fountain): a kneeling bronze Venus pouring water from a conch, on a large bronze vase-shaped basin with a relief of Charles II and Nell Gwynn, on a narrow three-step stone base, in an octagonal stone pool lined with blue tiles. 1953, Gilbert Ledward RA.
- Historic England list entry 1391379 (war memorial): Portland stone, octagonal cross with capped head on a tapered shaft, moulded three-stage base. IWM memorial 12144 gives about 8 m high on a 6 m base.
- London Gardens Trust site record KAC135: paved square with a line of London plane trees along its boundaries.
- Cadogan, 16 April 2026: the square's public realm project was completed with traditional Yorkstone paving and new dual-height lighting.

## Permanent vs temporary

Modelled (permanent): kerb and paving, plane trees, Venus Fountain and pool, war memorial, drinking
fountain, benches, street lamps, bicycle stands.

Excluded (temporary or seasonal, seen in some references): market stalls and kiosks, festival
planters and sculptures (Chelsea in Bloom), bunting and festoon lights, Christmas tree and lights,
works barriers.

## What is observed and what is estimated

- **Observed:** outline, tree and furniture positions (OSM); the fountain's composition and materials;
  the memorial's form; plane-tree character (tall clear trunks, mottled bark, ascending limbs, high
  rounded crowns that merge along the rows).
- **Estimated:** tree heights (18–24 m) and spreads (12–16 m), from photos against the 5–6 storey
  façades; fountain dimensions apart from the pool (plinth about 1.1 m, vase about 1.7 m, figure about
  1.2 m), scaled from photos against benches and people; bench orientation; lamp height (about 4.5 m).
- **Not verified after the 2026 works:** no openly licensed photo of the finished 2026 scheme was found.
  Paving is shown as Yorkstone flags as described by Cadogan. The bollards seen in 2022–24 photos stand
  on the surrounding pavements and are not modelled.

## Tree approach: comparison and choice

One representative plane tree (22.5 m tall, 11.7 m spread, first fork at 6.6 m) was built both ways
from the same deterministic skeleton, under the same light and camera, in a development harness
(`src/lab/treeLab.ts`; `npm run lab:trees`). The images are in `docs/tree-comparison.png`.

- **A, procedural branches with clustered foliage meshes:** about 290 opaque, irregular low-poly clumps at the twig ends.
- **B, hybrid:** the same branches with about 870 alpha-tested leaf cards, using a procedurally drawn plane-leaf atlas (512 px, mipmapped) and a few small opaque core clumps.

| Measure (one tree) | A, clumps | B, leaf cards |
|---|---|---|
| Triangles | 7,696 | 3,822 |
| Draw calls (whole square, all trees merged) | 2 | 3 |
| Transparency | none | alpha test, with alpha-to-coverage when MSAA is on; no blending |
| Overdraw at closest zoom: rasterised layers per covered pixel, depth test off | 9.8 | 7.7 |
| Overdraw at closest zoom: fragments passing the depth test, in draw order | 2.9 | 1.9 written (+ discarded, up to 2.9 rasterised) |
| Shimmer at closest zoom (mean colour change for a ¼-pixel camera move) | 0.13 | 1.1 |
| Shimmer at tabletop | 0.35 | 0.97 |
| Silhouette | a solid, rounded, slightly lumpy crown | ragged, leafy edge; sky visible through gaps |
| Close up (15 cm lean-in) | reads as faceted green boulders | reads as foliage; branches visible inside |
| Leaf size and translucency | no leaves; translucency is a lighting term only | leaves about 15–25 cm; backlit leaves glow |
| Both VR eyes | identical | no flat-card giveaway between the eyes (cards are randomly oriented with crown-shaped normals) |

Measured with headless Chrome and SwiftShader (a CPU renderer). The counts and overdraw are
GPU-independent. They are not Quest timings.

**Choice: B, the hybrid leaf cards, for normal play. A, at reduced density, for Low detail.**

At tabletop distance both read as tree crowns. Up close, which is the reason to lean in, A looks
like piles of green boulders, while B looks like plane foliage. B also halves the triangles. B's
cost is in fragments, not vertices: on Quest 3's tiled GPU, opaque geometry is shaded about once per
pixel (low-resolution depth culling), but an alpha-tested draw loses that early rejection, so B shades
roughly 2–3 fragments per covered pixel at the closest zoom. Mitigations used:

- The opaque branches and core are drawn first, so cards behind them are rejected early.
- Alpha-to-coverage is used with MSAA, with no blended layers and no sorting.
- The cards are a single double-sided draw: one-sided cards would need twice the geometry to look right from every side.
- A small, mipmapped texture is used.

B shimmers more than A. Alpha-to-coverage, a sharpened alpha edge and mipmapping limit this, but some
sparkle at the canopy edge remains when moving. This is the main visual risk to check on the headset.
No distance-based LOD is used: every tree in the square is at much the same distance from the
player, so switching would only add popping. **Low detail** swaps in opaque clumps (about 54% of the
triangles and no alpha test) and keeps each tree's position, height and crown silhouette.

## Tree realism assessment

- **Matches well:**
  - the sourced positions, in two rows along the long sides as in the photos;
  - tall clear trunks forking at 4–7 m into ascending limbs;
  - broad crowns of 11–16 m that merge along each row;
  - lobed plane leaves at a believable size;
  - each tree differs in height, spread, branching and rotation, and sways in its own phase, with still trunks.
- **Visibly stylised:**
  - bark is smooth with soft colour patches, without the plane's sharp flaking camouflage pattern;
  - branch joints are simple tube junctions;
  - a few dark core clumps can be glimpsed from below;
  - leaves are one texture atlas of four clusters;
  - crowns are slightly more regular than the real, pruned and lopsided ones.
- **Would improve it most:** a small bark texture with the plane's flaking patches. After that,
  crown asymmetry driven by neighbouring trees and buildings (the real crowns lean toward the
  open centre), then a second leaf atlas with seed balls and more shape variation.

## Performance (tabletop and square close-up)

The whole square adds about 49,000 triangles (trees 48,900, water 180) and 4 draw calls. In Low detail
it adds about 26,600 triangles and 3 draw calls.

Relative frame time in SwiftShader (CPU rendering, 1400 × 900; not representative of Quest):

| View | No trees or water | Trees (cards) | Low detail* |
|---|---|---|---|
| Default tabletop | 167 ms | 217 ms | 200 ms |
| Square close-up at 1.8× scale | 200 ms | 750 ms | 633 ms |

\*Low detail also hides people and traffic. Up close, the cost is dominated by the screen area the
canopies cover, not by alpha testing. **Quest 3 frame rate has not been measured.**

## Known simplifications

- **Venus:** the kneeling pose, conch and drapery cushion are modelled from tapered limbs and ellipsoids. There is no face, hands or anatomical detail.
- **Vase relief:** Charles II and Nell Gwynn by the Thames are suggested by low bumps. The inscriptions are not modelled.
- **Pool coping:** it has bevelled edges instead of a true round moulding.
- **War memorial:** the cross has a capped head but no mouldings.
- **Benches, lamps and cycle stands:** these are generic period-style pieces, oriented by estimate.
- **Square edge:** the estimated carriageway widths extend up to 2.1 m past the OSM kerb line in places. The raised square is drawn over that sliver; the streets themselves are unchanged.

## Manual headset checklist (Sloane Square)

- [ ] The square is recognisable from the tabletop: two rows of plane trees, the fountain at the west end and the memorial cross at the east.
- [ ] Leaning in, the trees read as foliage (not cards) from both eyes and at several angles. Note any edge sparkle or shimmer when moving your head.
- [ ] Sway is gentle and varies between trees; trunks don't move. With Reduced motion on, nothing moves.
- [ ] The fountain's water moves subtly. The overflow sheet and jet read as water, not as solid geometry.
- [ ] Low detail keeps the trees in place with the same overall shapes.
- [ ] Frame rate feels smooth when the square fills the view at the largest model size (use the OVR Metrics Tool for numbers).
- [ ] At street level the square is walkable; the pool, trees, lamps and memorial refuse teleports.
