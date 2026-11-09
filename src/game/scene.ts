// 3D scene: owns GPU meshes, tabletop transforms, ray picking and per-frame drawing.
import { PLOTS, type PlotDef } from '../map/chelsea';
import { RULES, type BuildingType } from '../sim/rules';
import { MeshBuilder, hex } from '../engine/geometry';
import { Renderer, type Mesh } from '../engine/renderer';
import {
  compose, invert, mat4, multiply, rayPlaneY, rayPlaneZ, rayToLocal, transformPoint,
  type Mat4, type Ray, type Vec3,
} from '../engine/math';
import { uprightQuad } from '../engine/text';
import {
  PLOT_Y, buildLabels, buildPlotsLayer, buildStaticCity, cachedBuilding, plotFrame, plotMatrix, radiusRing,
  vacantPlotLabels, type LabelData,
} from './cityModel';
import type { Game } from './game';
import { PANEL_M, Tooltip, WorldPanel, type Action } from './panel';

/** Map metres → world metres at scale 1 (400 m map ≈ 1 m model). */
export const BASE_SCALE = 0.0025;
export const SCALE_MIN = 0.6;
export const SCALE_MAX = 1.8;
const PLINTH_DEPTH = 16; // map metres below street level

export interface View {
  anchor: { x: number; y: number; z: number; yaw: number };
  modelYaw: number;
  modelScale: number;
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

const TINT_OK = [0.3, 0.75, 0.45, 0.35] as const;
const TINT_BAD = [0.85, 0.25, 0.2, 0.45] as const;
const FRAME_OK = [0.98, 0.84, 0.35, 1] as const;
const FRAME_BAD = [0.9, 0.3, 0.25, 1] as const;
const RING_TINT = [1, 0.97, 0.88, 1] as const;
const RAY_TINT = [0.98, 0.96, 0.9, 1] as const;

export class CityScene {
  readonly r: Renderer;
  readonly view: View = defaultView();
  showPanel = false;

  private staticMesh: Mesh;
  private plotsMesh: Mesh;
  private labelMesh: Mesh;
  private plotLabelMesh: Mesh;
  private labelTex: WebGLTexture;
  private labels: LabelData;
  private frameMesh: Mesh;
  private ringMesh: Mesh;
  private previews: Record<BuildingType, Mesh>;
  private tableMesh: Mesh;
  private floorMesh: Mesh;
  private rayMesh: Mesh;
  private cursorMesh: Mesh;
  private panelMesh: Mesh;
  private panelTex: WebGLTexture;
  readonly panel = new WorldPanel();
  private tooltip = new Tooltip();
  private tooltipMesh: Mesh;
  private tooltipTex: WebGLTexture;
  private banner = new Tooltip();
  private bannerTex: WebGLTexture;
  private bannerMesh: Mesh;
  private confetti: Confetti;
  private builtVersion = -1;
  private tableHeight = -1;

  // Reused matrices
  readonly anchorM = mat4();
  readonly modelM = mat4();
  readonly modelInv = mat4();
  readonly panelM = mat4();
  readonly panelInv = mat4();
  private tmp = mat4();
  private tmp2 = mat4();
  private localRay: Ray = { origin: [0, 0, 0], dir: [0, 0, 0] };
  private v3: Vec3 = [0, 0, 0];

  constructor(canvas: HTMLCanvasElement) {
    this.r = new Renderer(canvas);
    const r = this.r;
    this.staticMesh = r.litMesh(buildStaticCity().toFloat32());
    this.plotsMesh = r.litMesh(new Float32Array(0));
    this.labels = buildLabels();
    this.labelTex = r.createTexture(this.labels.canvas);
    this.labelMesh = r.texMesh(this.labels.staticData);
    this.plotLabelMesh = r.texMesh(new Float32Array(0));
    this.frameMesh = r.litMesh(plotFrame().toFloat32());
    this.ringMesh = r.litMesh(radiusRing(RULES.effectRadius).toFloat32());
    this.previews = {
      townhouse: r.litMesh(cachedBuilding('townhouse', 0).toFloat32()),
      shop: r.litMesh(cachedBuilding('shop', 0).toFloat32()),
      park: r.litMesh(cachedBuilding('park', 0).toFloat32()),
    };
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
    this.panelMesh = r.texMesh(uprightQuad(PANEL_M.w, PANEL_M.h));
    this.tooltipTex = r.createTexture(this.tooltip.canvas);
    this.tooltipMesh = r.texMesh(uprightQuad(0.3, 0.05));
    this.bannerTex = r.createTexture(this.banner.canvas);
    this.bannerMesh = r.texMesh(uprightQuad(0.6, 0.1));
    this.confetti = new Confetti(r);
    this.updateMatrices();
  }

  updateMatrices(): void {
    const v = this.view;
    const a = v.anchor;
    compose(this.anchorM, a.x, a.y, a.z, a.yaw);
    const s = BASE_SCALE * v.modelScale;
    compose(this.tmp, 0, PLINTH_DEPTH * s, 0, v.modelYaw, s);
    multiply(this.modelM, this.anchorM, this.tmp);
    invert(this.modelInv, this.modelM);
    // Panel: to the player's front-left of the table, angled toward them and tilted back like a lectern.
    compose(this.tmp, -0.74, 0.2, 0.3, 0.75, 1, -0.45);
    multiply(this.panelM, this.anchorM, this.tmp);
    invert(this.panelInv, this.panelM);
    if (a.y !== this.tableHeight) this.rebuildTable();
  }

  private rebuildTable(): void {
    const h = this.view.anchor.y;
    this.tableHeight = h;
    const b = new MeshBuilder();
    b.cylinder(0, 0, -0.035, 0, 0.66, 32, hex('#a77a55'));
    b.cylinder(0, 0, -0.05, -0.035, 0.6, 32, hex('#8c6345'));
    b.cylinder(0, 0, -h, -0.05, 0.06, 10, hex('#6f4f38'));
    b.cylinder(0, 0, -h, -h + 0.03, 0.3, 16, hex('#6f4f38'));
    this.tableMesh = this.r.litMesh(b.toFloat32(), this.tableMesh);
  }

  /** Rebuilds the dynamic building layer when the set of buildings changes. */
  sync(game: Game): void {
    if (game.buildingsVersion === this.builtVersion) return;
    this.builtVersion = game.buildingsVersion;
    this.plotsMesh = this.r.litMesh(buildPlotsLayer(game.state.buildings, game.stats).toFloat32(), this.plotsMesh);
    this.plotLabelMesh = this.r.texMesh(vacantPlotLabels(this.labels, game.state.buildings), this.plotLabelMesh);
  }

  /** Ray pick against the VR panel (when shown) and the plots. */
  raycast(ray: Ray): Hit | null {
    let best: Hit | null = null;
    if (this.showPanel) {
      const lr = rayToLocal(ray, this.panelInv, this.localRay);
      const t = rayPlaneZ(lr);
      if (t !== null) {
        const x = lr.origin[0] + lr.dir[0] * t, y = lr.origin[1] + lr.dir[1] * t;
        if (Math.abs(x) <= PANEL_M.w / 2 && Math.abs(y) <= PANEL_M.h / 2) {
          const u = x / PANEL_M.w + 0.5, v = 0.5 - y / PANEL_M.h;
          const point = transformPoint(this.panelM, [x, y, 0]);
          best = { kind: 'panel', action: this.panel.hit(u, v), point, t };
        }
      }
    }
    const lr = rayToLocal(ray, this.modelInv, this.localRay);
    const t = rayPlaneY(lr, PLOT_Y);
    if (t !== null && (!best || t < best.t)) {
      const x = lr.origin[0] + lr.dir[0] * t, z = lr.origin[2] + lr.dir[2] * t;
      if (Math.abs(x) <= 215 && Math.abs(z) <= 215) {
        const point = transformPoint(this.modelM, [x, PLOT_Y, z]);
        const p = plotAt(x, z);
        best = p ? { kind: 'plot', plotId: p.id, point, t } : { kind: 'map', point, t };
      }
    }
    return best;
  }

  celebrate(): void {
    this.confetti.start();
    this.banner.set('Objective reached!', true);
    this.r.updateTexture(this.bannerTex, this.banner.canvas);
    this.bannerUntil = performance.now() + 7000;
  }
  private bannerUntil = 0;

  render(game: Game, viewProj: Mat4, eye: Vec3, pointers: PointerVisual[], tickProgress: number, dt: number): void {
    const r = this.r;
    r.setViewProj(viewProj);
    const I = identityM;
    r.drawLit(this.floorMesh, I);
    r.drawLit(this.tableMesh, this.anchorM);
    r.drawLit(this.staticMesh, this.modelM);
    r.drawLit(this.plotsMesh, this.modelM);

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
    r.drawTex(this.plotLabelMesh, this.modelM, this.labelTex);

    // Hover feedback: frame, ghost preview, effect radius ring
    const pv = game.preview();
    if (pv) {
      multiply(this.tmp2, this.modelM, plotMatrix(pv.plot, this.tmp));
      r.drawLit(this.frameMesh, this.tmp2, { unlit: true, tint: pv.ok ? FRAME_OK : FRAME_BAD });
      if (pv.type) r.drawLit(this.previews[pv.type], this.tmp2, { tint: pv.ok ? TINT_OK : TINT_BAD, alpha: 0.6 });
      const existing = game.state.buildings[pv.plot.id];
      const ringType = pv.type ?? existing;
      if (ringType === 'shop' || ringType === 'park') {
        compose(this.tmp, pv.plot.x, 0, pv.plot.z, 0);
        multiply(this.tmp2, this.modelM, this.tmp);
        r.drawLit(this.ringMesh, this.tmp2, { unlit: true, tint: RING_TINT, alpha: 0.7 });
      }
      if (this.tooltip.set(pv.text, pv.ok)) r.updateTexture(this.tooltipTex, this.tooltip.canvas);
      this.billboard(pv.plot, 34, eye, this.tmp2);
      r.drawTex(this.tooltipMesh, this.tmp2, this.tooltipTex, 1, true);
    }

    if (this.showPanel) {
      if (this.panel.dirty) {
        this.panel.draw(game, tickProgress);
        r.updateTexture(this.panelTex, this.panel.canvas);
      }
      r.drawTex(this.panelMesh, this.panelM, this.panelTex);
    }

    if (performance.now() < this.bannerUntil) {
      transformPoint(this.anchorM, [0, 0.3, 0], this.v3);
      const yaw = Math.atan2(eye[0] - this.v3[0], eye[2] - this.v3[2]);
      compose(this.tmp2, this.v3[0], this.v3[1], this.v3[2], yaw);
      r.drawTex(this.bannerMesh, this.tmp2, this.bannerTex, 1, true);
    }
    this.confetti.render(this.anchorM, dt);
  }

  private billboard(p: PlotDef, heightMap: number, eye: Vec3, out: Mat4): void {
    transformPoint(this.modelM, [p.x, heightMap, p.z], this.v3);
    const dx = eye[0] - this.v3[0], dy = eye[1] - this.v3[1], dz = eye[2] - this.v3[2];
    const yaw = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, Math.hypot(dx, dz)); // face the viewer fully
    compose(out, this.v3[0], this.v3[1] + 0.03, this.v3[2], yaw, 1, pitch);
  }
}

const identityM = mat4();

export function defaultView(): View {
  return { anchor: { x: 0, y: 0.8, z: 0, yaw: 0 }, modelYaw: 0, modelScale: 1 };
}

export function plotAt(x: number, z: number): PlotDef | null {
  for (const p of PLOTS) {
    const h = p.size / 2 + 1;
    if (Math.abs(x - p.x) <= h && Math.abs(z - p.z) <= h) return p;
  }
  return null;
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
      this.p[o + 4] -= 0.9 * dt;
      if (this.p[o + 4] < -0.12) this.p[o + 4] = -0.12; // flutter
      this.p[o] += this.p[o + 3] * dt;
      this.p[o + 1] = Math.max(0.01, this.p[o + 1] + this.p[o + 4] * dt);
      this.p[o + 2] += this.p[o + 5] * dt;
      const x = this.p[o], y = this.p[o + 1], z = this.p[o + 2];
      const ang = this.age * 6 + i;
      const cx = Math.cos(ang) * s, cz = Math.sin(ang) * s;
      const c = this.colors[i % this.colors.length];
      const verts = [
        [x - cx, y - s * 0.5, z - cz], [x + cx, y - s * 0.5, z + cz], [x + cx, y + s * 0.5, z + cz],
        [x - cx, y - s * 0.5, z - cz], [x + cx, y + s * 0.5, z + cz], [x - cx, y + s * 0.5, z - cz],
      ];
      for (let k = 0; k < 6; k++) {
        const vo = (i * 6 + k) * 9;
        d[vo] = verts[k][0]; d[vo + 1] = verts[k][1]; d[vo + 2] = verts[k][2];
        d[vo + 3] = 0; d[vo + 4] = 1; d[vo + 5] = 0;
        d[vo + 6] = c[0]; d[vo + 7] = c[1]; d[vo + 8] = c[2];
      }
    }
    this.mesh = this.r.litMesh(this.data, this.mesh);
    this.r.drawLit(this.mesh, anchor, { unlit: true, doubleSided: true });
  }
}
