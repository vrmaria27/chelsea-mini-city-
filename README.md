# Chelsea Mini City

A cosy, single-player tabletop city-builder for **Meta Quest 3** (WebXR in the Quest Browser), with a desktop fallback. You look down at a miniature Chelsea-inspired neighbourhood around King's Road and Duke of York Square, and you improve it by building homes, shops and parks.

> **Chelsea-inspired; approximate street layout.** The map is hand-authored and approximate. It does not use surveyed geographic data. Every building is original, procedurally generated geometry.

**Live (after deployment):** https://vrmaria27.github.io/chelsea-mini-city-/

## How to play

1. **Choose a building**: Townhouse £1,000, Shop £1,500 or Park £750.
2. **Point at an empty plot** (numbered pads). A ghost preview, the cost and, for shops and parks, the 80 m reach ring appear.
3. **Build a happier Chelsea**: click (desktop) or pull the trigger (VR) to confirm.

**Goal:** 50 residents and an average happiness of 70. Each home starts at 50 happiness. A shop within 80 m adds 10, and each park within 80 m adds 10, up to a maximum of 100. Income arrives every 10 seconds of active play: £100 per townhouse, plus £200 per shop that has a home within 80 m. *Tip: give every home a park and a shop nearby, or two parks.*

| Control | Desktop | VR (Quest 3) |
|---|---|---|
| Choose building | Bottom buttons or keys `1` `2` `3` | Panel buttons (trigger) |
| Build | Click a plot (touch: tap twice) | Point the controller ray, pull trigger |
| Orbit / zoom / pan | Drag / scroll wheel / right-drag or shift-drag | — (no forced camera motion) |
| Rotate model | Rotate buttons or `Q` `E` | Panel buttons, or flick thumbstick left/right (15° steps) |
| Model size | Smaller/Larger or `-` `+` | Panel buttons, or flick thumbstick up/down |
| Table height | — | ▼ Lower / ▲ Raise |
| Reset view | Button or `R` | Reset view (re-centres the table in front of you; works seated or standing) |
| Undo last build (full refund) | Button or `Z` | ↶ Undo |
| Reset save | Button + confirmation dialog | Press twice within 5 s |

Progress saves to the browser's local storage after every build, undo and income tick. The simulation pauses while the page is hidden, and it never fast-forwards on resume. Nothing is earned offline.

## Install, run, build

Requires **Node.js 20+**.

```bash
npm install        # dev tools only: esbuild, TypeScript, tsx
npm run dev        # dev server with live rebuild → http://localhost:5173/
npm test           # unit tests (simulation, affordability, plots, happiness, undo, save/load)
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

- [ ] Page loads in the Quest Browser over HTTPS and shows **Enter VR**.
- [ ] Entering VR places the table in front of you at a comfortable height, **standing** and **seated** (use *Reset view* after sitting down).
- [ ] Both controller rays appear; the ray stops on the panel and on the map.
- [ ] Pointing at a vacant plot shows the frame, ghost building, cost tooltip and (shop/park) 80 m ring.
- [ ] Trigger builds; money, residents and happiness update on the panel.
- [ ] Occupied plot and unaffordable purchases show a red message and don't charge you.
- [ ] Undo refunds; Reset save requires a second press within 5 s.
- [ ] Rotate / Larger / Smaller / Lower / Raise / Reset view behave; thumbstick flicks rotate and resize in steps.
- [ ] Labels and panel text are readable at arm's length.
- [ ] Reaching 50 residents and 70 happiness shows confetti and the banner; play continues.
- [ ] Opening the Quest menu or removing the headset pauses income; nothing jumps ahead on return.
- [ ] Exit VR returns to the desktop view; reload restores the city.
- [ ] Motion feels comfortable (no forced camera movement) and frame rate feels smooth. (Use the Meta Quest Developer Hub / OVR Metrics Tool if you want numbers.)

## Project layout

```
src/sim/        Pure game rules, simulation, tick clock, versioned save/load (no DOM or rendering)
src/map/        Static map definition: roads, squares, blocks, 20 plots, labels
src/engine/     Tiny WebGL2 renderer, geometry builder, matrix maths, text atlas
src/game/       Game controller, procedural city model, 3D scene + ray picking, VR panel
src/main.ts     Desktop camera/input, HTML HUD, WebXR session and controllers
tests/          node:test unit tests (run with tsx)
public/         index.html (HUD markup and styles)
scripts/        esbuild build and dev/preview server
```

### Technical notes

- **Why not Three.js/Vite?** The environment this prototype was built in had no package-registry access, so it uses a small hand-written WebGL2 + WebXR renderer bundled with esbuild (the bundler Vite uses internally). There are no runtime dependencies, and the bundle is about 55 KB. Rendering is isolated in `src/engine` and `src/game/scene.ts`, so swapping in Three.js later wouldn't touch the game rules.
- **Performance choices:** all static scenery (terraces, roads, squares and trees, about 25k triangles) is merged into **one** vertex buffer and one draw call. The building layer is rebuilt only when buildings change. All map labels share one texture atlas. Lighting is a cheap hemisphere + sun model, with no shadows, post-processing or large textures. Frame rate on Quest 3 has **not** been measured.
- **Save format:** `localStorage["chelsea-mini-city.save"] = { version: 1, savedAt, state }`. Unreadable or unsupported saves start a new game with a notice. Unknown plots or buildings are skipped, and refunds always use the canonical price.

## Known limitations

- Not yet tested on a Quest 3 headset (controller input, comfort and performance are unverified).
- The street layout is approximate and stylised; distances are not to survey accuracy.
- Undo covers only the most recent placement.
- Hand tracking without controllers isn't specifically supported (controllers are expected).
- No sound.
