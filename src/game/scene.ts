// 3D scene: owns GPU meshes, tabletop transforms, ray picking, overlays and per-frame drawing.
import type { GameMap, PlotDef } from '../map/types';
import { BUILDINGS, RULES, type BuildingType } from '../sim/rules';
import { MeshBuilder, hex } from '../engine/geometry';
import { Renderer, type Mesh } from '../engine/renderer';
import {
  compose, invert, mat4, multiply, rayPlaneY, rayPlaneZ, rayToLocal, transformPoint,
  type Mat4, type Ray, type Vec3,
} from '../engine/math';
import { MarkerAtlas, type MarkerEntry, type MarkerIcon, type MarkerTone } from '../engine/markers';
import { uprightQuad } from '../engine/text';
import {
  PLOT_Y, buildLabelData, buildPlotsLayer, cachedBuilding, plotFrame, plotMatrix, radiusRing,
  vacantPlotLabels, type LabelData,
} from './cityModel';
import type { Game } from './game';
import { NeighbourhoodLife } from './life';
import { InspectorPanel, Tooltip, WorldPanel, type Action } from './panel';

export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.8;
const PLINTH_DEPTH = 16; // map metres below street level
const MARKER_H = 0.024; // world metres
const MAX_MARKERS = 40;

export interface View {
  anchor: { x: number; y: number; z: number; yaw: number };
  modelYaw: number;
  modelScale: number;
  /** 'map': north-up, tilted toward the player like a wall map (VR); desktop uses a top-down camera. */
  mode: 'table' | 'map';
}

export type Hit =
  | { kind: 'plot'; plotId: string; point: Vec3; t: number }
  | { kind: 'panel'; action: Action | null; point: Vec3; t: number }
  | { kind: 'map'; point: Vec3; t: number };

export interface PointerVisual {
  matrix: Float32Array; // controller target-ray pose (world)
  length: number;
  hit: boolean;
}

type Tint = readonly [number, number, number, number];
const TINT_OK: Tint = [0.3, 0.75, 0.45, 0.35];
const TINT_BAD: Tint = [0.85, 0.25, 0.2, 0.45];
const FRAME_OK: Tint = [0.98, 0.84, 0.35, 1];
const FRAME_BAD: Tint = [0.9, 0.3, 0.25, 1];
const FRAME_SELECT: Tint = [0.95, 0.66, 0.15, 1];
const FRAME_AFFECT: Tint = [0.3, 0.78, 0.45, 1];
const FRAME_SOURCE: Tint = [0.3, 0.62, 0.86, 1];
const RING_TINT: Tint = [1, 0.97, 0.88, 1];
const RAY_TINT: Tint = [0.98, 0.96, 0.9, 1];
const PULSE_PLACE: Tint = [0.98, 0.95, 0.85, 1];
const PULSE_UPGRADE: Tint = [0.95, 0.75, 0.25, 1];

interface FrameOverlay { plot: PlotDef; tint: Tint; scale: number }
interface MarkerOverlay { plot: PlotDef; entry: MarkerEntry; stack: number; rise?: number }
interface Overlays { frames: FrameOverlay[]; markers: MarkerOverlay[]; ring: PlotDef | null }
interface Pulse { plot: PlotDef; start: number; kind: 'place' | 'upgrade' }

export class CityScene {
  readonly r: Renderer;
  readonly view: View = defaultView();
  showPanel = false;
  reducedMotion = false;
  lowDetail = false;

  private staticMesh: Mesh;
  private plotsMesh: Mesh;
  private labelMesh: Mesh;
  private decals: { tex: WebGLTexture; mesh: Mesh }[] = [];
  private minorLabelMesh: Mesh;
  /** Minor street labels are hidden when the model is far away (normalised distance). */
  showMinorLabels = true;
  private plotLabelMesh: Mesh;
  private labelTex: WebGLTexture;
  private labels: LabelData;
  private frameMesh: Mesh;
  private ringMesh: Mesh;
  private pulseMesh: Mesh;
  private previews = new Map<BuildingType, Mesh>();
  private tableMesh: Mesh;
  private floorMesh: Mesh;
  private rayMesh: Mesh;
  private cursorMesh: Mesh;
  readonly panel = new WorldPanel();
  readonly inspector = new InspectorPanel();
  private panelMesh: Mesh;
  private panelTex: WebGLTexture;
  private inspMesh: Mesh;
  private inspTex: WebGLTexture;
  private tooltip = new Tooltip();
  private tooltipMesh: Mesh;
  private tooltipTex: WebGLTexture;
  private banner = new Tooltip();
  private bannerTex: WebGLTexture;
  private bannerMesh: Mesh;
  private markers = new MarkerAtlas();
  private markerTex: WebGLTexture;
  private markerMesh: Mesh;
  private markerData = new Float32Array(MAX_MARKERS * 6 * 5);
  private confetti: Confetti;
  readonly life: NeighbourhoodLife;
  private builtVersion = -1;
  private tableHeight = -1;
  private overlayKey = '';
  private overlays: Overlays = { frames: [], markers: [], ring: null };
  private pulses: Pulse[] = [];
  private bannerUntil = 0;

  // Reused matrices
  readonly anchorM = mat4();
  readonly modelM = mat4();
  readonly modelInv = mat4();
  readonly panelM = mat4();
  readonly panelInv = mat4();
  readonly inspM = mat4();
  readonly inspInv = mat4();
  private tmp = mat4();
  private tmp2 = mat4();
  private tmp3 = mat4();
  private localRay: Ray = { origin: [0, 0, 0], dir: [0, 0, 0] };
  private v3: Vec3 = [0, 0, 0];

  readonly baseScale: number;
  /** World half-size of the model at scale 1 (metres). */
  readonly worldHalf: number;

  constructor(canvas: HTMLCanvasElement, readonly map: GameMap) {
    this.r = new Renderer(canvas);
    const r = this.r;
    this.baseScale = map.baseScale;
    this.worldHalf = map.half * map.baseScale;
    this.staticMesh = r.litMesh(map.buildStatic().toFloat32());
    this.plotsMesh = r.litMesh(new Float32Array(0));
    this.labels = buildLabelData(map.labels(), map.plots, map.plotLabelSize);
    this.labelTex = r.createTexture(this.labels.canvas);
    this.labelMesh = r.texMesh(this.labels.major);
    this.minorLabelMesh = r.texMesh(this.labels.minor);
    this.decals = (map.decals?.() ?? []).map((d) => ({ tex: r.createTexture(d.canvas), mesh: r.texMesh(d.data) }));
    this.plotLabelMesh = r.texMesh(new Float32Array(0));
    this.frameMesh = r.litMesh(plotFrame().toFloat32());
    this.ringMesh = r.litMesh(radiusRing(RULES.effectRadius).toFloat32());
    this.pulseMesh = r.litMesh(radiusRing(15, 1.4, 32).toFloat32());
    this.tableMesh = r.litMesh(new Float32Array(0));
    const floor = new MeshBuilder();
    floor.cylinder(0, 0, -0.01, 0, 3.2, 40, hex('#d9d2c4'));
    floor.cylinder(0, 0, 0, 0.002, 1.4, 40, hex('#cfc6b4'));
    this.floorMesh = r.litMesh(floor.toFloat32());
    const ray = new MeshBuilder();
    ray.box(-0.0015, -0.0015, -1, 0.0015, 0.0015, 0, hex('#ffffff'), true);
    this.rayMesh = r.litMesh(ray.toFloat32());
    const cur = new MeshBuilder();
    cur.blob(0, 0, 0, 0.008, 0.008, hex('#ffffff'));
    this.cursorMesh = r.litMesh(cur.toFloat32());
    this.panelTex = r.createTexture(this.panel.canvas);
    this.panelMesh = r.texMesh(uprightQuad(this.panel.widthM, this.panel.heightM));
    this.inspTex = r.createTexture(this.inspector.canvas);
    this.inspMesh = r.texMesh(uprightQuad(this.inspector.widthM, this.inspector.heightM));
    this.tooltipTex = r.createTexture(this.tooltip.canvas);
    this.tooltipMesh = r.texMesh(uprightQuad(0.28, 0.035));
    this.bannerTex = r.createTexture(this.banner.canvas);
    this.bannerMesh = r.texMesh(uprightQuad(0.6, 0.075));
    this.markerTex = r.createTexture(this.markers.canvas);
    this.markerMesh = r.texMesh(new Float32Array(0));
    this.confetti = new Confetti(r);
    this.life = new NeighbourhoodLife(r, map);
    this.updateMatrices();
  }

  private preview(type: BuildingType): Mesh {
    let m = this.previews.get(type);
    if (!m) {
      m = this.r.litMesh(cachedBuilding(type, 0).toFloat32());
      this.previews.set(type, m);
    }
    return m;
  }

  updateMatrices(): void {
    const v = this.view;
    const a = v.anchor;
    compose(this.anchorM, a.x, a.y, a.z, a.yaw);
    const s = this.baseScale * v.modelScale;
    if (v.mode === 'map') {
      // Wall-map presentation: north away from the player, tilted up toward them. Only the model
      // moves; the player's viewpoint is never moved.
      const tilt = 0.95;
      const half = this.worldHalf * v.modelScale;
      compose(this.tmp, 0, Math.sin(tilt) * half + 0.04, -0.05, 0, s, tilt);
    } else {
      compose(this.tmp, 0, PLINTH_DEPTH * s, 0, v.modelYaw, s);
    }
    multiply(this.modelM, this.anchorM, this.tmp);
    invert(this.modelInv, this.modelM);
    // Panels flank the table toward the player, tilted back like lecterns: menu left, inspector right.
    const px = this.worldHalf + 0.3;
    compose(this.tmp, -px, 0.3, 0.32, 0.75, 1, -0.45);
    multiply(this.panelM, this.anchorM, this.tmp);
    invert(this.panelInv, this.panelM);
    compose(this.tmp, px, 0.3, 0.32, -0.75, 1, -0.45);
    multiply(this.inspM, this.anchorM, this.tmp);
    invert(this.inspInv, this.inspM);
    if (a.y !== this.tableHeight) this.rebuildTable();
  }

  private rebuildTable(): void {
    const h = this.view.anchor.y;
    this.tableHeight = h;
    const b = new MeshBuilder();
    const r = Math.max(0.66, this.worldHalf * 1.3);
    b.cylinder(0, 0, -0.035, 0, r, 40, hex('#a77a55'));
    b.cylinder(0, 0, -0.05, -0.035, r - 0.06, 40, hex('#8c6345'));
    b.cylinder(0, 0, -h, -0.05, 0.06, 10, hex('#6f4f38'));
    b.cylinder(0, 0, -h, -h + 0.03, 0.3, 16, hex('#6f4f38'));
    this.tableMesh = this.r.litMesh(b.toFloat32(), this.tableMesh);
  }

  /** Rebuilds the dynamic building layer when buildings change. */
  sync(game: Game): void {
    if (game.buildingsVersion !== this.builtVersion) {
      this.builtVersion = game.buildingsVersion;
      this.plotsMesh = this.r.litMesh(buildPlotsLayer(this.map.plots, game.state.buildings, game.stats).toFloat32(), this.plotsMesh);
      this.plotLabelMesh = this.r.texMesh(vacantPlotLabels(this.labels, this.map.plots, game.state.buildings), this.plotLabelMesh);
      this.life.sync(game.state, game.stats.residents);
    }
    const key = `${game.version}`;
    if (key !== this.overlayKey) {
      this.overlayKey = key;
      this.overlays = computeOverlays(game, this.markers);
      if (this.markers.dirty) {
        this.r.updateTexture(this.markerTex, this.markers.canvas);
        this.markers.dirty = false;
      }
    }
  }

  // ---- picking -------------------------------------------------------------------------------

  private panelHit(ray: Ray, inv: Mat4, m: Mat4, w: number, h: number, hit: (u: number, v: number) => Action | null): Hit | null {
    const lr = rayToLocal(ray, inv, this.localRay);
    const t = rayPlaneZ(lr);
    if (t === null) return null;
    const x = lr.origin[0] + lr.dir[0] * t, y = lr.origin[1] + lr.dir[1] * t;
    if (Math.abs(x) > w / 2 || Math.abs(y) > h / 2) return null;
    return { kind: 'panel', action: hit(x / w + 0.5, 0.5 - y / h), point: transformPoint(m, [x, y, 0]), t };
  }

  /** Ray pick against the VR panels (when shown) and the plots. The nearest hit wins, so a
   * panel always blocks the map behind it. */
  raycast(ray: Ray): Hit | null {
    let best: Hit | null = null;
    if (this.showPanel) {
      const a = this.panelHit(ray, this.panelInv, this.panelM, this.panel.widthM, this.panel.heightM, (u, v) => this.panel.hit(u, v));
      const b = this.panelHit(ray, this.inspInv, this.inspM, this.inspector.widthM, this.inspector.heightM, (u, v) => this.inspector.hit(u, v));
      best = a && b ? (a.t < b.t ? a : b) : a ?? b;
    }
    const lr = rayToLocal(ray, this.modelInv, this.localRay);
    const t = rayPlaneY(lr, PLOT_Y);
    if (t !== null && (!best || t < best.t)) {
      const x = lr.origin[0] + lr.dir[0] * t, z = lr.origin[2] + lr.dir[2] * t;
      const lim = this.map.half + 15;
      if (Math.abs(x) <= lim && Math.abs(z) <= lim) {
        const point = transformPoint(this.modelM, [x, PLOT_Y, z]);
        const p = plotAt(this.map.plots, x, z);
        best = p ? { kind: 'plot', plotId: p.id, point, t } : { kind: 'map', point, t };
      }
    }
    return best;
  }

  // ---- effects -------------------------------------------------------------------------------

  celebrate(text: string): void {
    if (!this.reducedMotion) this.confetti.start();
    this.banner.set(text, true);
    this.r.updateTexture(this.bannerTex, this.banner.canvas);
    this.bannerUntil = performance.now() + 6000;
  }

  pulse(kind: 'place' | 'upgrade', plotId: string): void {
    const plot = this.map.plots.find((p) => p.id === plotId);
    if (plot) this.pulses.push({ plot, start: performance.now(), kind });
  }

  // ---- drawing -------------------------------------------------------------------------------

  /** Advance per-frame animation once (not per eye). */
  tick(dt: number): void {
    if (!this.lowDetail) this.life.update(dt, !this.reducedMotion);
  }

  render(game: Game, viewProj: Mat4, eye: Vec3, pointers: PointerVisual[], tickProgress: number, dt: number): void {
    const r = this.r;
    const now = performance.now();
    r.setViewProj(viewProj);
    r.drawLit(this.floorMesh, identityM);
    r.drawLit(this.tableMesh, this.anchorM);
    r.drawLit(this.staticMesh, this.modelM);
    r.drawLit(this.plotsMesh, this.modelM);
    for (const d of this.decals) r.drawTex(d.mesh, this.modelM, d.tex);
    if (!this.lowDetail) this.life.draw(this.modelM);

    for (const p of pointers) {
      compose(this.tmp, 0, 0, 0, 0, 1);
      this.tmp[10] = p.length; // stretch along z
      multiply(this.tmp2, p.matrix, this.tmp);
      r.drawLit(this.rayMesh, this.tmp2, { unlit: true, tint: RAY_TINT, alpha: 0.75 });
      if (p.hit) {
        compose(this.tmp, 0, 0, -p.length, 0, 1);
        multiply(this.tmp2, p.matrix, this.tmp);
        r.drawLit(this.cursorMesh, this.tmp2, { unlit: true });
      }
    }

    r.drawTex(this.labelMesh, this.modelM, this.labelTex);
    if (this.showMinorLabels) r.drawTex(this.minorLabelMesh, this.modelM, this.labelTex);
    r.drawTex(this.plotLabelMesh, this.modelM, this.labelTex);

    // Overlays: only while placing or inspecting
    const ov = this.overlays;
    for (const f of ov.frames) {
      multiply(this.tmp2, this.modelM, plotMatrix(f.plot, this.tmp));
      if (f.scale !== 1) {
        compose(this.tmp, 0, 0, 0, 0, f.scale);
        multiply(this.tmp3, this.tmp2, this.tmp);
        this.tmp2.set(this.tmp3);
      }
      r.drawLit(this.frameMesh, this.tmp2, { unlit: true, tint: f.tint });
    }
    if (ov.ring) {
      compose(this.tmp, ov.ring.x, 0, ov.ring.z, 0);
      multiply(this.tmp2, this.modelM, this.tmp);
      r.drawLit(this.ringMesh, this.tmp2, { unlit: true, tint: RING_TINT, alpha: 0.7 });
    }
    const pv = game.preview();
    if (pv?.type) {
      multiply(this.tmp2, this.modelM, plotMatrix(pv.plot, this.tmp));
      r.drawLit(this.preview(pv.type), this.tmp2, { tint: pv.ok ? TINT_OK : TINT_BAD, alpha: 0.6 });
    }

    // Placement / upgrade pulses
    this.pulses = this.pulses.filter((p) => now - p.start < 900);
    for (const p of this.pulses) {
      const k = (now - p.start) / 900;
      const s = this.reducedMotion ? 1 : 0.7 + k * 0.9;
      compose(this.tmp, p.plot.x, 0.6, p.plot.z, 0, s);
      multiply(this.tmp2, this.modelM, this.tmp);
      r.drawLit(this.pulseMesh, this.tmp2, { unlit: true, tint: p.kind === 'upgrade' ? PULSE_UPGRADE : PULSE_PLACE, alpha: 1 - k });
    }

    this.drawMarkers(eye, now);

    if (pv) {
      if (this.tooltip.set(pv.text, pv.ok)) r.updateTexture(this.tooltipTex, this.tooltip.canvas);
      this.billboard(pv.plot.x, 46, pv.plot.z, eye, this.tmp2);
      r.drawTex(this.tooltipMesh, this.tmp2, this.tooltipTex, 1, true);
    }

    if (this.showPanel) {
      if (this.panel.mapMode !== (this.view.mode === 'map')) {
        this.panel.mapMode = this.view.mode === 'map';
        this.panel.dirty = true;
      }
      if (this.panel.dirty) {
        this.panel.draw(game, tickProgress);
        r.updateTexture(this.panelTex, this.panel.canvas);
      }
      r.drawTex(this.panelMesh, this.panelM, this.panelTex);
      if (this.inspector.dirty) {
        this.inspector.draw(game);
        r.updateTexture(this.inspTex, this.inspector.canvas);
      }
      r.drawTex(this.inspMesh, this.inspM, this.inspTex);
    }

    if (now < this.bannerUntil) {
      transformPoint(this.anchorM, [0, 0.32, 0], this.v3);
      const yaw = Math.atan2(eye[0] - this.v3[0], eye[2] - this.v3[2]);
      compose(this.tmp2, this.v3[0], this.v3[1], this.v3[2], yaw);
      r.drawTex(this.bannerMesh, this.tmp2, this.bannerTex, 1, true);
    }
    this.confetti.render(this.anchorM, dt);
  }

  /** Floating marker labels, batched into one draw call; each faces the viewer. */
  private drawMarkers(eye: Vec3, now: number): void {
    const list = this.overlays.markers;
    const pulses = this.pulses;
    if (!list.length && !pulses.length) return;
    const d = this.markerData;
    let n = 0;
    const put = (x: number, y: number, z: number, e: MarkerEntry): boolean => {
      if (n >= MAX_MARKERS) return false;
      transformPoint(this.modelM, [x, y, z], this.v3);
      const [px, py, pz] = this.v3;
      const dx = eye[0] - px, dy = eye[1] - py, dz = eye[2] - pz;
      const hl = Math.hypot(dx, dz) || 1;
      // right vector (horizontal) and up vector perpendicular to view direction
      const rx = dz / hl, rz = -dx / hl;
      const len = Math.hypot(dx, dy, dz) || 1;
      const fx = dx / len, fy = dy / len, fz = dz / len;
      const ux = fy * rz - 0 * fz, uy = fz * rx - fx * rz, uz = fx * 0 - fy * rx; // up = f × r
      // Roughly constant on-screen size: shrink when the viewer is close (desktop zoom), cap for VR.
      const mh = Math.min(MARKER_H, Math.max(0.006, len * 0.03));
      const h = mh / 2, w = (mh * e.aspect) / 2;
      const s = Math.sign(uy) || 1;
      const corner = (cx: number, cy: number, u: number, v: number, o: number) => {
        d[o] = px + rx * cx + ux * cy * s;
        d[o + 1] = py + uy * cy * s;
        d[o + 2] = pz + rz * cx + uz * cy * s;
        d[o + 3] = u;
        d[o + 4] = v;
      };
      const o = n * 30;
      corner(-w, -h, e.u0, e.v1, o);
      corner(w, -h, e.u1, e.v1, o + 5);
      corner(w, h, e.u1, e.v0, o + 10);
      corner(-w, -h, e.u0, e.v1, o + 15);
      corner(w, h, e.u1, e.v0, o + 20);
      corner(-w, h, e.u0, e.v0, o + 25);
      n++;
      return true;
    };
    const unit = this.baseScale * this.view.modelScale;
    for (const m of list) if (put(m.plot.x, 0, m.plot.z, m.entry)) this.lift(n - 1, 36 + (m.stack * MARKER_H * 1.15) / unit);
    for (const p of pulses) {
      if (p.kind !== 'upgrade') continue;
      const k = (now - p.start) / 900;
      if (put(p.plot.x, 0, p.plot.z, this.markers.get('Level 2', 'star', 'gold'))) this.lift(n - 1, 40 + (this.reducedMotion ? 0 : k * 10));
    }
    if (this.markers.dirty) {
      this.r.updateTexture(this.markerTex, this.markers.canvas);
      this.markers.dirty = false;
    }
    this.markerMesh = this.r.texMesh(d.subarray(0, n * 30), this.markerMesh);
    this.r.drawTex(this.markerMesh, identityM, this.markerTex, 1, true);
  }

  /** Raises marker i by h map metres (applied in world space along the model's up axis). */
  private lift(i: number, h: number): void {
    if (i < 0) return;
    const d = this.markerData;
    const up = this.baseScale * this.view.modelScale * h;
    for (let k = 0; k < 6; k++) d[i * 30 + k * 5 + 1] += up;
  }

  private billboard(x: number, heightMap: number, z: number, eye: Vec3, out: Mat4): void {
    transformPoint(this.modelM, [x, heightMap, z], this.v3);
    const dx = eye[0] - this.v3[0], dy = eye[1] - this.v3[1], dz = eye[2] - this.v3[2];
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz)); // face the viewer fully
    const dist = Math.hypot(dx, dy, dz);
    const s = Math.min(1, Math.max(0.25, dist / 0.95)); // keep the tooltip readable but not huge up close
    compose(out, this.v3[0], this.v3[1] + 0.03 * s, this.v3[2], yaw, s, pitch);
  }
}

const identityM = mat4();

export function defaultView(): View {
  return { anchor: { x: 0, y: 0.8, z: 0, yaw: 0 }, modelYaw: 0, modelScale: 1, mode: 'table' };
}

/** Plot containing a map-space point (plots are rotated rectangles), with a 1 m grace margin. */
export function plotAt(plots: readonly PlotDef[], x: number, z: number): PlotDef | null {
  for (const p of plots) {
    const dx = x - p.x, dz = z - p.z;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    // inverse of the plot rotation (local x along frontage, local z toward the street)
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= p.w / 2 + 1 && Math.abs(lz) <= p.d / 2 + 1) return p;
  }
  return null;
}

/**
 * What to highlight for the current hover preview and inspection. Uses the simulation's own
 * estimate / inspection results, so the overlay always matches what will actually happen.
 */
export function computeOverlays(game: Game, atlas: MarkerAtlas): Overlays {
  const frames: FrameOverlay[] = [];
  const markers: MarkerOverlay[] = [];
  let ring: PlotDef | null = null;
  const stackCount = new Map<string, number>();
  const plot = (id: string) => game.plotById.get(id)!;
  const mark = (id: string, text: string, icon: MarkerIcon, tone: MarkerTone) => {
    const s = stackCount.get(id) ?? 0;
    if (s >= 2) return;
    stackCount.set(id, s + 1);
    markers.push({ plot: plot(id), entry: atlas.get(text, icon, tone), stack: s });
  };
  const frame = (id: string, tint: Tint, scale = 1) => frames.push({ plot: plot(id), tint, scale });

  const pv = game.preview();
  if (pv) {
    frame(pv.plot.id, pv.ok ? FRAME_OK : FRAME_BAD);
    const est = pv.estimate;
    if (pv.type && est) {
      const changed = new Set<string>();
      for (const h of est.homeChanges) {
        if (h.before === null) continue;
        changed.add(h.id);
        frame(h.id, FRAME_AFFECT);
        mark(h.id, `+${h.after - h.before}`, 'heart', 'good');
      }
      for (const sc of est.shopChanges) {
        if (sc.after && !sc.before) {
          frame(sc.id, FRAME_AFFECT);
          const lvl = game.state.buildings[sc.id]?.level ?? 1;
          mark(sc.id, `Active +£${BUILDINGS.shop.levels[lvl].income}`, 'coin', 'gold');
        }
      }
      if (pv.type !== 'townhouse') {
        ring = pv.plot;
        for (const h of game.stats.homes) {
          if (changed.has(h.id) || !game.sim.inRange(h.id, pv.plot.id)) continue;
          frame(h.id, FRAME_SOURCE);
          mark(h.id, h.happiness >= 100 ? 'max' : 'has shop', 'heart', 'info');
        }
        if (pv.type === 'shop' && est.income[1] > est.income[0]) mark(pv.plot.id, `+£${est.income[1] - est.income[0]}`, 'coin', 'gold');
        if (pv.type === 'shop' && est.income[1] === est.income[0]) mark(pv.plot.id, 'Idle: no homes', 'warn', 'warn');
      } else {
        const own = est.homeChanges.find((h) => h.before === null);
        if (own) mark(pv.plot.id, `${own.after}`, 'heart', own.after >= 70 ? 'good' : 'info');
        for (const s of Object.keys(game.stats.activeShops)) if (game.sim.inRange(s, pv.plot.id)) frame(s, FRAME_SOURCE);
        for (const [id, b] of Object.entries(game.state.buildings)) if (b.type === 'park' && game.sim.inRange(id, pv.plot.id)) frame(id, FRAME_SOURCE);
      }
    }
  }

  const ins = game.inspection();
  if (ins) {
    frame(ins.plotId, FRAME_SELECT, 1.12);
    frame(ins.plotId, FRAME_SELECT);
    if (ins.type === 'townhouse') {
      mark(ins.plotId, `${ins.happiness}`, 'heart', (ins.happiness ?? 0) >= 70 ? 'good' : 'info');
      ins.nearbyShops.forEach((s, i) => {
        frame(s, FRAME_SOURCE);
        mark(s, i === 0 ? 'Shop +10' : 'Shop', 'heart', i === 0 ? 'good' : 'info');
      });
      for (const p of ins.nearbyParks) {
        frame(p.id, FRAME_SOURCE);
        mark(p.id, `Park +${p.bonus}`, 'heart', 'good');
      }
    } else {
      ring = plot(ins.plotId);
      if (ins.type === 'shop') mark(ins.plotId, ins.active ? `+£${ins.income}` : 'Idle', ins.active ? 'coin' : 'warn', ins.active ? 'gold' : 'warn');
      const bonus = ins.type === 'park' ? ins.contributions[0].value : RULES.shopHappinessBonus;
      for (const h of ins.servedHomes) {
        frame(h, FRAME_AFFECT);
        mark(h, `+${bonus}`, 'heart', 'good');
      }
    }
  }
  return { frames, markers, ring };
}

/** Short confetti burst over the table (CPU-updated, preallocated buffer, one draw call). */
class Confetti {
  private n = 90;
  private data = new Float32Array(this.n * 6 * 9);
  private mesh: Mesh;
  private p = new Float32Array(this.n * 6); // x y z vx vy vz
  private age = 99;
  private colors = ['#e8b84a', '#4caf6a', '#d65a4a', '#4a7bd6', '#f2efe6', '#b45ad6'].map(hex);
  constructor(private r: Renderer) {
    this.mesh = r.litMesh(this.data);
  }
  start(): void {
    this.age = 0;
    for (let i = 0; i < this.n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.random() * 0.35;
      this.p.set([Math.cos(a) * d, 0.35 + Math.random() * 0.25, Math.sin(a) * d, (Math.random() - 0.5) * 0.15, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 0.15], i * 6);
    }
  }
  render(anchor: Mat4, dt: number): void {
    if (this.age > 4.5) return;
    this.age += dt;
    const s = 0.008;
    const d = this.data;
    for (let i = 0; i < this.n; i++) {
      const o = i * 6;
      this.p[o + 4] = Math.max(-0.12, this.p[o + 4] - 0.9 * dt); // flutter
      this.p[o] += this.p[o + 3] * dt;
      this.p[o + 1] = Math.max(0.01, this.p[o + 1] + this.p[o + 4] * dt);
      this.p[o + 2] += this.p[o + 5] * dt;
      const x = this.p[o], y = this.p[o + 1], z = this.p[o + 2];
      const ang = this.age * 6 + i;
      const cx = Math.cos(ang) * s, cz = Math.sin(ang) * s;
      const c = this.colors[i % this.colors.length];
      for (let k = 0; k < 6; k++) {
        const sx = k === 1 || k === 2 || k === 4 ? 1 : -1;
        const sy = k === 2 || k === 4 || k === 5 ? 0.5 : -0.5;
        const vo = (i * 6 + k) * 9;
        d[vo] = x + cx * sx; d[vo + 1] = y + s * sy; d[vo + 2] = z + cz * sx;
        d[vo + 3] = 0; d[vo + 4] = 1; d[vo + 5] = 0;
        d[vo + 6] = c[0]; d[vo + 7] = c[1]; d[vo + 8] = c[2];
      }
    }
    this.mesh = this.r.litMesh(this.data, this.mesh);
    this.r.drawLit(this.mesh, anchor, { unlit: true, doubleSided: true });
  }
}
