// Chelsea Explorer entry point: wires the exploration state, the one 3D scene, desktop controls
// and the WebXR session together. There is no simulation, timer or game loop beyond rendering.
import { invert, lookAt, mat4, multiply, perspective, transformPoint, type Ray, type Vec3 } from './engine/math';
import { OSM, osmMap } from './map/osmMap';
import { Explorer } from './explore/explorer';
import { LANDMARKS, type Landmark, type Viewpoint } from './explore/landmarks';
import { EYE_HEIGHT, NavField, SQUARE_GROUND, STREET_GROUND, type NavData } from './explore/nav';
import { exportLegacy, readLegacy } from './explore/legacy';
import { safeLocalStorage } from './explore/prefs';
import { ExplorerScene, type Marker, type PointerVisual } from './view/scene';
import type { Action } from './view/panel';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('scene');
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function fatal(msg: string): never {
  const el = $('error');
  el.style.display = 'grid';
  el.innerHTML = `<div><h2>Chelsea Explorer couldn't start</h2><p>${msg}</p></div>`;
  throw new Error(msg);
}

let scene: ExplorerScene;
try {
  scene = new ExplorerScene(canvas, osmMap);
} catch (e) {
  fatal(`This browser couldn't start WebGL2 (${(e as Error).message}). Try an up-to-date Chrome, Edge, Firefox, Safari or the Meta Quest Browser.`);
}
const gl = scene.r.gl;
const store = safeLocalStorage();
const nav = new NavField(OSM as unknown as NavData);
const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const ex = new Explorer(nav, store, prefersReducedMotion);
if (ex.loadStatus !== 'ok' && ex.loadStatus !== 'none') console.info(`Explorer preferences reset (${ex.loadStatus}).`);

let xrSession: XRSession | null = null;
let highlight: Landmark | null = null;

// ---------------------------------------------------------------------------------------------
// Transitions: a brief fade (instant with reduced motion). Nothing ever flies through buildings.

const fadeEl = $('fade');
let xrFade = 0, xrFadeTarget = 0;
let transitioning = false;
function transition(change: () => void): void {
  if (transitioning) return;
  if (ex.prefs.reducedMotion) {
    change();
    return;
  }
  transitioning = true;
  if (xrSession) {
    xrFadeTarget = 1;
    setTimeout(() => {
      change();
      xrFadeTarget = 0;
      transitioning = false;
    }, 200);
  } else {
    fadeEl.style.opacity = '1';
    setTimeout(() => {
      change();
      fadeEl.style.opacity = '0';
      transitioning = false;
    }, 190);
  }
}

// ---------------------------------------------------------------------------------------------
// Actions shared by the desktop HUD, the keyboard and the VR panel

function snapRad(): number {
  return (ex.prefs.snapTurnDeg * Math.PI) / 180;
}

function goStreet(vp?: Viewpoint): void {
  const target = vp ?? ex.pick;
  if (!nav.isWalkable(target.x, target.z)) {
    ex.enterStreet(target); // reports why
    return;
  }
  transition(() => {
    const l = ex.selected;
    streetPitch = l?.street && l.street.x === target.x && l.street.z === target.z ? l.pitch ?? 0 : -0.05;
    ex.enterStreet(target);
    highlight = null;
    if (xrSession) xrPlacePending = 'enter';
  });
}

function goMiniature(): void {
  if (ex.mode === 'miniature') return;
  transition(() => {
    ex.toMiniature();
    if (xrSession) recenterPending = true;
  });
}

function turn(dir: 1 | -1): void {
  if (xrSession) xrTurnPending += dir * snapRad();
  else ex.turn(dir * snapRad());
}

function selectPlace(id: string): void {
  const before = ex.mode;
  const l = LANDMARKS.find((x) => x.id === id);
  if (!l) return;
  if (before === 'street' && l.street) {
    transition(() => {
      ex.selectLandmark(id);
      streetPitch = l.pitch ?? 0;
      if (xrSession) xrPlacePending = 'teleport';
    });
    return;
  }
  const apply = () => {
    ex.selectLandmark(id);
    highlight = l;
    if (!xrSession) focusDesktopOn(l);
    else if (before === 'street') recenterPending = true;
  };
  if (before === 'street') transition(apply);
  else apply();
}

function doAction(a: Action | 'resetView'): void {
  if (a.startsWith('place:')) {
    selectPlace(a.slice(6));
    return;
  }
  switch (a) {
    case 'toStreet': goStreet(); break;
    case 'toMiniature': goMiniature(); break;
    case 'rotL': ex.rotateMiniature(1); break;
    case 'rotR': ex.rotateMiniature(-1); break;
    case 'scaleDown': ex.scaleMiniature(false); break;
    case 'scaleUp': ex.scaleMiniature(true); break;
    case 'resetView':
      ex.resetMiniature();
      if (xrSession) recenterPending = true;
      else resetCamera();
      break;
    case 'turnL': turn(1); break;
    case 'turnR': turn(-1); break;
    case 'labels': ex.setPref('labels', !ex.prefs.labels); break;
    case 'lowDetail': ex.setPref('lowDetail', !ex.prefs.lowDetail); break;
    case 'reducedMotion': ex.setPref('reducedMotion', !ex.prefs.reducedMotion); break;
    case 'snap': ex.setSnapTurn(ex.prefs.snapTurnDeg === 30 ? 45 : 30); break;
    case 'seated':
      ex.setPref('seated', !ex.prefs.seated);
      if (xrSession && ex.mode === 'street') xrPlacePending = 'teleport';
      break;
    case 'about':
      if (xrSession) {
        vrAbout = !vrAbout;
        syncPanel();
      } else showAbout();
      break;
    case 'exitVR': xrSession?.end(); break;
  }
}

// ---------------------------------------------------------------------------------------------
// Desktop HUD

document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-action]');
  if (b && !b.disabled) doAction(b.dataset.action as Action);
});

$('placeList').innerHTML = LANDMARKS.map((l) => `<li><button data-action="place:${esc(l.id)}" aria-current="false">${esc(l.name)}${l.street ? '' : '<small>Shown on the miniature</small>'}</button></li>`).join('');

function renderHud(): void {
  const street = ex.mode === 'street';
  document.body.classList.toggle('street', street);
  $('btnMini').setAttribute('aria-pressed', String(!street));
  $('btnStreet').setAttribute('aria-pressed', String(street));
  $('sideTitle').textContent = street ? 'Street level' : 'Miniature';
  $('miniControls').hidden = street;
  $('streetControls').hidden = !street;
  const sel = ex.selected?.id ?? null;
  document.querySelectorAll<HTMLButtonElement>('#placeList button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.action === `place:${sel}`)));
  const opt = (id: string, label: string, on: boolean) => {
    const b = $(id);
    b.setAttribute('aria-pressed', String(on));
    b.textContent = `${label}: ${on ? 'on' : 'off'}`;
  };
  opt('optLabels', 'Labels', ex.prefs.labels);
  opt('optDetail', 'Low detail', ex.prefs.lowDetail);
  opt('optMotion', 'Reduced motion', ex.prefs.reducedMotion);
  scene.showLabels = ex.prefs.labels;
  scene.lowDetail = ex.prefs.lowDetail;
  scene.reducedMotion = ex.prefs.reducedMotion;

  const n = ex.notice;
  const l = ex.selected;
  let html = '';
  if (l) html += `<h3>${esc(l.name)}</h3><p>${esc(l.description)}</p>`;
  if (n) html += `<p class="notice ${n.kind}">${esc(n.text)}</p>`;
  if (!l && !n) {
    html += street
      ? `<p class="help"><b>Walk</b> with W A S D or the arrow keys · <b>look</b> by dragging (or “Look with the mouse”) · <b>click</b> the pavement to step there · <b>M</b> returns to the miniature.</p>`
      : `<p class="help"><b>1</b> Drag to turn the model, scroll to zoom. <b>2</b> Click the pavement or the square to choose a spot (or pick a place). <b>3</b> Go to street level and look around.</p>`;
  }
  if (!street) html += `<div class="actions"><button class="primary" data-action="toStreet">Go to street level${l?.street || !l ? '' : ' here'}</button><span class="help">${l && !l.street ? `${esc(l.name)} is outside the street-level area; you will stand at your chosen spot.` : 'Street level covers the area around Sloane Square.'}</span></div>`;
  $('info').innerHTML = html;
  syncPanel();
}
ex.subscribe(renderHud);
renderHud();

function updateCompass(headingYaw: number): void {
  // Screen-up is the camera's heading; north is drawn rotated by the heading.
  const svg = $('compass').querySelector('svg')!;
  svg.style.transform = `rotate(${(headingYaw * 180) / Math.PI}deg)`;
}

// ---- About panel & attribution ---------------------------------------------------------------
function showAbout(): void {
  const meta = OSM.meta;
  const legacy = readLegacy(store);
  const restored = OSM.buildings.filter((b) => b.formerSite).length;
  $('aboutBody').innerHTML = `
    <p><b>${esc(meta.title)}</b>. A reconstruction of about ${meta.half * 2} m × ${meta.half * 2} m of Chelsea around
      Sloane Square and King’s Road, to explore as a miniature or at street level. It is an approximate model, not a photorealistic one.</p>
    <p>Map data <a href="${esc(meta.copyrightUrl)}" target="_blank" rel="noopener">© OpenStreetMap contributors</a>,
      available under the Open Database License (ODbL 1.0). Extract retrieved ${esc(meta.retrieved.slice(0, 10))}.</p>
    <p><b>From OpenStreetMap:</b> street centrelines and names, pavements and squares, building footprints, most building heights (from storey counts), the trees, benches and lamps in Sloane Square, and landmark positions.</p>
    <p><b>Approximations:</b> the buildings around Sloane Square and Peter Jones are hand-built procedural models based on photographs and published descriptions; their windows, ornament, roofs and colours are simplified.
      Elsewhere buildings are plain masses with flat roofs at their mapped height (${restored} of them, previously cleared for an earlier game, are shown the same way). Road widths without a mapped width, façade colours and the trees outside Sloane Square are estimates.</p>
    <p><b>Place descriptions</b> are short statements from the sources listed with each place (Historic England, Wikipedia, the Royal Borough of Kensington and Chelsea and others).</p>
    <p class="sub"><b>Earlier city-builder save.</b> ${esc(legacy.description)}
      ${legacy.found ? '<button id="legacyDownload" class="link">Download a copy</button>.' : ''}</p>`;
  $('about').hidden = false;
  $('aboutClose').focus();
  $('legacyDownload')?.addEventListener('click', () => {
    const blob = new Blob([exportLegacy(legacy)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chelsea-mini-city-legacy-save.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}
$('aboutClose').addEventListener('click', () => ($('about').hidden = true));
$('attribution').innerHTML = `Map data <a href="${esc(osmMap.attribution.url)}" target="_blank" rel="noopener">${esc(osmMap.attribution.text)}</a> · <button data-action="about" class="link">About</button>`;

// ---------------------------------------------------------------------------------------------
// Desktop camera. Miniature: orbit (drag), zoom (wheel / pinch), pan (right-drag).
// Street level: eye height above the walking surface, look by dragging or pointer lock.

const cam = { yaw: 0, pitch: 0.9, dist: 1.4, tx: 0, ty: 0.83, tz: 0.04 };
let camAnim: { from: typeof cam; to: Partial<typeof cam>; t0: number } | null = null;
function resetCamera(): void {
  const fit = scene.worldHalf * (window.innerWidth < 760 ? 3.5 : 2.7);
  Object.assign(cam, { yaw: 0, pitch: 0.9, dist: fit, tx: 0, ty: scene.mini.anchor.y + 0.03, tz: 0.04 });
  camAnim = null;
}
resetCamera();

/** Desktop miniature: centre the orbit on a landmark (a short glide, or instant with reduced motion). */
function focusDesktopOn(l: Landmark): void {
  scene.setMiniature();
  const p = scene.mapToWorld(l.x, 0, l.z);
  const to = { tx: clamp(p[0], -0.8, 0.8), tz: clamp(p[2], -0.8, 0.8), ty: p[1] + 0.02, dist: Math.min(cam.dist, scene.worldHalf * 1.4 * ex.prefs.miniature.scale) };
  if (ex.prefs.reducedMotion) Object.assign(cam, to);
  else camAnim = { from: { ...cam }, to, t0: performance.now() };
}

let streetPitch = -0.05;
const proj = mat4(), view = mat4(), viewProj = mat4(), invVP = mat4();
const eye: Vec3 = [0, 0, 0];

function streetEye(): Vec3 {
  const s = ex.street;
  return [s.x, nav.groundY(s.x, s.z) + EYE_HEIGHT, s.z];
}

function updateDesktopCamera(): void {
  if (ex.mode === 'street') {
    scene.setStreet(0, 0, 0, 0, 0, 0, 0); // map space is world space
    const e = streetEye();
    eye[0] = e[0]; eye[1] = e[1]; eye[2] = e[2];
    const y = ex.street.yaw, p = streetPitch;
    lookAt(view, eye, [eye[0] - Math.sin(y) * Math.cos(p), eye[1] + Math.sin(p), eye[2] - Math.cos(y) * Math.cos(p)]);
    perspective(proj, (60 * Math.PI) / 180, canvas.width / Math.max(1, canvas.height), 0.1, 900);
    updateCompass(y);
  } else {
    scene.mini.yaw = ex.prefs.miniature.yaw;
    scene.mini.scale = ex.prefs.miniature.scale;
    scene.setMiniature();
    if (camAnim) {
      const k = Math.min(1, (performance.now() - camAnim.t0) / 600), e = k * k * (3 - 2 * k);
      for (const [key, v] of Object.entries(camAnim.to)) (cam as Record<string, number>)[key] = camAnim.from[key as keyof typeof cam] + (v - camAnim.from[key as keyof typeof cam]) * e;
      if (k >= 1) camAnim = null;
    }
    const cp = Math.cos(cam.pitch);
    eye[0] = cam.tx + Math.sin(cam.yaw) * cp * cam.dist;
    eye[1] = cam.ty + Math.sin(cam.pitch) * cam.dist;
    eye[2] = cam.tz + Math.cos(cam.yaw) * cp * cam.dist;
    lookAt(view, eye, [cam.tx, cam.ty, cam.tz]);
    perspective(proj, (50 * Math.PI) / 180, canvas.width / Math.max(1, canvas.height), 0.02, 30);
    updateCompass(cam.yaw - ex.prefs.miniature.yaw);
  }
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

interface GroundHit { x: number; z: number; y: number; ok: boolean; reason: string | null; t: number }
/**
 * Where a world-space ray meets the walking surface in map space, with line of sight: a hit behind
 * a building counts as the building, so nobody is moved through a wall.
 */
function groundHit(ray: Ray): GroundHit | null {
  const o = transformPoint(scene.modelInv, ray.origin);
  const tip = transformPoint(scene.modelInv, [ray.origin[0] + ray.dir[0], ray.origin[1] + ray.dir[1], ray.origin[2] + ray.dir[2]]);
  const d: Vec3 = [tip[0] - o[0], tip[1] - o[1], tip[2] - o[2]];
  if (d[1] >= -1e-6) return null;
  let y = STREET_GROUND;
  let t = (y - o[1]) / d[1];
  let x = o[0] + d[0] * t, z = o[2] + d[2] * t;
  if (nav.inSquare(x, z)) {
    y = SQUARE_GROUND;
    t = (y - o[1]) / d[1];
    x = o[0] + d[0] * t; z = o[2] + d[2] * t;
  }
  if (Math.abs(x) > osmMap.half || Math.abs(z) > osmMap.half) return null;
  const w = scene.mapToWorld(x, y, z);
  const worldT = Math.hypot(w[0] - ray.origin[0], w[1] - ray.origin[1], w[2] - ray.origin[2]);
  if (nav.inZone(x, z) && nav.lineBlocked(o[0], o[1], o[2], x, y + 0.3, z)) {
    return { x, z, y, ok: false, reason: 'A building is in the way.', t: worldT };
  }
  const reason = ex.reason(x, z);
  const far = ex.mode === 'street' && Math.hypot(x - ex.street.x, z - ex.street.z) > 40;
  return { x, z, y, ok: !reason && !far, reason: reason ?? (far ? 'Too far for one step.' : null), t: worldT };
}

let hover: GroundHit | null = null;
const pointers = new Map<number, { x: number; y: number; sx: number; sy: number; button: number; shift: boolean }>();
let dragged = false;
let pinchDist = 0;
let locked = false;

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  if (locked) {
    // pointer lock: a click steps to the point at the centre of the view
    const r = canvas.getBoundingClientRect();
    clickGround(r.left + r.width / 2, r.top + r.height / 2);
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button, shift: e.shiftKey });
  dragged = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (locked) {
    ex.turn(-e.movementX * 0.0025, false);
    streetPitch = clamp(streetPitch - e.movementY * 0.0025, -1.2, 1.2);
    return;
  }
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
  hover = null;
  if (ex.mode === 'street') {
    ex.turn(dx * 0.004, false);
    streetPitch = clamp(streetPitch + dy * 0.004, -1.2, 1.2);
    return;
  }
  camAnim = null;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0) cam.dist = clamp(cam.dist * (pinchDist / d), 0.2, 2.6);
    pinchDist = d;
  } else if (p.button === 2 || p.shift) {
    const k = cam.dist * 0.0012;
    const c = Math.cos(cam.yaw), s = Math.sin(cam.yaw);
    cam.tx = clamp(cam.tx - (dx * c + dy * s) * k, -0.8, 0.8);
    cam.tz = clamp(cam.tz - (-dx * s + dy * c) * k, -0.8, 0.8);
  } else {
    cam.yaw -= dx * 0.006;
    cam.pitch = clamp(cam.pitch + dy * 0.005, 0.15, 1.5);
  }
});
const endPointer = (e: PointerEvent) => {
  const p = pointers.get(e.pointerId);
  pointers.delete(e.pointerId);
  if (p && dragged && ex.mode === 'street') ex.commit();
  if (p && !dragged && pointers.size === 0 && p.button === 0 && e.type === 'pointerup') clickGround(e.clientX, e.clientY);
  if (pointers.size < 2) pinchDist = 0;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => (hover = null));
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (ex.mode === 'miniature') {
    camAnim = null;
    cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), 0.2, 2.6);
  }
}, { passive: false });

function pickRay(cx: number, cy: number): GroundHit | null {
  updateDesktopCamera();
  return groundHit(rayFromClient(cx, cy));
}
function hoverAt(cx: number, cy: number): void {
  hover = pickRay(cx, cy);
}
function clickGround(cx: number, cy: number): void {
  const h = pickRay(cx, cy);
  if (!h) return;
  if (ex.mode === 'miniature') {
    // face the way the camera looks across the table
    const yaw = cam.yaw - ex.prefs.miniature.yaw;
    if (ex.pickAt(h.x, h.z, yaw)) highlight = null;
  } else if (h.ok) {
    transition(() => ex.teleport(h.x, h.z));
  } else if (h.reason) ex.say(h.reason, 'warn');
}

// Pointer lock (optional): explained beside the button; Esc releases it (browser standard).
$('lockBtn').addEventListener('click', () => {
  if (canvas.requestPointerLock) canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  $('lockBtn').textContent = locked ? 'Mouse look on · Esc releases' : 'Look with the mouse';
  if (!locked && ex.mode === 'street') ex.commit();
});

const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(k)) {
    if (ex.mode === 'street') {
      keys.add(k);
      if (k.startsWith('arrow')) e.preventDefault();
    }
    return;
  }
  if (k === 'q') ex.mode === 'street' ? doAction('turnL') : doAction('rotL');
  else if (k === 'e') ex.mode === 'street' ? doAction('turnR') : doAction('rotR');
  else if (k === '-' || k === '_') doAction('scaleDown');
  else if (k === '+' || k === '=') doAction('scaleUp');
  else if (k === 'r') doAction('resetView');
  else if (k === 'm') ex.mode === 'street' ? goMiniature() : goStreet();
  else if (k === 'l') doAction('labels');
  else if (k === 'escape' && !$('about').hidden) $('about').hidden = true;
});
window.addEventListener('keyup', (e) => {
  const k = e.key.toLowerCase();
  if (keys.delete(k) && keys.size === 0 && ex.mode === 'street') ex.commit();
});
window.addEventListener('blur', () => keys.clear());

/** Desktop walking: user-driven only (no motion without a key held). */
function walk(dt: number): void {
  if (ex.mode !== 'street' || !keys.size || xrSession) return;
  const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const r = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  const turnKeys = (keys.has('arrowleft') ? 1 : 0) - (keys.has('arrowright') ? 1 : 0);
  if (turnKeys) ex.turn(turnKeys * dt * 1.6, false);
  if (!f && !r) return;
  const speed = (keys.has('shift') ? 3.2 : 1.4) * dt;
  const y = ex.street.yaw;
  const fx = -Math.sin(y), fz = -Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
  const l = Math.hypot(f, r) || 1;
  ex.walk(((fx * f + rx * r) / l) * speed, ((fz * f + rz * r) / l) * speed);
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

/** Minor street names appear only when the miniature is close enough to read them. */
function updateLabelVisibility(e: Vec3): void {
  const m = scene.modelM;
  const d = Math.hypot(e[0] - m[12], e[1] - m[13], e[2] - m[14]);
  scene.showMinorLabels = d / (scene.worldHalf * 2 * ex.prefs.miniature.scale) < 1.45;
}

function markersFor(h: GroundHit | null): Marker[] {
  const out: Marker[] = [];
  if (ex.mode === 'miniature') {
    const p = ex.pick;
    out.push({ x: p.x, z: p.z, y: nav.groundY(p.x, p.z), ok: true, yaw: p.yaw });
  }
  if (h) out.push({ x: h.x, z: h.z, y: h.y, ok: h.ok, yaw: null });
  return out;
}

let lastTime = -1;
function pinFor(): { x: number; z: number; h: number } | null {
  const l = highlight ?? (ex.mode === 'miniature' ? ex.selected : null);
  return l ? { x: l.x, z: l.z, h: l.pinY } : null;
}

function desktopFrame(time: number): void {
  if (xrSession) return;
  const dt = lastTime < 0 ? 0 : Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  resize();
  walk(dt);
  updateDesktopCamera();
  if (ex.mode === 'miniature') updateLabelVisibility(eye);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  if (ex.mode === 'street') gl.clearColor(0.74, 0.82, 0.88, 1);
  else gl.clearColor(0.913, 0.89, 0.847, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  scene.showFurniture = false;
  scene.render(viewProj, eye, { markers: markersFor(hover), pin: pinFor(), time: time / 1000 });
  requestAnimationFrame(desktopFrame);
}
requestAnimationFrame(desktopFrame);
document.addEventListener('visibilitychange', () => (lastTime = -1));

// ---------------------------------------------------------------------------------------------
// WebXR

const vrBox = $('vr');
async function setupVR(): Promise<void> {
  if (!window.isSecureContext) {
    vrBox.innerHTML = '<p><b>VR needs HTTPS.</b> Open this page from an https:// address (e.g. GitHub Pages) to enter VR. Desktop exploring works here.</p>';
    return;
  }
  if (!navigator.xr) {
    vrBox.innerHTML = '<p><b>VR is not available in this browser.</b> Explore on the desktop here, or open this page in the Meta Quest Browser.</p>';
    return;
  }
  let ok = false;
  try {
    ok = await navigator.xr.isSessionSupported('immersive-vr');
  } catch {
    ok = false;
  }
  if (!ok) {
    vrBox.innerHTML = '<p><b>No VR headset detected.</b> Desktop exploring works here. On Meta Quest 3, open this page in the Quest Browser and an “Enter VR” button appears.</p>';
    return;
  }
  vrBox.innerHTML = '<button id="enterVR" class="primary">Enter VR</button>';
  $('enterVR').addEventListener('click', () => enterVR().catch((e) => ex.say(`Couldn't start VR: ${(e as Error).message}`, 'warn')));
}
setupVR();

let refSpace: XRReferenceSpace | null = null;
let floorSpace = true;
let recenterPending = false;
let xrPlacePending: 'enter' | 'teleport' | null = null;
let xrTurnPending = 0;
let vrAbout = false;
/** Street-level placement in VR: map point (sx, sz) sits at world (ox, oy, oz), map rotated by yaw. */
const xrStreet = { sx: 0, sy: 0, sz: 0, ox: 0, oy: 0, oz: 0, yaw: 0 };
const xrViewProj = mat4();
const xrEye: Vec3 = [0, 0, 0];
const ctrlRay: Ray = { origin: [0, 0, 0], dir: [0, 0, 0] };
interface CtrlState { panel: Action | null | undefined; panelT: number; ground: GroundHit | null; visual: PointerVisual; snapReady: boolean; scaleReady: boolean }
const ctrls = new Map<XRInputSource, CtrlState>();
let primary: XRInputSource | null = null;

async function enterVR(): Promise<void> {
  if (!navigator.xr) return;
  const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor'] });
  await gl.makeXRCompatible();
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl, { antialias: true }), depthNear: 0.05, depthFar: 900 });
  try {
    refSpace = await session.requestReferenceSpace('local-floor');
    floorSpace = true;
  } catch {
    refSpace = await session.requestReferenceSpace('local');
    floorSpace = false;
  }
  xrSession = session;
  scene.showPanel = true;
  recenterPending = true;
  if (ex.mode === 'street') xrPlacePending = 'enter';
  vrBox.hidden = true;
  if (document.pointerLockElement) document.exitPointerLock();
  session.addEventListener('end', onXREnd);
  session.addEventListener('select', (ev) => onSelect(ev as XRInputSourceEvent));
  session.addEventListener('inputsourceschange', () => ctrls.clear());
  syncPanel();
  session.requestAnimationFrame(xrFrame);
}

function onXREnd(): void {
  xrSession = null;
  refSpace = null;
  ctrls.clear();
  primary = null;
  scene.showPanel = false;
  scene.mini.anchor = { x: 0, y: 0.8, z: 0, yaw: 0 };
  vrBox.hidden = false;
  xrFade = xrFadeTarget = 0;
  transitioning = false;
  lastTime = -1;
  ex.commit();
  requestAnimationFrame(desktopFrame);
}

function onSelect(ev: XRInputSourceEvent): void {
  primary = ev.inputSource;
  const st = ctrls.get(ev.inputSource);
  if (!st) return;
  if (st.panel !== undefined) {
    // a panel swallows the selection even between buttons, so nothing behind it is chosen
    if (st.panel) doAction(st.panel);
    return;
  }
  const h = st.ground;
  if (!h) return;
  if (ex.mode === 'miniature') {
    // face away from the viewer across the table
    const yaw = -ex.prefs.miniature.yaw;
    if (ex.pickAt(h.x, h.z, yaw)) {
      highlight = null;
      vrAbout = false;
    }
  } else if (h.ok) transition(() => {
    ex.teleport(h.x, h.z);
    xrPlacePending = 'teleport';
  });
  else if (h.reason) ex.say(h.reason, 'warn');
}

/** Places the table in front of the player at a comfortable height (works seated or standing). */
function recenter(pose: XRViewerPose): void {
  const m = pose.transform.matrix, p = pose.transform.position;
  let fx = -m[8], fz = -m[10];
  const l = Math.hypot(fx, fz) || 1;
  fx /= l;
  fz /= l;
  const a = scene.mini.anchor;
  const reach = 0.2 + scene.worldHalf * 1.05;
  a.x = p.x + fx * reach;
  a.z = p.z + fz * reach;
  a.y = floorSpace ? clamp(p.y - 0.62, 0.45, 1.15) : p.y - 0.62;
  a.yaw = Math.atan2(-fx, -fz);
}

function headYaw(pose: XRViewerPose): number {
  const m = pose.transform.matrix;
  return Math.atan2(m[8], m[10]); // forward = −z column → yaw with forward (−sin, −cos)
}

/**
 * Street level in VR: put the visitor's head over a map point. The user is never moved; the model
 * is placed under them. Seated mode lowers the model so the eye is at standing height.
 */
function placeStreet(pose: XRViewerPose, mx: number, mz: number, mapYaw: number): void {
  const p = pose.transform.position;
  const g = nav.groundY(mx, mz);
  const floor = floorSpace ? 0 : p.y - EYE_HEIGHT;
  const lift = ex.prefs.seated && floorSpace ? Math.max(0, EYE_HEIGHT - p.y) : 0;
  Object.assign(xrStreet, { sx: mx, sy: g, sz: mz, ox: p.x, oy: floor - lift, oz: p.z, yaw: headYaw(pose) - mapYaw });
}

function applyXrStreet(): void {
  const s = xrStreet;
  scene.setStreet(s.sx, s.sy, s.sz, s.ox, s.oy, s.oz, s.yaw);
}

/** Map position and heading under the head (room-scale walking updates the explorer). */
function headOnMap(pose: XRViewerPose): { x: number; z: number; yaw: number } {
  const p = pose.transform.position;
  const m = scene.worldToMap([p.x, p.y, p.z]);
  return { x: m[0], z: m[2], yaw: headYaw(pose) - xrStreet.yaw };
}

function syncPanel(): void {
  if (!xrSession) return;
  const l = ex.selected, n = ex.notice;
  let title = ex.mode === 'street' ? 'Street level' : 'Miniature';
  let body = ex.mode === 'street'
    ? 'Point at the pavement and pull the trigger to step there. Flick the thumbstick left or right to turn.'
    : 'Point at the pavement or the square and pull the trigger to choose a spot, then “Go to street level”. Thumbstick: rotate and resize.';
  let warn = false;
  if (l) {
    title = l.name;
    body = l.description;
  }
  if (n) {
    if (!l) title = n.kind === 'warn' ? 'Not there' : title;
    body = l ? `${n.text} ${body}` : n.text;
    warn = n.kind === 'warn';
  }
  if (vrAbout) {
    title = 'About';
    body = `Map data © OpenStreetMap contributors (ODbL). An approximate reconstruction: buildings around Sloane Square are simplified procedural models; others are plain masses at their mapped height.`;
    warn = false;
  }
  scene.panel.set({
    mode: ex.mode, labels: ex.prefs.labels, lowDetail: ex.prefs.lowDetail, reducedMotion: ex.prefs.reducedMotion,
    snapTurnDeg: ex.prefs.snapTurnDeg, seated: ex.prefs.seated, selectedId: l?.id ?? null, title, body, warn,
  });
}

const panelOffset = mat4();
// Panel held above the left controller, tilted toward the face.
{
  const t = mat4();
  const c = Math.cos(-0.9), s = Math.sin(-0.9);
  t.set([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0.02, 0.2, -0.08, 1]);
  panelOffset.set(t);
}
const fixedPanel = mat4();

function xrFrame(time: number, frame: XRFrame): void {
  const session = frame.session;
  if (!xrSession || !refSpace) return;
  session.requestAnimationFrame(xrFrame);
  const dt = lastTime < 0 ? 0 : Math.min(0.1, (time - lastTime) / 1000);
  lastTime = time;
  const pose = frame.getViewerPose(refSpace);
  if (!pose) return;
  if (recenterPending) {
    recenter(pose);
    recenterPending = false;
  }
  if (ex.mode === 'street') {
    if (xrPlacePending) {
      placeStreet(pose, ex.street.x, ex.street.z, ex.street.yaw);
      xrPlacePending = null;
      // fallback panel pose: in front-left of the head, at chest height
      const p = pose.transform.position, y = headYaw(pose) + 0.5;
      const t = mat4();
      const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(-0.5), sp = Math.sin(-0.5);
      t.set([cy, 0, -sy, 0, sy * sp, cp, cy * sp, 0, sy * cp, -sp, cy * cp, 0, p.x - Math.sin(y) * 0.55, p.y - 0.35, p.z - Math.cos(y) * 0.55, 1]);
      fixedPanel.set(t);
    }
    if (xrTurnPending) {
      // snap turn about the head: keep the map point under the head fixed
      applyXrStreet();
      const h = headOnMap(pose);
      placeStreet(pose, h.x, h.z, h.yaw + xrTurnPending);
      xrTurnPending = 0;
      applyXrStreet();
      const h2 = headOnMap(pose);
      ex.street = { x: h2.x, z: h2.z, yaw: h2.yaw };
      ex.turn(0);
    }
    applyXrStreet();
    const h = headOnMap(pose);
    ex.street = { x: h.x, z: h.z, yaw: h.yaw }; // room-scale steps (not saved every frame)
  } else {
    xrTurnPending = 0;
    scene.mini.yaw = ex.prefs.miniature.yaw;
    scene.mini.scale = ex.prefs.miniature.scale;
    scene.setMiniature();
  }

  // Panel pose: lectern by the table (miniature) or held above the left controller (street).
  let leftGrip: XRPose | null = null;
  if (ex.mode === 'street') {
    for (const src of session.inputSources) if (src.handedness === 'left' && src.gripSpace) leftGrip = frame.getPose(src.gripSpace, refSpace) ?? null;
    if (leftGrip) {
      const m = mat4();
      multiply(m, leftGrip.transform.matrix, panelOffset);
      // shrink to a hand-held size
      for (let i = 0; i < 12; i++) m[i] *= 0.72;
      scene.setPanelPose(m);
    } else scene.setPanelPose(fixedPanel);
  }

  // Controllers
  const visuals: PointerVisual[] = [];
  let panelHover: Action | null = null;
  const markers: Marker[] = [];
  if (ex.mode === 'miniature') markers.push({ x: ex.pick.x, z: ex.pick.z, y: nav.groundY(ex.pick.x, ex.pick.z), ok: true, yaw: ex.pick.yaw });
  for (const src of session.inputSources) {
    if (src.targetRayMode !== 'tracked-pointer') continue;
    const rp = frame.getPose(src.targetRaySpace, refSpace);
    if (!rp) continue;
    let st = ctrls.get(src);
    if (!st) {
      st = { panel: undefined, panelT: 0, ground: null, visual: { matrix: new Float32Array(16), length: 1, hit: false }, snapReady: true, scaleReady: true };
      ctrls.set(src, st);
    }
    const m = rp.transform.matrix;
    st.visual.matrix.set(m);
    ctrlRay.origin = [m[12], m[13], m[14]];
    ctrlRay.dir = [-m[8], -m[9], -m[10]];
    // the hand holding the panel does not point at it
    const holdsPanel = ex.mode === 'street' && leftGrip && src.handedness === 'left';
    const ph = holdsPanel ? null : panelHit(ctrlRay);
    st.panel = ph ? ph.action : undefined;
    st.ground = ph ? null : groundHit(ctrlRay);
    const len = ph ? ph.t : st.ground ? Math.min(st.ground.t, 60) : 1.2;
    st.visual.hit = !!(ph || st.ground);
    st.visual.length = len;
    visuals.push(st.visual);
    if (!primary) primary = src;
    if (ph?.action) panelHover = ph.action;
    if (st.ground && (src === primary || !holdsPanel)) markers.push({ x: st.ground.x, z: st.ground.z, y: st.ground.y, ok: st.ground.ok, yaw: null });
    handleThumbstick(src, st);
  }
  scene.panel.setHover(panelHover);

  // Comfort: dim the view if the head enters a building at street level (room-scale walking).
  let inside = 0;
  if (ex.mode === 'street' && nav.buildingAt(ex.street.x, ex.street.z)) inside = 0.85;
  const target = Math.max(xrFadeTarget, inside);
  xrFade += (target - xrFade) * Math.min(1, dt * 14);

  const layer = session.renderState.baseLayer!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, layer.framebuffer);
  if (ex.mode === 'street') gl.clearColor(0.74, 0.82, 0.88, 1);
  else gl.clearColor(0.86, 0.84, 0.8, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  scene.showFurniture = ex.mode === 'miniature';
  for (const v of pose.views) {
    const vp = layer.getViewport(v);
    if (!vp) continue;
    gl.viewport(vp.x, vp.y, vp.width, vp.height);
    multiply(xrViewProj, v.projectionMatrix, v.transform.inverse.matrix);
    const p = v.transform.position;
    xrEye[0] = p.x; xrEye[1] = p.y; xrEye[2] = p.z;
    if (v === pose.views[0] && ex.mode === 'miniature') updateLabelVisibility(xrEye);
    scene.render(xrViewProj, xrEye, { pointers: visuals, markers, pin: pinFor(), fade: xrFade, time: time / 1000 });
  }
}

/** Ray test against the VR panel (local XY plane). */
function panelHit(ray: Ray): { action: Action | null; t: number } | null {
  const o = transformPoint(scene.panelInv, ray.origin);
  const tip = transformPoint(scene.panelInv, [ray.origin[0] + ray.dir[0], ray.origin[1] + ray.dir[1], ray.origin[2] + ray.dir[2]]);
  const dz = tip[2] - o[2];
  if (Math.abs(dz) < 1e-8) return null;
  const t = -o[2] / dz;
  if (t <= 0) return null;
  const x = o[0] + (tip[0] - o[0]) * t, y = o[1] + (tip[1] - o[1]) * t;
  const w = scene.panel.widthM, h = scene.panel.heightM;
  if (Math.abs(x) > w / 2 || Math.abs(y) > h / 2) return null;
  const world = transformPoint(scene.panelM, [x, y, 0]);
  const dist = Math.hypot(world[0] - ray.origin[0], world[1] - ray.origin[1], world[2] - ray.origin[2]);
  return { action: scene.panel.hit(x / w + 0.5, 0.5 - y / h), t: dist };
}

/** Thumbstick: miniature — flick left/right to rotate 15°, up/down to resize; street — snap turn. */
function handleThumbstick(src: XRInputSource, st: CtrlState): void {
  const ax = src.gamepad?.axes;
  if (!ax || ax.length < 4) return;
  const x = ax[2], y = ax[3];
  if (Math.abs(x) > 0.7 && st.snapReady) {
    if (ex.mode === 'street') turn(x > 0 ? -1 : 1);
    else doAction(x > 0 ? 'rotR' : 'rotL');
    st.snapReady = false;
  } else if (Math.abs(x) < 0.3) st.snapReady = true;
  if (ex.mode !== 'miniature') return;
  if (Math.abs(y) > 0.7 && st.scaleReady) {
    doAction(y < 0 ? 'scaleUp' : 'scaleDown');
    st.scaleReady = false;
  } else if (Math.abs(y) < 0.3) st.scaleReady = true;
}


// A tiny debug hook for automated desktop checks.
(window as unknown as { __explorer: unknown }).__explorer = { ex, scene, nav, cam, doAction, selectPlace, goStreet, goMiniature, setPitch: (p: number) => (streetPitch = p) };
