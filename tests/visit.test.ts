// The visitor experience: route data validated against the scene, guidance, postcard checks and saving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSM } from '../src/map/osmMap';
import { NavField, EYE_HEIGHT, type NavData } from '../src/explore/nav';
import { POSTCARDS, STOPS, HOME } from '../src/visit/route';
import { LEGS, VISIT_KEY, Visit, bearing, loadVisit } from '../src/visit/visit';
import type { KeyValueStore } from '../src/explore/prefs';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  fail = false;
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw new Error('quota'); this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const nav = new NavField(OSM as unknown as NavData);
const eye = (x: number, z: number) => nav.groundY(x, z) + EYE_HEIGHT;

test('five stops in order, each on a walkable viewpoint; the visit starts in Sloane Square', () => {
  assert.deepEqual(STOPS.map((s) => s.id), ['square', 'peter-jones', 'doy-square', 'saatchi', 'markham']);
  for (const s of STOPS) {
    assert.ok(nav.isWalkable(s.at.x, s.at.z), `${s.id} walkable`);
    assert.ok(s.story.split(/\s+/).length >= 55 && s.story.split(/\s+/).length <= 110, `${s.id} story ${s.story.split(/\s+/).length} words (20–40 s)`);
    assert.ok(s.sources.length >= 2 && s.detail.length > 20);
  }
  assert.ok(nav.inSquare(HOME.x, HOME.z), 'start in the square');
});

test('the route between stops follows walkable ground, crossing roads only briefly', () => {
  assert.equal(LEGS.length, STOPS.length - 1);
  for (const [i, leg] of LEGS.entries()) {
    assert.equal(leg.from, STOPS[i].id);
    assert.equal(leg.to, STOPS[i + 1].id);
    for (let k = 1; k < leg.points.length; k++) {
      const [ax, az] = leg.points[k - 1], [bx, bz] = leg.points[k];
      const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
      let road = 0;
      for (let q = 0; q <= n; q++) {
        const c = nav.classify(ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n);
        assert.ok(c === 'ok' || c === 'carriageway', `${leg.from}→${leg.to} segment ${k}: ${c}`);
        if (c === 'carriageway') road++;
      }
      assert.ok(road * 0.5 <= 22, `${leg.from}→${leg.to} segment ${k}: ${road * 0.5} m of road`);
    }
  }
  const total = LEGS.reduce((s, l) => s + l.length, 0);
  assert.ok(total > 600 && total < 1100, `route ${total} m`);
});

test('six postcards: each viewpoint is walkable, near the route and has a clear sight line', () => {
  assert.equal(POSTCARDS.length, 6);
  for (const p of POSTCARDS) {
    assert.ok(nav.isWalkable(p.at.x, p.at.z), `${p.id} viewpoint walkable`);
    assert.equal(nav.lineBlocked(p.at.x, eye(p.at.x, p.at.z), p.at.z, p.subject.x, p.subject.y, p.subject.z, p.subjectBuilding), false, `${p.id} sight line`);
    if (p.subjectBuilding) assert.ok(nav.buildingAt(p.subject.x, p.subject.z)?.id === p.subjectBuilding || OSM.buildings.some((b) => b.id === p.subjectBuilding), `${p.id} subject building exists`);
    const near = Math.min(...LEGS.flatMap((l) => l.points.map(([x, z]) => Math.hypot(x - p.at.x, z - p.at.z))));
    assert.ok(near < 80, `${p.id} within a short detour of the route (${near.toFixed(0)} m)`);
  }
});

test('capture: right place and direction earns the postcard; wrong direction and out of range do not', () => {
  const v = new Visit(new MemoryStore());
  const p = POSTCARDS[0];
  const yaw = bearing(p.at.x, p.at.z, p.subject.x, p.subject.z);
  const ok = v.checkCapture(p.at.x, p.at.z, yaw + 0.2, eye(p.at.x, p.at.z), nav);
  assert.ok(ok.ok && ok.postcard.id === p.id && !ok.retake);
  const wrong = v.checkCapture(p.at.x, p.at.z, yaw + Math.PI, eye(p.at.x, p.at.z), nav);
  assert.ok(!wrong.ok && wrong.reason === 'direction');
  const far = v.checkCapture(HOME.x, HOME.z + 300, 0, 2, nav);
  assert.ok(!far.ok && far.reason === 'far');
  v.award(p.id, 1);
  const again = v.checkCapture(p.at.x, p.at.z, yaw, eye(p.at.x, p.at.z), nav);
  assert.ok(again.ok && again.retake, 'retake');
  // every postcard can be earned from its own viewpoint
  for (const q of POSTCARDS) {
    const r = v.checkCapture(q.at.x, q.at.z, bearing(q.at.x, q.at.z, q.subject.x, q.subject.z), eye(q.at.x, q.at.z), nav);
    assert.ok(r.ok && r.postcard.id === q.id, `${q.id} earnable (${r.ok ? '' : r.reason})`);
  }
});

test('route: welcome choices, arriving, skipping, leaving and resuming, completion', () => {
  const v = new Visit(new MemoryStore());
  assert.ok(v.showWelcome);
  v.chooseWelcome('discover');
  assert.equal(v.state.mode, 'discover');
  assert.equal(v.openStop, 'square');
  assert.equal(v.target?.id, 'peter-jones');
  v.closeStop();
  v.updatePosition(STOPS[1].at.x, STOPS[1].at.z);
  assert.equal(v.openStop, 'peter-jones');
  v.skipStop(); // skip Duke of York Square
  assert.equal(v.target?.id, 'saatchi');
  v.leaveRoute();
  v.updatePosition(STOPS[3].at.x, STOPS[3].at.z); // free exploring: nothing happens
  assert.ok(!v.state.visited.includes('saatchi'));
  v.startRoute();
  v.updatePosition(STOPS[3].at.x, STOPS[3].at.z);
  assert.ok(v.state.visited.includes('saatchi'));
  v.updatePosition(STOPS[4].at.x, STOPS[4].at.z);
  assert.ok(v.state.completed && v.showCompletion, 'completes even with a stop skipped and no postcards');
  assert.equal(v.target?.id, 'doy-square', 'the skipped stop can still be visited later');
  assert.equal(v.openStop, 'markham', 'the final story is shown first');
  v.closeStop();
  assert.ok(v.showCompletion && !v.openStop, 'closing the final story reveals the completion message');
  v.closeStop();
  assert.ok(!v.showCompletion, 'and it can then be dismissed');
  const free = new Visit(new MemoryStore());
  free.chooseWelcome('free');
  assert.equal(free.state.mode, 'free');
  assert.equal(free.openStop, null);
});

test('guidance leads along the planned path towards the next stop', () => {
  const v = new Visit(new MemoryStore());
  v.chooseWelcome('discover');
  const g = v.guidance(STOPS[1].at.x, STOPS[1].at.z);
  v.updatePosition(STOPS[1].at.x, STOPS[1].at.z);
  const g2 = v.guidance(STOPS[1].at.x, STOPS[1].at.z)!;
  assert.ok(g && g2.target.id === 'doy-square');
  assert.ok(Math.abs(g2.remaining - LEGS[1].length) < 15, `remaining ${g2.remaining} vs ${LEGS[1].length}`);
  assert.ok(Math.hypot(g2.x - STOPS[1].at.x, g2.z - STOPS[1].at.z) > 5, 'points ahead');
});

test('progress is saved and restored; malformed, outdated and failing storage are handled', () => {
  const s = new MemoryStore();
  const v = new Visit(s);
  v.chooseWelcome('discover');
  v.award('fountain', 5);
  v.setSound('ambience', false);
  const r = new Visit(s);
  assert.equal(r.loadStatus, 'ok');
  assert.equal(r.state.mode, 'discover');
  assert.equal(r.state.postcards.fountain, 5);
  assert.equal(r.state.sound.ambience, false);
  assert.ok(!r.showWelcome);
  s.map.set(VISIT_KEY, '{nope');
  assert.equal(loadVisit(s).status, 'malformed');
  s.map.set(VISIT_KEY, JSON.stringify({ version: 99 }));
  assert.equal(loadVisit(s).status, 'unsupported-version');
  s.map.set(VISIT_KEY, JSON.stringify({ version: 1, visited: ['square', 'bogus'], postcards: { fountain: 1, nope: 2 } }));
  const l = loadVisit(s).state;
  assert.deepEqual(l.visited, ['square']);
  assert.deepEqual(Object.keys(l.postcards), ['fountain']);
  s.fail = true;
  const f = new Visit(s);
  f.award('saatchi');
  assert.ok(f.saveFailed && f.state.postcards.saatchi, 'kept for the session when saving fails');
});
