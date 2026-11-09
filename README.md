# Chelsea Mini City

A cosy, single-player tabletop city-builder for **Meta Quest 3** (WebXR in the Quest Browser), with a desktop fallback. You look down at a miniature Chelsea-inspired neighbourhood around King's Road and Duke of York Square, and you improve it by building homes, shops and parks.

> **Chelsea-inspired; approximate street layout.** The map is hand-authored and approximate. It does not use surveyed geographic data. Every building is original, procedurally generated geometry.

**Live (after deployment):** https://vrmaria27.github.io/chelsea-mini-city-/

## How to play

1. **Choose a building**: Townhouse £1,000, Shop £1,500 or Park £750.
2. **Point at an empty plot** (numbered pads). You'll see a ghost preview, the cost and the **exact effect** before you buy. Homes that would gain happiness get a green outline and a "+10 ♥" label, and shops and parks show their 80 m reach ring. The inspector lists the before → after residents, income and average happiness.
3. **Build a happier Chelsea**: click (desktop) or pull the trigger (VR) to confirm.

**Inspect and upgrade.** Choose **Inspect**, or select any occupied plot with any tool, to see:
- the building's level, residents and income,
- its happiness breakdown,
- the shops and parks affecting it (blue outlines),
- one actionable hint.

Each building can be upgraded once to **Level 2**. The values below replace Level 1's:

| Building | Level 1 | Upgrade | Level 2 | Look |
|---|---|---|---|---|
| Townhouse | 10 residents, £100/tick | £1,500 | 20 residents, £180/tick | extra storey, columned porches, cornice, window boxes, planters |
| Shop | £200/tick when a home is within 80 m | £2,000 | £350/tick (same rule) | deeper striped awning, gilded sign, café umbrellas, flower boxes |
| Park | +10 happiness to homes within 80 m | £1,000 | +15 (same radius) | flower beds, extra benches, lamp posts |

Homes start at 50 happiness. A shop within 80 m adds 10 (once, however many shops), and each park within 80 m adds its bonus, up to 100. Average happiness is shown as "—" until someone lives here. Income arrives every 10 seconds of active play.

**Chapters** (each completes once and stays complete):
1. **Welcome to Chelsea:** 50 residents and 70 happiness.
2. **A Thriving High Street:** 80 residents, two active shops and two upgraded townhouses.
3. **A Greener Chelsea:** 100 residents and 80 happiness, with two upgraded parks.

After chapter 3 you can keep building freely (sandbox). The status panel shows a progress bar for each goal and one "Next:" hint.

| Control | Desktop | VR (Quest 3) |
|---|---|---|
| Choose tool | Bottom buttons, or keys `1` `2` `3`, `4`/`I` for Inspect | Menu panel (left of the table) |
| Build / inspect | Click a plot (touch: tap to preview, tap again to build) | Point the controller ray, pull trigger |
| Upgrade | Inspector card → Upgrade, or `U` | Inspector panel (right of the table) → Upgrade |
| Close inspector | ✕ or `Esc` | Close ✕ |
| Orbit / zoom / pan | Drag / scroll wheel / right-drag or shift-drag | No forced camera motion |
| Rotate model | Rotate buttons or `Q` `E` | Panel buttons, or flick thumbstick left/right (15° steps) |
| Model size | Smaller/Larger or `-` `+` | Panel buttons, or flick thumbstick up/down |
| Table height | n/a | ▼ Lower / ▲ Raise |
| Reset view | Button or `R` | Reset view (re-centres the table in front of you; works seated or standing) |
| Undo last action (build or upgrade, exact refund) | Button or `Z` | ↶ Undo last action |
| Reduced motion / Low detail | Toggles in the controls card | Toggles on the menu panel |
| Reset save | Button + confirmation dialog | Press twice within 5 s |

- **Reduced motion** (on automatically if your system asks for reduced motion) freezes people and traffic, removes confetti and keeps the placement pulses static.
- **Low detail** hides people and traffic entirely.
- Neither setting changes gameplay.

Progress, chapters and preferences save to the browser's local storage after every build, upgrade, undo, setting change and income tick. The simulation pauses while the page is hidden, and it never fast-forwards on resume. Nothing is earned offline.

## Install, run, build

Requires **Node.js 20+**.

```bash
npm install        # dev tools only: esbuild, TypeScript, tsx
npm run dev        # dev server with live rebuild → http://localhost:5173/
npm test           # unit tests (simulation, upgrades, previews, undo, chapters, save migration)
npm run build      # type-check + production bundle → dist/
npm run preview    # serve dist/ → http://localhost:5173/
npm run check      # typecheck + tests + build
```

`dist/` is a fully static site with relative paths, so it can be hosted on any static host or subpath.

## Opening it on Quest 3

WebXR only works in a **secure context (HTTPS)**. Your laptop's `http://localhost:5173` is **not** reachable as `localhost` on the headset: on the Quest, `localhost` means the headset itself. Your laptop's LAN address (`http://192.168.x.x:5173`) is reachable, but it isn't HTTPS, so the Enter VR button won't appear. Use one of these instead:

**A. GitHub Pages (easiest, free):** push to `main`. The included workflow (`.github/workflows/deploy.yml`) tests, builds and deploys automatically. One-time setup: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then on the Quest open **https://vrmaria27.github.io/chelsea-mini-city-/** in the Quest Browser and press **Enter VR**.

**B. Local HTTPS dev server (same Wi-Fi):**
```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=chelsea-dev" \
  -keyout certs/key.pem -out certs/cert.pem
npm run dev        # now serves https:// and prints a "Network:" URL
```
Open the printed `https://192.168.x.x:5173/` on the Quest and accept the self-signed certificate warning (Advanced → Proceed).

**C. USB (developer mode):** `adb reverse tcp:5173 tcp:5173`, then open `http://localhost:5173` on the Quest. Browsers treat `localhost` as secure, so this works over the forwarded port.

## Manual headset checklist (Quest 3)

Not yet verified on a headset. Please check:

- [ ] Page loads in the Quest Browser over HTTPS and shows **Enter VR**. A Milestone 1 save loads with its buildings intact.
- [ ] The table appears in front of you at a comfortable height, **standing** and **seated** (use *Reset view* after sitting down). The menu panel is on the left and the inspector on the right, both readable at arm's length.
- [ ] Both controller rays appear and stop on the panels and on the map.
- [ ] **Panels block the map:** pulling the trigger on a panel (including the gaps between buttons) never builds on a plot behind it.
- [ ] Previewing a park or shop shows the ring, green outlines and "+10 ♥" labels on affected homes, and the inspector lists before → after numbers. The building you then get matches the preview.
- [ ] Pointing at an occupied plot and pulling the trigger opens its details. **Upgrade** charges once, shows the Level 2 look and a gold "Level 2" pulse, then greys out.
- [ ] **Undo last action** reverses an upgrade or a build with an exact refund.
- [ ] Chapter goals and the hint update. Completing a chapter shows a short banner and confetti without blocking play (no confetti with Reduced motion).
- [ ] Reduced motion freezes people and traffic; Low detail hides them. Both settings survive a reload.
- [ ] Rotate / Larger / Smaller / Lower / Raise / Reset view behave; thumbstick flicks rotate and resize in steps.
- [ ] Opening the Quest menu or removing the headset pauses income; nothing jumps ahead on return.
- [ ] Exit VR returns to the desktop view; reload restores the city.
- [ ] Motion feels comfortable and frame rate feels smooth, including with people and traffic on. (Use the OVR Metrics Tool if you want numbers.)

## Project layout

```
src/sim/        Pure rules: simulation, upgrades, estimates, inspection, chapters, tick clock, save v2 + migration
src/map/        Static map definition: roads, squares, blocks, 20 plots, labels
src/engine/     Tiny WebGL2 renderer (incl. instancing), geometry builder, maths, text + marker atlases
src/game/       Game controller, inspector view model, city model, scene + overlays + picking, VR panels, life
src/main.ts     Desktop camera/input, HTML HUD, WebXR session and controllers
tests/          node:test unit tests (run with tsx)
public/         index.html (HUD markup and styles)
scripts/        esbuild build and dev/preview server
```

### Technical notes

- **Why not Three.js/Vite?** The environment this prototype was built in had no package-registry access, so it uses a small hand-written WebGL2 + WebXR renderer bundled with esbuild (the bundler Vite uses internally). There are no runtime dependencies, and the bundle is about 90 KB. Rendering is isolated in `src/engine` and `src/game/scene.ts`, so swapping in Three.js later wouldn't touch the game rules.
- **Performance choices:** all static scenery (terraces, roads, squares and trees, about 25k triangles) is merged into **one** vertex buffer and one draw call. The building layer is rebuilt only when buildings change. All map labels share one texture atlas. Lighting is a cheap hemisphere + sun model, with no shadows, post-processing or large textures. Frame rate on Quest 3 has **not** been measured.
- **Neighbourhood life:** at most 24 pedestrians (more as the population grows) walk fixed pavement loops around populated blocks, inset from the kerb so they never cross buildings. Six vehicles, including a red bus, drive fixed King's Road and side-street lanes on the left. People and vehicles each take one instanced draw call. There's no pathfinding or collision.
- **Previews are exact:** placement and upgrade estimates are computed by applying the real rules to a copy of the city, and tests check them against actual results.
- **Save format (v2):** `localStorage["chelsea-mini-city.save"] = { version: 2, savedAt, state: { money, buildings: {plot: {type, level}}, lastAction, chapter, ticks }, prefs }`.
  - Milestone 1 (v1) saves migrate automatically. Buildings become Level 1, and money, placements, ticks and undo history are kept. Chapter completion is derived from the old objective flag and the current state.
  - Unreadable or unsupported saves start a new game with a notice. The original text is kept under `chelsea-mini-city.save.backup`.
  - Unknown plots or building types are skipped, and refunds always use the canonical price.

## Economy and pacing

No prices or incomes were changed from the brief. The automated playthrough test (`tests/milestone2.test.ts`) completes all three chapters with legal moves. On that optimal route a player only has to wait about **8 income ticks (≈1.3 minutes)** in total. Real sessions are dominated by deciding, previewing and inspecting, so they should land in the 15–20 minute range, but this hasn't been playtested with people. If chapters 2–3 feel too quick, the simplest lever is the upgrade prices in `src/sim/rules.ts`. The chapter thresholds were checked as achievable on the existing map and are unchanged.

## Known limitations

- Not yet tested on a Quest 3 headset (controller input, panel readability, comfort and performance are unverified).
- The street layout is approximate and stylised; distances are not to survey accuracy.
- Undo covers only the most recent build or upgrade. Completed chapters are never revoked by undo.
- People and vehicles are decorative. Vehicles pass through junctions without stopping and reappear at the map edge.
- Hand tracking without controllers isn't specifically supported (controllers are expected).
- No sound.
- Some automated review browsers can't start WebGL2. The game shows an explanatory message there and otherwise needs a WebGL2-capable browser.
