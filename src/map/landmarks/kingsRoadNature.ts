// King's Road street trees at their OpenStreetMap positions, using the plane-tree generator with a
// per-tree size, rotation and sway phase (no two alike). Lighter than the Sloane Square trees for Quest:
// branches to depth 2 and two leaf cards per tip.
import { rng } from '../../engine/geometry';
import type { NatureBuilder } from '../../engine/nature';
import { buildBranches, buildCardFoliage, buildClumpFoliage, planeSkeleton, type TreeSpec } from './planeTree';
import { KR_PAVE, krNearest, type KrData } from './kingsRoad';

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) % 100000; };
/** Trees already drawn by the Duke of York Square model (its box, map metres). */
const inDoyBox = (x: number, z: number) => x > -60 && x < 100 && z > -30 && z < 110;

export function krTrees(d: KrData) {
  return d.trees
    .filter((t) => !inDoyBox(t.x, t.z))
    .filter((t) => { const q = krNearest(t.x, t.z); return q.s >= d.sStart && q.s <= d.sEnd + 3; })
    .map((t, i) => {
      const h = hash(t.osm), r = rng(12000 + (h % 991));
      // street planes kept clear of the carriageway and shopfronts: tall clear trunks, moderate spread
      const spec: TreeSpec = { height: 11 + r() * 5, spread: 7 + r() * 3, clearTrunk: 3.6 + r() * 1.4, trunkR: 0.26 + r() * 0.1, seed: 8100 + (h % 977) };
      return { ...t, spec, yaw: ((h % 360) * Math.PI) / 180, phase: (h % 628) / 100 + i * 0.37 };
    });
}

export function addKrNature(d: KrData, n: { branches: NatureBuilder; core: NatureBuilder; cards: NatureBuilder; lowB: NatureBuilder; lowF: NatureBuilder }): number {
  const ts = krTrees(d);
  for (const t of ts) {
    const sk = planeSkeleton(t.spec);
    const o = { x: t.x, y: KR_PAVE, z: t.z, yaw: t.yaw, phase: t.phase };
    buildBranches(n.branches, sk, o, 0, 2, (k) => (k === 0 ? 8 : k === 1 ? 5 : 4));
    buildCardFoliage(n.core, n.cards, sk, o, 2);
    buildBranches(n.lowB, sk, o, 0, 1, (k) => (k === 0 ? 6 : 4));
    buildClumpFoliage(n.lowF, sk, o, 0.2);
  }
  return ts.length;
}
