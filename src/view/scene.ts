// The one 3D scene used by both views. The neighbourhood meshes are built once; the miniature and
// street-level views differ only in the model matrix that places them (tabletop scale or 1:1), so
// changing view never duplicates or rebuilds the world.
import type { SceneMap } from '../map/types';
import { MeshBuilder, hex, type RGB } from '../engine/geometry';
import { Renderer, type Mesh } from '../engine/renderer';
import { compose, invert, mat4, multiply, transformPoint, type Mat4, type Vec3 } from '../engine/math';
import { buildAtlas, pushFlatLabel, uprightQuad } from '../engine/text';
import { drawLeafAtlas } from '../map/landmarks/leafAtlas';
import { ExplorePanel } from './panel';

/** Depth of the wooden plinth below street level (map metres) in the miniature. */
const PLINTH_DEPTH = 16;
const TILES = 4; // static mesh is split into TILES × TILES chunks for frustum culling

export interface MiniatureView {
  anchor: { x: number; y: number; z: number; yaw: number };
  yaw: number;
  scale: number;
}

export interface PointerVisual {
  matrix: Float32Array; // controller target-ray pose (world)
  length: number;
  hit: boolean;
}

export interface Marker {
  /** Map position. */
  x: number;
  z: number;
  y: number;
  ok: boolean;
  /** Facing direction (yaw 0 = north), drawn as a small arrow; null for none. */
  yaw: number | null;
}

interface Tile { mesh: Mesh; min: Vec3; max: Vec3 }

const RAY_TINT = [0.98, 0.96, 0.9, 1] as const;
const OK_TINT = [0.25, 0.7, 0.45, 1] as const;
const BAD_TINT = [0.86, 0.3, 0.25, 1] as const;
const PIN_TINT = [0.95, 0.68, 0.2, 1] as const;

export class ExplorerScene {
  readonly r: Renderer;
  readonly mini: MiniatureView = { anchor: { x: 0, y: 0.8, z: 0, yaw: 0 }, yaw: 0, scale: 1 };
  mode: 'miniature' | 'street' = 'miniature';
  showLabels = true;
  showMinorLabels = true;
  lowDetail = false;
  reducedMotion = false;
  /** VR only: draw the table and the floor disc under the miniature. */
  showFurniture = false;
  showPanel = false;

  private tiles: Tile[] = [];
  private plinthMesh: Mesh;
  private labelMesh: Mesh;
  private minorLabelMesh: Mesh;
  private labelTex: WebGLTexture;
  private decals: { tex: WebGLTexture; mesh: Mesh }[] = [];
  private nature: { branches: Mesh; core: Mesh; cards: Mesh; lowB: Mesh; lowF: Mesh; water: Mesh; leaf: WebGLTexture } | null = null;
  natureStats: Record<string, number> | null = null;
  readonly staticTriangles: number;
  private tableMesh: Mesh;
  private floorMesh: Mesh;
  private rayMesh: Mesh;
  private cursorMesh: Mesh;
  private ringMesh: Mesh;
  private arrowMesh: Mesh;
  private pinMesh: Mesh;
  private pinHeadMesh: Mesh;
  private fadeMesh: Mesh;
  readonly panel = new ExplorePanel();
  private panelMesh: Mesh;
  private panelTex: WebGLTexture;
  private tableHeight = -1;

  readonly anchorM = mat4();
  /** Map → world for the current view. */
  readonly modelM = mat4();
  readonly modelInv = mat4();
  readonly panelM = mat4();
  readonly panelInv = mat4();
  /** Metres in the world per map metre in the current view. */
  unit = 1;
  private tmp = mat4();
  private tmp2 = mat4();
  private v3: Vec3 = [0, 0, 0];
  private frustum = new Float32Array(24);
  /** Tiles drawn in the last frame (for measurements). */
  drawnTiles = 0;

  readonly baseScale: number;
  readonly worldHalf: number;

  constructor(canvas: HTMLCanvasElement, readonly map: SceneMap) {
    this.r = new Renderer(canvas);
    const r = this.r;
    this.baseScale = map.baseScale;
    this.worldHalf = map.half * map.baseScale;
    const data = map.buildStatic().toFloat32();
    this.staticTriangles = data.length / 27;
    this.tiles = splitTiles(data, map.half, TILES).map((t) => ({ mesh: r.litMesh(t.data), min: t.min, max: t.max }));
    this.plinthMesh = r.litMesh(map.buildPlinth().toFloat32());
    const defs = map.labels();
    const { canvas: lc, entries } = buildAtlas(defs.map((d) => ({ text: d.text, color: d.color, outline: d.outline, bold: d.bold })));
    const major: number[] = [], minor: number[] = [];
    defs.forEach((d, i) => pushFlatLabel(d.tier === 'minor' ? minor : major, entries[i], d.x, d.y ?? 0.7, d.z, d.size * 1.35, d.angle));
    this.labelTex = r.createTexture(lc);
    this.labelMesh = r.texMesh(new Float32Array(major));
    this.minorLabelMesh = r.texMesh(new Float32Array(minor));
    this.decals = (map.decals?.() ?? []).map((d) => ({ tex: r.createTexture(d.canvas), mesh: r.texMesh(d.data) }));
    const nat = map.nature?.();
    if (nat) {
      this.nature = {
        branches: r.natureMesh(nat.branches), core: r.natureMesh(nat.core), cards: r.natureMesh(nat.cards),
        lowB: r.natureMesh(nat.lowBranches), lowF: r.natureMesh(nat.lowFoliage), water: r.natureMesh(nat.water),
        leaf: r.createTexture(drawLeafAtlas()),
      };
      this.natureStats = nat.stats;
    }
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
    this.ringMesh = r.litMesh(ringMesh(0.55, 0.75, 32, hex('#ffffff')).toFloat32());
    const arrow = new MeshBuilder();
    const w = hex('#ffffff');
    arrow.tri([0, 0.02, -1.6], [-0.45, 0.02, -0.85], [0.45, 0.02, -0.85], w);
    this.arrowMesh = r.litMesh(arrow.toFloat32());
    const pin = new MeshBuilder();
    pin.cylinder(0, 0, 0, 1, 0.7, 6, w, false); // unit-height stem (map metres), stretched per landmark
    this.pinMesh = r.litMesh(pin.toFloat32());
    const head = new MeshBuilder();
    head.blob(0, 0, 0, 3.2, 3.2, w);
    this.pinHeadMesh = r.litMesh(head.toFloat32());
    const fade = new MeshBuilder();
    fade.box(-0.3, -0.3, -0.3, 0.3, 0.3, 0.3, hex('#1d1a17'), true);
    this.fadeMesh = r.litMesh(fade.toFloat32());
    this.panelTex = r.createTexture(this.panel.canvas);
    this.panelMesh = r.texMesh(uprightQuad(this.panel.widthM, this.panel.heightM));
    this.setMiniature();
  }

  // ---- transforms -----------------------------------------------------------------------------

  /** Miniature: the map scaled onto the table (VR) or into the desktop orbit view. */
  setMiniature(): void {
    this.mode = 'miniature';
    const v = this.mini;
    const a = v.anchor;
    compose(this.anchorM, a.x, a.y, a.z, a.yaw);
    const s = this.baseScale * v.scale;
    compose(this.tmp, 0, PLINTH_DEPTH * s, 0, v.yaw, s);
    multiply(this.modelM, this.anchorM, this.tmp);
    invert(this.modelInv, this.modelM);
    this.unit = s;
    // VR panel: a lectern on the left of the table, tilted back toward the player
    compose(this.tmp, -(this.worldHalf * v.scale + 0.32), 0.28, 0.3, 0.75, 1, -0.45);
    multiply(this.panelM, this.anchorM, this.tmp);
    invert(this.panelInv, this.panelM);
    if (a.y !== this.tableHeight) this.rebuildTable();
  }

  /**
   * Street level at 1:1. The map point (sx, sy, sz) is placed at world (ox, oy, oz) and the map is
   * rotated by `yaw` about that point. Desktop uses the identity (map space is world space).
   */
  setStreet(sx: number, sy: number, sz: number, ox: number, oy: number, oz: number, yaw: number): void {
    this.mode = 'street';
    compose(this.tmp, ox, oy, oz, yaw, 1);
    compose(this.tmp2, -sx, -sy, -sz, 0, 1);
    multiply(this.modelM, this.tmp, this.tmp2);
    invert(this.modelInv, this.modelM);
    this.unit = 1;
  }

  /** Places the VR panel at a world pose (e.g. above the left controller). */
  setPanelPose(m: ArrayLike<number>): void {
    this.panelM.set(m);
    invert(this.panelInv, this.panelM);
  }

  mapToWorld(x: number, y: number, z: number, out: Vec3 = [0, 0, 0]): Vec3 {
    return transformPoint(this.modelM, [x, y, z], out);
  }

  worldToMap(p: Vec3, out: Vec3 = [0, 0, 0]): Vec3 {
    return transformPoint(this.modelInv, p, out);
  }

  private rebuildTable(): void {
    const h = this.mini.anchor.y;
    this.tableHeight = h;
    const b = new MeshBuilder();
    const r = Math.max(0.66, this.worldHalf * 1.3);
    b.cylinder(0, 0, -0.035, 0, r, 40, hex('#a77a55'));
    b.cylinder(0, 0, -0.05, -0.035, r - 0.06, 40, hex('#8c6345'));
    b.cylinder(0, 0, -h, -0.05, 0.06, 10, hex('#6f4f38'));
    b.cylinder(0, 0, -h, -h + 0.03, 0.3, 16, hex('#6f4f38'));
    this.tableMesh = this.r.litMesh(b.toFloat32(), this.tableMesh);
  }

  // ---- drawing --------------------------------------------------------------------------------

  /**
   * Draws one view. `eye` is the eye position in world space (for level of detail);
   * `markers` are teleport / pick indicators in map space; `pin` highlights a landmark.
   */
  render(viewProj: Mat4, eye: Vec3, opts: {
    pointers?: PointerVisual[]; markers?: Marker[]; pin?: { x: number; z: number; h: number } | null; fade?: number; time: number;
  }): void {
    const r = this.r;
    r.setViewProj(viewProj);
    const mini = this.mode === 'miniature';
    if (mini && this.showFurniture) {
      r.drawLit(this.floorMesh, identityM);
      r.drawLit(this.tableMesh, this.anchorM);
    }
    if (mini) r.drawLit(this.plinthMesh, this.modelM);
    // Visibility: skip static tiles outside the view frustum (matters at street level).
    multiply(this.tmp, viewProj, this.modelM);
    frustumPlanes(this.tmp, this.frustum);
    let drawn = 0;
    for (const t of this.tiles) {
      if (!boxVisible(this.frustum, t.min, t.max)) continue;
      r.drawLit(t.mesh, this.modelM);
      drawn++;
    }
    this.drawnTiles = drawn;
    for (const d of this.decals) r.drawTex(d.mesh, this.modelM, d.tex);
    if (this.nature) {
      const n = this.nature, time = opts.time % 3600, sway = this.reducedMotion ? 0 : 1;
      // Level of detail: leaf cards only when the trees are large enough on screen to matter.
      this.worldToMap(eye, this.v3);
      const d = Math.hypot(this.v3[0] - 177, this.v3[1], this.v3[2] + 150) * this.unit;
      const cards = !this.lowDetail && (this.mode === 'street' || d < 0.55);
      if (!cards) {
        r.drawNature(n.lowB, this.modelM, { mode: 0, time, sway });
        r.drawNature(n.lowF, this.modelM, { mode: 0, time, sway });
      } else {
        r.drawNature(n.branches, this.modelM, { mode: 0, time, sway });
        r.drawNature(n.core, this.modelM, { mode: 0, time, sway });
        r.drawNature(n.cards, this.modelM, { mode: 1, time, sway, texture: n.leaf, doubleSided: true });
      }
    }
    for (const m of opts.markers ?? []) this.drawMarker(m);
    if (opts.pin && mini) {
      compose(this.tmp, opts.pin.x, 0, opts.pin.z, 0, 1);
      this.tmp[5] = opts.pin.h; // stretch the unit stem to the pin height
      multiply(this.tmp2, this.modelM, this.tmp);
      r.drawLit(this.pinMesh, this.tmp2, { unlit: true, tint: PIN_TINT });
      compose(this.tmp, opts.pin.x, opts.pin.h + 2.5, opts.pin.z, 0, 1);
      multiply(this.tmp2, this.modelM, this.tmp);
      r.drawLit(this.pinHeadMesh, this.tmp2, { unlit: true, tint: PIN_TINT });
    }
    for (const p of opts.pointers ?? []) {
      compose(this.tmp, 0, 0, 0, 0, 1);
      this.tmp[10] = p.length;
      multiply(this.tmp2, p.matrix, this.tmp);
      r.drawLit(this.rayMesh, this.tmp2, { unlit: true, tint: RAY_TINT, alpha: 0.75 });
      if (p.hit) {
        compose(this.tmp, 0, 0, -p.length, 0, 1);
        multiply(this.tmp2, p.matrix, this.tmp);
        r.drawLit(this.cursorMesh, this.tmp2, { unlit: true });
      }
    }
    // water is the only blended world layer: after the opaque geometry
    if (this.nature) r.drawNature(this.nature.water, this.modelM, { mode: 2, time: opts.time % 3600, sway: this.reducedMotion ? 0 : 1 });
    if (mini && this.showLabels) {
      r.drawTex(this.labelMesh, this.modelM, this.labelTex);
      if (this.showMinorLabels) r.drawTex(this.minorLabelMesh, this.modelM, this.labelTex);
    }
    if (this.showPanel) {
      if (this.panel.dirty) {
        this.panel.draw();
        r.updateTexture(this.panelTex, this.panel.canvas);
      }
      r.drawTex(this.panelMesh, this.panelM, this.panelTex);
    }
    if (opts.fade && opts.fade > 0.001) {
      compose(this.tmp, eye[0], eye[1], eye[2], 0, 1);
      r.drawLit(this.fadeMesh, this.tmp, { unlit: true, alpha: Math.min(1, opts.fade), doubleSided: true, overlay: true });
    }
  }

  private drawMarker(m: Marker): void {
    const s = this.mode === 'street' ? 1 : 9; // readable on the miniature
    compose(this.tmp, m.x, m.y + 0.03, m.z, 0, s);
    multiply(this.tmp2, this.modelM, this.tmp);
    const tint = m.ok ? OK_TINT : BAD_TINT;
    this.r.drawLit(this.ringMesh, this.tmp2, { unlit: true, tint, doubleSided: true });
    if (m.yaw !== null && m.ok) {
      compose(this.tmp, m.x, m.y + 0.04, m.z, m.yaw, s);
      multiply(this.tmp2, this.modelM, this.tmp);
      this.r.drawLit(this.arrowMesh, this.tmp2, { unlit: true, tint, doubleSided: true });
    }
  }
}

const identityM = mat4();

/** Flat ring in the XZ plane (local units). */
function ringMesh(r0: number, r1: number, n: number, col: RGB): MeshBuilder {
  const b = new MeshBuilder();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const p = (r: number, a: number): [number, number, number] => [Math.cos(a) * r, 0, Math.sin(a) * r];
    b.quad(p(r0, a0), p(r0, a1), p(r1, a1), p(r1, a0), col);
  }
  return b;
}

/** Splits an interleaved triangle list (9 floats per vertex) into a grid of tiles by centroid. */
export function splitTiles(data: Float32Array, half: number, n: number): { data: Float32Array; min: Vec3; max: Vec3 }[] {
  const F = 27;
  const tris = data.length / F;
  const idx = new Uint16Array(tris);
  const counts = new Uint32Array(n * n);
  const cell = (half * 2) / n;
  for (let t = 0; t < tris; t++) {
    const o = t * F;
    const cx = (data[o] + data[o + 9] + data[o + 18]) / 3, cz = (data[o + 2] + data[o + 11] + data[o + 20]) / 3;
    const i = Math.min(n - 1, Math.max(0, Math.floor((cx + half) / cell)));
    const j = Math.min(n - 1, Math.max(0, Math.floor((cz + half) / cell)));
    idx[t] = j * n + i;
    counts[j * n + i]++;
  }
  const out = Array.from(counts, (c) => ({ data: new Float32Array(c * F), min: [Infinity, Infinity, Infinity] as Vec3, max: [-Infinity, -Infinity, -Infinity] as Vec3, k: 0 }));
  for (let t = 0; t < tris; t++) {
    const tile = out[idx[t]];
    tile.data.set(data.subarray(t * F, t * F + F), tile.k * F);
    tile.k++;
    for (let v = 0; v < 3; v++) for (let a = 0; a < 3; a++) {
      const x = data[t * F + v * 9 + a];
      if (x < tile.min[a]) tile.min[a] = x;
      if (x > tile.max[a]) tile.max[a] = x;
    }
  }
  return out.filter((t) => t.k > 0).map(({ data, min, max }) => ({ data, min, max }));
}

/** Six clip planes (a, b, c, d) of a model-view-projection matrix (column-major). */
function frustumPlanes(m: Mat4, out: Float32Array): void {
  const row = (r: number, c: number) => m[c * 4 + r];
  for (let p = 0; p < 6; p++) {
    const axis = p >> 1, sign = p & 1 ? -1 : 1;
    for (let c = 0; c < 4; c++) out[p * 4 + c] = row(3, c) + sign * row(axis, c);
  }
}

function boxVisible(pl: Float32Array, min: Vec3, max: Vec3): boolean {
  for (let p = 0; p < 6; p++) {
    const a = pl[p * 4], b = pl[p * 4 + 1], c = pl[p * 4 + 2], d = pl[p * 4 + 3];
    const x = a >= 0 ? max[0] : min[0], y = b >= 0 ? max[1] : min[1], z = c >= 0 ? max[2] : min[2];
    if (a * x + b * y + c * z + d < 0) return false;
  }
  return true;
}
