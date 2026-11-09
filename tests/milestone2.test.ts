import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLOTS } from '../src/map/chelsea';
import { CHAPTER_COUNT, chapterHint } from '../src/sim/chapters';
import { BUILDINGS, BUILDING_TYPES, RULES, type BuildingType } from '../src/sim/rules';
import { Simulation, createInitialState, type GameState } from '../src/sim/simulation';
import { Game } from '../src/game/game';
import type { KeyValueStore } from '../src/sim/save';

const sim = new Simulation(PLOTS);
const must = (r: { ok: boolean }): GameState => {
  assert.ok(r.ok, JSON.stringify(r));
  return (r as unknown as { state: GameState }).state;
};
const rich = (): GameState => ({ ...createInitialState(), money: 1e6 });

// ---- Upgrades ---------------------------------------------------------------------------------

test('upgrade prices are £1,500 / £2,000 / £1,000 and charge exactly once', () => {
  let s = rich();
  for (const [id, t] of [['p1', 'townhouse'], ['p2', 'shop'], ['p3', 'park']] as [string, BuildingType][]) s = must(sim.place(s, id, t));
  const before = s.money;
  s = must(sim.upgrade(s, 'p1'));
  s = must(sim.upgrade(s, 'p2'));
  s = must(sim.upgrade(s, 'p3'));
  assert.equal(before - s.money, 1500 + 2000 + 1000);
  for (const id of ['p1', 'p2', 'p3']) {
    const again = sim.upgrade(s, id);
    assert.equal(again.ok, false);
    assert.equal(!again.ok && again.reason, 'max-level');
  }
  assert.equal(sim.upgrade(s, 'p4').ok, false, 'cannot upgrade an empty plot');
});

test('upgrade is refused when unaffordable, without charging', () => {
  let s = must(sim.place(createInitialState(), 'p1', 'townhouse'));
  s = { ...s, money: 1499 };
  const r = sim.upgrade(s, 'p1');
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.reason, 'unaffordable');
  assert.equal(must(sim.upgrade({ ...s, money: 1500 }, 'p1')).money, 0);
});

test('Level 2 values replace (not add to) Level 1 values', () => {
  let s = rich();
  s = must(sim.place(s, 'p10', 'townhouse'));
  s = must(sim.place(s, 'p11', 'shop'));
  s = must(sim.place(s, 'p13', 'park'));
  let st = sim.stats(s);
  assert.equal(st.residents, 10);
  assert.equal(st.incomePerTick, 100 + 200);
  assert.equal(st.homeHappiness.p10, 50 + 10 + 10);
  s = must(sim.upgrade(s, 'p10'));
  s = must(sim.upgrade(s, 'p11'));
  s = must(sim.upgrade(s, 'p13'));
  st = sim.stats(s);
  assert.equal(st.residents, 20);
  assert.equal(st.incomePerTick, 180 + 350);
  assert.equal(st.homeHappiness.p10, 50 + 10 + 15, 'park +15 replaces +10; shop bonus unchanged');
  assert.deepEqual(st.upgraded, { townhouse: 1, shop: 1, park: 1 });
});

test('upgraded shop still needs a home within 80 m to earn', () => {
  let s = rich();
  s = must(sim.place(s, 'p20', 'shop'));
  s = must(sim.upgrade(s, 'p20'));
  assert.equal(sim.stats(s).incomePerTick, 0);
  assert.equal(sim.stats(s).activeShopCount, 0);
  s = must(sim.place(s, 'p18', 'townhouse'));
  assert.equal(sim.stats(s).incomePerTick, 100 + 350);
});

test('happiness stays capped at 100 with upgraded parks', () => {
  let s = rich();
  s = must(sim.place(s, 'p11', 'townhouse'));
  for (const id of ['p7', 'p8', 'p9', 'p10']) s = must(sim.upgrade(must(sim.place(s, id, 'park')), id));
  s = must(sim.place(s, 'p14', 'shop'));
  assert.equal(sim.stats(s).homeHappiness.p11, 100);
  const ins = sim.inspect(s, 'p11')!;
  assert.equal(ins.capped, true);
  assert.equal(ins.contributions.reduce((n, c) => n + c.value, 0), 100, 'breakdown sums to the displayed value');
});

// ---- Previews match reality -------------------------------------------------------------------

test('placement estimates exactly match the result of placing (randomised)', () => {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 40; round++) {
    let s = rich();
    // random existing town
    for (const p of PLOTS) {
      const x = rand();
      if (x < 0.45) continue;
      const t = BUILDING_TYPES[Math.floor(rand() * 3)];
      s = must(sim.place(s, p.id, t));
      if (rand() < 0.3) s = must(sim.upgrade(s, p.id));
    }
    const vacant = PLOTS.filter((p) => !s.buildings[p.id]);
    if (!vacant.length) continue;
    const plot = vacant[Math.floor(rand() * vacant.length)].id;
    for (const t of BUILDING_TYPES) {
      const est = sim.estimatePlacement(s, plot, t)!;
      const after = sim.stats(must(sim.place(s, plot, t)));
      assert.deepEqual(est.residents[1], after.residents);
      assert.deepEqual(est.income[1], after.incomePerTick);
      assert.deepEqual(est.happiness[1], after.happiness);
      for (const h of est.homeChanges) assert.equal(after.homeHappiness[h.id], h.after);
      for (const sc of est.shopChanges) assert.equal(after.activeShops[sc.id], sc.after);
      // Every home whose happiness changed is reported
      const before = sim.stats(s);
      for (const h of after.homes) if (before.homeHappiness[h.id] !== undefined && before.homeHappiness[h.id] !== h.happiness) assert.ok(est.homeChanges.some((c) => c.id === h.id));
    }
  }
});

test('upgrade estimates match the result of upgrading', () => {
  let s = rich();
  for (const [id, t] of [['p7', 'townhouse'], ['p8', 'park'], ['p9', 'townhouse'], ['p11', 'shop']] as [string, BuildingType][]) s = must(sim.place(s, id, t));
  for (const id of ['p7', 'p8', 'p11']) {
    const est = sim.estimateUpgrade(s, id)!;
    const after = sim.stats(must(sim.upgrade(s, id)));
    assert.equal(est.residents[1], after.residents);
    assert.equal(est.income[1], after.incomePerTick);
    assert.equal(est.happiness[1], after.happiness);
  }
  const ins = sim.inspect(s, 'p8')!;
  assert.ok(ins.upgrade.effects.some((e) => e.includes('+10 → +15')));
  assert.ok(ins.upgrade.effects.some((e) => /Average happiness 70 → 75/.test(e)), ins.upgrade.effects.join('|'));
});

test('inspection explains what affects a building and what to do next', () => {
  let s = rich();
  s = must(sim.place(s, 'p1', 'townhouse'));
  assert.match(sim.inspect(s, 'p1')!.hint, /Add a nearby park or shop/);
  s = must(sim.place(s, 'p20', 'shop'));
  const shop = sim.inspect(s, 'p20')!;
  assert.equal(shop.active, false);
  assert.match(shop.hint, /needs a nearby home/);
  s = must(sim.place(s, 'p3', 'park'));
  const home = sim.inspect(s, 'p1')!;
  assert.deepEqual(home.nearbyParks, [{ id: 'p3', bonus: 10 }]);
  assert.deepEqual(home.contributions.map((c) => c.value), [50, 10]);
  assert.match(home.hint, /nearby shop/);
  assert.equal(sim.inspect(s, 'p5'), null, 'vacant plots have no inspection');
});

// ---- Undo ---------------------------------------------------------------------------------------

test('undo after an upgrade and income ticks refunds the upgrade only, keeping income', () => {
  let s = must(sim.place(createInitialState(), 'p1', 'townhouse')); // 9000
  s = must(sim.upgrade(s, 'p1')); // 7500
  s = sim.tick(sim.tick(s)); // +180 × 2
  assert.equal(s.money, 7860);
  const u = sim.undo(s);
  assert.ok(u.ok);
  if (!u.ok) return;
  assert.equal(u.undone.kind, 'upgrade');
  assert.equal(u.state.money, 7860 + 1500);
  assert.deepEqual(u.state.buildings.p1, { type: 'townhouse', level: 1 });
  assert.equal(sim.stats(u.state).residents, 10);
  assert.equal(sim.stats(u.state).incomePerTick, 100);
  assert.equal(sim.undo(u.state).ok, false, 'single-level undo: the earlier placement is not undoable');
});

test('undo of a park upgrade restores happiness exactly', () => {
  let s = rich();
  s = must(sim.place(s, 'p10', 'townhouse'));
  s = must(sim.place(s, 'p11', 'park'));
  const before = sim.stats(s);
  s = must(sim.upgrade(s, 'p11'));
  const u = sim.undo(s);
  assert.ok(u.ok);
  if (u.ok) assert.deepEqual(sim.stats(u.state), before);
});

test('random action sequences never create money (money + spent = start + income)', () => {
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let s = createInitialState();
  let income = 0;
  const spentOn = (st: GameState) =>
    Object.values(st.buildings).reduce((n, b) => n + BUILDINGS[b.type].cost + (b.level === 2 ? BUILDINGS[b.type].upgradeCost : 0), 0);
  for (let i = 0; i < 2000; i++) {
    const r = rand();
    const p = PLOTS[Math.floor(rand() * PLOTS.length)].id;
    if (r < 0.3) {
      const res = sim.place(s, p, BUILDING_TYPES[Math.floor(rand() * 3)]);
      if (res.ok) s = res.state;
    } else if (r < 0.5) {
      const res = sim.upgrade(s, p);
      if (res.ok) s = res.state;
    } else if (r < 0.7) {
      const res = sim.undo(s);
      if (res.ok) s = res.state;
    } else {
      income += sim.stats(s).incomePerTick;
      s = sim.tick(s);
    }
    assert.equal(s.money + spentOn(s), RULES.startingMoney + income, `step ${i}`);
    assert.ok(s.money >= 0);
  }
});

// ---- Chapters ----------------------------------------------------------------------------------

test('chapter completion happens once and is never revoked', () => {
  const store: KeyValueStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const g = new Game(store, () => 0);
  const completed: number[] = [];
  g.onChapterComplete = (i) => completed.push(i);
  const plan: [string, BuildingType][] = [
    ['p11', 'park'], ['p8', 'park'], ['p14', 'shop'], ['p7', 'townhouse'], ['p9', 'townhouse'], ['p10', 'townhouse'], ['p12', 'townhouse'], ['p13', 'townhouse'],
  ];
  for (const [id, t] of plan) {
    g.select(t);
    assert.ok(g.place(id));
  }
  assert.deepEqual(completed, [0]);
  // Undo drops below the goal, then rebuild: no second award
  assert.ok(g.undo());
  assert.equal(g.state.chapter, 1);
  g.select('townhouse');
  assert.ok(g.place('p13'));
  for (let i = 0; i < 5; i++) g.update(10);
  assert.deepEqual(completed, [0], 'chapter 1 awarded exactly once');
});

test('a legal sequence of actions completes all three chapters (with income ticks)', () => {
  let s = createInitialState();
  let ticks = 0;
  const afford = (cost: number) => {
    while (s.money < cost) {
      s = sim.tick(s);
      ticks++;
      assert.ok(ticks < 500, 'economy stalled');
    }
  };
  const place = (id: string, t: BuildingType) => {
    afford(BUILDINGS[t].cost);
    s = must(sim.place(s, id, t));
  };
  const upgrade = (id: string) => {
    afford(BUILDINGS[s.buildings[id].type].upgradeCost);
    s = must(sim.upgrade(s, id));
  };

  // Chapter 1: Symons cluster with a central park, a second park and a shop.
  place('p11', 'park'); place('p8', 'park'); place('p14', 'shop');
  for (const id of ['p7', 'p9', 'p10', 'p12', 'p13']) place(id, 'townhouse');
  assert.equal(s.chapter, 1, 'chapter 1');
  const ticksCh1 = ticks;

  // Chapter 2: 80 residents, two active shops, two upgraded homes.
  place('p15', 'townhouse');
  place('p6', 'shop'); // across Blacklands Terrace, within 80 m of plot 13
  upgrade('p10'); upgrade('p12');
  assert.equal(s.chapter, 2, `chapter 2: ${JSON.stringify(sim.stats(s).residents)}`);
  const ticksCh2 = ticks;

  // Chapter 3: 100 residents and 80 happiness, with two upgraded parks.
  upgrade('p11'); upgrade('p8');
  upgrade('p7'); upgrade('p9');
  const st = sim.stats(s);
  assert.equal(st.residents, 100);
  assert.ok((st.happiness ?? 0) >= 80, `happiness ${st.happiness}`);
  assert.equal(s.chapter, CHAPTER_COUNT, 'all chapters complete');
  assert.match(chapterHint(s.chapter, st), /keep building/);

  // Pacing: waiting time in ticks (10 s each) across the whole run, excluding thinking time.
  assert.ok(ticks <= 40, `total waiting ${ticks} ticks`);
  console.log(`  pacing: waited ${ticksCh1} ticks for ch1, ${ticksCh2 - ticksCh1} for ch2, ${ticks - ticksCh2} for ch3 (${(ticks * 10) / 60} min total)`);
});

test('chapters complete in order even if later goals are already met', () => {
  // Meet chapter 2 conditions while chapter 1 is unmet (happiness too low): chapter stays 0.
  let s = rich();
  for (const id of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p16', 'p17']) s = must(sim.upgrade(must(sim.place(s, id, 'townhouse')), id));
  assert.equal(sim.stats(s).residents, 160);
  assert.equal(s.chapter, 0, 'happiness 50 < 70, so chapter 1 is not met and later chapters wait');
});
