// Geometry helpers for the offline OSM import. Plain JS, no dependencies.

export const EARTH_R = 6371008.8;

/** Local equirectangular projection around (lat0, lon0): x = east metres, z = south metres. */
export function makeProjection(lat0, lon0) {
  const k = (Math.PI / 180) * EARTH_R;
  const kx = k * Math.cos((lat0 * Math.PI) / 180);
  return {
    toXZ: (lat, lon) => [(lon - lon0) * kx, -(lat - lat0) * k],
    toLatLon: (x, z) => [lat0 - z / k, lon0 + x / kx],
  };
}

export const round1 = (v) => Math.round(v * 10) / 10;

/** Signed area in the (x, z) plane (shoelace). */
export function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return a / 2;
}

/** Liang–Barsky clip of a polyline to an axis-aligned box; returns zero or more polylines. */
export function clipPolyline(pts, box) {
  const out = [];
  let cur = [];
  const push = (p) => {
    const last = cur[cur.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) cur.push(p);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    let t0 = 0, t1 = 1, ok = true;
    for (const [p, q] of [[-dx, x0 - box.x0], [dx, box.x1 - x0], [-dz, z0 - box.z0], [dz, box.z1 - z0]]) {
      if (p === 0) { if (q < 0) { ok = false; break; } continue; }
      const r = q / p;
      if (p < 0) { if (r > t1) { ok = false; break; } if (r > t0) t0 = r; }
      else { if (r < t0) { ok = false; break; } if (r < t1) t1 = r; }
    }
    if (!ok) { if (cur.length > 1) out.push(cur); cur = []; continue; }
    const a = [x0 + t0 * dx, z0 + t0 * dz, pts[i][2]], b = [x0 + t1 * dx, z0 + t1 * dz, pts[i + 1][2]];
    if (t0 > 0) a[2] = undefined; // clipped vertex: not an OSM node
    if (t1 < 1) b[2] = undefined;
    if (cur.length && t0 > 0) { if (cur.length > 1) out.push(cur); cur = []; }
    push(a);
    push(b);
    if (t1 < 1) { if (cur.length > 1) out.push(cur); cur = []; }
  }
  if (cur.length > 1) out.push(cur);
  return out;
}

/** Sutherland–Hodgman clip of a closed ring (no repeated end point) to a box. */
export function clipRing(ring, box) {
  let poly = ring;
  const edges = [
    (p) => p[0] >= box.x0, (p) => p[0] <= box.x1, (p) => p[1] >= box.z0, (p) => p[1] <= box.z1,
  ];
  const cut = [
    (a, b) => { const t = (box.x0 - a[0]) / (b[0] - a[0]); return [box.x0, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (box.x1 - a[0]) / (b[0] - a[0]); return [box.x1, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (box.z0 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), box.z0]; },
    (a, b) => { const t = (box.z1 - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), box.z1]; },
  ];
  for (let e = 0; e < 4 && poly.length; e++) {
    const res = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[(i + poly.length - 1) % poly.length], b = poly[i];
      const ia = edges[e](a), ib = edges[e](b);
      if (ib) { if (!ia) res.push(cut[e](a, b)); res.push(b); }
      else if (ia) res.push(cut[e](a, b));
    }
    poly = res;
  }
  return poly;
}

function perpDist(p, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  if (!l2) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
}

/** Douglas–Peucker. Points whose index is in `keep` (e.g. junction nodes) are always retained. */
export function simplify(pts, tol, keep = () => false) {
  if (pts.length <= 2) return pts.slice();
  const mark = new Uint8Array(pts.length);
  mark[0] = mark[pts.length - 1] = 1;
  pts.forEach((p, i) => { if (keep(p, i)) mark[i] = 1; });
  const stack = [];
  // split at kept points
  let prev = 0;
  for (let i = 1; i < pts.length; i++) if (mark[i]) { stack.push([prev, i]); prev = i; }
  while (stack.length) {
    const [s, e] = stack.pop();
    let md = 0, mi = -1;
    for (let i = s + 1; i < e; i++) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { mark[mi] = 1; stack.push([s, mi], [mi, e]); }
  }
  return pts.filter((_, i) => mark[i]);
}

/** Closed-ring simplification that never collapses the shape (area must stay within 4%). */
export function simplifyRing(ring, tol) {
  if (ring.length <= 4) return ring;
  // split the ring at its farthest-apart pair so DP works on two open chains
  let far = 0, fd = 0;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > fd) { fd = d; far = i; }
  }
  const a = simplify(ring.slice(0, far + 1), tol);
  const b = simplify([...ring.slice(far), ring[0]], tol);
  const res = [...a.slice(0, -1), ...b.slice(0, -1)];
  const A0 = Math.abs(ringArea(ring)), A1 = Math.abs(ringArea(res));
  return res.length >= 3 && Math.abs(A1 - A0) <= 0.04 * A0 ? res : ring;
}

// ---------------------------------------------------------------------------------------------
// Ear-clipping triangulation with hole bridging (Eberly). Input rings as [[x,z],...] without
// repeated end points. Returns triangles as flat [x,z, x,z, x,z, ...] with upward winding
// (negative shoelace orientation in x/z, matching the renderer's counter-clockwise-from-above).

function area2(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointInTri(p, a, b, c) {
  const d1 = area2(p, a, b), d2 = area2(p, b, c), d3 = area2(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function bridgeHole(outer, hole) {
  // rightmost hole vertex
  let hi = 0;
  for (let i = 1; i < hole.length; i++) if (hole[i][0] > hole[hi][0]) hi = i;
  const M = hole[hi];
  let best = -1, bestX = Infinity, ix = 0;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i], b = outer[(i + 1) % outer.length];
    if ((a[1] > M[1]) === (b[1] > M[1])) continue;
    const x = a[0] + ((M[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    if (x >= M[0] && x < bestX) { bestX = x; best = a[0] > b[0] ? i : (i + 1) % outer.length; ix = x; }
  }
  if (best < 0) return null;
  // If reflex vertices lie inside triangle (M, I, P), choose the one with the smallest angle
  const I = [ix, M[1]], P = outer[best];
  let pick = best, minAng = Infinity;
  for (let i = 0; i < outer.length; i++) {
    const v = outer[i];
    if (i === best || v[0] < M[0]) continue;
    if (pointInTri(v, M, I, P) && (v[0] !== P[0] || v[1] !== P[1])) {
      const ang = Math.abs(Math.atan2(v[1] - M[1], v[0] - M[0]));
      if (ang < minAng) { minAng = ang; pick = i; }
    }
  }
  const hRot = [...hole.slice(hi), ...hole.slice(0, hi), hole[hi]];
  return [...outer.slice(0, pick + 1), ...hRot, outer[pick], ...outer.slice(pick + 1)];
}

export function triangulate(outerIn, holesIn = []) {
  // outer: positive orientation for the clipping maths; holes negative
  let outer = ringArea(outerIn) > 0 ? outerIn.slice() : outerIn.slice().reverse();
  const holes = holesIn
    .map((h) => (ringArea(h) < 0 ? h.slice() : h.slice().reverse()))
    .sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])));
  for (const h of holes) {
    const merged = bridgeHole(outer, h);
    if (merged) outer = merged;
  }
  const idx = outer.map((_, i) => i);
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = outer[i0], b = outer[i1], c = outer[i2];
      if (area2(a, b, c) <= 1e-9) continue; // reflex or degenerate
      let inside = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        const p = outer[j];
        if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue;
        if (pointInTri(p, a, b, c)) { inside = true; break; }
      }
      if (inside) continue;
      tris.push(a, b, c);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // remove a degenerate vertex to make progress
      let removed = false;
      for (let k = 0; k < idx.length; k++) {
        const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
        if (Math.abs(area2(outer[i0], outer[i1], outer[i2])) < 1e-6) { idx.splice(k, 1); removed = true; break; }
      }
      if (!removed) break;
    }
  }
  if (idx.length === 3) tris.push(outer[idx[0]], outer[idx[1]], outer[idx[2]]);
  // Emit with upward winding: renderer needs negative shoelace orientation per triangle.
  const flat = [];
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
    if (area2(a, b, c) > 0) flat.push(a[0], a[1], c[0], c[1], b[0], b[1]);
    else flat.push(a[0], a[1], b[0], b[1], c[0], c[1]);
  }
  return flat;
}

export function trisArea(flat) {
  let a = 0;
  for (let i = 0; i < flat.length; i += 6) a += Math.abs(area2([flat[i], flat[i + 1]], [flat[i + 2], flat[i + 3]], [flat[i + 4], flat[i + 5]])) / 2;
  return a;
}

// ---------------------------------------------------------------------------------------------
// Distances & intersection for plot fitting

export function segSegDist(a, b, c, d) {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.min(perpDist(a, c, d), perpDist(b, c, d), perpDist(c, a, b), perpDist(d, a, b));
}

export function segmentsIntersect(a, b, c, d) {
  const d1 = area2(c, d, a), d2 = area2(c, d, b), d3 = area2(a, b, c), d4 = area2(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function pointInPolygon(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

/** Minimum distance between a convex polygon `poly` and a polyline segment a–b (0 if overlapping). */
export function polySegDist(poly, a, b) {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return 0;
  let m = Infinity;
  for (let i = 0; i < poly.length; i++) m = Math.min(m, segSegDist(poly[i], poly[(i + 1) % poly.length], a, b));
  return m;
}

export function polygonsOverlap(p, q) {
  for (let i = 0; i < p.length; i++)
    for (let j = 0; j < q.length; j++)
      if (segmentsIntersect(p[i], p[(i + 1) % p.length], q[j], q[(j + 1) % q.length])) return true;
  return pointInPolygon(p[0], q) || pointInPolygon(q[0], p);
}

/** Simple uniform grid for bounding-box queries. */
export class Grid {
  constructor(cell = 25) { this.cell = cell; this.map = new Map(); }
  key(i, j) { return i * 100003 + j; }
  insert(item, minx, minz, maxx, maxz) {
    for (let i = Math.floor(minx / this.cell); i <= Math.floor(maxx / this.cell); i++)
      for (let j = Math.floor(minz / this.cell); j <= Math.floor(maxz / this.cell); j++) {
        const k = this.key(i, j);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(item);
      }
  }
  query(minx, minz, maxx, maxz) {
    const set = new Set();
    for (let i = Math.floor(minx / this.cell); i <= Math.floor(maxx / this.cell); i++)
      for (let j = Math.floor(minz / this.cell); j <= Math.floor(maxz / this.cell); j++)
        for (const it of this.map.get(this.key(i, j)) ?? []) set.add(it);
    return [...set];
  }
}
