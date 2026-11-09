// Entry point: wires the game, 3D scene, desktop controls and WebXR session together.
import { invert, lookAt, mat4, multiply, perspective, transformPoint, type Ray, type Vec3 } from './engine/math';
import { BUILDINGS, BUILDING_TYPES, RULES, type BuildingType } from './sim/rules';
import { formatHappiness, formatMoney } from './sim/simulation';
import { Game, safeLocalStorage } from './game/game';
import { CityScene, SCALE_MAX, SCALE_MIN, defaultView, type Hit, type PointerVisual } from './game/scene';
import type { Action } from './game/panel';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');

function fatal(msg: string): never {
  const el = $('error');
  el.style.display = 'grid';
  el.innerHTML = `<div><h2>Chelsea Mini City couldn't start</h2><p>${msg}</p></div>`;
  throw new Error(msg);
}

let scene: CityScene;
try {
  scene = new CityScene(canvas);
} catch (e) {
  fatal(`This browser couldn't start WebGL2 (${(e as Error).message}). Try an up-to-date Chrome, Edge, Firefox, Safari or the Meta Quest Browser.`);
}
const gl = scene.r.gl;
const store = safeLocalStorage();
const game = new Game(store);
const ROT_STEP = Math.PI / 12; // 15°

// ---------------------------------------------------------------------------------------------
// Actions shared by desktop buttons, keyboard and the VR panel

let xrSession: XRSession | null = null;
let recenterPending = false;

function doAction(a: Action | 'help'): void {
  const v = scene.view;
  switch (a) {
    case 'tool:townhouse':
    case 'tool:shop':
    case 'tool:park':
      game.select(a.slice(5) as BuildingType);
      break;
    case 'undo':
      game.undo();
      break;
    case 'rotL':
      v.modelYaw += ROT_STEP;
      break;
    case 'rotR':
      v.modelYaw -= ROT_STEP;
      break;
    case 'scaleDown':
      v.modelScale = Math.max(SCALE_MIN, +(v.modelScale / 1.15).toFixed(3));
      break;
    case 'scaleUp':
      v.modelScale = Math.min(SCALE_MAX, +(v.modelScale * 1.15).toFixed(3));
      break;
    case 'lower':
      v.anchor.y = Math.max(0.4, v.anchor.y - 0.05);
      break;
    case 'raise':
      v.anchor.y = Math.min(1.5, v.anchor.y + 0.05);
      break;
    case 'resetView':
      v.modelYaw = 0;
      v.modelScale = 1;
      if (xrSession) recenterPending = true;
      else resetCamera();
      break;
    case 'resetSave':
      if (xrSession) game.requestReset();
      else if (window.confirm('Erase your saved city and start again? This cannot be undone.')) game.resetNow();
      break;
    case 'exitVR':
      xrSession?.end();
      break;
    case 'help':
      showOnboarding(true);
      break;
  }
  scene.updateMatrices();
  scene.panel.dirty = true;
}

// ---------------------------------------------------------------------------------------------
// Desktop HTML UI

const ui = {
  money: $('money'), residents: $('residents'), happiness: $('happiness'), income: $('income'),
  tick: $('tick'), goal: $('goal'), barRes: $('barRes'), barHap: $('barHap'), message: $('message'),
  resetSave: $('resetSave'),
};

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((b) =>
  b.addEventListener('click', () => doAction(b.dataset.action as Action)),
);

function setBar(el: HTMLElement, frac: number, text: string): void {
  (el.firstElementChild as HTMLElement).style.width = `${Math.round(frac * 100)}%`;
  (el.lastElementChild as HTMLElement).textContent = text;
  el.classList.toggle('full', frac >= 1);
}

function renderHud(): void {
  const s = game.stats;
  ui.money.textContent = formatMoney(game.state.money);
  ui.residents.textContent = String(s.residents);
  ui.happiness.textContent = formatHappiness(s.happiness);
  ui.income.textContent = '+' + formatMoney(s.incomePerTick);
  const p = game.objectiveProgress();
  const o = RULES.objective;
  ui.goal.textContent = game.state.objectiveReached ? '★ Objective reached — keep building!' : `Goal: ${o.residents} residents & ${o.happiness} happiness`;
  ui.goal.classList.toggle('done', game.state.objectiveReached);
  setBar(ui.barRes, p.residents, `Residents ${s.residents} / ${o.residents}`);
  setBar(ui.barHap, p.happiness, `Avg happiness ${formatHappiness(s.happiness)} / ${o.happiness}`);
  for (const t of BUILDING_TYPES) {
    const btn = document.querySelector<HTMLButtonElement>(`[data-action="tool:${t}"]`)!;
    btn.setAttribute('aria-pressed', String(game.selected === t));
    btn.querySelector('.cost')!.classList.toggle('no', game.state.money < BUILDINGS[t].cost);
  }
  const pv = game.preview();
  const fresh = performance.now() - game.message.at < 2500;
  const m = pv && !fresh ? { text: pv.text + (pv.ok ? ' — click to build' : ''), kind: pv.ok ? 'info' : 'error' } : game.message;
  ui.message.textContent = m.text;
  ui.message.className = `hud card ${m.kind}`;
  ui.resetSave.textContent = 'Reset save…';
}

game.subscribe(() => {
  renderHud();
  scene.panel.dirty = true;
});
game.onCelebrate = () => scene.celebrate();
renderHud();

const OB_KEY = 'chelsea-mini-city.onboarded';
function showOnboarding(force = false): void {
  let seen = false;
  try {
    seen = localStorage.getItem(OB_KEY) === '1';
  } catch { /* ignore */ }
  if (seen && !force) return;
  $('onboarding').hidden = false;
  $('obClose').focus();
}
$('obClose').addEventListener('click', () => {
  $('onboarding').hidden = true;
  try {
    localStorage.setItem(OB_KEY, '1');
  } catch { /* ignore */ }
});
showOnboarding();

// ---------------------------------------------------------------------------------------------
// Desktop camera: orbit (drag), zoom (wheel / pinch), pan (right-drag or shift-drag), click to build

const cam = { yaw: 0, pitch: 0.9, dist: 1.4, tx: 0, ty: 0.83, tz: 0.04 };
function resetCamera(): void {
  const d = defaultView();
  Object.assign(cam, { yaw: 0, pitch: 0.9, dist: window.innerWidth < 760 ? 1.8 : 1.4, tx: 0, ty: d.anchor.y + 0.03, tz: 0.04 });
}
resetCamera();

const proj = mat4(), view = mat4(), viewProj = mat4(), invVP = mat4();
const eye: Vec3 = [0, 0, 0];

function updateDesktopCamera(): void {
  const cp = Math.cos(cam.pitch);
  eye[0] = cam.tx + Math.sin(cam.yaw) * cp * cam.dist;
  eye[1] = cam.ty + Math.sin(cam.pitch) * cam.dist;
  eye[2] = cam.tz + Math.cos(cam.yaw) * cp * cam.dist;
  lookAt(view, eye, [cam.tx, cam.ty, cam.tz]);
  perspective(proj, (50 * Math.PI) / 180, canvas.width / Math.max(1, canvas.height), 0.02, 30);
  multiply(viewProj, proj, view);
  invert(invVP, viewProj);
}

const mouseRay: Ray = { origin: [0, 0, 0], dir: [0, 0, 0] };
function rayFromClient(cx: number, cy: number): Ray {
  const rect = canvas.getBoundingClientRect();
  const nx = ((cx - rect.left) / rect.width) * 2 - 1;
  const ny = -(((cy - rect.top) / rect.height) * 2 - 1);
  const near = transformPoint(invVP, [nx, ny, -1]);
  const far = transformPoint(invVP, [nx, ny, 1]);
  mouseRay.origin = near;
  const d: Vec3 = [far[0] - near[0], far[1] - near[1], far[2] - near[2]];
  const l = Math.hypot(...d);
  mouseRay.dir = [d[0] / l, d[1] / l, d[2] / l];
  return mouseRay;
}

const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; button: number; shift: boolean }>();
let dragged = false;
let pinchDist = 0;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, shift: e.shiftKey });
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) {
    if (e.pointerType === 'mouse') hoverAt(e.clientX, e.clientY);
    return;
  }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX;
  p.y = e.clientY;
  if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) dragged = true;
  if (!dragged) return;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) cam.dist = clamp(cam.dist * (pinchDist / d), 0.35, 2.6);
    pinchDist = d;
  } else if (p.button === 2 || p.shift) {
    // pan in the ground plane
    const k = cam.dist * 0.0012;
    const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    cam.tx = clamp(cam.tx - (dx * c + dy * s) * k, -0.8, 0.8);
    cam.tz = clamp(cam.tz - (-dx * s + dy * c) * k, -0.8, 0.8);
  } else {
    cam.yaw -= dx * 0.006;
    cam.pitch = clamp(cam.pitch + dy * 0.005, 0.2, 1.5);
  }
});
const endPointer = (e: PointerEvent) => {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (p && !dragged && pointers.size === 0 && p.button === 0 && e.type === 'pointerup') {
    const hit = pick(e.clientX, e.clientY);
    if (hit?.kind === 'plot') {
      if (e.pointerType !== 'mouse') {
        // Touch: first tap previews, second tap on the same plot builds.
        if (game.hoverPlot !== hit.plotId) {
          game.setHover(hit.plotId);
          return;
        }
      }
      game.place(hit.plotId);
    }
  }
  if (pointers.size < 2) pinchDist = 0;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse' && !pointers.size) game.setHover(null);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 0.35, 2.6);
}, { passive: false });

function pick(cx: number, cy: number): Hit | null {
  updateDesktopCamera();
  return scene.raycast(rayFromClient(cx, cy));
}
function hoverAt(cx: number, cy: number): void {
  const hit = pick(cx, cy);
  game.setHover(hit?.kind === 'plot' ? hit.plotId : null);
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === '1' || k === '2' || k === '3') doAction(`tool:${BUILDING_TYPES[+k - 1]}`);
  else if (k === 'z') doAction('undo');
  else if (k === 'q') doAction('rotL');
  else if (k === 'e') doAction('rotR');
  else if (k === '-' || k === '_') doAction('scaleDown');
  else if (k === '+' || k === '=') doAction('scaleUp');
  else if (k === 'r') doAction('resetView');
  else if (k === 'escape') $('onboarding').hidden = true;
});

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v));
}

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------------------------------------
// Simulation clock: active play only; paused when the page (or headset view) is hidden

let pageHidden = document.hidden;
document.addEventListener('visibilitychange', () => {
  pageHidden = document.hidden;
  lastTime = -1; // never jump ahead on resume
});
let lastTime = -1;
let hudTimer = 0;

function stepSim(time: number, active: boolean): number {
  const dt = lastTime < 0 ? 0 : Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  if (active && !pageHidden) game.update(dt);
  hudTimer += dt;
  if (hudTimer > 0.25) {
    hudTimer = 0;
    ui.tick.style.width = `${Math.round(game.clock.progress * 100)}%`;
    scene.panel.dirty = true;
    if (!xrSession && game.preview()) renderHud();
  }
  return dt;
}

const noPointers: PointerVisual[] = [];
function desktopFrame(time: number): void {
  if (xrSession) return;
  const dt = stepSim(time, true);
  resize();
  scene.sync(game);
  updateDesktopCamera();
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.913, 0.89, 0.847, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  scene.render(game, viewProj, eye, noPointers, game.clock.progress, dt);
  requestAnimationFrame(desktopFrame);
}
requestAnimationFrame(desktopFrame);

// ---------------------------------------------------------------------------------------------
// WebXR

const vrBox = $('vr');
async function setupVR(): Promise<void> {
  if (!window.isSecureContext) {
    vrBox.innerHTML = '<p><b>VR needs HTTPS.</b> Open this page from an https:// address (e.g. GitHub Pages) to enter VR. Desktop play works here.</p>';
    return;
  }
  if (!navigator.xr) {
    vrBox.innerHTML = '<p><b>VR not available in this browser.</b> Desktop play works: drag to orbit, scroll to zoom, click a numbered plot to build. Open this page in the Meta Quest Browser to play in VR.</p>';
    return;
  }
  let ok = false;
  try {
    ok = await navigator.xr.isSessionSupported('immersive-vr');
  } catch {
    ok = false;
  }
  if (!ok) {
    vrBox.innerHTML = '<p><b>No VR headset detected.</b> Desktop play works here. On Meta Quest 3, open this page in the Quest Browser and an “Enter VR” button will appear.</p>';
    return;
  }
  vrBox.innerHTML = '<button id="enterVR">Enter VR</button>';
  $('enterVR').addEventListener('click', () => enterVR().catch((e) => {
    game.message = { text: `Couldn't start VR: ${(e as Error).message}`, kind: 'error', at: performance.now() };
    renderHud();
  }));
}
setupVR();

let refSpace: XRReferenceSpace | null = null;
let floorSpace = true;
const xrViewProj = mat4();
const xrEye: Vec3 = [0, 0, 0];
const ctrlRay: Ray = { origin: [0, 0, 0], dir: [0, 0, 0] };
interface CtrlState { hit: Hit | null; visual: PointerVisual; snapReady: boolean; scaleReady: boolean }
const ctrls = new Map<XRInputSource, CtrlState>();
let primary: XRInputSource | null = null;
let savedView = { ...scene.view, anchor: { ...scene.view.anchor } };

async function enterVR(): Promise<void> {
  if (!navigator.xr) return;
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  await gl.makeXRCompatible();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl, { antialias: true }), depthNear: 0.02, depthFar: 30 });
  try {
    refSpace = await session.requestReferenceSpace('local-floor');
    floorSpace = true;
  } catch {
    refSpace = await session.requestReferenceSpace('local');
    floorSpace = false;
  }
  xrSession = session;
  savedView = { ...scene.view, anchor: { ...scene.view.anchor } };
  scene.showPanel = true;
  recenterPending = true;
  lastTime = -1;
  vrBox.hidden = true;
  session.addEventListener('end', onXREnd);
  session.addEventListener('select', (ev) => onSelect(ev as XRInputSourceEvent));
  session.addEventListener('inputsourceschange', () => ctrls.clear());
  session.addEventListener('visibilitychange', () => (lastTime = -1));
  session.requestAnimationFrame(xrFrame);
}

function onXREnd(): void {
  xrSession = null;
  refSpace = null;
  ctrls.clear();
  primary = null;
  scene.showPanel = false;
  Object.assign(scene.view, savedView, { anchor: { ...savedView.anchor } });
  scene.updateMatrices();
  game.setHover(null);
  vrBox.hidden = false;
  lastTime = -1;
  requestAnimationFrame(desktopFrame);
}

function onSelect(ev: XRInputSourceEvent): void {
  primary = ev.inputSource;
  const st = ctrls.get(ev.inputSource);
  const hit = st?.hit;
  if (!hit) return;
  if (hit.kind === 'panel' && hit.action) doAction(hit.action);
  else if (hit.kind === 'plot') game.place(hit.plotId);
}

/** Places the table in front of the player at a comfortable height (works seated or standing). */
function recenter(pose: XRViewerPose): void {
  const m = pose.transform.matrix;
  const p = pose.transform.position;
  let fx = -m[8], fz = -m[10];
  const l = Math.hypot(fx, fz) || 1;
  fx /= l;
  fz /= l;
  const a = scene.view.anchor;
  a.x = p.x + fx * 0.62;
  a.z = p.z + fz * 0.62;
  a.y = floorSpace ? clamp(p.y - 0.62, 0.45, 1.15) : p.y - 0.62;
  a.yaw = Math.atan2(-fx, -fz);
  scene.updateMatrices();
}

function xrFrame(time: number, frame: XRFrame): void {
  const session = frame.session;
  if (!xrSession || !refSpace) return;
  session.requestAnimationFrame(xrFrame);
  const dt = stepSim(time, session.visibilityState === 'visible');
  const pose = frame.getViewerPose(refSpace);
  if (!pose) return;
  if (recenterPending) {
    recenter(pose);
    recenterPending = false;
  }
  scene.sync(game);

  // Controllers
  const visuals: PointerVisual[] = [];
  let panelHover: Action | null = null;
  let plotHover: string | null = null;
  for (const src of session.inputSources) {
    if (src.targetRayMode !== 'tracked-pointer') continue;
    const rp = frame.getPose(src.targetRaySpace, refSpace);
    if (!rp) continue;
    let st = ctrls.get(src);
    if (!st) {
      st = { hit: null, visual: { matrix: new Float32Array(16), length: 1, hit: false }, snapReady: true, scaleReady: true };
      ctrls.set(src, st);
    }
    const m = rp.transform.matrix;
    st.visual.matrix.set(m);
    ctrlRay.origin = [m[12], m[13], m[14]];
    ctrlRay.dir = [-m[8], -m[9], -m[10]];
    st.hit = scene.raycast(ctrlRay);
    st.visual.hit = !!st.hit;
    st.visual.length = st.hit ? st.hit.t : 1.2;
    visuals.push(st.visual);
    if (!primary) primary = src;
    if (src === primary || (st.hit?.kind === 'panel' && !panelHover)) {
      if (st.hit?.kind === 'panel') panelHover = st.hit.action;
      if (src === primary && st.hit?.kind === 'plot') plotHover = st.hit.plotId;
    }
    handleThumbstick(src, st);
  }
  scene.panel.setHover(panelHover);
  game.setHover(plotHover);

  // Draw both eyes
  const layer = session.renderState.baseLayer!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  gl.clearColor(0.86, 0.84, 0.8, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  for (const v of pose.views) {
    const vp = layer.getViewport(v);
    if (!vp) continue;
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    multiply(xrViewProj, v.projectionMatrix, v.transform.inverse.matrix);
    const p = v.transform.position;
    xrEye[0] = p.x; xrEye[1] = p.y; xrEye[2] = p.z;
    scene.render(game, xrViewProj, xrEye, visuals, game.clock.progress, v === pose.views[0] ? dt : 0);
  }
}

/** Thumbstick: flick left/right to snap-rotate the model 15°, up/down to resize. */
function handleThumbstick(src: XRInputSource, st: CtrlState): void {
  const ax = src.gamepad?.axes;
  if (!ax || ax.length < 4) return;
  const x = ax[2], y = ax[3];
  if (Math.abs(x) > 0.7 && st.snapReady) {
    doAction(x > 0 ? 'rotR' : 'rotL');
    st.snapReady = false;
  } else if (Math.abs(x) < 0.3) st.snapReady = true;
  if (Math.abs(y) > 0.7 && st.scaleReady) {
    doAction(y < 0 ? 'scaleUp' : 'scaleDown');
    st.scaleReady = false;
  } else if (Math.abs(y) < 0.3) st.scaleReady = true;
}

// Expose a tiny debug hook for automated desktop checks.
(window as unknown as { __cmc: unknown }).__cmc = { game, scene, doAction };
