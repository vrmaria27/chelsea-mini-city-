// Decorative neighbourhood life: a capped number of stylised pedestrians on predefined
// pavement loops and a few vehicles on fixed road lanes. Purely visual: no pathfinding,
// collisions or traffic rules. Two instanced draw calls (people, vehicles).
import { BLOCKS, PLOTS, type Rect } from '../map/chelsea';
import type { GameState } from '../sim/simulation';
import { MeshBuilder, hex, rng } from '../engine/geometry';
import type { InstancedMesh, Renderer } from '../engine/renderer';
import type { Mat4 } from '../engine/math';
import { PAVE_Y } from './cityModel';

const MAX_PEOPLE = 24;
const PEOPLE_SCALE = 2.2; // stylised: real-size people would be ~4 mm tall on the table
const INSET = 2.4; // pavement path distance from the kerb (houses start 3.5 m in)

const WHITE = hex('#ffffff'); // instance-coloured parts

function personMesh(): Float32Array {
  const b = new MeshBuilder();
  const s = PEOPLE_SCALE;
  b.box(-0.18 * s, 0, -0.12 * s, 0.18 * s, 0.85 * s, 0.12 * s, hex('#3b3f4a')); // legs
  b.box(-0.24 * s, 0.85 * s, -0.15 * s, 0.24 * s, 1.5 * s, 0.15 * s, WHITE); // coat
  b.blob(0, 1.68 * s, 0, 0.17 * s, 0.2 * s, hex('#e6c1a1')); // head
  return b.toFloat32();
}

function carMesh(): Float32Array {
  const b = new MeshBuilder();
  const s = 1.3;
  b.box(-2.1 * s, 0.35 * s, -0.9 * s, 2.1 * s, 1.0 * s, 0.9 * s, WHITE); // body (paint)
  b.box(-1.1 * s, 1.0 * s, -0.8 * s, 0.9 * s, 1.55 * s, 0.8 * s, hex('#3d4855')); // cabin glass
  b.box(-1.0 * s, 1.55 * s, -0.75 * s, 0.8 * s, 1.62 * s, 0.75 * s, WHITE); // roof
  for (const x of [-1.3, 1.3]) for (const z of [-0.92, 0.82]) b.box((x - 0.35) * s, 0, z * s, (x + 0.35) * s, 0.6 * s, (z + 0.1) * s, hex('#222226'));
  return b.toFloat32();
}

function busMesh(): Float32Array {
  const b = new MeshBuilder();
  b.box(-5.5, 0.4, -1.25, 5.5, 4.3, 1.25, WHITE); // body (red via instance colour)
  for (const y of [1.6, 3.2]) {
    b.box(-5.2, y, 1.26, 4.6, y + 0.9, 1.3, hex('#3d4855'));
    b.box(-5.2, y, -1.3, 4.6, y + 0.9, -1.26, hex('#3d4855'));
  }
  b.box(5.5, 1.4, -1.1, 5.55, 3.9, 1.1, hex('#3d4855')); // windscreen
  b.box(-5.5, 4.3, -1.2, 5.5, 4.45, 1.2, hex('#e9e2d5')); // roof
  for (const x of [-3.8, 3.6]) for (const z of [-1.3, 1.15]) b.box(x - 0.5, 0, z, x + 0.5, 0.9, z + 0.15, hex('#222226'));
  return b.toFloat32();
}

interface Loop {
  rect: Rect;
  perimeter: number;
  weight: number;
}

interface Walker {
  loop: number;
  t: number;
  speed: number;
  color: [number, number, number];
}

interface Vehicle {
  kind: 'car' | 'bus';
  axis: 'x' | 'z';
  fixed: number; // lane coordinate
  from: number;
  to: number;
  pos: number;
  speed: number;
  color: [number, number, number];
}

const COATS = ['#2f5a45', '#9c3d3d', '#2f4f7a', '#c08a2e', '#6b4f7a', '#e9e2d5', '#4a4a50', '#b86a4b'].map(hex);
const PAINTS = ['#2f4f7a', '#e9e2d5', '#1f1f22', '#7a8c6b', '#9c3d3d', '#c9c3b8'].map(hex);

/** Point at distance d around a rectangle's perimeter (clockwise from the north-west corner) and heading. */
function onLoop(r: Rect, d: number, out: [number, number, number]): void {
  const w = r.x1 - r.x0, h = r.z1 - r.z0;
  const p = ((d % (2 * (w + h))) + 2 * (w + h)) % (2 * (w + h));
  if (p < w) { out[0] = r.x0 + p; out[1] = r.z0; out[2] = Math.PI / 2; }
  else if (p < w + h) { out[0] = r.x1; out[1] = r.z0 + (p - w); out[2] = 0; }
  else if (p < 2 * w + h) { out[0] = r.x1 - (p - w - h); out[1] = r.z1; out[2] = -Math.PI / 2; }
  else { out[0] = r.x0; out[1] = r.z1 - (p - 2 * w - h); out[2] = Math.PI; }
}

/** Writes one instance row without allocating. */
function write(d: Float32Array, i: number, x: number, y: number, z: number, yaw: number, c: [number, number, number]): void {
  const o = i * 7;
  d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = yaw; d[o + 4] = c[0]; d[o + 5] = c[1]; d[o + 6] = c[2];
}

export class NeighbourhoodLife {
  private people: InstancedMesh;
  private cars: InstancedMesh;
  private buses: InstancedMesh;
  private loops: Loop[];
  private walkers: Walker[] = [];
  private vehicles: Vehicle[];
  private pData = new Float32Array(MAX_PEOPLE * 7);
  private cData = new Float32Array(8 * 7);
  private bData = new Float32Array(2 * 7);
  private tmp: [number, number, number] = [0, 0, 0];
  private time = 0;
  private stateKey = '';

  constructor(private r: Renderer) {
    this.people = r.instancedMesh(personMesh(), MAX_PEOPLE);
    this.cars = r.instancedMesh(carMesh(), 8);
    this.buses = r.instancedMesh(busMesh(), 2);
    this.loops = BLOCKS.map((b) => {
      const rect = { x0: b.x0 + INSET, z0: b.z0 + INSET, x1: b.x1 - INSET, z1: b.z1 - INSET };
      return { rect, perimeter: 2 * (rect.x1 - rect.x0 + rect.z1 - rect.z0), weight: 0 };
    });
    // Lanes: UK traffic keeps left. King's Road runs east-west at z = -20.
    this.vehicles = [
      { kind: 'bus', axis: 'x', fixed: -24, from: -200, to: 200, pos: -120, speed: 6.5, color: hex('#c8322b') },
      { kind: 'car', axis: 'x', fixed: -24, from: -200, to: 200, pos: 60, speed: 8, color: PAINTS[0] },
      { kind: 'car', axis: 'x', fixed: -16, from: 200, to: -200, pos: 20, speed: 8.5, color: PAINTS[1] },
      { kind: 'car', axis: 'x', fixed: -16, from: 200, to: -200, pos: -140, speed: 7.5, color: PAINTS[2] },
      { kind: 'car', axis: 'z', fixed: 173, from: -11, to: 200, pos: 80, speed: 7, color: PAINTS[3] },
      { kind: 'car', axis: 'z', fixed: 27.5, from: 200, to: -11, pos: 120, speed: 6.5, color: PAINTS[4] },
    ];
  }

  /** Re-plan pedestrians when the neighbourhood changes: more residents, more people, near homes and shops. */
  sync(state: GameState, residents: number): void {
    const key = `${residents}|${Object.keys(state.buildings).length}`;
    if (key === this.stateKey) return;
    this.stateKey = key;
    for (const l of this.loops) l.weight = 0;
    for (const p of PLOTS) {
      const b = state.buildings[p.id];
      if (!b || b.type === 'park') continue;
      const li = BLOCKS.findIndex((bl) => p.x > bl.x0 && p.x < bl.x1 && p.z > bl.z0 && p.z < bl.z1);
      if (li >= 0) this.loops[li].weight += b.type === 'shop' ? 2 : b.level;
    }
    // King's Road frontages and the squares always have a little life.
    for (const i of [2, 3, 6]) this.loops[i].weight += 1;
    const total = Math.min(MAX_PEOPLE, 4 + Math.floor(residents / 6));
    const sum = this.loops.reduce((n, l) => n + l.weight, 0);
    const rand = rng(residents * 7 + 3);
    this.walkers = [];
    // Largest-remainder allocation so exactly `total` people are placed.
    const shares = this.loops.map((l, li) => ({ li, exact: (l.weight / sum) * total }));
    const counts = shares.map((x) => Math.floor(x.exact));
    let left = total - counts.reduce((n, c) => n + c, 0);
    for (const x of [...shares].sort((a, b) => (b.exact % 1) - (a.exact % 1))) if (left-- > 0) counts[x.li]++;
    this.loops.forEach((l, li) => {
      const n = counts[li];
      for (let k = 0; k < n; k++) {
        this.walkers.push({
          loop: li,
          t: rand() * l.perimeter,
          speed: (1.1 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1),
          color: COATS[Math.floor(rand() * COATS.length)],
        });
      }
    });
  }

  update(dt: number, moving: boolean): void {
    if (moving) this.time += dt;
    const step = moving ? dt : 0;
    const o = this.tmp;
    this.walkers.forEach((w, i) => {
      w.t += w.speed * step;
      onLoop(this.loops[w.loop].rect, w.t, o);
      const bob = moving ? Math.abs(Math.sin(this.time * 7 + i)) * 0.25 : 0;
      write(this.pData, i, o[0], PAVE_Y + bob, o[1], o[2] + (w.speed < 0 ? Math.PI : 0), w.color);
    });
    let ci = 0, bi = 0;
    for (const v of this.vehicles) {
      const dir = Math.sign(v.to - v.from);
      v.pos += dir * v.speed * step;
      if ((dir > 0 && v.pos > v.to) || (dir < 0 && v.pos < v.to)) v.pos = v.from;
      const x = v.axis === 'x' ? v.pos : v.fixed, z = v.axis === 'x' ? v.fixed : v.pos;
      const yaw = v.axis === 'x' ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? -Math.PI / 2 : Math.PI / 2;
      if (v.kind === 'bus') write(this.bData, bi++, x, 0, z, yaw, v.color);
      else write(this.cData, ci++, x, 0, z, yaw, v.color);
    }
    this.r.updateInstances(this.people, this.pData, this.walkers.length);
    this.r.updateInstances(this.cars, this.cData, ci);
    this.r.updateInstances(this.buses, this.bData, bi);
  }

  draw(model: Mat4): void {
    this.r.drawInstanced(this.people, model);
    this.r.drawInstanced(this.cars, model);
    this.r.drawInstanced(this.buses, model);
  }
}
