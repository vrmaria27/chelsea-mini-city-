// Decorative neighbourhood life: a capped number of stylised pedestrians walking predefined
// footpaths (on the real map: OpenStreetMap footways/sidewalks) and a few vehicles driving real
// carriageways. Purely visual: no pathfinding, collisions or traffic rules. Instanced draw calls.
import type { GameMap, LifePath } from '../map/types';
import type { GameState } from '../sim/simulation';
import { MeshBuilder, hex, rng } from '../engine/geometry';
import type { InstancedMesh, Renderer } from '../engine/renderer';
import type { Mat4 } from '../engine/math';

const MAX_PEOPLE = 24;
const PEOPLE_SCALE = 2.2; // stylised: real-size people would be ~4 mm tall on the table

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

/** A polyline with cumulative lengths for constant-speed travel. */
class Track {
  readonly cum: number[] = [0];
  readonly length: number;
  constructor(readonly path: LifePath) {
    const p = path.pts;
    for (let i = 0; i + 3 < p.length; i += 2) this.cum.push(this.cum[this.cum.length - 1] + Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]));
    this.length = this.cum[this.cum.length - 1];
  }
  /** Position and heading at distance d (clamped), with a sideways offset (left of travel when positive). */
  at(d: number, offset: number, out: [number, number, number]): void {
    const p = this.path.pts;
    d = Math.max(0, Math.min(this.length, d));
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const seg = this.cum[i] - this.cum[i - 1] || 1;
    const t = (d - this.cum[i - 1]) / seg;
    const ax = p[(i - 1) * 2], az = p[(i - 1) * 2 + 1], bx = p[i * 2], bz = p[i * 2 + 1];
    const dx = (bx - ax) / seg, dz = (bz - az) / seg;
    out[0] = ax + (bx - ax) * t + dz * offset;
    out[1] = az + (bz - az) * t - dx * offset;
    out[2] = Math.atan2(-dz, dx); // yaw that turns local +x along the direction of travel
  }
  midpoint(): [number, number] {
    const o: [number, number, number] = [0, 0, 0];
    this.at(this.length / 2, 0, o);
    return [o[0], o[1]];
  }
}

interface Mover {
  track: Track;
  d: number;
  speed: number; // signed: negative travels the path backwards
  color: [number, number, number];
  kind: 'person' | 'car' | 'bus';
  lane: number;
}

const COATS = ['#2f5a45', '#9c3d3d', '#2f4f7a', '#c08a2e', '#6b4f7a', '#e9e2d5', '#4a4a50', '#b86a4b'].map(hex);
const PAINTS = ['#2f4f7a', '#e9e2d5', '#1f1f22', '#7a8c6b', '#9c3d3d', '#c9c3b8'].map(hex);

/** Writes one instance row without allocating. */
function write(d: Float32Array, i: number, x: number, y: number, z: number, yaw: number, c: [number, number, number]): void {
  const o = i * 7;
  d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = yaw; d[o + 4] = c[0]; d[o + 5] = c[1]; d[o + 6] = c[2];
}

export class NeighbourhoodLife {
  private people: InstancedMesh;
  private cars: InstancedMesh;
  private buses: InstancedMesh;
  private walkTracks: Track[];
  private walkers: Mover[] = [];
  private vehicles: Mover[] = [];
  private pData = new Float32Array(MAX_PEOPLE * 7);
  private cData = new Float32Array(8 * 7);
  private bData = new Float32Array(2 * 7);
  private tmp: [number, number, number] = [0, 0, 0];
  private time = 0;
  private stateKey = '';

  constructor(private r: Renderer, private map: GameMap) {
    this.people = r.instancedMesh(personMesh(), MAX_PEOPLE);
    this.cars = r.instancedMesh(carMesh(), 8);
    this.buses = r.instancedMesh(busMesh(), 2);
    this.walkTracks = map.walkPaths.map((p) => new Track(p)).filter((t) => t.length > 20);
    // Vehicles on the longest drive paths; UK traffic keeps left.
    const drive = map.drivePaths.map((p) => new Track(p)).filter((t) => t.length > 60).sort((a, b) => b.length - a.length);
    const rand = rng(7);
    const kinds: Mover['kind'][] = ['bus', 'car', 'car', 'car', 'car', 'car'];
    kinds.forEach((kind, i) => {
      const track = drive[i % Math.max(1, drive.length)];
      if (!track) return;
      const dir = i % 2 ? -1 : 1;
      this.vehicles.push({ track, d: rand() * track.length, speed: dir * (kind === 'bus' ? 6 : 7 + rand() * 2), color: kind === 'bus' ? hex('#c8322b') : PAINTS[i % PAINTS.length], kind, lane: 2.2 });
    });
  }

  /** Re-plan pedestrians when the neighbourhood changes: more residents, more people, near homes and shops. */
  sync(state: GameState, residents: number): void {
    const key = `${residents}|${Object.keys(state.buildings).length}`;
    if (key === this.stateKey || !this.walkTracks.length) return;
    this.stateKey = key;
    const built = this.map.plots.filter((p) => state.buildings[p.id] && state.buildings[p.id].type !== 'park');
    // Weight each footpath by nearby homes and shops (plus a little everywhere along main routes).
    const weights = this.walkTracks.map((t) => {
      const [mx, mz] = t.midpoint();
      return 0.15 + built.filter((p) => Math.hypot(p.x - mx, p.z - mz) < 120).length;
    });
    const sum = weights.reduce((a, b) => a + b, 0);
    const total = Math.min(MAX_PEOPLE, 4 + Math.floor(residents / 6));
    const rand = rng(residents * 7 + 3);
    this.walkers = [];
    for (let k = 0; k < total; k++) {
      let x = rand() * sum, i = 0;
      while (i < weights.length - 1 && (x -= weights[i]) > 0) i++;
      const track = this.walkTracks[i];
      this.walkers.push({ track, d: rand() * track.length, speed: (1.1 + rand() * 0.6) * (rand() < 0.5 ? -1 : 1), color: COATS[Math.floor(rand() * COATS.length)], kind: 'person', lane: (rand() - 0.5) * 0.8 });
    }
  }

  update(dt: number, moving: boolean): void {
    if (moving) this.time += dt;
    const step = moving ? dt : 0;
    const o = this.tmp;
    this.walkers.forEach((w, i) => {
      w.d += w.speed * step;
      if (w.d > w.track.length || w.d < 0) { w.speed = -w.speed; w.d = Math.max(0, Math.min(w.track.length, w.d)); } // turn around at path ends
      w.track.at(w.d, w.lane, o);
      const bob = moving ? Math.abs(Math.sin(this.time * 7 + i)) * 0.25 : 0;
      write(this.pData, i, o[0], w.track.path.y + bob, o[1], o[2] + (w.speed < 0 ? Math.PI : 0), w.color);
    });
    let ci = 0, bi = 0;
    for (const v of this.vehicles) {
      v.d += v.speed * step;
      if (v.d > v.track.length) v.d -= v.track.length; // reappear at the start (map edge)
      if (v.d < 0) v.d += v.track.length;
      const fwd = v.speed >= 0;
      v.track.at(v.d, fwd ? v.lane : -v.lane, o);
      const yaw = o[2] + (fwd ? 0 : Math.PI);
      if (v.kind === 'bus') write(this.bData, bi++, o[0], v.track.path.y, o[1], yaw, v.color);
      else write(this.cData, ci++, o[0], v.track.path.y, o[1], yaw, v.color);
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
