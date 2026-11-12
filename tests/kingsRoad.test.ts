// King's Road, Sloane Square to the Markham Square junction: coverage, street fit, navigation and boundary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSM } from '../src/map/osmMap';
import { MeshBuilder } from '../src/engine/geometry';
import { buildSquareBuildings } from '../src/map/landmarks/squareBuildings';
import { KR_SPECS } from '../src/map/landmarks/kingsRoadSpecs';
import { krNearest, useKingsRoadLine, type KrData } from '../src/map/landmarks/kingsRoad';
import { NavField, type NavData } from '../src/explore/nav';
import { END_TEXT, Explorer } from '../src/explore/explorer';
import type { KeyValueStore } from '../src/explore/prefs';
import { LANDMARKS } from '../src/explore/landmarks';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const kr = (OSM as unknown as { kr: KrData }).kr;
useKingsRoadLine(kr.line);
const nav = new NavField(OSM as unknown as NavData);
const krModels = OSM.buildings.filter((b) => b.custom?.startsWith('kr:'));
const specOf = (id: string) => KR_SPECS[id.replace(/-\d+$/, '')];
const pts: [number, number][] = [];
for (let i = 0; i < kr.line.length; i += 2) pts.push([kr.line[i], kr.line[i + 1]]);
const cum = [0];
for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
/** Point, direction and carriageway half-width at chainage s. */
function at(s: number) {
  for (let i = 0; i + 1 < pts.length; i++) if (s <= cum[i + 1]) {
    const L = cum[i + 1] - cum[i], f = (s - cum[i]) / L, a = pts[i], b = pts[i + 1];
    const t: [number, number] = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f] as [number, number], t, north: [-t[1], t[0]] as [number, number], hw: (kr.w![i] + (kr.w![i + 1] - kr.w![i]) * f) / 2 };
  }
  throw new Error(`chainage ${s} beyond the line`);
}

test('every street-facing building in the corridor has its own sourced configuration', () => {
  assert.ok(krModels.length >= 60, `${krModels.length} frontages`);
  for (const b of krModels) {
    const s = specOf(b.id);
    assert.ok(s, `${b.id} has a configuration`);
    assert.ok(s.src.length > 10 && ['observed', 'partly', 'estimated'].includes(s.conf), `${b.id} records its sources and confidence`);
    assert.ok(s.floors.length >= 1 && s.floors.every((h) => h > 2.5 && h < 5), `${b.id} storey heights`);
  }
  // no configuration is left without a footprint (ids follow OpenStreetMap)
  for (const id of Object.keys(KR_SPECS)) assert.ok(krModels.some((b) => b.id.replace(/-\d+$/, '') === id), `${id} is on the map`);
  // completeness: any footprint whose edge fronts the road within the corridor is reconstructed
  for (const f of (kr as unknown as { frontages: { id: string }[] }).frontages) assert.ok(krModels.some((b) => b.id === f.id), `${f.id} frontage`);
});

test('the carriageway sits between the building lines, with a pavement on both sides', () => {
  for (const b of krModels) {
    const r = b.rings[0];
    for (let i = 0; i < r.length; i += 2) {
      const q = krNearest(r[i], r[i + 1]);
      if (q.s < 5 || q.s > kr.sEnd) continue;
      const { hw } = at(q.s);
      assert.ok(q.d - hw > 2.0, `${b.id}: footprint ${(q.d - hw).toFixed(2)} m from the kerb at chainage ${q.s.toFixed(0)}`);
    }
  }
});

test('models stay on their footprints and out of the carriageway', () => {
  const roofs = (OSM as unknown as { squareRoofs: Record<string, never> }).squareRoofs;
  let total = 0;
  for (const b of krModels) {
    const mb = new MeshBuilder();
    buildSquareBuildings(mb, [b as never], roofs, OSM.square!.ring, OSM.buildings as never);
    const d = mb.data;
    assert.ok(d.length > 0, `${b.id} built`);
    total += d.length / 27;
    for (let i = 0; i < d.length; i += 9) {
      const x = d[i], y = d[i + 1], z = d[i + 2];
      assert.ok(y > -0.01 && y < 40, `${b.id}: vertex height ${y.toFixed(1)}`);
      const q = krNearest(x, z);
      if (q.s < 5 || q.s > kr.sEnd + 30) continue;
      // nothing below 2.3 m (headroom) reaches past the kerb
      if (y < 2.3) assert.ok(q.d > at(q.s).hw + 0.5, `${b.id}: low geometry ${(q.d - at(q.s).hw).toFixed(2)} m from the kerb`);
    }
  }
  assert.ok(total < 140000, `King's Road models: ${Math.round(total)} triangles`);
});

test('a continuous walkable route runs along both pavements from Sloane Square to Markham Square', () => {
  for (const side of [1, -1]) {
    for (let s = 6; s <= kr.sEnd - 2; s += 2) {
      const { p, north, hw } = at(s);
      let ok = false;
      for (let o = hw + 0.4; o <= hw + 7 && !ok; o += 0.3) ok = nav.isWalkable(p[0] + north[0] * o * side, p[1] + north[1] * o * side);
      assert.ok(ok, `${side > 0 ? 'north' : 'south'} pavement walkable at chainage ${s}`);
    }
  }
  // the carriageway itself is not, except at mapped crossings
  const mid = at(300);
  assert.equal(nav.classify(mid.p[0], mid.p[1]), 'carriageway');
});

test('the reconstruction ends at the Markham Square junction with a message and a way back', () => {
  const beyond = at(kr.sEnd + 12), before = at(kr.sEnd - 40), near = at(kr.sEnd - 6);
  for (const side of [1, -1]) {
    const o = beyond.hw + 2;
    assert.equal(nav.classify(beyond.p[0] + beyond.north[0] * o * side, beyond.p[1] + beyond.north[1] * o * side), 'end');
  }
  const pave = (q: ReturnType<typeof at>) => { for (let o = q.hw + 0.4; o < q.hw + 7; o += 0.3) { const x = q.p[0] + q.north[0] * o, z = q.p[1] + q.north[1] * o; if (nav.isWalkable(x, z)) return { x, z }; } throw new Error('no pavement'); };
  const a = pave(before), b = pave(near);
  assert.equal(nav.nearKrEnd(a.x, a.z), false);
  assert.equal(nav.nearKrEnd(b.x, b.z), true);
  const ex = new Explorer(nav, new MemoryStore());
  ex.enterStreet({ x: a.x, z: a.z, yaw: 2.2 });
  assert.equal(ex.atEnd, false);
  ex.enterStreet({ x: b.x, z: b.z, yaw: 2.2 });
  assert.equal(ex.atEnd, true);
  assert.equal(ex.notice?.text, END_TEXT);
  ex.returnFromEnd();
  assert.equal(ex.atEnd, false);
  assert.ok(nav.isWalkable(ex.street.x, ex.street.z));
});

test('King\'s Road viewpoints are in the places list and inside the corridor', () => {
  for (const id of ['kings-road#terrace', 'kings-road#markham-square']) {
    const l = LANDMARKS.find((x) => x.id === id);
    assert.ok(l?.street, id);
    assert.ok(nav.inKrZone(l!.street!.x, l!.street!.z) && nav.isWalkable(l!.street!.x, l!.street!.z), `${id} walkable`);
  }
});
