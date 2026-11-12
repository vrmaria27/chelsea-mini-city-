// Street corridors for the building-by-building reconstructions (King's Road, Sloane Street, Lower Sloane
// Street). A corridor is a centreline with chainage from the Sloane Square end, a start and an end. The
// same steps run for every corridor:
//   1. replaceBuildings: footprints from the focused, newer extract replace the main extract's near the line;
//   2. detectFrontages: every building with an edge facing the line gets its own model id ('<prefix>:<id>');
//   3. fitCarriageway: the carriageway is re-centred / narrowed between the surveyed building lines where the
//      OSM centreline and default width would leave less than minPave of pavement (shift applied to road
//      vertices near the line, fading out by 23 m, so side streets stay joined);
//   4. streetData: the corridor's data for the app (line, widths, ends, trees, crossings, side-street mouths).
// "Right" is the right-hand side when travelling away from Sloane Square (north on King's Road, east on
// Sloane Street, west on Lower Sloane Street).
import { readFileSync } from 'node:fs';

/** Chains the named primary-road ways into one line, starting from the end nearest `from`. */
export function chainLine(ways, P, name, from, keep = () => true, skipWays = []) {
  const parts = ways.filter((w) => w.tags?.name === name && w.tags.highway === 'primary' && !skipWays.includes(w.id)).map((w) => w.geometry.map(P));
  const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  const ends = parts.flatMap((p) => [p[0], p[p.length - 1]]);
  const start = typeof from === 'function' ? ends.reduce((m, q) => (from(q) > from(m) ? q : m)) : ends.reduce((m, q) => (Math.hypot(q[0] - from[0], q[1] - from[1]) < Math.hypot(m[0] - from[0], m[1] - from[1]) ? q : m));
  const pool = parts.slice(); const line = [start];
  for (let grow = true; grow;) {
    grow = false;
    const end = line[line.length - 1];
    const k = pool.findIndex((w) => same(w[0], end) || same(w[w.length - 1], end));
    if (k >= 0) { let w = pool.splice(k, 1)[0]; if (!same(w[0], end)) w = w.slice().reverse(); line.push(...w.slice(1)); grow = true; }
  }
  return line.filter(keep);
}

const toPts = (r) => { const o = []; for (let i = 0; i < r.length; i += 2) o.push([r[i], r[i + 1]]); return o; };

export class Corridor {
  /**
   * def: { id, prefix, name, line, startS, endS, rawFile, buildingsFile, minPave, maxW, minW, frontD, replaceD,
   *        replaceFrom, endHalf, fitFrom, fitTo }
   */
  constructor(def) {
    Object.assign(this, { minPave: 3.0, maxW: 12, minW: 8.5, frontD: 16, replaceD: 16, replaceFrom: 30, endHalf: 24, fitFrom: -20, fitTo: null }, def);
    this.cum = [0];
    for (let i = 1; i < this.line.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(this.line[i][0] - this.line[i - 1][0], this.line[i][1] - this.line[i - 1][1]));
    this.replaced = { removed: [], added: [] };
    this.frontages = [];
    this.profile = null;
  }

  near(x, z) {
    let best = { d: Infinity, s: 0, p: [0, 0], t: [1, 0] };
    const L0 = this.line;
    for (let i = 0; i + 1 < L0.length; i++) {
      const a = L0[i], b = L0[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 1e-6) continue;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (L * L)));
      const p = [a[0] + dx * t, a[1] + dz * t], d = Math.hypot(x - p[0], z - p[1]);
      if (d < best.d) best = { d, s: this.cum[i] + t * L, p, t: [dx / L, dz / L] };
    }
    return best;
  }

  at(s) {
    const L0 = this.line;
    for (let i = 0; i + 1 < L0.length; i++) if (s <= this.cum[i + 1] || i === L0.length - 2) {
      const L = this.cum[i + 1] - this.cum[i] || 1, t = (s - this.cum[i]) / L, a = L0[i], b = L0[i + 1];
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], t: [(b[0] - a[0]) / L, (b[1] - a[1]) / L] };
    }
  }

  /** Step 1: newer footprints from the focused extract replace the main extract's near the line. */
  replaceBuildings(ways, rels, P, keep, report) {
    try {
      const kb = JSON.parse(readFileSync(this.buildingsFile, 'utf8'));
      const inCorr = (e) => {
        const g = e.geometry ?? e.members?.filter((m) => m.role === 'outer').flatMap((m) => m.geometry ?? []) ?? [];
        if (!g.length) return false;
        const pts = g.map(P);
        const c = pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length], [0, 0]);
        const q = this.near(c[0], c[1]);
        const dmin = Math.min(...pts.map((p) => this.near(p[0], p[1]).d));
        return dmin < this.replaceD && q.s > this.replaceFrom && q.s < this.endS + 25;
      };
      const isB = (e) => (e.type === 'way' || e.type === 'relation') && (e.tags?.building || e.tags?.['building:part']);
      // footprints already present with geometry (the main extract's relations carry none, so those are added)
      const has = new Set([...ways.filter((e) => e.geometry), ...rels.filter((e) => e.members?.some((m) => m.geometry))].map((e) => `${e.type[0]}${e.id}`));
      for (let i = ways.length - 1; i >= 0; i--) if (isB(ways[i]) && !keep(ways[i]) && inCorr(ways[i])) { const e = ways.splice(i, 1)[0]; has.delete(`w${e.id}`); this.replaced.removed.push(`w${e.id}`); }
      for (let i = rels.length - 1; i >= 0; i--) if (isB(rels[i]) && !keep(rels[i]) && inCorr(rels[i])) { const e = rels.splice(i, 1)[0]; has.delete(`r${e.id}`); this.replaced.removed.push(`r${e.id}`); }
      for (const e of kb.elements) {
        if (!isB(e) || keep(e) || !inCorr(e) || has.has(`${e.type[0]}${e.id}`)) continue;
        if (e.type === 'way' && e.geometry) { ways.push(e); this.replaced.added.push(`w${e.id}`); has.add(`w${e.id}`); }
        if (e.type === 'relation' && e.members?.some((m) => m.geometry)) { rels.push(e); this.replaced.added.push(`r${e.id}`); has.add(`r${e.id}`); }
      }
      this.replaced.source = `${this.buildingsFile} (retrieved ${kb.retrieved}, OSM data as of ${kb.osm_base})`;
    } catch (e) {
      report.warnings.push(`${this.name} building extract unavailable: ${e.message}`);
    }
  }

  /** Step 2: buildings with an edge facing the line (within frontD, between startS and endS). */
  detectFrontages(buildings, ringArea, round1, accept = () => true) {
    for (const bl of buildings) {
      if (bl.custom || !accept(bl)) continue;
      const r = bl.rings[0];
      const n = r.length / 2;
      const ring = []; for (let i = 0; i < n; i++) ring.push([r[i * 2], r[i * 2 + 1]]);
      const area = ringArea(ring);
      let best = null;
      for (let i = 0; i < n; i++) {
        const a = ring[i], b = ring[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 2) continue;
        // outward normal for a counter-clockwise ring (x east, z south) is (dz, -dx) when area > 0
        let nx = (b[1] - a[1]) / len, nz = -(b[0] - a[0]) / len; if (area < 0) { nx = -nx; nz = -nz; }
        const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], q = this.near(m[0], m[1]);
        const to = [(q.p[0] - m[0]) / (q.d || 1), (q.p[1] - m[1]) / (q.d || 1)];
        const maxD = (this.include ?? []).includes(bl.id) ? 40 : this.frontD;
        if (q.d < maxD && nx * to[0] + nz * to[1] > 0.6 && q.s > (this.frontFrom ?? 3) && q.s < this.endS) { if (!best || q.d < best.d) best = { d: q.d, s: q.s, len }; }
      }
      if (best) { bl.custom = `${this.prefix}:${bl.id}`; this.frontages.push({ id: bl.id, s: round1(best.s), d: round1(best.d) }); }
    }
    // shop polygons drawn inside a larger frontage building are units of that building, not buildings
    const pin = (x, z, r) => { let ins = false; for (let i = 0, j = r.length / 2 - 1; i < r.length / 2; j = i++) { const xi = r[2 * i], zi = r[2 * i + 1], xj = r[2 * j], zj = r[2 * j + 1]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
    const mine = buildings.filter((b) => this.frontages.some((f) => f.id === b.id));
    this.parts = [];
    for (const b of mine) {
      const r = b.rings[0], n = r.length / 2;
      let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += r[2 * i]; cz += r[2 * i + 1]; } cx /= n; cz /= n;
      const host = mine.find((a) => a !== b && Math.abs(ringArea(toPts(a.rings[0]))) > Math.abs(ringArea(toPts(r))) && [...Array(n).keys()].filter((i) => pin(r[2 * i] * 0.9 + cx * 0.1, r[2 * i + 1] * 0.9 + cz * 0.1, a.rings[0])).length >= n * 0.75);
      if (host) { b.custom = `part:${host.id}`; this.parts.push({ id: b.id, host: host.id }); }
    }
    this.frontages = this.frontages.filter((f) => !this.parts.some((p) => p.id === f.id));
    this.frontages.sort((a, b) => a.s - b.s);
  }

  /** Step 3: fit the carriageway between the building lines (see the module comment). */
  fitCarriageway(buildings, areas, roads, round1) {
    const { minPave, maxW, minW } = this;
    const STEP = 5, s0 = this.fitFrom, s1 = this.fitTo ?? this.endS + 60;
    const R = [], Lf = [];
    for (let s = s0; s <= s1; s += STEP) { R.push(Infinity); Lf.push(Infinity); }
    // nearest building edge on each side, sampled along every footprint edge; garden railings front the
    // road like a building line
    const frontRings = [...buildings.map((bl) => bl.rings[0]), ...areas.filter((a) => a.kind === 'green').map((a) => a.ring)];
    for (const r of frontRings) {
      for (let i = 0; i < r.length; i += 2) {
        const j = (i + 2) % r.length;
        const L = Math.hypot(r[j] - r[i], r[j + 1] - r[i + 1]), n = Math.max(1, Math.ceil(L / 1.0));
        for (let k = 0; k < n; k++) {
          const x = r[i] + ((r[j] - r[i]) * k) / n, z = r[i + 1] + ((r[j + 1] - r[i + 1]) * k) / n;
          const q = this.near(x, z);
          if (q.d > 16 || q.s < s0 || q.s > s1) continue;
          const right = q.t[0] * (z - q.p[1]) - q.t[1] * (x - q.p[0]) > 0;
          const bin = Math.round((q.s - s0) / STEP);
          if (right) R[bin] = Math.min(R[bin], q.d); else Lf[bin] = Math.min(Lf[bin], q.d);
        }
      }
    }
    const fill = (a) => {
      const idx = a.map((v, i) => (Number.isFinite(v) ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return a.map(() => 16);
      return a.map((v, i) => {
        if (Number.isFinite(v)) return v;
        const lo = idx.filter((k) => k < i).pop(), hi = idx.find((k) => k > i);
        if (lo == null) return a[hi]; if (hi == null) return a[lo];
        return a[lo] + ((a[hi] - a[lo]) * (i - lo)) / (hi - lo);
      });
    };
    const winMin = (a) => a.map((_, i) => Math.min(...[-1, 0, 1].map((k) => a[i + k] ?? Infinity)));
    const smooth = (a) => a.map((_, i) => { let s = 0, c = 0; for (let k = -1; k <= 1; k++) if (a[i + k] != null) { s += a[i + k]; c++; } return s / c; });
    const Rf = smooth(winMin(fill(R))), Lff = smooth(winMin(fill(Lf)));
    const prof = [];
    for (let i = 0; i < Rf.length; i++) {
      const s = s0 + i * STEP;
      const total = Rf[i] + Lff[i];
      const w = Math.max(minW, Math.min(maxW, total - 2 * minPave));
      let shift = (Rf[i] - Lff[i]) / 2; // + = toward the right-hand line
      const f = Math.max(0, Math.min(1, (s - s0) / 20, (s1 - s) / 40));
      shift = Math.max(-(this.maxShift ?? 3), Math.min(this.maxShift ?? 3, shift)) * f;
      prof.push({ s, shift: round1(shift), w: round1(maxW + (w - maxW) * f), R: round1(Rf[i]), L: round1(Lff[i]) });
    }
    this.profile = prof;
    const moved = (x, z) => {
      const q = this.near(x, z);
      if (q.d > 23 || q.s < prof[0].s || q.s > prof[prof.length - 1].s) return null;
      const wgt = q.d < 9 ? 1 : 1 - (q.d - 9) / 14;
      const { shift } = this.prof(q.s);
      const n = [-q.t[1], q.t[0]]; // right of the direction of travel
      return [x + n[0] * shift * wgt, z + n[1] * shift * wgt];
    };
    const newLine = this.line.map((p) => moved(p[0], p[1]) ?? p);
    for (const r of roads) {
      const isOwn = r.name === this.name;
      let touched = false;
      const wv = [];
      for (let i = 0; i < r.pts.length; i += 2) {
        const q0 = this.near(r.pts[i], r.pts[i + 1]);
        const m = moved(r.pts[i], r.pts[i + 1]);
        if (isOwn) wv.push(q0.d < 3 && q0.s >= prof[0].s && q0.s <= prof[prof.length - 1].s ? round1(this.prof(q0.s).w) : (r.wv?.[i / 2] ?? r.w));
        if (m) { r.pts[i] = round1(m[0]); r.pts[i + 1] = round1(m[1]); touched = true; }
      }
      if (isOwn && touched && wv.some((w) => w !== r.w)) r.wv = wv;
    }
    this.line.splice(0, this.line.length, ...newLine);
    for (let i = 1; i < this.line.length; i++) this.cum[i] = this.cum[i - 1] + Math.hypot(this.line[i][0] - this.line[i - 1][0], this.line[i][1] - this.line[i - 1][1]);
    return { minPavement: minPave, maxShift: Math.max(...prof.map((p) => Math.abs(p.shift))), minWidth: Math.min(...prof.map((p) => p.w)) };
  }

  prof(s) {
    const pr = this.profile;
    if (!pr) return { shift: 0, w: this.maxW };
    const P0 = pr[0], step = pr[1].s - P0.s;
    const t = Math.max(0, Math.min(pr.length - 1.0001, (s - P0.s) / step)), i = Math.floor(t), f = t - i;
    const a = pr[i], b = pr[i + 1];
    return { shift: a.shift + (b.shift - a.shift) * f, w: a.w + (b.w - a.w) * f };
  }

  /** Step 4: the corridor's data for the app. */
  streetData({ P, round1, areas, roads, square, report, exclAreaIds = [] }) {
    const r1 = (q) => [round1(q[0]), round1(q[1])];
    const endP = this.at(this.endS), hwEnd = this.endHalf;
    const nEnd = [-endP.t[1], endP.t[0]];
    const out = {
      id: this.id,
      name: this.name,
      source: `OpenStreetMap: ${this.name} centreline from the main extract`,
      line: this.line.flatMap(r1),
      sStart: this.startS,
      sEnd: this.endS,
      ...(this.paveFrom != null ? { paveFrom: this.paveFrom } : {}),
      end: [...r1([endP.p[0] - nEnd[0] * hwEnd, endP.p[1] - nEnd[1] * hwEnd]), ...r1([endP.p[0] + nEnd[0] * hwEnd, endP.p[1] + nEnd[1] * hwEnd])],
      roadW: this.maxW,
      /** Carriageway width at each centreline vertex (fitted between the building lines). */
      w: this.line.map((_, i) => round1(this.prof(this.cum[i]).w)),
      trees: [], lamps: [], bollards: [], crossings: [], postBoxes: [], mouths: [], excl: [], rails: [],
      frontages: this.frontages,
    };
    const inCorr = (p, w = 15) => { const q = this.near(p[0], p[1]); return q.d < w && q.s > this.startS - 10 && q.s < this.endS + 30; };
    try {
      const dr = JSON.parse(readFileSync(this.rawFile, 'utf8'));
      const els = dr.elements;
      const nodes = (pred) => els.filter((e) => e.type === 'node' && pred(e.tags ?? {})).map((e) => ({ osm: `node/${e.id}`, p: P(e), tags: e.tags }));
      const pt = (n, extra = {}) => ({ osm: n.osm, x: round1(n.p[0]), z: round1(n.p[1]), ...extra });
      out.source = `OpenStreetMap (${this.rawFile}, retrieved ${dr.retrieved}, OSM data as of ${dr.osm_base})`;
      out.trees = nodes((t) => t.natural === 'tree').filter((n) => inCorr(n.p, 13)).map((n) => pt(n, { genus: n.tags.genus ?? n.tags.species ?? null }));
      out.lamps = nodes((t) => t.highway === 'street_lamp').filter((n) => inCorr(n.p, 12)).map((n) => pt(n));
      out.bollards = nodes((t) => t.barrier === 'bollard').filter((n) => inCorr(n.p, 12)).map((n) => pt(n));
      out.postBoxes = nodes((t) => t.amenity === 'post_box').filter((n) => inCorr(n.p, 12)).map((n) => pt(n));
      out.crossings = nodes((t) => t.highway === 'crossing').filter((n) => inCorr(n.p, 9)).map((n) => pt(n, { kind: n.tags.crossing ?? null }));
      const railWays = els.filter((e) => e.type === 'way' && e.geometry && (this.railKinds ?? ['fence', 'railing', 'guard_rail']).includes(e.tags?.barrier)).map((e) => ({ osm: `way/${e.id}`, pts: e.geometry.map(P), tags: e.tags }));
      out.rails = railWays.filter((w) => w.pts.some((q) => inCorr(q, 14))).map((w) => ({ osm: w.osm, kind: w.tags.barrier, h: w.tags.height ? +w.tags.height : null, pts: w.pts.flatMap(r1) }));
    } catch (e) {
      report.warnings.push(`${this.name} street detail unavailable: ${e.message}`);
    }
    // areas the pavement must leave alone: plazas, the square and green spaces
    for (const a of areas) {
      const q = []; for (let i = 0; i < a.ring.length; i += 2) q.push([a.ring[i], a.ring[i + 1]]);
      if (!q.some((p) => inCorr(p, 25))) continue;
      if (a.kind === 'green' || exclAreaIds.includes(a.id)) out.excl.push(a.ring);
    }
    if (square) out.excl.push(square.ring);
    // side-street mouths along the corridor (for crossings at street level)
    for (const r of roads) {
      if (r.name === this.name || !['street', 'service'].includes(r.cls)) continue;
      const q = []; for (let i = 0; i < r.pts.length; i += 2) q.push([r.pts[i], r.pts[i + 1]]);
      const near = q.map((p) => this.near(p[0], p[1])).filter((n) => n.d < 16 && n.s > this.startS && n.s < this.endS + 5);
      if (near.length) out.mouths.push({ name: r.name ?? '', w: r.w, pts: r.pts });
    }
    return out;
  }
}
