// One view model for the inspector, rendered by both the desktop HTML card and the VR panel.
import { BUILDINGS } from '../sim/rules';
import { formatMoney } from '../sim/simulation';
import type { Game } from './game';

export interface InspectorView {
  mode: 'inspect' | 'preview' | 'idle';
  title: string;
  subtitle: string;
  level: number | null;
  stats: { label: string; value: string }[];
  /** Happiness contributions or effect lines: [label, value]. */
  rows: { label: string; value: string }[];
  nearby: string[];
  hint: string;
  hintKind: 'good' | 'action' | 'warn';
  upgrade: { label: string; effects: string[]; enabled: boolean; reason: string | null } | null;
}

export function inspectorView(game: Game): InspectorView {
  const ins = game.inspection();
  if (ins) {
    const spec = BUILDINGS[ins.type];
    const stats = [
      { label: 'Residents', value: ins.type === 'townhouse' ? String(ins.residents) : '—' },
      { label: 'Income / tick', value: formatMoney(ins.income) },
    ];
    if (ins.happiness !== null) stats.push({ label: 'Happiness', value: String(ins.happiness) });
    else if (ins.active !== null) stats.push({ label: 'Status', value: ins.active ? 'Active' : 'Idle' });
    else stats.push({ label: 'Homes helped', value: String(ins.servedHomes.length) });
    const rows = ins.contributions.map((c) => ({
      label: c.label,
      value: ins.type === 'shop' ? formatMoney(c.value) + '/tick' : ins.type === 'park' ? `+${c.value}` : c.label.startsWith('Base') ? String(c.value) : c.value < 0 ? String(c.value) : `+${c.value}`,
    }));
    const nearby: string[] = [];
    if (ins.type === 'townhouse') {
      nearby.push(ins.nearbyShops.length ? `Shops nearby: ${ins.nearbyShops.map((s) => game.plotName(s)).join(', ')}` : 'No shop within 80 m');
      nearby.push(ins.nearbyParks.length ? `Parks nearby: ${ins.nearbyParks.map((p) => `${game.plotName(p.id)} (+${p.bonus})`).join(', ')}` : 'No park within 80 m');
    } else {
      nearby.push(ins.servedHomes.length ? `Homes in range: ${ins.servedHomes.map((h) => game.plotName(h)).join(', ')}` : 'No homes within 80 m');
    }
    const good = ins.happiness === 100 || (ins.type !== 'townhouse' && ins.servedHomes.length > 0);
    const warn = (ins.type === 'shop' && !ins.active) || (ins.type === 'park' && !ins.servedHomes.length) || (ins.type === 'townhouse' && !ins.nearbyShops.length && !ins.nearbyParks.length);
    const u = ins.upgrade;
    return {
      mode: 'inspect',
      title: `${spec.label} · ${game.plotName(ins.plotId).replace('plot', 'Plot')}`,
      subtitle: ins.level === 2 ? 'Level 2 (fully upgraded)' : 'Level 1',
      level: ins.level,
      stats,
      rows,
      nearby,
      hint: ins.hint,
      hintKind: warn ? 'warn' : good ? 'good' : 'action',
      upgrade: u.available
        ? { label: `Upgrade to Level 2: ${formatMoney(u.cost)}`, effects: u.effects, enabled: u.affordable, reason: u.reason }
        : { label: 'Level 2 reached', effects: [], enabled: false, reason: 'Already upgraded' },
    };
  }
  const pv = game.preview();
  if (pv && pv.type) {
    const spec = BUILDINGS[pv.type];
    return {
      mode: 'preview',
      title: `Preview: ${spec.label} on plot ${pv.plot.number}`,
      subtitle: `Costs ${formatMoney(spec.cost)} · you have ${formatMoney(game.state.money)}`,
      level: null,
      stats: [],
      rows: pv.details.map((d) => ({ label: d, value: '' })),
      nearby: [],
      hint: pv.ok ? 'Click or pull the trigger on this plot to build.' : pv.text.split(': ').slice(1).join(': ') || 'Cannot build here.',
      hintKind: pv.ok ? 'action' : 'warn',
      upgrade: null,
    };
  }
  return {
    mode: 'idle',
    title: 'Inspector',
    subtitle: game.tool === 'inspect' ? 'Point at a building and select it.' : 'Hover a plot to preview, or select a building to inspect it.',
    level: null,
    stats: [],
    rows: [],
    nearby: [],
    hint: 'Shops and parks affect homes within 80 m. Inspect any building to see why it is (or isn’t) happy.',
    hintKind: 'action',
    upgrade: null,
  };
}
