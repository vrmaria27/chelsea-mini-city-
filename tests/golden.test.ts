// "Chelsea at Golden Hour": lighting presets, peaceful viewpoints, postcards that remember their light,
// and compatibility with saves made before this milestone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OSM } from '../src/map/osmMap';
import { NavField, EYE_HEIGHT, type NavData } from '../src/explore/nav';
import { VIEWPOINTS, POSTCARDS } from '../src/visit/route';
import { VISIT_KEY, Visit, loadVisit } from '../src/visit/visit';
import { PREFS_KEY, defaultPrefs, loadPrefs, type KeyValueStore } from '../src/explore/prefs';
import { PRESETS, skyDome } from '../src/view/lighting';

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}
const nav = new NavField(OSM as unknown as NavData);
const elevation = (d: number[]) => (Math.asin(d[1] / Math.hypot(d[0], d[1], d[2])) * 180) / Math.PI;

test('Daylight keeps the established baseline; Golden hour is a lower, warmer sun with cooler shade', () => {
  const d = PRESETS.day, g = PRESETS.golden;
  // the values the renderer used before presets existed
  assert.deepEqual(d.sun, [1.35, 1.269, 1.134]);
  assert.deepEqual(d.ambSky, [0.47, 0.50, 0.56]);
  assert.deepEqual(d.clear, [0.74, 0.82, 0.88]);
  assert.equal(d.exposure, 1);
  assert.equal(d.dome, null);
  assert.ok(Math.abs(elevation(d.sunDir) - 51) < 3, `daylight sun ${elevation(d.sunDir).toFixed(1)}°`);
  const ge = elevation(g.sunDir);
  assert.ok(ge > 15 && ge < 30, `golden-hour sun ${ge.toFixed(1)}° high`);
  assert.ok(g.sun[0] > g.sun[1] && g.sun[1] > g.sun[2], 'warm sunlight');
  assert.ok(g.ambSky[2] > g.ambSky[0], 'cooler sky light in the shade');
  const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(g.ambSky) > 0.6 * lum(d.ambSky), 'shade not excessively dark');
  assert.ok(g.exposure >= 1 && g.exposure < 1.2, 'moderate exposure');
  const v = skyDome(g);
  assert.equal(v.length % 27, 0);
  for (let i = 6; i < v.length; i += 9) for (let k = 0; k < 3; k++) assert.ok(v[i + k] >= 0 && v[i + k] <= 1, 'sky colours in range');
});

test('three peaceful viewpoints on walkable paving with a clear view, apart from the postcard spots', () => {
  assert.deepEqual(VIEWPOINTS.map((v) => v.id), ['vp-fountain', 'vp-doy', 'vp-saatchi']);
  for (const v of VIEWPOINTS) {
    assert.ok(nav.isWalkable(v.at.x, v.at.z), `${v.id} walkable`);
    const y = nav.groundY(v.at.x, v.at.z) + EYE_HEIGHT;
    assert.ok(!nav.lineBlocked(v.at.x, y, v.at.z, v.look.x, v.look.y, v.look.z, v.look.ignore), `${v.id} clear view`);
    // the heading used when going there points roughly at the view
    const b = Math.atan2(-(v.look.x - v.at.x), -(v.look.z - v.at.z));
    const off = Math.abs(Math.atan2(Math.sin(b - v.at.yaw), Math.cos(b - v.at.yaw)));
    assert.ok(off < 0.8, `${v.id} faces its view (${off.toFixed(2)} rad)`);
    for (const w of VIEWPOINTS) if (w !== v) assert.ok(Math.hypot(w.at.x - v.at.x, w.at.z - v.at.z) > v.radius + w.radius, 'viewpoints do not overlap');
  }
  assert.ok(nav.inSquare(VIEWPOINTS[0].at.x, VIEWPOINTS[0].at.z), 'the first is in Sloane Square');
  assert.ok(Math.hypot(VIEWPOINTS[0].at.x - 161.9, VIEWPOINTS[0].at.z + 146.9) < 12, 'beside the fountain');
});

test('pausing at a viewpoint changes nothing saved and nothing about the position', () => {
  const store = new MemoryStore();
  const v = new Visit(store);
  v.chooseWelcome('discover');
  const saved = store.getItem(VISIT_KEY);
  const at = VIEWPOINTS[1].at;
  assert.equal(v.viewpointAt(at.x, at.z)?.id, 'vp-doy');
  assert.equal(v.viewpointAt(at.x + 30, at.z), null);
  v.setPaused(true);
  assert.ok(v.paused);
  assert.equal(store.getItem(VISIT_KEY), saved, 'not written to storage');
  v.setPaused(false);
  assert.equal(new Visit(store).paused, false, 'a reload never starts paused');
});

test('postcards remember the light they were taken in; older saves read as daylight', () => {
  const store = new MemoryStore();
  store.setItem(VISIT_KEY, JSON.stringify({ version: 1, welcomeSeen: true, mode: 'free', visited: [], skipped: [], completed: false, postcards: { fountain: 1, saatchi: 2 }, sound: { muted: false, ambience: true, narration: true }, uiHidden: false, guide: true, smooth: false }));
  const v = new Visit(store);
  assert.equal(v.loadStatus, 'ok');
  assert.equal(v.postcardLightOf('fountain'), 'day');
  assert.equal(v.postcardLightOf('kings-road'), null);
  v.award('fountain', 3, 'golden');
  v.award('kings-road', 4, 'golden');
  const again = new Visit(store);
  assert.equal(again.postcardLightOf('fountain'), 'golden');
  assert.equal(again.postcardLightOf('saatchi'), 'day');
  assert.equal(again.postcardCount, 3);
  // junk lighting entries are ignored
  store.setItem(VISIT_KEY, JSON.stringify({ ...JSON.parse(store.getItem(VISIT_KEY)!), postcardLight: { fountain: 'purple', saatchi: 'golden', nope: 'day' } }));
  const l = loadVisit(store).state;
  assert.deepEqual(l.postcardLight, { saatchi: 'golden' });
  assert.equal(POSTCARDS.length, 6);
});

test('the lighting choice is saved with the preferences; older or odd values fall back to Daylight', () => {
  const ok = () => true;
  const put = (o: unknown) => { const s = new MemoryStore(); s.setItem(PREFS_KEY, JSON.stringify(o)); return s; };
  assert.equal(defaultPrefs().light, 'day');
  assert.equal(loadPrefs(put({ ...defaultPrefs(), light: 'golden' }), ok).prefs.light, 'golden');
  const { light: _drop, ...older } = defaultPrefs();
  void _drop;
  const r = loadPrefs(put(older), ok);
  assert.equal(r.status, 'ok');
  assert.equal(r.prefs.light, 'day');
  assert.equal(loadPrefs(put({ ...defaultPrefs(), light: 'midnight' }), ok).prefs.light, 'day');
});
