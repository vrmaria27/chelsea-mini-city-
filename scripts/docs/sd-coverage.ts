// Prints the side-street coverage tables (docs/side-streets.md):
//   npx tsx scripts/docs/sd-coverage.ts
import { OSM } from '../../src/map/osmMap';
import { SD_SPECS, SIDE_CORRIDORS, PROFILES } from '../../src/map/landmarks/sideStreetSpecs';
import { NavField, type NavData } from '../../src/explore/nav';

const PRIORITY: Record<string, number> = {
  symons: 1, culford: 1, 'cadogan-gdns': 1, pavilion: 1, 'cadogan-gdns-n': 1,
  cheltenham: 2, franklins: 2, turks: 2, 'royal-ave': 2, walpole: 2, 'doy-lane': 2,
  holbein: 3, 'sloane-gdns': 3, 'holbein-mews': 3, whittaker: 3, bourne: 3, cliveden: 3, sedding: 3, 'sloane-tce': 3, wilbraham: 3, ellis: 3, 'sloane-ct-e': 3, 'sloane-ct-w': 3, 'graham-tce': 3,
};
const nav = new NavField(OSM as unknown as NavData);
const cors = (OSM as unknown as { corridors: { id: string; name: string; sEnd: number; line: number[]; shared?: boolean; pedestrian?: boolean }[] }).corridors.filter((c) => c.id.startsWith('sd-'));
/** Map point at chainage s along a centreline. */
function at(line: number[], s: number): [number, number] {
  let acc = 0;
  for (let i = 0; i + 3 < line.length; i += 2) { const l = Math.hypot(line[i + 2] - line[i], line[i + 3] - line[i + 1]); if (acc + l >= s) { const f = (s - acc) / l; return [line[i] + (line[i + 2] - line[i]) * f, line[i + 1] + (line[i + 3] - line[i + 1]) * f]; } acc += l; }
  return [line[line.length - 2], line[line.length - 1]];
}
const CONF = { observed: 'observed', partly: 'partly', estimated: 'estimated' } as const;
const esc = (t: string) => t.replace(/\|/g, '/');
const mat = (k: string) => k.replace(/([A-Z])/g, ' $1').toLowerCase();

console.log('| P | Street | In-map extent | Surface | Frontages built | Observed / partly / estimated | End | Photographs |');
console.log('|---|---|---|---|---|---|---|---|');
const rows = cors.map((c) => ({ c, p: PRIORITY[c.id.slice(3)] ?? 4 })).sort((a, b) => a.p - b.p || a.c.name.localeCompare(b.c.name));
for (const { c, p } of rows) {
  const sc = SIDE_CORRIDORS.find((k) => k.id === c.id)!;
  const specs = sc.frontages.map((f) => SD_SPECS[f.id.replace(/-\d+$/, '')]);
  const n = (k: keyof typeof CONF) => specs.filter((s) => s.conf === k).length;
  const nc = nav.corridors.find((k) => k.id === c.id)!;
  const prof = PROFILES[c.id]?.both ?? PROFILES[c.id]?.L ?? PROFILES[c.id]?.R;
  const photos = prof ? (prof.src.match(/C:\d+/g) ?? []).length : 0;
  const surface = c.pedestrian ? 'pedestrian lane' : c.shared ? 'shared (walk on the carriageway)' : 'carriageway + pavements';
  console.log(`| ${p} | ${c.name} (${c.id}) | ${c.sEnd.toFixed(0)} m from its junction${Math.max(...at(c.line, c.sEnd).map(Math.abs)) > 330 ? ', to the map edge' : ''} | ${surface} | ${sc.frontages.length} | ${n('observed')} / ${n('partly')} / ${n('estimated')} | ${nc.open ? 'open (continues into the reconstruction)' : 'end-of-area message'} | ${photos ? `${photos} (C:)` : 'none found'} |`);
}

console.log('\n### Buildings\n');
console.log('| Street | Address | OSM | Storeys | Walls | Ground floor | Status | Sources |');
console.log('|---|---|---|---|---|---|---|---|');
for (const { c } of rows) {
  const sc = SIDE_CORRIDORS.find((k) => k.id === c.id)!;
  const seen = new Set<string>();
  for (const f of [...sc.frontages].sort((a, b) => a.s - b.s)) {
    const key = f.id.replace(/-\d+$/, '');
    if (seen.has(key)) continue; seen.add(key);
    const s = SD_SPECS[key];
    const g = s.ground;
    const ground = g.kind === 'shops' ? `${g.units ?? 1} shopfront${(g.units ?? 1) > 1 ? 's' : ''}` : g.kind === 'residential' ? (g.garages ? 'mews garages' : 'houses / entrances') : g.kind;
    const src = s.src.length > 140 ? `${s.src.slice(0, 137)}…` : s.src;
    console.log(`| ${c.name} | ${esc(s.addr)}${s.name && !s.addr.includes(s.name) ? ` (${esc(s.name)})` : ''} | ${f.id} | ${s.floors.length}${s.roof?.kind === 'mansard' ? ' + mansard' : s.gables ? ' + gables' : ''} | ${mat(s.wall)}${s.base && s.base !== s.wall ? ` over ${mat(s.base)}` : ''}${s.houses ? ' (painted houses)' : ''} | ${ground} | ${CONF[s.conf]} | ${esc(src)} |`);
  }
}
const all = SIDE_CORRIDORS.flatMap((c) => c.frontages.map((f) => SD_SPECS[f.id.replace(/-\d+$/, '')]));
console.log(`\n${all.length} side-street buildings: ${all.filter((s) => s.conf === 'observed').length} observed, ${all.filter((s) => s.conf === 'partly').length} partly observed, ${all.filter((s) => s.conf === 'estimated').length} estimated.`);
