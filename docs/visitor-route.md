# The first visitor experience: "Discover Chelsea"

> Spend 20 minutes discovering a little corner of London, from wherever you are.

This milestone adds a gentle, optional visit on top of the existing explorer. The engine, geography, buildings, miniature, street level and WebXR are unchanged. The map boundary still ends at King's Road's junction with Markham Square. Everything runs in the browser: there are no accounts, payments, ads, servers or API keys.

The 20-minute figure is the product promise, **not a measured duration**. Nobody has timed a real visit yet.

## The journey

1. **Welcome.** Every visit starts at street level. A first visit begins in Sloane Square, on the paving west of the Venus Fountain. Later visits begin where you left off. A short welcome offers two choices, each with one sentence:
   - **Explore freely**: wander anywhere, as before.
   - **Discover Chelsea**: a gentle walk past five stops with short stories, collecting six postcards along the way.

   The welcome teaches one action for the current device:
   - desktop: click the paving to step there (or W A S D), and drag to look;
   - touch: tap and drag;
   - VR: point and pull the trigger to step.

   *Just look around* dismisses it. **Welcome** (desktop toolbar) or the Explore tab (VR panel) reopens it.
2. **Five stops**, all optional. Each has a title, a 55–110-word story (about 20–40 s read aloud), an optional "A detail to notice", its sources, and **Continue exploring**.

   | # | Stop | Viewpoint (map m) | Walk from the previous stop |
   |---|---|---|---|
   | 1 | Sloane Square and the Venus Fountain | (145, −147) | (start) |
   | 2 | Peter Jones | (141, −134) | 14 m |
   | 3 | Duke of York Square | (−28, 36) | 249 m, with 3 road crossings |
   | 4 | The Saatchi Gallery | (62, 55) | 103 m |
   | 5 | King's Road at Markham Square | (−287, 217) | 433 m |

   The walk is about 800 m in total. Paths come from `scripts/visit/plan-route.ts`: an A* search on the explorer's own walkable-surface map, at 1 m resolution. Pavement is preferred. Carriageway is allowed only in short, costly crossings (≤ 22 m), and the crossings are recorded. The result is stored in `src/visit/routePaths.json`, and a test re-checks every point and segment.
3. **Following the route.**
   - On desktop, a small pill shows the next stop, the distance along the path, the direction ("20° to your left", "behind you") and "cross the road with care" near crossings. In VR the panel's Discover tab shows the same text.
   - Optionally, a single ring on the pavement marks a point about 14 m ahead along the path. There are no constant floating markers.
   - You can walk there, or press **Step to the next stop** (a fade, never forced travel). You can also **skip a stop**, **Explore freely** (leave the route) and **Resume walk** later, with progress kept.
   - Arriving within a stop's radius opens its story once. There is no timer.
4. **Six postcards.** Each has a clue and an optional hint. A postcard is awarded when you are within its radius (9–14 m) and facing its subject within ±0.55–0.6 rad, with a clear sightline (`NavField.lineBlocked`). There is no image recognition. Gentle feedback explains near misses: "Almost: turn 30° to your left", "Something is in the way", or the nearest clue.

   | Postcard | Viewpoint | Subject |
   |---|---|---|
   | The Venus Fountain | (152, −143) | fountain figure |
   | Peter Jones's curve | (141, −134) | the curtain-wall corner |
   | The Royal Court Theatre | (212, −151) | the façade on the square's east side (a 67 m detour) |
   | Sir Hans Sloane, Duke of York Square | (5, 3) | the statue, about 11 m away |
   | The Saatchi Gallery portico | (64, 58) | the portico |
   | King's Road at Markham Square | (−287, 217) | the streetscape across the road |

   A retake shows the new photo beside the current one, and the visitor chooses which to keep (added with [golden hour](golden-hour.md)). The collection shows six slots with images and place names, "3 of 6", a large view, and a hint toggle. There are no scores, countdowns or penalties.
5. **Ending.** Closing the last stop's story reveals a quiet message: "You've reached the end of the walk". It shows the stops and postcards so far, and the collection. It offers **View my postcards**, **Explore at golden hour** and **Continue exploring** (updated with [golden hour](golden-hour.md); *Return to Sloane Square* stays in the toolbar and the VR panel). You can finish with postcards missing; the message says they will be waiting. There is no sunset button.

## How postcards are captured

`Scene.captureImage` renders the scene into an offscreen framebuffer (768 × 512, RGBA8 + depth, created once and reused) and reads it back.
- The VR panel, labels and markers are hidden for the capture, and MSAA is skipped.
- The image is checked for a blank frame: a luminance range under 30 is rejected with "The camera didn't catch that one".
- It is encoded as a JPEG at quality 0.82 (typically 40–120 KB).
- **Desktop:** the current view: same position, heading and tilt, at 3:2 and a 55° FOV.
- **VR:** one deliberate camera at the head pose, not the two-eye output. The panel's **Take postcard** button levels the horizon (you are looking down at the panel). The **A** button (right controller) uses the head's tilt, clamped.
- Images are stored in IndexedDB (`chelsea-explorer-postcards`). Progress is stored in localStorage (`chelsea-explorer-visit`, version 1).
- If either store fails, everything keeps working for the session and the visitor is told that photos will last only until the page is closed. Malformed or future-version saves are reset gracefully. Nothing is written per frame: saves happen only on meaningful changes.

## Sound

All sound is **synthesised in the browser with the Web Audio API**. No audio files are shipped, so there are no third-party audio licences to record.
- **Fountain:** band-passed noise with a wandering "splash" layer, positioned at the fountain with HRTF panning and distance falloff.
- **Leaves:** gust-modulated filtered noise near the plane trees.
- **Birds:** short FM chirps at random 6–20 s intervals, near trees, with random pitch and pattern.
- **City:** a quiet low-passed swell.

Because the parameters are randomised continuously there are no fixed-length loops to notice. Audio starts only after a click, key or trigger. It is suspended when the page is hidden.

**Narration** uses the browser's built-in speech synthesis (Web Speech API, an en-GB voice where available). It is free, uses no API key, and has matching on-screen text.
- It plays only when the visitor presses **Listen**. It never autoplays, and starting a story stops any other.
- Pause, resume and replay are available. Muting, switching narration off or leaving the stop stops it.
- Where speech synthesis is unavailable, the button explains this and the text remains. Voices are supplied by the visitor's browser or OS, not distributed with the app.
- **Availability and voice quality in the Quest Browser have not been verified.**

Settings (desktop Settings panel, VR Sound tab): **All sound** (overall mute), **Ambience** and **Narration**, each independent and saved.

## Comfort and controls

| | Desktop | VR (Quest Browser) |
|---|---|---|
| Move | click/tap the paving, W A S D | teleport (point + trigger); optional smooth walking with the left stick (off by default) |
| Turn | drag, Turn buttons | snap turn (right stick; left stick too unless smooth walking is on) |
| Return home | toolbar **Sloane Square** | panel **Return to Sloane Square** |
| Postcard | **Take postcard** or **P** | panel button or **A** |
| Hide interface | **Hide interface** or **H**, restore with the **Show interface (H)** button | **X**/**Y** (left) toggles the hand panel |
| Postcards | **Postcards n/6** or **C** | panel Postcards tab |

There is no forced rotation or travel. Seated play uses the existing seated setting. All stops and postcard viewpoints are walkable, so they can be reached by teleporting.

## Sources

Every historical statement in the stories is taken from the sources listed with that stop in `src/visit/route.ts`. Each story card links to them in the app. Uncertain details were left out; for example, the opening date of Duke of York Square is not stated.

- **Sloane Square and the Venus Fountain:**
  - [British History Online, VCH Middlesex vol. 12 (Hans Town)](https://www.british-history.ac.uk/vch/middx/vol12/pp47-51);
  - [London Gardens Trust inventory](https://londongardenstrust.org/conservation/inventory/site-record/?ID=KAC134);
  - [RBKC listed building 494459](https://www.rbkc.gov.uk/planning/listedbuildings/listeddetails.asp?ID=494459);
  - [Historic England 1391739](https://historicengland.org.uk/listing/the-list/list-entry/1391739);
  - [London Remembers: Charles II, Sloane Square](https://londonremembers.com/memorials/charles-ii-sloane-square).
- **Peter Jones:**
  - [RBKC listed building 423991](https://www.rbkc.gov.uk/planning/listedbuildings/listeddetails.asp?ID=423991);
  - [Historic England 1226626](https://historicengland.org.uk/listing/the-list/list-entry/1226626);
  - [Papers of William Crabtree, University of Liverpool](https://sca-archives.liverpool.ac.uk/Record/131047/Description).
- **Duke of York Square:**
  - [New London Architecture](https://nla.london/projects/duke-of-york-square);
  - [London Remembers: Sir Hans Sloane statue](https://londonremembers.com/memorials/sir-hans-sloane-statue-duke-of-york-sq);
  - [Art UK: Sir Hans Sloane by Simon Smith](https://artuk.org/discover/artworks/sir-hans-sloane-16601753-302652).
- **Saatchi Gallery:**
  - [Historic England: Royal Military Asylum](https://historicengland.org.uk/services-skills/education/educational-images/royal-military-asylum-kings-road-chelsea-london-10241);
  - [FIBIS: Duke of York's Military School](https://wiki.fibis.org/w/Duke_of_York%27s_Military_School);
  - [Artdaily, 8 October 2008](https://artdaily.com/news/26548/);
  - [Historic England 1266717](https://historicengland.org.uk/listing/the-list/list-entry/1266717).
- **King's Road:**
  - [The National Archives blog: The King's (Private) Road](https://blog.nationalarchives.gov.uk/the-kings-private-road/);
  - [Hidden London: King's Road](https://hidden-london.com/?p=43726);
  - [Historic England 1225025 (138A King's Road)](https://historicengland.org.uk/listing/the-list/list-entry/1225025).
- A few Wikipedia articles are listed as secondary references in `route.ts`.

**Attribution:**
- Map data © OpenStreetMap contributors (ODbL), unchanged.
- Textures from Poly Haven (CC0), unchanged.
- Sound is procedural (no assets). Narration uses the visitor's own browser voices.

## Tests

- **Unit tests** (`tests/visit.test.ts`, part of `npm run check`):
  - stops and postcard viewpoints are walkable;
  - story lengths;
  - the route legs stay on walkable ground with short crossings, 600–1100 m in total;
  - each postcard has a clear sightline and is within an 80 m detour of the route;
  - each postcard is awarded from its own viewpoint and refused for the wrong direction or out of range; retakes work;
  - welcome choices, arrival, skip, leave and resume;
  - completion with a stop skipped, and its order (story first, then the message);
  - guidance distance;
  - save and restore, malformed saves, unsupported versions and failing storage.
- **Desktop walkthrough** (Playwright + headless Chromium with the SwiftShader software renderer, 1280 × 800): the full visit is driven through the real UI. 40 of 41 checks passed in the final run.
  - Passed:
    - first launch at street level in Sloane Square, with the welcome;
    - both welcome choices; reopening the welcome; the detail toggle; the guidance pill;
    - wrong-direction refusal ("Almost: turn round…");
    - all five stops reached and opened;
    - all six postcards collected, at 43–110 KB JPEGs; retake;
    - collection with six images, and the large view;
    - completion after the final story;
    - independent ambience, narration and overall mute; audio starting after interaction;
    - leaving and resuming the route; hiding and restoring the interface;
    - reload restoring progress and images;
    - Return to Sloane Square; miniature and street modes; low detail;
    - capture still working when storage throws;
    - no page errors.
  - The one failure was the test's own out-of-range point, which wasn't walkable. A follow-up run from a walkable point 50 m from the nearest postcard gave the expected "No postcard to take here…" with the nearest clue, and awarded nothing.
- **Capture cost** (same setup, Peter Jones view): the capture render took 1.4 s against 1.3 s for a normal frame, i.e. about one extra frame. JPEG encoding runs asynchronously.
- **Before/after performance** (same machine and browser; SwiftShader software rendering, so the absolute times say nothing about a Quest; two runs each):

  | View | Draw calls | Triangles/frame | `main` median frame | `visitor-route` median frame |
  |---|---|---|---|---|
  | Sloane Square | 31 | 270k | 1183 / 1200 ms | 1250 / 1233 ms |
  | Peter Jones | 72 | 403k | 1283 / 1400 ms | 1367 / 1317 ms |
  | Duke of York Square | 58 | 365k | 1383 / 1433 ms | 1433 / 1383 ms |
  | Markham Square | 87 | 410k | 1300 / 1333 ms | 1367 / 1300 ms |

  Draw calls and triangles are unchanged; frame-time differences are within run-to-run noise. The guide ring adds at most one marker draw while following the route. The soundscape was not running in these measurements (audio needs a user gesture), so its CPU cost is unmeasured.

Screenshots (desktop, software-rendered):
- [welcome](visit/01-welcome.jpg);
- [first story](visit/02-story-square.jpg);
- [route guidance](visit/03-guidance.jpg);
- [Duke of York Square stop](visit/06-stop-3-doy-square.jpg);
- [completion](visit/08-completion.jpg);
- [postcard collection](visit/09-collection.jpg);
- [interface hidden](visit/11-ui-hidden.jpg).

## Manual Quest 3 checklist (NOT yet verified on a headset)

- [ ] Enter VR in Sloane Square; the hand panel shows tabs Explore / Discover / Postcards / Sound; text is readable.
- [ ] Welcome in VR: both choices work; *Just look around* dismisses; reopen from the Explore tab.
- [ ] Teleport along the route to each stop; the story opens on arrival; Listen / Pause / Replay work (or "unavailable" is shown).
- [ ] **Step to the next stop** fades and places you at the stop, without rotating you.
- [ ] Each postcard: panel button and **A** both capture; the image is a single camera, level, with no panel or labels in it; wrong direction gives turn advice.
- [ ] Postcards tab shows thumbnails, "n of 6" and hints.
- [ ] X/Y hides and shows the panel; nothing else floats in view.
- [ ] Smooth walking (Sound tab → off by default) moves gently with the left stick; snap turn still works on the right stick.
- [ ] Fountain sound comes from the fountain and fades with distance; birds and leaves are quiet; mute controls are independent.
- [ ] Taking off the headset (page hidden) pauses sound and narration.
- [ ] Completion appears after the last story; Return to Sloane Square works.
- [ ] Comfort and frame rate feel acceptable during a full visit (frame rate not measured).

## Limitations

- Nothing in this milestone has been tested on a Quest 3. Narration voices, Web Audio performance, capture timing and IndexedDB quota in the Quest Browser are unverified.
- The postcard check is geometric (position, direction, sightline), not visual: a postcard can be awarded while a tree partly blocks the view.
- Route guidance follows precomputed paths. A visitor who wanders far off is guided back to the nearest point on the current leg, not along a fresh path.
- Desktop W A S D walking cannot cross roads except at mapped crossings; clicking the far pavement (teleport) or **Step to the next stop** works.
- Speech-synthesis voices vary by browser and platform; some read place names imperfectly.
- The visit's length (about 20 minutes) is a target, not a measurement.
