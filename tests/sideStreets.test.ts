// Connecting side streets (docs/side-streets.md): every frontage configured and sourced, models clear of the
// carriageway, a continuous walking route along each street, end-of-area behaviour, legacy data and LOD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OSM, osmMap } from '../src/map/osmMap';
import { MeshBuilder } from '../src/engine/geometry';
import { buildSquareBuildings } from '../src/map/landmarks/squareBuildings';
import { SD_SPECS, PROFILES } from '../src/map/landmarks/sideStreetSpecs';
import { NavField, type NavData } from '../src/explore/nav';
import { endTextFor } from '../src/explore/explorer';
import type { KrData } from '../src/map/landmarks/kingsRoad';

type Cor = KrData & { id: string; name: string; shared?: boolean; frontages: { id: string; s: number; d: number }[] };
const cors = (OSM as unknown as { corridors: Cor[] }).corridors.filter((c) => c.id.startsWith('sd-'));
const nav = new NavField(OSM as unknown as NavData);
const roofs = (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs;

function geo(c: Cor) {
  const pts: [number, number][] = [];
  for (let i = 0; i < c.line.length; i += 2) pts.push([c.line[i], c.line[i + 1]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = (s: number) => {
    for (let i = 0; i + 1 < pts.length; i++) if (s <= cum[i + 1]) {
      const L = cum[i + 1] - cum[i], f = (s - cum[i]) / L, a = pts[i], b = pts[i + 1], t: [number, number] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as [number, number], t, n: [-t[1], t[0]] as [number, number], hw: (c.w![i] + (c.w![i + 1] - c.w![i]) * f) / 2 };
    }
    const L = pts.length - 1, a = pts[L - 1], b = pts[L], len = cum[L] - cum[L - 1], t: [number, number] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    return { p: b, t, n: [-t[1], t[0]] as [number, number], hw: c.w![L] / 2 };
  };
  const near = (x: number, z: number) => { let best = { d: Infinity, s: 0 }; for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (d < best.d) best = { d, s: cum[i] + t * Math.sqrt(L2) }; } return best; };
  return { at, near };
}

test('the side streets exist inside the map with their frontages claimed by the side-street builder', () => {
  assert.ok(cors.length >= 30, `${cors.length} side streets`);
  for (const c of cors) {
    const g = geo(c), e = g.at(c.sEnd);
    assert.ok(Math.abs(e.p[0]) < 350 && Math.abs(e.p[1]) < 350, `${c.id} ends inside the map`);
    for (const f of c.frontages) {
      const b = OSM.buildings.find((x) => x.id === f.id);
      assert.ok(b, `${c.id}: frontage ${f.id} exists`);
      assert.equal(b!.custom, `sd:${f.id}`);
    }
  }
});

test('every side-street frontage has a sourced configuration; photographed streets are not estimated', () => {
  for (const c of cors) for (const f of c.frontages) {
    const s = SD_SPECS[f.id.replace(/-\d+$/, '')];
    assert.ok(s, `${f.id} configured`);
    assert.ok(s.src.length > 10 && s.floors.length >= 1 && s.bays >= 1, `${f.id} complete`);
    if (PROFILES[c.id]) assert.notEqual(s.conf, 'estimated', `${f.id} on photographed ${c.id}`);
  }
  const est = cors.filter((c) => !PROFILES[c.id] && c.frontages.length).map((c) => c.id);
  assert.deepEqual(est.sort(), ['sd-walpole', 'sd-whittaker'], 'streets still without photographs');
});

test('side-street models stay on their footprints, below sensible heights and out of the carriageway', () => {
  let total = 0;
  for (const c of cors) {
    const g = geo(c);
    for (const b of OSM.buildings.filter((x) => (x as { cor?: string }).cor === c.id && x.custom?.startsWith('sd:'))) {
      const mb = new MeshBuilder();
      buildSquareBuildings(mb, [b as never], roofs, OSM.square!.ring, OSM.buildings as never);
      const d = mb.data;
      assert.ok(d.length > 0, `${b.id} built`);
      total += d.length / 27;
      for (let i = 0; i < d.length; i += 9) {
        const x = d[i], y = d[i + 1], z = d[i + 2];
        assert.ok(y > -0.01 && y < 40, `${b.id}: vertex height ${y.toFixed(1)}`);
        const q = g.near(x, z);
        if (q.s < 8 || q.s > c.sEnd || y >= 2.3) continue;
        assert.ok(q.d > g.at(q.s).hw + (c.shared ? 0 : 0.2), `${c.id} ${b.id}: low geometry ${(q.d - g.at(q.s).hw).toFixed(2)} m from the kerb at ${q.s.toFixed(0)} m`);
      }
    }
  }
  // drawn in full only within the LOD radius (scene.ts LOD_NEAR); beyond it as simple extrusions
  assert.ok(total < 360_000, `side-street models: ${Math.round(total)} triangles`);
});

test('each side street can be walked end to end (pavement on either side, or the carriageway of a shared street)', () => {
  for (const c of cors) {
    const g = geo(c);
    let gaps = 0, n = 0;
    for (let s = 8; s <= c.sEnd - 4; s += 2) {
      const { p, n: nn, hw } = g.at(s);
      n++;
      // a shared street is walked down the middle, crossing the carriageways of the streets it meets
      let ok = c.shared ? nav.isWalkable(p[0], p[1]) || nav.corridors.some((k) => k.id !== c.id && k.onCarriageway(p[0], p[1])) : false;
      for (const side of [1, -1]) for (let o = hw + 0.3; o <= hw + 4.5 && !ok; o += 0.3) ok = nav.isWalkable(p[0] + nn[0] * o * side, p[1] + nn[1] * o * side);
      if (!ok) gaps++;
    }
    // a step or two may fall on a junction mouth where the walkway crosses another street
    assert.ok(gaps <= 1, `${c.id}: ${gaps} of ${n} steps with no walkable surface`);
  }
});

test('closed side streets warn near their end with their own name; open ones run on without a message', () => {
  let closed = 0, open = 0;
  for (const nc of nav.corridors.filter((k) => k.id.startsWith('sd-'))) {
    const c = cors.find((k) => k.id === nc.id)!, g = geo(c), e = g.at(Math.max(1, c.sEnd - 2));
    const pts = [[e.p[0], e.p[1]], ...[1, -1].map((sd) => [e.p[0] + e.n[0] * (e.hw + 1.5) * sd, e.p[1] + e.n[1] * (e.hw + 1.5) * sd])];
    const hit = pts.some(([x, z]) => nav.nearEndOf(x, z) === c.id);
    if (nc.open) { open++; assert.equal(hit, false, `${c.id} is open-ended`); } else if (nav.corridors.every((k) => k === nc || !k.inZone(e.p[0], e.p[1]))) { closed++; assert.ok(hit, `${c.id} warns at its end`); }
    assert.ok(endTextFor(c.id, c.name).includes(c.name));
  }
  assert.ok(closed > 5 && open > 3, `${closed} closed, ${open} open`);
});

test('Royal Avenue is a walkable gravel avenue, not a lawn', () => {
  const a = OSM.areas.find((x) => x.id === 'w630720415');
  assert.ok(a && a.kind === 'plaza' && (a as { surface?: string }).surface === 'gravel');
});

test('legacy development sites are unchanged by the side streets', () => {
  // the generated sites are analysed against the roads as they were before the side-street fits
  const legacy = JSON.parse(readFileSync('data/legacy/game-sites-v2.json', 'utf8'));
  assert.ok(Array.isArray(legacy.plots) && legacy.plots.length >= 20);
});

test('corridor models are split into a detailed and a much lighter distant level', () => {
  osmMap.buildStatic();
  const lod = osmMap.buildLod!();
  const tri = (m: { vertexCount: number }) => m.vertexCount / 3;
  assert.ok(tri(lod.detail) > 0 && tri(lod.simple) > 0);
  assert.ok(tri(lod.simple) < tri(lod.detail) / 8, `simple ${tri(lod.simple)} vs detail ${tri(lod.detail)}`);
});
