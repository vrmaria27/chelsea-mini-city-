# Chelsea at Golden Hour

The existing Chelsea walk can now be seen in two lights, **Daylight** and **Golden hour**. Three quiet viewpoints let a visitor stop, put the interface away and simply look.

The engine, geography, buildings, map boundary and earlier visual work are unchanged.

## What the visitor experiences

- **Light.** Settings → Light, on desktop and in VR (the *Light & settings* tab), offers ☀ Daylight or ◐ Golden hour.
  - Switching keeps you exactly where you are, facing the same way. Route progress, postcards and sound settings are untouched.
  - A short fade hides the change. With reduced motion it is instant, with no fade.
  - The choice is saved and restored on the next visit.
- **Daylight** is the established baseline, unchanged: a morning sun from the south-east, about 51° high.
- **Golden hour** is a low sun from the south-west, about 22° high.
  - It gives warm sunlight, a cooler and slightly dimmer sky light in the shade, and long shadows across the square and King's Road.
  - Reflections in Peter Jones's glass, the fountain water and polished stone pick up a warm horizon.
  - A soft sky dome glows toward the sun.
  - It is an artistic preset, not an astronomical simulation.
- **Quiet viewpoints:**

  | Viewpoint | Position (map m) | Faces |
  |---|---|---|
  | Beside the Venus Fountain | (153, −151) | the fountain, 10 m away |
  | Duke of York Square | (−28, 28) | east, across the square to the pavilion, trees and gallery buildings |
  | Along the Saatchi Gallery | (79, 84) | north, along the façade to the portico |

  - Go to one from *Quiet viewpoints* (desktop: below the places list; VR: the Discover tab). Or simply walk there.
  - Standing within 7 m offers **Pause here**. Desktop shows it as a small bar; VR shows it in the panel.
  - Pausing hides the toolbar, panels, route guidance, ground ring, labels, cursors and VR controller rays.
  - Pausing never moves or turns the camera.
  - Ambience carries on at the visitor's settings, and narration stops.
  - Head movement and physical tracking are unaffected. On desktop you can still drag to look around, and clicks don't step anywhere.
  - **To resume:** desktop has a *Continue exploring* button, or any key. In VR, any controller button or the trigger resumes, and the trigger press that resumes never also steps you somewhere.
  - Seated visitors keep their own eye height; nothing is forced.
  - If a viewpoint is also near an unvisited route stop, the stop's story appears first, and *Pause here* is offered once it is closed.
- **Postcards in either light.**
  - Each new postcard records the light it was taken in. The collection shows a discreet *Daylight* / *Golden hour* badge on each card, on desktop and in VR.
  - Postcards saved before this milestone were all taken in daylight and read as such.
  - Retaking a postcard no longer overwrites it straight away. The new photo appears beside the current one, with each one's lighting, and the visitor chooses **Replace with the new photo** or **Keep the current one**.
  - Captures use the active lighting (including the sky) and exclude every interface element, as before.
  - **Download:** on desktop, a large postcard view has a *Download* link that saves the JPEG (for example `chelsea-postcard-fountain-golden-hour.jpg`). There is no download button inside VR.
- **End of the walk.** The completion message now offers **View my postcards**, **Explore at golden hour** and **Continue exploring**.
  - "Explore at golden hour" changes the light where you stand; it never teleports you.
  - If you are already in golden hour, the button reads *Explore in daylight*.
  - All stops and postcards work in both lights.

## How the lighting works (and why it stays affordable)

The renderer bakes its sun shadows once, into two static shadow maps: a detailed one and a coarse one for the whole map. It also bakes a contact-shading map. Nothing is computed per frame beyond a texture lookup.

A preset therefore must not move the sun without new shadows. `ExplorerScene.setLight` (`src/view/scene.ts`) works like this:

1. It sets the sun direction and colour, the ambient sky and ground colours, the reflected-sky colours and the exposure. These used to be shader constants and are now uniforms (`src/engine/renderer.ts`).
2. It re-renders **only the two sun shadow maps**, into the **existing textures** (`rebakeShadows` in `src/view/bake.ts`). No GPU memory is added, and the sun-independent contact shading is kept.
   - For golden hour the detailed map is widened to cover Duke of York Square and the Saatchi Gallery, so the longer low-sun shadows there don't look coarse. Texels grow from about 0.15 m to about 0.21 m.
3. Golden hour draws a small unlit sky dome: about 1,100 triangles, one draw call, no depth writes. It is built once on first use.

The preset values are in `src/view/lighting.ts`. There are no real-time shadows, volumetrics, screen-space effects or post-processing. Only one preset is ever rendered, behind a 0.2 s fade.

## Daylight and golden hour, same camera positions

Desktop, rendered by headless Chromium's software renderer (SwiftShader). Daylight is on the left, golden hour on the right:
- [Sloane Square fountain](golden/compare-fountain.jpg)
- [Peter Jones](golden/compare-peter-jones.jpg)
- [Duke of York Square](golden/compare-doy.jpg)
- [Saatchi Gallery](golden/compare-saatchi.jpg)
- [King's Road at Markham Square](golden/compare-kings-road.jpg)

What was checked in each place:
- **Fountain:** long tree shadows over warm paving, and a bright but still detailed stone basin.
- **Peter Jones:** the glass and the store front are in shade, with a warm horizon reflected and visible down the road.
- **Duke of York Square:** warm stone, dappled light, and the statue readable.
- **Saatchi Gallery:** a warm yellow-brick front with tree shadows, and no blown-out stonework.
- **King's Road:** a mostly shaded street with sunlit upper floors.

The leaves keep their colour in both lights and don't look metallic. Shadows in the shade stay readable, because the cooler sky light is only slightly dimmer than in daylight.

The VR panel was rendered from the app's own state (it is a 2D canvas) to check its new screens:
- [Light & settings tab](golden/vr-light-settings.jpg)
- [Replace your postcard?](golden/vr-replace.jpg)
- [Pause here on the Explore tab](golden/vr-explore-pause-offer.jpg)
- [End of the walk](golden/vr-completion.jpg)

Desktop screens:
- [replace preview](golden/desktop-03-replace-preview.jpg)
- [collection with lighting badges](golden/desktop-04-collection-badges.jpg)
- [Pause here offer](golden/desktop-06-vp-saatchi-offer.jpg)
- [paused at Duke of York Square](golden/desktop-07-vp-doy-paused.jpg)
- [end of the walk](golden/desktop-08-completion.jpg)

## Tests

**Unit tests.** `npm run check` passes 90 of 90 tests. The new ones are in `tests/golden.test.ts`:
- Daylight equals the old baseline values. Golden hour is a lower (15–30°), warmer sun, with cooler shade that is not too dark.
- Sky colours stay in range.
- The viewpoints are walkable, have clear sightlines, face their view, don't overlap, and the first is beside the fountain.
- Pausing writes nothing to storage and never survives a reload.
- Postcards remember their light. Old saves read as daylight, and junk entries are ignored.
- The light preference saves. Old or odd values fall back to Daylight.

**Desktop walkthrough** (Playwright, headless Chromium with SwiftShader, 1280 × 800, `golden.mjs` in the hand-off). It drives the real interface through 32 checks, all passing:
- An **older save** (made before this milestone) loads with Daylight, its route progress, its postcard (shown as Daylight) and its sound settings.
- **Switching to Golden hour mid-walk** from Settings keeps the position and heading exactly. Route progress, postcards and sound are unchanged, and the choice is saved.
- **Postcards in golden hour:**
  - A retake shows the old and new photos with their lighting. *Keep* changes nothing; *Replace* stores the golden-hour photo.
  - A new postcard records Golden hour, and the collection shows the badges.
  - *Download* delivers the JPEG (about 118 KB).
- **Each viewpoint** is reached by choice and offers *Pause here*. At Duke of York Square, while following the route, the stop's story is shown first.
  - Pausing hides the toolbar, guidance and labels, and keeps the position, heading and sound settings.
  - Dragging still looks around, and clicking doesn't step anywhere.
  - A key press, or the *Continue exploring* button, restores everything.
- **End of the walk:** the message offers *View my postcards / Explore at golden hour / Continue exploring*. "Explore at golden hour" relights where you stand, with no teleport.
- **Settings:**
  - With reduced motion, the switch is immediate (no fade).
  - Low detail works in golden hour, and so does the miniature.
- **Reload** restores the light, route progress, postcards with their lighting, and sound settings.
- There are no page errors.

The **previous milestone** was re-checked first, with its 40-check walkthrough on the unchanged build; no blockers were found.

## Performance

These were measured on the same machine and browser with identical camera positions. The renderer is SwiftShader (software), so the absolute frame times say nothing about a Quest. Each figure is the median of 24 frames, from two runs per mode.

| View | Draw calls (Day → Golden) | Triangles/frame (k) | Median frame, Daylight | Median frame, Golden hour |
|---|---|---|---|---|
| Fountain | 37 → 38 | 280 → 281 | 1183 / 1183 ms | 1317 / 1333 ms |
| Peter Jones | 72 → 73 | 403 → 404 | 1517 / 1483 ms | 1617 / 1650 ms |
| Duke of York Square | 48 → 49 | 288 → 289 | 1150 / 1133 ms | 1200 / 1200 ms |
| Saatchi Gallery | 58 → 59 | 352 → 353 | 1400 / 1450 ms | 1533 / 1517 ms |
| King's Road at Markham | 87 → 88 | 410 → 411 | 1467 / 1517 ms | 1550 / 1600 ms |

With **Low detail** on (same positions; measured just before the sky-dome draw-order change), Daylight ran 800–1133 ms and Golden hour 900–1233 ms. Draw calls and triangles changed in the same way: one extra call and about 1k triangles.

- **What golden hour adds:** the sky dome, which is one draw call and about 1,100 triangles, drawn after the scenery with the depth test so only visible sky is shaded.
- **Frame times** were 0–12% slower than daylight in these software-rendered runs. A separate attribution run, with the dome switched off and with the daylight shadow area, landed within about 7% of daylight. That is about the run-to-run noise of this setup, so there is no clear attributable cost. GPU cost on a headset is **unmeasured**.
- **Switching presets** re-renders two 2048² depth maps of the static scene and trees, into the existing textures. Timed with `gl.finish()`, it took 1–9 ms here. SwiftShader probably under-reports this, so treat it as unmeasured on a Quest. It happens behind the 0.2 s fade.
- **Memory:** no new shadow textures. The dome mesh is about 60 KB of vertex data, built on first use.

## Limitations

- **Nothing here has been tested on a Quest 3.** Comfort, frame rate, the look of both presets through the headset's lenses and the VR interactions are all unverified.
- Golden hour uses one fixed sun direction chosen for Sloane Square. Some streets, such as King's Road at Markham Square looking east, are mostly in shade and less warm than the square.
- The widened detailed shadow area makes golden-hour shadows in Sloane Square slightly softer and coarser than daylight's (texels of about 0.21 m against 0.15 m).
- The miniature uses the active light but keeps its room background.
- Download is desktop-only. Inside VR there is no download button, because a headset session has no file save.
- Only one photo is kept per postcard; the replace preview makes the choice explicit.

## Manual Quest 3 checklist (not verified on a headset)

- [ ] *Light & settings* → Golden hour: a short fade, no flash, no change of position or direction; the panel still reads well.
- [ ] Look around in golden hour at the fountain, Peter Jones, Duke of York Square and the Saatchi Gallery: no shimmering shadow edges, no harsh dark areas, no glare from the stone.
- [ ] Switch back to Daylight: identical to before this milestone.
- [ ] Frame rate stays comfortable in both lights, also with Low detail.
- [ ] Discover tab → *Quiet viewpoints* → each one: the fade places you there, facing the view.
- [ ] *Pause here*: the panel, rays and cursors disappear; head movement and physical tracking are normal; seated eye height is respected.
- [ ] While paused, the trigger brings everything back **without stepping**. So do A/B/X/Y and the grip.
- [ ] A postcard (panel button and A) in golden hour: the photo looks golden and contains no panel.
- [ ] Retake a postcard with the panel hidden: the panel appears with *Replace* / *Keep*, and both work.
- [ ] End of the walk → *Explore at golden hour*: the light changes where you stand.
- [ ] Exit VR and enter again in either light: you are still at a valid street-level position.
- [ ] Reload the page: the light, postcards and progress are kept.
