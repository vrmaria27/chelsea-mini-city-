// CPU-side builder for the nature shader: interleaved [pos3, normal3, colour3, u, v, sway, phase].
import type { RGB } from './geometry';

export type V3 = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// Icosahedron (12 vertices, 20 faces) used for foliage clumps.
const T = (1 + Math.sqrt(5)) / 2;
const ICO_V: V3[] = ([[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]] as V3[]).map(norm);
const ICO_F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

export class NatureBuilder {
  data: number[] = [];

  get vertexCount(): number {
    return this.data.length / 13;
  }

  vert(p: V3, n: V3, c: RGB, u = 0, v = 0, sway = 0, phase = 0): void {
    this.data.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], u, v, sway, phase);
  }

  /** Flat-shaded triangle (normal from the counter-clockwise winding). */
  tri(a: V3, b: V3, c: V3, col: RGB, sway = 0, phase = 0): void {
    const n = norm(cross(sub(b, a), sub(c, a)));
    this.vert(a, n, col, 0, 0, sway, phase);
    this.vert(b, n, col, 0, 0, sway, phase);
    this.vert(c, n, col, 0, 0, sway, phase);
  }

  /**
   * Tapered tube from a to b with smooth normals. colAt(i, end) lets callers mottle bark per vertex.
   * swayA/swayB are the sway weights at each end (0 for the trunk).
   */
  tube(a: V3, b: V3, ra: number, rb: number, sides: number, colAt: (i: number, end: 0 | 1) => RGB, swayA = 0, swayB = 0, phase = 0, cap = false): void {
    const axis = norm(sub(b, a));
    const ref: V3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(axis, ref)), w = cross(axis, u);
    const ring = (c: V3, r: number, k: number): { p: V3; n: V3 } => {
      const t = (k / sides) * Math.PI * 2, cs = Math.cos(t), sn = Math.sin(t);
      const n: V3 = [u[0] * cs + w[0] * sn, u[1] * cs + w[1] * sn, u[2] * cs + w[2] * sn];
      return { p: [c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r], n };
    };
    for (let k = 0; k < sides; k++) {
      const a0 = ring(a, ra, k), a1 = ring(a, ra, k + 1), b0 = ring(b, rb, k), b1 = ring(b, rb, k + 1);
      const ca0 = colAt(k, 0), ca1 = colAt(k + 1, 0), cb0 = colAt(k, 1), cb1 = colAt(k + 1, 1);
      this.vert(a0.p, a0.n, ca0, 0, 0, swayA, phase); this.vert(b1.p, b1.n, cb1, 0, 0, swayB, phase); this.vert(b0.p, b0.n, cb0, 0, 0, swayB, phase);
      this.vert(a0.p, a0.n, ca0, 0, 0, swayA, phase); this.vert(a1.p, a1.n, ca1, 0, 0, swayA, phase); this.vert(b1.p, b1.n, cb1, 0, 0, swayB, phase);
      if (cap) this.vert(b, axis, cb0, 0, 0, swayB, phase), this.vert(b0.p, axis, cb0, 0, 0, swayB, phase), this.vert(b1.p, axis, cb1, 0, 0, swayB, phase);
    }
  }

  /**
   * Irregular foliage clump: a perturbed icosahedron. Normals blend the clump's own radial direction
   * with the crown's (crownC) so many clumps light as one soft canopy rather than as separate balls.
   */
  clump(c: V3, r: number, squash: number, crownC: V3, colTop: RGB, colBottom: RGB, rnd: () => number, sway: number, phase: number): void {
    const pts = ICO_V.map((d) => {
      const k = r * (0.72 + rnd() * 0.5);
      return [c[0] + d[0] * k, c[1] + d[1] * k * squash, c[2] + d[2] * k] as V3;
    });
    const nrm = ICO_V.map((d, i) => {
      const cr = norm(sub(pts[i], crownC));
      return norm([d[0] * 0.3 + cr[0] * 0.7, d[1] * 0.3 + cr[1] * 0.7 + 0.1, d[2] * 0.3 + cr[2] * 0.7]);
    });
    const col = ICO_V.map((d) => {
      const t = d[1] * 0.5 + 0.5;
      return [colBottom[0] + (colTop[0] - colBottom[0]) * t, colBottom[1] + (colTop[1] - colBottom[1]) * t, colBottom[2] + (colTop[2] - colBottom[2]) * t] as RGB;
    });
    for (const [i, j, k] of ICO_F) {
      this.vert(pts[i], nrm[i], col[i], 0, 0, sway, phase);
      this.vert(pts[j], nrm[j], col[j], 0, 0, sway, phase);
      this.vert(pts[k], nrm[k], col[k], 0, 0, sway, phase);
    }
  }

  /**
   * Leaf card: a quad centred at c spanning axes ax/ay (half extents included), textured from the atlas
   * rectangle uv = [u0, v0, u1, v1]. The normal n is the crown's outward direction (soft volume lighting).
   */
  card(c: V3, ax: V3, ay: V3, uv: [number, number, number, number], n: V3, col: RGB, sway: number, phase: number): void {
    const p = (sx: number, sy: number): V3 => [c[0] + ax[0] * sx + ay[0] * sy, c[1] + ax[1] * sx + ay[1] * sy, c[2] + ax[2] * sx + ay[2] * sy];
    const [u0, v0, u1, v1] = uv;
    const A = p(-1, -1), B = p(1, -1), C = p(1, 1), D = p(-1, 1);
    // lower edge sways a little less than the tip, so the card bends rather than slides
    this.vert(A, n, col, u0, v1, sway * 0.8, phase); this.vert(B, n, col, u1, v1, sway * 0.8, phase); this.vert(C, n, col, u1, v0, sway, phase);
    this.vert(A, n, col, u0, v1, sway * 0.8, phase); this.vert(C, n, col, u1, v0, sway, phase); this.vert(D, n, col, u0, v0, sway, phase);
  }

  /** Flat horizontal polygon (triangle list in x,z pairs) at height y, for water surfaces. */
  flatTris(tris: number[], y: number, col: RGB): void {
    for (let i = 0; i < tris.length; i += 6) {
      const a: V3 = [tris[i], y, tris[i + 1]], b: V3 = [tris[i + 2], y, tris[i + 3]], c: V3 = [tris[i + 4], y, tris[i + 5]];
      const ccw = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]) < 0;
      const up: V3 = [0, 1, 0];
      if (ccw) { this.vert(a, up, col, a[0], a[2]); this.vert(b, up, col, b[0], b[2]); this.vert(c, up, col, c[0], c[2]); }
      else { this.vert(a, up, col, a[0], a[2]); this.vert(c, up, col, c[0], c[2]); this.vert(b, up, col, b[0], b[2]); }
    }
  }

  append(o: NatureBuilder): void {
    for (let i = 0; i < o.data.length; i++) this.data.push(o.data[i]);
  }

  toFloat32(): Float32Array {
    return new Float32Array(this.data);
  }
}
