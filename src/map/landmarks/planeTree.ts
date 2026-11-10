// Procedural London plane trees (Platanus × hispanica) for Sloane Square.
//
// One deterministic skeleton generator (trunk, ascending limbs, branches, twigs) feeds two foliage
// treatments that were compared for Quest 3 (see docs/sloane-square.md):
//   A. clustered foliage meshes: irregular opaque clumps at the twig ends;
//   B. hybrid: the same skeleton with alpha-tested leaf cards over a few dark opaque core clumps.
// All sizes are metres in map space. Pure geometry (no DOM), so it can be tested in Node.
import { rng, type RGB } from '../../engine/geometry';
import { NatureBuilder, norm, type V3 } from '../../engine/nature';

export interface TreeSpec {
  /** Total height (m). */
  height: number;
  /** Crown spread (m). */
  spread: number;
  /** Height of the first main fork (m): London planes in the square are crown-lifted. */
  clearTrunk: number;
  /** Trunk radius at the base (m). */
  trunkR: number;
  seed: number;
}

export interface Segment { a: V3; b: V3; ra: number; rb: number; depth: number }
export interface Tip { p: V3; dir: V3; depth: number }
export interface Skeleton { segments: Segment[]; tips: Tip[]; crownC: V3; crownR: [number, number] }

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Rotate direction d away from itself by angle `tilt` toward azimuth `az` (around d). */
function deviate(d: V3, tilt: number, az: number): V3 {
  const ref: V3 = Math.abs(d[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const u = norm([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  const w: V3 = [d[1] * u[2] - d[2] * u[1], d[2] * u[0] - d[0] * u[2], d[0] * u[1] - d[1] * u[0]];
  const s = Math.sin(tilt), c = Math.cos(tilt);
  return norm([d[0] * c + (u[0] * Math.cos(az) + w[0] * Math.sin(az)) * s, d[1] * c + (u[1] * Math.cos(az) + w[1] * Math.sin(az)) * s, d[2] * c + (u[2] * Math.cos(az) + w[2] * Math.sin(az)) * s]);
}

/** Deterministic branching skeleton for one tree. */
export function planeSkeleton(spec: TreeSpec): Skeleton {
  const r = rng(spec.seed);
  const segments: Segment[] = [];
  const tips: Tip[] = [];
  const crownH = spec.height - spec.clearTrunk;
  const crownC: V3 = [0, spec.clearTrunk + crownH * 0.56, 0];
  const crownR: [number, number] = [spec.spread / 2, crownH * 0.5];
  // Trunk: two gently curving segments with a slight lean
  const lean: V3 = [(r() - 0.5) * 0.12, 1, (r() - 0.5) * 0.12];
  const mid: V3 = add([0, 0, 0], scale(norm(lean), spec.clearTrunk * 0.55));
  const fork: V3 = add(mid, scale(norm([lean[0] * 1.6, 1, lean[2] * 1.6]), spec.clearTrunk * 0.45));
  segments.push({ a: [0, 0, 0], b: mid, ra: spec.trunkR * 1.12, rb: spec.trunkR * 0.95, depth: 0 });
  segments.push({ a: mid, b: fork, ra: spec.trunkR * 0.95, rb: spec.trunkR * 0.85, depth: 0 });
  // Distance outside the crown ellipsoid (>1 = outside)
  const outside = (p: V3) => Math.hypot((p[0] - crownC[0]) / crownR[0], (p[1] - crownC[1]) / crownR[1], (p[2] - crownC[2]) / crownR[0]);
  const MAX = 4;
  let lobe = 1; // per-limb envelope scale: makes the crown outline lobed rather than egg-shaped
  function grow(p: V3, d: V3, length: number, radius: number, depth: number): void {
    // two sub-segments with gravitropism (tips turn upward and outward a little)
    let q = p, dir = d;
    for (let k = 0; k < 2; k++) {
      const out = norm([q[0] - crownC[0], 0.0001, q[2] - crownC[2]]);
      dir = norm(add(scale(dir, 1), add(scale([0, 1, 0], 0.1 + r() * 0.06), scale(out, 0.1))));
      dir = deviate(dir, (r() - 0.5) * 0.25, r() * Math.PI * 2);
      let nq = add(q, scale(dir, length / 2));
      // keep inside the crown envelope: pull back toward the centre when poking out
      const o = outside(nq);
      if (o > lobe) nq = add(crownC, scale([nq[0] - crownC[0], nq[1] - crownC[1], nq[2] - crownC[2]], lobe / o));
      const r0 = k === 0 ? radius : radius * 0.86, r1 = k === 0 ? radius * 0.86 : radius * 0.72;
      segments.push({ a: q, b: nq, ra: r0, rb: r1, depth });
      q = nq;
    }
    if (depth >= MAX || radius < 0.03) { tips.push({ p: q, dir, depth }); return; }
    const n = depth <= 2 ? 3 : 2 + (r() < 0.35 ? 1 : 0);
    const az0 = r() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const tilt = 0.4 + r() * 0.4;
      const nd = deviate(dir, tilt, az0 + (i / n) * Math.PI * 2 + (r() - 0.5) * 0.6);
      grow(q, nd, length * (0.7 + r() * 0.14), radius * 0.72 / Math.sqrt(n / 2), depth + 1);
    }
    if (depth >= 2) tips.push({ p: q, dir, depth }); // leaves along the outer branches too
    if (depth >= 2) tips.push({ p: add(p, scale(add(q, scale(p, -1)), 0.5)), dir, depth });
  }
  // central leader: an upright limb that fills the top of the crown (no hollow centre from above)
  lobe = 1;
  grow(fork, deviate([0, 1, 0], 0.08 + r() * 0.1, r() * Math.PI * 2), crownH * 0.42, spec.trunkR * 0.5, 2);
  const limbs = 3 + Math.floor(r() * 2);
  const az0 = r() * Math.PI * 2;
  const L1 = crownH * (0.36 + r() * 0.06);
  for (let i = 0; i < limbs; i++) {
    const az = az0 + (i / limbs) * Math.PI * 2 + (r() - 0.5) * 0.7;
    const tilt = 0.32 + r() * 0.26; // ascending limbs, 18–33° from vertical
    const d = deviate([0, 1, 0], tilt, az);
    const len1 = L1 * (0.8 + r() * 0.4);
    lobe = 0.86 + r() * 0.3;
    grow(fork, d, len1, spec.trunkR * 0.62, 1);
    // lateral branches from the lower limb arch outward and fill the lower crown
    const laterals = 1 + (r() < 0.6 ? 1 : 0);
    for (let k = 0; k < laterals; k++) {
      const at = add(fork, scale(d, len1 * (0.3 + r() * 0.25)));
      const ld = deviate([0, 1, 0], 1.0 + r() * 0.3, az + (r() - 0.5) * 1.0);
      grow(at, ld, L1 * (0.5 + r() * 0.15), spec.trunkR * 0.26, 2);
    }
  }
  // Fill the crown cap around the axis, which the splaying limbs leave hollow when seen from above.
  for (let k = 0; k < 12; k++) {
    const a = r() * Math.PI * 2, rr = Math.sqrt(r()) * crownR[0] * 0.55;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    const cap = Math.sqrt(Math.max(0, 1 - (rr / crownR[0]) ** 2));
    const y = crownC[1] + crownR[1] * (0.45 + 0.45 * cap * r());
    tips.push({ p: [crownC[0] + x, y, crownC[2] + z], dir: [0, 1, 0], depth: 4 });
  }
  return { segments, tips, crownC, crownR };
}

// ---- colours ------------------------------------------------------------------------------------
const hexc = (h: string): RGB => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
/** Plane bark: flaking patches of olive-grey, cream and brown (observed in the reference photos). */
const BARK = ['#6a6853', '#8d886e', '#56523f', '#7a755d', '#a39c7f'].map(hexc);
// Mid-summer plane foliage as seen in the references: mid green, lighter where sunlit.
const LEAF_TOP = ['#6f9143', '#79994a', '#66883d', '#80a050'].map(hexc);
const LEAF_BOTTOM = ['#3a5628', '#405c2b', '#344f24', '#45612e'].map(hexc);
const mix3 = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

export interface TreeBuildOptions {
  /** Map position of the trunk base. */
  x: number;
  y: number;
  z: number;
  /** Rotation about the vertical (radians). */
  yaw: number;
  /** Sway phase (radians); differs per tree. */
  phase: number;
}

function place(o: TreeBuildOptions): (p: V3) => V3 {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return (p) => [o.x + p[0] * c + p[2] * s, o.y + p[1], o.z - p[0] * s + p[2] * c];
}
function rot(o: TreeBuildOptions): (d: V3) => V3 {
  const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
  return (d) => [d[0] * c + d[2] * s, d[1], -d[0] * s + d[2] * c];
}

/** Trunk and branches (shared by both approaches). Sway weight grows with branch order. */
export function buildBranches(b: NatureBuilder, sk: Skeleton, o: TreeBuildOptions, minDepth = 0, maxDepth = 9, sidesFor = (d: number) => (d === 0 ? 8 : d === 1 ? 6 : d === 2 ? 5 : 4)): void {
  const P = place(o);
  const r = rng(Math.floor(o.phase * 1000) + 7);
  // Bark: flaking patches as a function of height and angle, so adjoining segments match (no bands).
  const off = r() * 100;
  const barkAt = (y: number, k: number, sides: number) => {
    const t = Math.sin(y * 1.7 + off + k * 2.1) + Math.sin(y * 0.6 - off * 0.5 + (k / sides) * 9.4) * 0.8;
    const i = Math.floor(((t + 1.8) / 3.6) * BARK.length);
    return BARK[Math.max(0, Math.min(BARK.length - 1, i))];
  };
  for (const s of sk.segments) {
    if (s.depth < minDepth || s.depth > maxDepth) continue;
    const sides = sidesFor(s.depth);
    const sw = (d: number) => (d <= 1 ? 0 : Math.min(1, (d - 1) * 0.3));
    b.tube(P(s.a), P(s.b), s.ra, s.rb, sides, (i, end) => barkAt(end ? s.b[1] : s.a[1], i % sides, sides), sw(s.depth), sw(s.depth + 1), o.phase, s.depth >= 3);
  }
}

/** Approach A: irregular opaque foliage clumps at the twig ends. */
export function buildClumpFoliage(b: NatureBuilder, sk: Skeleton, o: TreeBuildOptions, density = 1): void {
  const P = place(o);
  const r = rng(Math.floor(o.phase * 1000) + 11);
  const C = P(sk.crownC);
  const k = Math.max(1, Math.round(1 / density));
  sk.tips.forEach((t, i) => {
    if (i % k) return;
    const inner = Math.hypot((t.p[0] - sk.crownC[0]) / sk.crownR[0], (t.p[1] - sk.crownC[1]) / sk.crownR[1], (t.p[2] - sk.crownC[2]) / sk.crownR[0]);
    const ao = 0.72 + 0.28 * Math.min(1, inner); // inner foliage is shaded
    const ci = (i + Math.floor(o.phase * 3)) % 4;
    const top = mul(LEAF_TOP[ci], ao), bot = mul(LEAF_BOTTOM[ci], ao);
    const rad = (t.depth >= 4 ? 1.15 : 1.35) * (0.85 + r() * 0.35) / Math.sqrt(density);
    b.clump(P(t.p), rad, 0.72, C, top, bot, r, 0.55 + 0.45 * Math.min(1, inner), o.phase);
  });
}

/** Approach B: alpha-tested leaf cards over a few dark opaque core clumps that hide see-through gaps. */
export function buildCardFoliage(core: NatureBuilder, cards: NatureBuilder, sk: Skeleton, o: TreeBuildOptions, cardsPerTip = 3): void {
  const P = place(o), R = rot(o);
  const r = rng(Math.floor(o.phase * 1000) + 13);
  const C = P(sk.crownC);
  // core: dark opaque clumps around the depth-2 branch ends, inset from the card shell
  sk.segments.filter((s) => s.depth === 2 && s.b[1] > sk.crownC[1] - sk.crownR[1] * 0.2).forEach((s, i) => {
    if (i % 2) return;
    const q: V3 = [lerp(s.b[0], sk.crownC[0], 0.5), lerp(s.b[1], sk.crownC[1], 0.5), lerp(s.b[2], sk.crownC[2], 0.5)];
    core.clump(P(q), 0.95, 0.8, C, mul(LEAF_TOP[i % 4], 0.85), mul(LEAF_BOTTOM[i % 4], 1.0), r, 0.3, o.phase);
  });
  for (const t of sk.tips) {
    const inner = Math.hypot((t.p[0] - sk.crownC[0]) / sk.crownR[0], (t.p[1] - sk.crownC[1]) / sk.crownR[1], (t.p[2] - sk.crownC[2]) / sk.crownR[0]);
    const ao = 0.75 + 0.25 * Math.min(1, inner);
    for (let k = 0; k < cardsPerTip; k++) {
      const off: V3 = [(r() - 0.5) * 1.4, (r() - 0.3) * 1.0, (r() - 0.5) * 1.4];
      const c = add(t.p, off);
      const out = norm([c[0] - sk.crownC[0], (c[1] - sk.crownC[1]) * 0.7 + 0.25, c[2] - sk.crownC[2]]);
      // card plane: roughly facing outward, with random roll; ~1.7 m across
      const roll = r() * Math.PI * 2;
      const face = deviate(out, 0.5 + r() * 0.6, roll);
      const ref: V3 = Math.abs(face[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const ax = norm([face[1] * ref[2] - face[2] * ref[1], face[2] * ref[0] - face[0] * ref[2], face[0] * ref[1] - face[1] * ref[0]]);
      const ay: V3 = [face[1] * ax[2] - face[2] * ax[1], face[2] * ax[0] - face[0] * ax[2], face[0] * ax[1] - face[1] * ax[0]];
      const h = 0.75 + r() * 0.25;
      const cell = Math.floor(r() * 4);
      const uv: [number, number, number, number] = [(cell % 2) * 0.5, Math.floor(cell / 2) * 0.5, (cell % 2) * 0.5 + 0.5, Math.floor(cell / 2) * 0.5 + 0.5];
      const tint = mix3([1.18, 1.18, 1.1], [1.02, 1.12, 0.95], r());
      cards.card(P(c), scale(R(ax), h), scale(R(ay), h), uv, R(out), mul(tint, ao), 0.6 + 0.4 * Math.min(1, inner), o.phase);
    }
  }
}

/** Variant specs: visually matched to the square's mature planes (heights and spreads estimated). */
export function squareTreeSpec(i: number, seedBase = 4150): TreeSpec {
  const r = rng(seedBase + i * 97);
  return {
    height: 18 + r() * 6,
    spread: 11 + r() * 5,
    clearTrunk: 4.2 + r() * 2.6,
    trunkR: 0.4 + r() * 0.12,
    seed: seedBase + i * 31,
  };
}
