// Tree comparison harness (development only; not part of the game build).
// Renders approach A (clustered foliage meshes) and approach B (hybrid leaf cards) for the same tree
// spec, camera and lighting, and measures triangles, draw calls and foliage overdraw.
import { Renderer, type Mesh } from '../engine/renderer';
import { MeshBuilder, hex } from '../engine/geometry';
import { NatureBuilder } from '../engine/nature';
import { compose, lookAt, multiply, perspective, type Mat4 } from '../engine/math';
import { buildBranches, buildCardFoliage, buildClumpFoliage, planeSkeleton, squareTreeSpec } from '../map/landmarks/planeTree';
import { drawLeafAtlas } from '../map/landmarks/leafAtlas';

const canvas = document.getElementById('c') as HTMLCanvasElement;
canvas.width = innerWidth; canvas.height = innerHeight;
const r = new Renderer(canvas);
const gl = r.gl;
const leafTex = r.createTexture(drawLeafAtlas());

const spec = squareTreeSpec(Number(new URLSearchParams(location.search).get('t') ?? 2));
const sk = planeSkeleton(spec);
const SEP = 9; // trees 18 m apart (as in the square's rows)
const optA = { x: -SEP, y: 0, z: 0, yaw: 0, phase: 1.3 };
const optB = { x: SEP, y: 0, z: 0, yaw: 0, phase: 1.3 };
const branchesA = new NatureBuilder(), clumps = new NatureBuilder();
buildBranches(branchesA, sk, optA, 0, 3); buildClumpFoliage(clumps, sk, optA);
const branchesB = new NatureBuilder(), core = new NatureBuilder(), cards = new NatureBuilder();
buildBranches(branchesB, sk, optB, 0, 3); buildCardFoliage(core, cards, sk, optB);
const ground = new MeshBuilder();
ground.flat(-40, -25, 40, 25, 0, hex('#cfc3ad'));
for (let i = -40; i < 40; i += 1.2) for (let j = -25; j < 25; j += 0.8) if ((Math.floor(i * 7 + j * 13) & 3) === 0) ground.flat(i, j, i + 1.15, j + 0.75, 0.01, hex('#c4b8a2'));
const m = {
  ground: r.litMesh(ground.toFloat32()),
  branchesA: r.natureMesh(branchesA.toFloat32()), clumps: r.natureMesh(clumps.toFloat32()),
  branchesB: r.natureMesh(branchesB.toFloat32()), core: r.natureMesh(core.toFloat32()), cards: r.natureMesh(cards.toFloat32()),
};
const tris = (x: NatureBuilder) => x.vertexCount / 3;
const stats = {
  spec,
  A: { trunkBranchTris: tris(branchesA), foliageTris: tris(clumps), totalTris: tris(branchesA) + tris(clumps), drawCalls: 1, blended: false, alphaTested: false },
  B: { trunkBranchTris: tris(branchesB), coreTris: tris(core), cardTris: tris(cards), cards: tris(cards) / 2, totalTris: tris(branchesB) + tris(core) + tris(cards), drawCalls: 2, blended: false, alphaTested: true },
  msaa: r.msaa,
};

const proj = new Float32Array(16) as Mat4, view = new Float32Array(16) as Mat4, vp = new Float32Array(16) as Mat4, model = new Float32Array(16) as Mat4;
let time = 0, sway = 1;
type View = { name: string; dist: number; scale: number; pitch: number; yaw: number; target: [number, number, number]; eye?: number };
function setView(v: View) {
  const k = 0.0015 * v.scale;
  compose(model, 0, 0, 0, 0, k);
  const t = [v.target[0] * k, v.target[1] * k, v.target[2] * k];
  const cp = Math.cos(v.pitch);
  const right = [Math.cos(v.yaw), 0, -Math.sin(v.yaw)];
  const ipd = (v.eye ?? 0) * 0.032;
  const eye: [number, number, number] = [t[0] + Math.sin(v.yaw) * cp * v.dist + right[0] * ipd, t[1] + Math.sin(v.pitch) * v.dist, t[2] + Math.cos(v.yaw) * cp * v.dist + right[2] * ipd];
  perspective(proj, (50 * Math.PI) / 180, canvas.width / canvas.height, 0.01, 20);
  lookAt(view, eye, [t[0] + right[0] * ipd, t[1], t[2] + right[2] * ipd]);
  multiply(vp, proj, view);
  r.setViewProj(vp);
}
function draw(which: 'both' | 'A' | 'B' = 'both') {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.93, 0.9, 0.85, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  r.drawLit(m.ground, model);
  if (which !== 'B') { r.drawNature(m.branchesA, model, { mode: 0, time, sway }); r.drawNature(m.clumps, model, { mode: 0, time, sway }); }
  if (which !== 'A') {
    r.drawNature(m.branchesB, model, { mode: 0, time, sway }); r.drawNature(m.core, model, { mode: 0, time, sway });
    r.drawNature(m.cards, model, { mode: 1, time, sway, texture: leafTex, doubleSided: true });
  }
}
/** Foliage overdraw: average fragments per covered pixel, and total fragments shaded. */
function overdraw(which: 'A' | 'B', depth = false) {
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const run = (meshes: Mesh[], mode: 3 | 4) => { for (const x of meshes) r.drawNature(x, model, { mode, time, sway: 0, texture: leafTex, doubleSided: true, depth }); };
  const read = () => {
    const px = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let covered = 0, frags = 0, max = 0;
    for (let i = 0; i < px.length; i += 4) { const n = Math.round(px[i] / 4); if (n) { covered++; frags += n; max = Math.max(max, n); } }
    return { covered, frags, perPixel: +(frags / Math.max(1, covered)).toFixed(2), max };
  };
  if (which === 'A') { run([m.clumps], 4); return { written: read() }; }
  run([m.core], 4); run([m.cards], 3); const written = read();
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  run([m.core, m.cards], 4); const rasterised = read();
  return { written, rasterised };
}
/** Shimmer: mean absolute colour change in the canopy when the camera moves by about a quarter pixel. */
function shimmer(v: View, which: 'A' | 'B') {
  const grab = () => { const px = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  setView(v); draw(which); const a = grab();
  const dyaw = (50 * Math.PI / 180) / canvas.height / 4 / Math.max(0.05, Math.cos(v.pitch)) * 1;
  setView({ ...v, yaw: v.yaw + dyaw }); draw(which); const b = grab();
  let sum = 0, n = 0;
  for (let i = 0; i < a.length; i += 4) {
    const bg = Math.abs(a[i] - 237) + Math.abs(a[i + 1] - 230) < 20 && Math.abs(b[i] - 237) + Math.abs(b[i + 1] - 230) < 20;
    const green = a[i + 1] > a[i] + 6 || b[i + 1] > b[i] + 6;
    if (!green || bg) continue;
    sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); n++;
  }
  setView(v);
  return { pixels: n, meanAbsDiff: +(sum / Math.max(1, n) / 3).toFixed(2) };
}
(window as unknown as { __lab: unknown }).__lab = { shimmer, stats, setView, draw, overdraw, setTime: (t: number) => (time = t), setSway: (s: number) => (sway = s) };
setView({ name: 'tabletop', dist: 0.8, scale: 1, pitch: 0.7, yaw: 0, target: [0, 8, 0] });
draw();
