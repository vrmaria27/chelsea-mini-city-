import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLOTS } from '../src/map/chelsea';
import { BUILDINGS, RULES, type BuildingType } from '../src/sim/rules';
import { Simulation, TickClock, createInitialState, formatHappiness, type GameState } from '../src/sim/simulation';

const sim = new Simulation(PLOTS);
const build = (state: GameState, plan: [string, BuildingType][]) =>
  plan.reduce((s, [id, t]) => {
    const r = sim.place(s, id, t);
    assert.ok(r.ok, `placing ${t} on ${id} should succeed`);
    return r.state;
  }, state);

test('starts with £10,000, no residents and happiness shown as —', () => {
  const s = createInitialState();
  assert.equal(s.money, 10000);
  const st = sim.stats(s);
  assert.equal(st.residents, 0);
  assert.equal(st.happiness, null);
  assert.equal(formatHappiness(st.happiness), '—');
});

test('map has about 20 plots with unique ids', () => {
  assert.equal(PLOTS.length, 20);
  assert.equal(new Set(PLOTS.map((p) => p.id)).size, 20);
});

test('placing a townhouse costs £1,000, adds 10 residents and earns £100 per tick', () => {
  let s = build(createInitialState(), [['p1', 'townhouse']]);
  assert.equal(s.money, 9000);
  assert.equal(sim.stats(s).residents, 10);
  assert.equal(sim.stats(s).happiness, 50);
  s = sim.tick(s);
  assert.equal(s.money, 9100);
  assert.equal(s.ticks, 1);
});

test('shop earns £200 only with an occupied townhouse within 80 m', () => {
  let s = build(createInitialState(), [['p20', 'shop']]);
  assert.equal(sim.stats(s).incomePerTick, 0);
  s = build(s, [['p1', 'townhouse']]); // far away
  assert.ok(sim.distance('p1', 'p20') > RULES.effectRadius);
  assert.equal(sim.stats(s).incomePerTick, 100);
  s = build(s, [['p18', 'townhouse']]); // 45 m away
  assert.ok(sim.distance('p18', 'p20') <= RULES.effectRadius);
  assert.equal(sim.stats(s).incomePerTick, 100 + 100 + 200);
});

test('happiness: +10 for a nearby shop (once), +10 per nearby park, capped at 100', () => {
  let s = build(createInitialState(), [['p11', 'townhouse'], ['p14', 'shop'], ['p8', 'shop']]);
  assert.equal(sim.stats(s).homeHappiness.p11, 60); // two shops still only +10
  s = { ...s, money: 100000 };
  s = build(s, [['p10', 'park'], ['p12', 'park']]);
  assert.equal(sim.stats(s).homeHappiness.p11, 80);
  s = build(s, [['p7', 'park'], ['p9', 'park'], ['p13', 'park'], ['p15', 'park']]);
  assert.equal(sim.stats(s).homeHappiness.p11, 100); // 50 + 10 + 60 capped
});

test('parks out of range do not count; average is across townhouses', () => {
  const s = build(createInitialState(), [['p1', 'townhouse'], ['p16', 'townhouse'], ['p18', 'park']]);
  const st = sim.stats(s);
  assert.equal(st.homeHappiness.p1, 50);
  assert.equal(st.homeHappiness.p16, 60);
  assert.equal(st.happiness, 55);
});

test('cannot build on an occupied plot', () => {
  const s = build(createInitialState(), [['p3', 'park']]);
  const r = sim.place(s, 'p3', 'townhouse');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'occupied');
});

test('cannot build when unaffordable, and money is unchanged', () => {
  const s: GameState = { ...createInitialState(), money: 1499 };
  const r = sim.place(s, 'p3', 'shop');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'unaffordable');
  assert.match(!r.ok ? r.message : '', /£1 more/);
  assert.equal(sim.place({ ...s, money: 1500 }, 'p3', 'shop').ok, true);
});

test('unknown plots are rejected', () => {
  assert.equal(sim.place(createInitialState(), 'nope', 'park').ok, false);
});

test('undo refunds the purchase cost but keeps tick income', () => {
  let s = build(createInitialState(), [['p1', 'townhouse']]);
  s = sim.tick(sim.tick(s)); // +200 income
  s = build(s, [['p2', 'shop']]);
  assert.equal(s.money, 9000 + 200 - 1500);
  const before = s.money;
  const u = sim.undo(s);
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.equal(u.state.money, before + BUILDINGS.shop.cost);
  assert.equal(u.state.buildings.p2, undefined);
  assert.equal(u.state.buildings.p1, 'townhouse');
  assert.equal(sim.undo(u.state).ok, false, 'only the most recent placement can be undone');
});

test('objective: 50 residents and 70 average happiness is achievable from the start', () => {
  // Symons cluster: central park, second park and shop on the edge; five homes around them.
  const plan: [string, BuildingType][] = [
    ['p11', 'park'], ['p8', 'park'], ['p14', 'shop'],
    ['p7', 'townhouse'], ['p9', 'townhouse'], ['p10', 'townhouse'], ['p12', 'townhouse'], ['p13', 'townhouse'],
  ];
  const cost = plan.reduce((n, [, t]) => n + BUILDINGS[t].cost, 0);
  assert.ok(cost <= RULES.startingMoney, `plan costs ${cost}`);
  const s = build(createInitialState(), plan);
  const st = sim.stats(s);
  assert.equal(st.residents, 50);
  assert.ok((st.happiness ?? 0) >= 70, `happiness ${st.happiness}`);
  assert.equal(s.objectiveReached, true);
  assert.equal(sim.undo(s).ok && (sim.undo(s) as { state: GameState }).state.objectiveReached, true, 'celebration not repeated after undo');
});

test('tick clock: every 10 s of active play, clamps large gaps', () => {
  const c = new TickClock();
  assert.equal(c.advance(9.9), 0); // clamped to 0.25
  let ticks = 0;
  for (let i = 0; i < 600; i++) ticks += c.advance(1 / 60); // 10 s at 60 fps
  assert.equal(ticks, 1);
  assert.equal(c.advance(3600), 0, 'a long pause never fast-forwards the simulation');
  assert.equal(c.advance(-1), 0);
});
