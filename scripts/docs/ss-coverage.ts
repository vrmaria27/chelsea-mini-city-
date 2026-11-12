// Prints the Sloane Street / Lower Sloane Street coverage tables (docs/sloane-streets.md):
//   npx tsx scripts/docs/ss-coverage.ts
import { OSM } from '../../src/map/osmMap';
import { SS_SPECS as KR_SPECS } from '../../src/map/landmarks/sloaneStreetSpecs';
import { krFronts, withCorridorLine, type KrData } from '../../src/map/landmarks/kingsRoad';

const o = OSM as unknown as { corridors: (KrData & { id: string; name: string; frontages: { id: string; s: number; d: number }[] })[]; buildings: { id: string; h: number; rings: number[][] }[] };
for (const cor of o.corridors) {
const CONF = { observed: 'Observed', partly: 'Partly observed', estimated: 'Estimated' } as const;
const rows = new Map<string, { s: number; id: string; ids: string[]; w: number; ret: number }>();
for (const f of cor.frontages) {
  const key = f.id.replace(/-\d+$/, '');
  const bl = o.buildings.find((b) => b.id === f.id)!;
  const others = o.buildings.filter((b) => b.id !== f.id).map((b) => b.rings[0]);
  const { kr, ret } = withCorridorLine(cor.id, () => krFronts({ bl, others } as never, KR_SPECS[key]?.frontD));
  const w = kr.reduce((s, e) => s + e.len, 0), r = ret.reduce((s, e) => s + e.len, 0);
  const row = rows.get(key);
  if (row) { row.w += w; row.ret += r; row.ids.push(f.id); row.s = Math.min(row.s, f.s); } else rows.set(key, { s: f.s, id: key, ids: [f.id], w, ret: r });
}
const esc = (t: string) => t.replace(/\|/g, '/');
const mat = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase();
for (const side of ['W', 'E'] as const) {
  console.log(`\n### ${cor.name}, ${side === 'W' ? 'west' : 'east'} side, outward from Sloane Square\n`);
  console.log('| Chainage | Address | OSM | Storeys, height | Front (m) | Upper bays | Materials | Roof / top | Ground floor | Status | Sources | Remaining approximations |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of [...rows.values()].filter((x) => KR_SPECS[x.id].side === side).sort((a, b) => a.s - b.s)) {
    const s = KR_SPECS[r.id];
    const h = s.floors.reduce((a, b) => a + b, 0) + (s.top.h ?? 0.6) + (s.roof && s.roof.kind !== 'flat' ? s.roof.h ?? 2.5 : 0);
    const storeys = `${s.floors.length}${s.roof?.kind === 'mansard' ? ' + mansard' : s.gables ? ' + gables' : ''}, ≈${h.toFixed(0)} m`;
    const g = s.ground;
    const ground = g.kind === 'shops' ? `${g.units ?? 1} shopfront${(g.units ?? 1) > 1 ? 's' : ''}${g.consoles ? ', consoles' : ''}${g.recess ? ', recessed doors' : ''}` : g.kind === 'pub' ? 'Victorian pub front' : g.kind === 'glass' ? 'full-height glazing' : g.kind === 'stone' ? 'stone base, large openings' : g.kind === 'podium' ? 'rendered base' : 'arcade';
    const roof = `${s.roof?.kind && s.roof.kind !== 'flat' ? s.roof.kind + ', ' : ''}${s.top.kind}${s.chimneys ? `, ${s.chimneys} stack${s.chimneys > 1 ? 's' : ''}` : ''}`;
    const front = `${r.w.toFixed(0)}${r.ret > 0.5 ? ` (+${Math.min(r.ret, 16).toFixed(0)} return)` : ''}`;
    console.log(`| ${r.s.toFixed(0)} m | ${esc(s.addr)}${s.name && !s.addr.includes(s.name) ? ` (${s.name})` : ''} | ${r.ids.join(', ')} | ${storeys} | ${front} | ${s.bays}${s.returnBays ? ` + ${s.returnBays}` : ''} | ${mat(s.wall)}${s.base && s.base !== s.wall ? ` over ${mat(s.base)}` : ''} | ${roof} | ${ground} | ${CONF[s.conf]} | ${esc(s.src)} | ${esc(s.approx ?? '—')} |`);
  }
}
const all = [...rows.values()].map((r) => KR_SPECS[r.id]);
console.log(`\n${cor.name}: ${all.length} buildings: ${all.filter((s) => s.conf === 'observed').length} observed, ${all.filter((s) => s.conf === 'partly').length} partly observed, ${all.filter((s) => s.conf === 'estimated').length} estimated.`);
}
