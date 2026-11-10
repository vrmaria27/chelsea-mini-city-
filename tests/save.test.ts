import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLOTS } from '../src/map/chelsea';
import {
  BACKUP_KEY, SAVE_KEY, SAVE_VERSION, clearSave, deserialize, loadGame, saveGame, serialize, type KeyValueStore,
} from '../src/sim/save';
import { Simulation, createInitialState, type GameState } from '../src/sim/simulation';
import type { MapContext } from '../src/sim/save';

// These tests exercise the save format on the legacy map (plot ids p1–p20).
const sim = new Simulation(PLOTS);
const legacyCtx: MapContext = { id: 'legacy', version: 1, sim };

class MemoryStore implements KeyValueStore {
  map = new Map<string, string>();
  getItem(k: string) { return this.map.get(k) ?? null; }
  setItem(k: string, v: string) { this.map.set(k, v); }
  removeItem(k: string) { this.map.delete(k); }
}

const ok = <T extends { ok: boolean }>(r: T) => {
  assert.ok(r.ok);
  return (r as unknown as { state: GameState }).state;
};

test('round-trips state (with upgrades, chapter and preferences) through the v2 format', () => {
  let s = createInitialState();
  s = ok(sim.place(s, 'p1', 'townhouse'));
  s = ok(sim.place(s, 'p3', 'park'));
  s = ok(sim.upgrade(s, 'p3'));
  s = sim.tick(s);
  const store = new MemoryStore();
  assert.equal(saveGame(store, s, { reducedMotion: true, lowDetail: false, showSites: true }, { id: 'legacy', version: 1 }), true);
  const raw = JSON.parse(store.getItem(SAVE_KEY)!);
  assert.equal(raw.version, SAVE_VERSION);
  assert.equal(SAVE_VERSION, 3);
  const loaded = loadGame(store, legacyCtx);
  assert.equal(loaded.status, 'loaded');
  assert.deepEqual(loaded.state, s);
  assert.deepEqual(loaded.prefs, { reducedMotion: true, lowDetail: false, showSites: true });
  assert.equal(loaded.state.lastAction?.kind, 'upgrade');
});

test('reads a Milestone 1 (v1) save on the legacy map: buildings become Level 1, money and progress kept', () => {
  const v1 = {
    version: 1,
    savedAt: '2026-11-09T14:00:00.000Z',
    state: {
      money: 3450,
      buildings: { p11: 'park', p8: 'park', p14: 'shop', p7: 'townhouse', p9: 'townhouse', p10: 'townhouse', p12: 'townhouse', p13: 'townhouse' },
      lastPlacement: { plotId: 'p13', type: 'townhouse', cost: 1000 },
      objectiveReached: true,
      ticks: 12,
    },
  };
  const store = new MemoryStore();
  store.setItem(SAVE_KEY, JSON.stringify(v1));
  const r = loadGame(store, legacyCtx);
  assert.equal(r.status, 'loaded');
  assert.ok(r.status === 'loaded' && r.migratedFrom === 1);
  assert.equal(r.state.money, 3450);
  assert.equal(r.state.ticks, 12);
  assert.equal(Object.keys(r.state.buildings).length, 8);
  for (const b of Object.values(r.state.buildings)) assert.equal(b.level, 1);
  assert.deepEqual(r.state.buildings.p14, { type: 'shop', level: 1 });
  assert.deepEqual(r.state.lastAction, { kind: 'place', plotId: 'p13', type: 'townhouse', cost: 1000 }, 'undo history migrated');
  assert.equal(r.state.chapter, 1, 'objectiveReached becomes chapter 1 complete');
  // Undo still refunds exactly the purchase price after migration.
  const u = sim.undo(r.state);
  assert.ok(u.ok && u.state.money === 4450);
});

test('v1 migration derives chapter completion from state even if the flag was missing', () => {
  const v1 = { version: 1, state: { money: 0, buildings: { p11: 'park', p8: 'park', p14: 'shop', p7: 'townhouse', p9: 'townhouse', p10: 'townhouse', p12: 'townhouse', p13: 'townhouse' }, objectiveReached: false, ticks: 0 } };
  const r = deserialize(JSON.stringify(v1), legacyCtx);
  assert.equal(r.state.chapter, 1);
});

test('no save starts a new game', () => {
  const r = loadGame(new MemoryStore(), legacyCtx);
  assert.equal(r.status, 'none');
  assert.deepEqual(r.state, createInitialState());
});

test('malformed or unsupported saves start fresh but keep a backup copy', () => {
  for (const raw of ['{not json', JSON.stringify({ version: 99, state: {} }), JSON.stringify({ hello: 1 })]) {
    const store = new MemoryStore();
    store.setItem(SAVE_KEY, raw);
    const r = loadGame(store, legacyCtx);
    assert.equal(r.status, 'reset');
    assert.deepEqual(r.state, createInitialState());
    assert.equal(store.getItem(BACKUP_KEY), raw, 'unreadable data is backed up, not destroyed');
    assert.ok(r.status === 'reset' && /backup/.test(r.notice));
  }
});

test('damaged fields are rejected or repaired without losing valid buildings', () => {
  assert.equal(deserialize(JSON.stringify({ version: 2, state: { money: 'lots', buildings: {} } }), legacyCtx).status, 'reset');
  assert.equal(deserialize(JSON.stringify({ version: 2, state: { money: -5, buildings: {} } }), legacyCtx).status, 'reset');
  const r = deserialize(
    JSON.stringify({
      version: 2,
      state: {
        money: 500,
        buildings: { p1: { type: 'townhouse', level: 2 }, p2: { type: 'park', level: 7 }, p99: { type: 'shop', level: 1 }, p3: { type: 'castle', level: 1 } },
        lastAction: { kind: 'upgrade', plotId: 'p1', type: 'townhouse', cost: 999999 },
        chapter: 'x',
        ticks: -1,
      },
      prefs: 'bad',
    }),
    legacyCtx,
  );
  assert.equal(r.status, 'loaded');
  assert.deepEqual(r.state.buildings, { p1: { type: 'townhouse', level: 2 }, p2: { type: 'park', level: 1 } });
  assert.equal(r.state.lastAction?.cost, 1500, 'refund uses the canonical upgrade price, not the stored value');
  assert.equal(r.state.ticks, 0);
  assert.equal(r.state.chapter, 0);
  assert.equal(r.prefs, null);
  assert.ok(r.status === 'loaded' && r.notice?.includes('3'));
});

test('stale undo history that no longer matches the buildings is dropped', () => {
  const r = deserialize(JSON.stringify({ version: 2, state: { money: 0, buildings: { p1: { type: 'townhouse', level: 1 } }, lastAction: { kind: 'upgrade', plotId: 'p1', type: 'townhouse', cost: 1500 }, chapter: 0, ticks: 0 } }), legacyCtx);
  assert.equal(r.state.lastAction, null, 'cannot refund an upgrade that is not present');
});

test('storage failures do not crash', () => {
  const broken: KeyValueStore = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('full'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.equal(saveGame(broken, createInitialState()), false);
  assert.equal(loadGame(broken, legacyCtx).status, 'none');
  assert.doesNotThrow(() => clearSave(broken));
  assert.equal(saveGame(null, createInitialState()), false);
});

test('reset clears the save', () => {
  const store = new MemoryStore();
  saveGame(store, createInitialState());
  clearSave(store);
  assert.equal(store.getItem(SAVE_KEY), null);
  assert.ok(serialize(createInitialState()).includes('"version":3'));
});
