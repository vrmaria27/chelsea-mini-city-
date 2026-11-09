import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLOTS } from '../src/map/chelsea';
import { SAVE_KEY, SAVE_VERSION, clearSave, deserialize, loadGame, saveGame, serialize, type KeyValueStore } from '../src/sim/save';
import { Simulation, createInitialState } from '../src/sim/simulation';

const ids = new Set(PLOTS.map((p) => p.id));
const sim = new Simulation(PLOTS);

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

test('round-trips state through the versioned save format', () => {
  let s = createInitialState();
  for (const [id, t] of [['p1', 'townhouse'], ['p3', 'park']] as const) {
    const r = sim.place(s, id, t);
    assert.ok(r.ok);
    if (r.ok) s = r.state;
  }
  s = sim.tick(s);
  const store = new MemoryStore();
  assert.equal(saveGame(store, s), true);
  const raw = JSON.parse(store.getItem(SAVE_KEY)!);
  assert.equal(raw.version, SAVE_VERSION);
  const loaded = loadGame(store, ids);
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.state, s);
});

test('no save starts a new game', () => {
  const r = loadGame(new MemoryStore(), ids);
  assert.equal(r.status, 'none');
  assert.deepEqual(r.state, createInitialState());
});

test('malformed JSON starts fresh with a notice', () => {
  const r = deserialize('{not json', ids);
  assert.equal(r.status, 'reset');
  assert.deepEqual(r.state, createInitialState());
  assert.ok(r.status === 'reset' && r.notice.length > 0);
});

test('unsupported/outdated version starts fresh with a notice', () => {
  const r = deserialize(JSON.stringify({ version: 0, state: {} }), ids);
  assert.equal(r.status, 'reset');
  assert.match(r.status === 'reset' ? r.notice : '', /v0/);
  assert.equal(deserialize(JSON.stringify({ hello: 1 }), ids).status, 'reset');
});

test('damaged fields are rejected or sanitised', () => {
  assert.equal(deserialize(JSON.stringify({ version: 1, state: { money: 'lots', buildings: {} } }), ids).status, 'reset');
  assert.equal(deserialize(JSON.stringify({ version: 1, state: { money: -5, buildings: {} } }), ids).status, 'reset');
  const r = deserialize(
    JSON.stringify({
      version: 1,
      state: { money: 500, buildings: { p1: 'townhouse', p99: 'shop', p2: 'castle' }, lastPlacement: { plotId: 'p1', type: 'townhouse', cost: 999999 }, ticks: 'x' },
    }),
    ids,
  );
  assert.equal(r.status, 'loaded');
  assert.deepEqual(r.state.buildings, { p1: 'townhouse' });
  assert.equal(r.state.lastPlacement?.cost, 1000, 'refund uses canonical cost, not stored value');
  assert.equal(r.state.ticks, 0);
  assert.ok(r.status === 'loaded' && r.notice?.includes('2'));
});

test('storage failures do not crash', () => {
  const broken: KeyValueStore = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(saveGame(broken, createInitialState()), false);
  assert.equal(loadGame(broken, ids).status, 'none');
  assert.doesNotThrow(() => clearSave(broken));
  assert.equal(saveGame(null, createInitialState()), false);
});

test('reset clears the save', () => {
  const store = new MemoryStore();
  saveGame(store, createInitialState());
  clearSave(store);
  assert.equal(store.getItem(SAVE_KEY), null);
  assert.ok(serialize(createInitialState()).includes('"version":1'));
});
