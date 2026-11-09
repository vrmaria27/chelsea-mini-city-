// CPU-side geometry builder. Produces interleaved [pos3, normal3, color3] vertex data
// so many objects can be merged into one buffer (one draw call).
import { type Mat4, identity, mat4 } from './math';

export type RGB = [number, number, number];

const colorCache = new Map<string, RGB>();
export function hex(c: string): RGB {
  let v = colorCache.get(c);
  if (!v) {
    const n = parseInt(c.slice(1), 16);
    v = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    colorCache.set(c, v);
  }
  return v;
}

export function shade(c: RGB, f: number): RGB {
  return [Math.min(1, c[0] * f), Math.min(1, c[1] * f), Math.min(1, c[2] * f)];
}

export class MeshBuilder {
  data: number[] = [];
  private m: Mat4 = mat4();
  private hasTransform = false;

  get vertexCount(): number {
    return this.data.length / 9;
  }

  setTransform(m: Mat4 | null): this {
    if (m) {
      this.m.set(m);
      this.hasTransform = true;
    } else {
      identity(this.m);
      this.hasTransform = false;
    }
    return this;
  }

  private v(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: RGB): void {
    if (this.hasTransform) {
      const m = this.m;
      const px = m[0] * x + m[4] * y + m[8] * z + m[12];
      const py = m[1] * x + m[5] * y + m[9] * z + m[13];
      const pz = m[2] * x + m[6] * y + m[10] * z + m[14];
      let tx = m[0] * nx + m[4] * ny + m[8] * nz;
      let ty = m[1] * nx + m[5] * ny + m[9] * nz;
      let tz = m[2] * nx + m[6] * ny + m[10] * nz;
      const l = Math.hypot(tx, ty, tz) || 1;
      tx /= l; ty /= l; tz /= l;
      this.data.push(px, py, pz, tx, ty, tz, c[0], c[1], c[2]);
    } else {
      this.data.push(x, y, z, nx, ny, nz, c[0], c[1], c[2]);
    }
  }

  /** Triangle with a flat normal computed from its winding (counter-clockwise = front). */
  tri(a: number[], b: number[], c: number[], col: RGB): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    this.v(a[0], a[1], a[2], nx, ny, nz, col);
    this.v(b[0], b[1], b[2], nx, ny, nz, col);
    this.v(c[0], c[1], c[2], nx, ny, nz, col);
  }

  quad(a: number[], b: number[], c: number[], d: number[], col: RGB): void {
    this.tri(a, b, c, col);
    this.tri(a, c, d, col);
  }

  /** Axis-aligned box. Bottom face omitted by default (never seen on a tabletop). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: RGB, bottom = false): void {
    // top
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);
    // front (+z) / back (-z)
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);
    // right (+x) / left (-x)
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
  }

  /** Flat horizontal rectangle facing up. */
  flat(x0: number, z0: number, x1: number, z1: number, y: number, col: RGB): void {
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col);
  }

  /** Gable roof over a rectangle; ridge runs along x when alongX, otherwise along z. Includes gable ends. */
  gable(x0: number, z0: number, x1: number, z1: number, y: number, h: number, col: RGB, alongX = true, endCol?: RGB): void {
    const e = endCol ?? col;
    if (alongX) {
      const zm = (z0 + z1) / 2;
      this.quad([x0, y, z1], [x1, y, z1], [x1, y + h, zm], [x0, y + h, zm], col);
      this.quad([x1, y, z0], [x0, y, z0], [x0, y + h, zm], [x1, y + h, zm], col);
      this.tri([x0, y, z0], [x0, y, z1], [x0, y + h, zm], e);
      this.tri([x1, y, z1], [x1, y, z0], [x1, y + h, zm], e);
    } else {
      const xm = (x0 + x1) / 2;
      this.quad([x1, y, z1], [x1, y, z0], [xm, y + h, z0], [xm, y + h, z1], col);
      this.quad([x0, y, z0], [x0, y, z1], [xm, y + h, z1], [xm, y + h, z0], col);
      this.tri([x0, y, z1], [x1, y, z1], [xm, y + h, z1], e);
      this.tri([x1, y, z0], [x0, y, z0], [xm, y + h, z0], e);
    }
  }

  /** Low-poly vertical prism (cylinder) with n sides. */
  cylinder(cx: number, cz: number, y0: number, y1: number, r: number, n: number, col: RGB, top = true): void {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
      const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
      this.quad([x1, y0, z1], [x0, y0, z0], [x0, y1, z0], [x1, y1, z1], col);
      if (top) this.tri([cx, y1, cz], [x1, y1, z1], [x0, y1, z0], col);
    }
  }

  /** Faceted blob (stretched octahedron with a ring) used for tree canopies. */
  blob(cx: number, cy: number, cz: number, r: number, h: number, col: RGB, twist = 0): void {
    const n = 6;
    const top = [cx, cy + h, cz], bot = [cx, cy - h * 0.55, cz];
    const ring: number[][] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + twist;
      ring.push([cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r]);
    }
    const light = shade(col, 1.08), dark = shade(col, 0.82);
    for (let i = 0; i < n; i++) {
      const a = ring[i], b = ring[(i + 1) % n];
      this.tri(top, b, a, light);
      this.tri(bot, a, b, dark);
    }
  }

  append(other: MeshBuilder): void {
    for (let i = 0; i < other.data.length; i += 9) {
      const d = other.data;
      this.v(d[i], d[i + 1], d[i + 2], d[i + 3], d[i + 4], d[i + 5], [d[i + 6], d[i + 7], d[i + 8]]);
    }
  }

  toFloat32(): Float32Array {
    return new Float32Array(this.data);
  }
}

/** Small deterministic PRNG so the procedural city looks the same every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
