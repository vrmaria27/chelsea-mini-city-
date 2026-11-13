// Sloane Street and Lower Sloane Street: coverage, street fit, footprints, pavement continuity and the ends.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSM } from '../src/map/osmMap';
import { MeshBuilder } from '../src/engine/geometry';
import { buildSquareBuildings } from '../src/map/landmarks/squareBuildings';
import { SS_SPECS } from '../src/map/landmarks/sloaneStreetSpecs';
import { NavField, type NavData } from '../src/explore/nav';
import { END_TEXTS, Explorer } from '../src/explore/explorer';
import type { KeyValueStore } from '../src/explore/prefs';
import type { KrData } from '../src/map/landmarks/kingsRoad';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

type Cor = KrData & { id: string; name: string; frontages: { id: string; s: number; d: number }[] };
const cors = (OSM as unknown as { corridors: Cor[] }).corridors.filter((c) => c.id === 'ss' || c.id === 'ls');
const nav = new NavField(OSM as unknown as NavData);
const roofs = (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs;

/** Point, direction, right-hand normal and carriageway half-width at chainage s. */
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
    throw new Error(`chainage ${s}`);
  };
  const near = (x: number, z: number) => { let best = { d: Infinity, s: 0 }; for (let i = 0; i + 1 < pts.length; i++) { const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz; const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)); const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); if (d < best.d) best = { d, s: cum[i] + t * Math.sqrt(L2) }; } return best; };
  return { at, near };
}

test('both corridors exist, end inside the map, and keep the King\'s Road endpoint', () => {
  assert.deepEqual(cors.map((c) => c.id), ['ss', 'ls']);
  const ss = cors[0], ls = cors[1];
  assert.equal(ss.name, 'Sloane Street');
  assert.equal(ls.name, 'Lower Sloane Street');
  for (const c of cors) for (const v of [(c.end[0] + c.end[2]) / 2, (c.end[1] + c.end[3]) / 2]) assert.ok(Math.abs(v) < 349, `${c.id} end inside the map`);
  assert.equal((OSM as unknown as { kr: KrData }).kr.sEnd, 562);
});

test('every frontage has its own sourced configuration; shop polygons inside a building are merged into it', () => {
  const models = OSM.buildings.filter((b) => /^(ss|ls):/.test(b.custom ?? ''));
  assert.ok(models.length >= 30, `${models.length} frontages`);
  for (const b of models) {
    const s = SS_SPECS[b.id.replace(/-\d+$/, '')];
    assert.ok(s, `${b.id} has a configuration`);
    assert.ok(s.src.length > 10 && ['observed', 'partly', 'estimated'].includes(s.conf), `${b.id} records its sources and confidence`);
  }
  for (const id of Object.keys(SS_SPECS)) assert.ok(models.some((b) => b.id.replace(/-\d+$/, '') === id), `${id} is on the map`);
  // Saloni (No. 134) and Escada (No. 129) are units of George House, not separate buildings
  for (const id of ['w531836263', 'w531836311']) assert.equal(OSM.buildings.find((b) => b.id === id)?.custom, 'part:r12217309');
  // completed landmarks are untouched
  assert.equal(OSM.buildings.find((b) => b.id === 'w223451081')?.custom, 'square:holy-trinity');
  assert.equal(OSM.buildings.find((b) => b.id === 'w28682626')?.custom, 'peter-jones');
  for (const id of ['r12224305', 'r12224306', 'w532074737', 'w532074738', 'w532074739']) assert.ok(OSM.buildings.find((b) => b.id === id)?.custom?.startsWith('square:'), `${id} keeps its square model`);
});

test('the carriageway leaves a pavement in front of every rebuilt frontage', () => {
  for (const c of cors) {
    const g = geo(c);
    for (const f of c.frontages) {
      const b = OSM.buildings.find((x) => x.id === f.id)!;
      if (f.d > 20) continue; // set back across a garden or forecourt
      const r = b.rings[0];
      for (let i = 0; i < r.length; i += 2) {
        const q = g.near(r[i], r[i + 1]);
        if (q.s < 5 || q.s > c.sEnd - 2 || q.d > 20) continue;
        assert.ok(q.d - g.at(q.s).hw > 2.0, `${c.id} ${b.id}: footprint ${(q.d - g.at(q.s).hw).toFixed(2)} m from the kerb at ${q.s.toFixed(0)} m`);
      }
    }
  }
});

test('models stay on their footprints and out of the carriageway', () => {
  let total = 0;
  for (const c of cors) {
    const g = geo(c);
    for (const b of OSM.buildings.filter((x) => x.custom?.startsWith(`${c.id}:`))) {
      const mb = new MeshBuilder();
      buildSquareBuildings(mb, [b as never], roofs, OSM.square!.ring, OSM.buildings as never);
      const d = mb.data;
      assert.ok(d.length > 0, `${b.id} built`);
      total += d.length / 27;
      for (let i = 0; i < d.length; i += 9) {
        const x = d[i], y = d[i + 1], z = d[i + 2];
        assert.ok(y > -0.01 && y < 40, `${b.id}: vertex height ${y.toFixed(1)}`);
        const q = g.near(x, z);
        if (q.s < 5 || q.s > c.sEnd || y >= 2.3) continue;
        assert.ok(q.d > g.at(q.s).hw + 0.5, `${b.id}: low geometry ${(q.d - g.at(q.s).hw).toFixed(2)} m from the kerb at ${q.s.toFixed(0)} m`);
      }
    }
  }
  assert.ok(total < 90_000, `Sloane Street and Lower Sloane Street models: ${Math.round(total)} triangles`);
});

test('a continuous walkable route runs along both pavements of each street', () => {
  for (const c of cors) {
    const g = geo(c);
    for (const side of [1, -1]) {
      // Lower Sloane Street's east side starts beside Wellesley House, whose pavement belongs to the square
      const from = c.id === 'ls' && side === -1 ? 40 : (c.paveFrom ?? 0) + 2;
      for (let s = from; s <= c.sEnd - 2; s += 2) {
        const { p, n, hw } = g.at(s);
        let ok = false;
        for (let o = hw + 0.4; o <= hw + 7 && !ok; o += 0.3) ok = nav.isWalkable(p[0] + n[0] * o * side, p[1] + n[1] * o * side);
        assert.ok(ok, `${c.id} ${side > 0 ? 'right' : 'left'} pavement walkable at ${s} m`);
      }
    }
  }
});

test('each street ends with its own message and a way back; nothing is walkable beyond', () => {
  for (const c of cors) {
    const g = geo(c);
    const pave = (s: number) => { const q = g.at(s); for (let o = q.hw + 0.4; o < q.hw + 7; o += 0.3) for (const side of [1, -1]) { const x = q.p[0] + q.n[0] * o * side, z = q.p[1] + q.n[1] * o * side; if (nav.isWalkable(x, z)) return { x, z }; } throw new Error(`${c.id}: no pavement at ${s}`); };
    const a = pave(c.sEnd - 40), b = pave(c.sEnd - 5);
    assert.equal(nav.nearEndOf(a.x, a.z), null);
    assert.equal(nav.nearEndOf(b.x, b.z), c.id);
    const ex = new Explorer(nav, new MemoryStore());
    ex.enterStreet({ x: b.x, z: b.z, yaw: 0 });
    assert.equal(ex.atEnd, true);
    assert.equal(ex.notice?.text, END_TEXTS[c.id]);
    ex.returnFromEnd();
    assert.equal(ex.atEnd, false);
  }
  // beyond Sloane Street's end (towards the map edge) and Lower Sloane Street's (Chelsea Bridge Road)
  const ss = geo(cors[0]).at(cors[0].sEnd + 4), ls = geo(cors[1]).at(cors[1].sEnd);
  assert.notEqual(nav.classify(ss.p[0] + ss.n[0] * (ss.hw + 2), ss.p[1] + ss.n[1] * (ss.hw + 2)), 'ok');
  assert.equal(nav.classify(ls.p[0] + ls.t[0] * 30, ls.p[1] + ls.t[1] * 30) === 'ok', false);
});
