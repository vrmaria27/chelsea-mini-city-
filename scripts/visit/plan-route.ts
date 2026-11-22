// Plans the walking route between the discovery stops over the real walkable surface (NavField):
// A* on a 1 m grid (8-connected). Pavements and squares are walkable; a carriageway may be crossed
// (as on foot, at a much higher cost so mapped crossings and short crossings are preferred), never a
// building. The path is simplified to a short polyline whose every segment is re-checked every 0.5 m.
// Writes src/visit/routePaths.json with each leg's points and the road crossings it makes.
//   npx tsx scripts/visit/plan-route.ts
import { writeFileSync } from 'node:fs';
import { OSM } from '../../src/map/osmMap';
import { NavField, type NavData } from '../../src/explore/nav';
import { STOPS } from '../../src/visit/route';

const nav = new NavField(OSM as unknown as NavData);
const G = 1;
const X0 = -320, X1 = 240, Z0 = -180, Z1 = 240;
const W = Math.round((X1 - X0) / G) + 1, H = Math.round((Z1 - Z0) / G) + 1;
const ok = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const c = nav.classify(X0 + i * G, Z0 + j * G); ok[j * W + i] = c === 'ok' ? 1 : c === 'carriageway' ? 2 : 0; }
const idx = (x: number, z: number) => Math.round((z - Z0) / G) * W + Math.round((x - X0) / G);
/** A straight segment is usable if it stays on walkable ground, or crosses one road the short way. */
const segClear = (ax: number, az: number, bx: number, bz: number) => {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
  let road = 0;
  for (let k = 0; k <= n; k++) {
    const c = nav.classify(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n);
    if (c === 'carriageway') road++;
    else if (c !== 'ok') return false;
  }
  return road * 0.5 <= 22 && (road === 0 || Math.hypot(bx - ax, bz - az) < 40);
};
function astar(a: [number, number], b: [number, number]): [number, number][] {
  const start = idx(a[0], a[1]), goal = idx(b[0], b[1]);
  const g = new Float32Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1);
  const open: number[] = [start]; g[start] = 0;
  const f = new Float32Array(W * H).fill(Infinity);
  const hx = (k: number) => Math.hypot((k % W) - (goal % W), Math.floor(k / W) - Math.floor(goal / W));
  f[start] = hx(start);
  const closed = new Uint8Array(W * H);
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    if (cur === goal) break;
    if (closed[cur]) continue; closed[cur] = 1;
    const ci = cur % W, cj = Math.floor(cur / W);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di, nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni;
      if (!ok[nk] || closed[nk]) continue;
      if (di && dj && (!ok[cj * W + ni] || !ok[nj * W + ci])) continue;
      const road = ok[nk] === 2 ? 7 : 0;
      // prefer staying a little away from kerbs and walls: cells next to blocked ones cost more
      let edge = 0; for (const [ei, ej] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!ok[(nj + ej) * W + ni + ei]) edge = 0.6;
      const ng = g[cur] + Math.hypot(di, dj) * (1 + edge + road);
      if (ng < g[nk]) { g[nk] = ng; came[nk] = cur; f[nk] = ng + hx(nk); open.push(nk); }
    }
  }
  if (came[goal] < 0) throw new Error(`no walkable path from ${a} to ${b}`);
  const path: [number, number][] = [];
  for (let k = goal; k >= 0; k = came[k]) { path.push([X0 + (k % W) * G, Z0 + Math.floor(k / W) * G]); if (k === start) break; }
  path.reverse();
  // simplify: greedily keep the furthest point still reachable in a straight, walkable line
  const out: [number, number][] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !segClear(path[i][0], path[i][1], path[j][0], path[j][1])) j--;
    out.push(path[j]); i = j;
  }
  return out.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
}
const legs = [];
for (let k = 0; k + 1 < STOPS.length; k++) {
  const a = STOPS[k].at, b = STOPS[k + 1].at;
  const pts = astar([a.x, a.z], [b.x, b.z]);
  pts[0] = [a.x, a.z]; pts[pts.length - 1] = [b.x, b.z];
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  // road crossings: segments that leave the walkable surface
  const crossings: number[] = [];
  for (let i = 1; i < pts.length; i++) { const n = Math.ceil(Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / 0.5); for (let q = 0; q <= n; q++) if (nav.classify(pts[i - 1][0] + ((pts[i][0] - pts[i - 1][0]) * q) / n, pts[i - 1][1] + ((pts[i][1] - pts[i - 1][1]) * q) / n) === 'carriageway') { crossings.push(i); break; } }
  legs.push({ from: STOPS[k].id, to: STOPS[k + 1].id, length: Math.round(len), points: pts, crossings });
  console.log(`${STOPS[k].id} → ${STOPS[k + 1].id}: ${Math.round(len)} m, ${pts.length} points, road crossings at segments ${crossings.join(', ') || 'none'}`);
}
writeFileSync('src/visit/routePaths.json', JSON.stringify({ note: 'Generated by scripts/visit/plan-route.ts from the walkable surface; checked by tests/visit.test.ts.', legs }, null, 1));
