// Downloads openly licensed reference photos of Sloane Street (Sloane Square to the map's north edge) and
// Lower Sloane Street (Sloane Square to Pimlico Road) from Wikimedia Commons, with author, licence, date and camera position, for modelling
// reference only (never shipped in the app). Photos are found by geographic search at points along
// the road, plus text searches for named buildings and addresses.
// Usage: node scripts/refs/fetch-commons-ss.mjs [outDir]
// (Run by .github/workflows/fetch-references-ss.yml on the references-ss branch.)
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || 'references/ss';
mkdirSync(out, { recursive: true });
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'chelsea-mini-city-reference-fetch/1.0 (https://github.com/vrmaria27/chelsea-mini-city-)' };
const q = async (params) => {
  for (let i = 0; i < 4; i++) {
    try { return await (await fetch(API + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params }), { headers: UA })).json(); }
    catch (e) { await new Promise((r) => setTimeout(r, 2000)); }
  }
  return {};
};
// Centrelines (lat, lon) sampled every ~35 m: Sloane Street north from the square; Lower Sloane Street south.
const LINES = [
  [[51.49276, -0.15775], [51.49355, -0.15807], [51.4944, -0.15820]],
  [[51.49227, -0.15757], [51.49073, -0.15710], [51.49043, -0.15701], [51.49028, -0.15690], [51.48989, -0.15628], [51.48961, -0.15584]],
];
const pts = [];
for (const LINE of LINES) for (let i = 0; i < LINE.length - 1; i++) {
  const [a, b] = [LINE[i], LINE[i + 1]];
  const d = Math.hypot((b[0] - a[0]) * 111195, (b[1] - a[1]) * 69290);
  const n = Math.max(1, Math.round(d / 35));
  for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
}
for (const L of LINES) pts.push(L.at(-1));
const files = new Map(); // title -> source
for (const [lat, lon] of pts) {
  const r = await q({ action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: '45', gsnamespace: '6', gslimit: '100' });
  for (const g of r.query?.geosearch ?? []) if (!files.has(g.title)) files.set(g.title, 'geo');
}
const SEARCH = [
  'Sloane Street London', 'Sloane Street Chelsea', 'Sloane Street geograph', 'Sloane Street shops', 'Lower Sloane Street', 'Lower Sloane Street geograph',
  'Holy Trinity Sloane Street', 'Sloane Square north side', 'Sloane Square south side', 'Cadogan Place Sloane Street', 'Sloane Terrace Chelsea', 'Wilbraham Place',
  'Sloane Gardens Chelsea', 'Sedding Street', 'Holbein Place', 'Turks Row', 'Pimlico Road Chelsea', 'Chelsea Bridge Road', 'Royal Hospital Road Lower Sloane',
  'Sloane Square station', 'Cliveden Place', 'Symons Street', 'Sloane Street 2025', 'Sloane Street 2024', 'Sloane Street 2023', 'Sloane Street 2026',
  'Sloane Street Cadogan', 'Sloane Street boutique', 'Sloane Street listed building', 'Lower Sloane Street 2024', 'Chelsea Barracks Lower Sloane', 'Sloane Street plane trees',
];
for (const term of SEARCH) {
  const r = await q({ action: 'query', list: 'search', srsearch: term, srnamespace: '6', srlimit: '40' });
  for (const s of r.query?.search ?? []) if (!files.has(s.title)) files.set(s.title, 'search');
}
const list = [...files.keys()].filter((f) => /\.(jpe?g|png)$/i.test(f));
const got = [];
for (let i = 0; i < list.length; i += 40) {
  const r = await q({ action: 'query', titles: list.slice(i, i + 40).join('|'), prop: 'imageinfo|coordinates', coprop: 'type|dim', colimit: 'max', iiprop: 'url|extmetadata|size', iiurlwidth: '1024' });
  for (const p of Object.values(r.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const em = ii.extmetadata ?? {}; const v = (k) => (em[k]?.value ?? '').replace(/<[^>]+>/g, '').trim();
    const co = p.coordinates?.[0];
    got.push({
      title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, date: v('DateTimeOriginal') || v('DateTime'), author: v('Artist'), licence: v('LicenseShortName'),
      description: v('ImageDescription').slice(0, 400), lat: co?.lat ?? null, lon: co?.lon ?? null, how: files.get(p.title), heading: v('GPSImgDirection') || null,
    });
  }
}
// Most recent first; drop interiors, maps, posters and pre-1990 photographs
got.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
const meta = [];
let n = 0;
for (const m of got) {
  if (!/cc|public domain|pd/i.test(m.licence)) continue;
  if (/interior|inside|map|plan|logo|poster|menu|food|dish|cake|1[89]\d\d[^\d]|19[0-8]\d/i.test(m.title + ' ' + m.description + ' ' + m.date.slice(0, 4))) continue;
  if (m.how === 'search' && m.lat !== null && !(m.lat > 51.4890 && m.lat < 51.4947 && m.lon > -0.1592 && m.lon < -0.1548)) continue;
  if (n >= 260) break;
  try {
    // Commons rate-limits bursts: pace the downloads and keep only real JPEG/PNG data
    let buf = null;
    for (let i = 0; i < 5 && !buf; i++) {
      await new Promise((r) => setTimeout(r, 1500 + i * 4000));
      const res = await fetch(m.thumb, { headers: UA });
      const b = Buffer.from(await res.arrayBuffer());
      if (res.ok && (b[0] === 0xff || b[0] === 0x89)) buf = b;
    }
    if (!buf) { console.warn('skipped', m.title); continue; }
    m.file = `${String(++n).padStart(3, '0')}.jpg`;
    writeFileSync(`${out}/${m.file}`, buf);
    meta.push(m);
  } catch (e) { console.warn(e.message); }
}
console.log('candidates', got.length, 'downloaded', n);
writeFileSync(`${out}/index.json`, JSON.stringify(meta, null, 1));
