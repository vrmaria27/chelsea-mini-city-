// Downloads openly licensed reference photos of King's Road from Sloane Square to the Markham Square
// junction from Wikimedia Commons, with author, licence, date and camera position, for modelling
// reference only (never shipped in the app). Photos are found by geographic search at points along
// the road, plus text searches for named buildings and addresses.
// Usage: node scripts/refs/fetch-commons-kr.mjs [outDir]
// (Run by .github/workflows/fetch-references-kr.yml on the references-kr branch.)
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || 'references/kr';
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
// King's Road centreline (lat, lon), Sloane Square → Markham Square, sampled every ~35 m.
const LINE = [[51.49224, -0.15837], [51.49176, -0.15941], [51.49108, -0.16076], [51.49016, -0.16245], [51.4897, -0.16328], [51.48936, -0.16398], [51.48901, -0.16492]];
const pts = [];
for (let i = 0; i < LINE.length - 1; i++) {
  const [a, b] = [LINE[i], LINE[i + 1]];
  const d = Math.hypot((b[0] - a[0]) * 111195, (b[1] - a[1]) * 69290);
  const n = Math.max(1, Math.round(d / 35));
  for (let k = 0; k < n; k++) pts.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
}
pts.push(LINE.at(-1));
const files = new Map(); // title -> source
for (const [lat, lon] of pts) {
  const r = await q({ action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: '45', gsnamespace: '6', gslimit: '100' });
  for (const g of r.query?.geosearch ?? []) if (!files.has(g.title)) files.set(g.title, 'geo');
}
const SEARCH = [
  "King's Road Chelsea shops", "King's Road Chelsea buildings", "King's Road Chelsea terrace", "Kings Road Chelsea geograph",
  'Markham Square Chelsea', "Markham Square King's Road", 'Smith Street Chelsea', 'Wellington Square Chelsea', 'Royal Avenue Chelsea',
  'Bywater Street Chelsea', 'Anderson Street Chelsea', 'Lincoln Street Chelsea', 'Blacklands Terrace', 'Cheltenham Terrace Chelsea',
  'Tryon Street Chelsea', 'Kings Walk Chelsea', 'Sidney Smith Buildings', "King's Road Chelsea Marks and Spencer", 'Whitelands House Chelsea',
  "Royal Avenue House King's Road", 'Walpole Street Chelsea', 'Mitre House Chelsea', "King's Road Chelsea 1960s", "King's Road Chelsea listed",
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
  if (m.how === 'search' && m.lat !== null && !(m.lat > 51.4880 && m.lat < 51.4930 && m.lon > -0.1660 && m.lon < -0.1575)) continue;
  if (n >= 260) break;
  try {
    const buf = Buffer.from(await (await fetch(m.thumb, { headers: UA })).arrayBuffer());
    m.file = `${String(++n).padStart(3, '0')}.jpg`;
    writeFileSync(`${out}/${m.file}`, buf);
    meta.push(m);
  } catch (e) { console.warn(e.message); }
}
console.log('candidates', got.length, 'downloaded', n);
writeFileSync(`${out}/index.json`, JSON.stringify(meta, null, 1));
