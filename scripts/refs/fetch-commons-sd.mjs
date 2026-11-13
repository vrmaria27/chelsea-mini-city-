// Downloads openly licensed reference photos of the side streets connecting the reconstructed areas
// (points along each street in scripts/refs/sd-points.json) from Wikimedia Commons, with author, licence, date and camera position, for modelling
// reference only (never shipped in the app). Photos are found by geographic search at points along
// the road, plus text searches for named buildings and addresses.
// Usage: node scripts/refs/fetch-commons-sd.mjs [outDir]
// (Run by .github/workflows/fetch-references-sd.yml on the references-sd branch.)
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || 'references/sd';
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
import { readFileSync } from 'node:fs';
const SD = JSON.parse(readFileSync(new URL('./sd-points.json', import.meta.url), 'utf8'));
const pts = SD.points;
const files = new Map(); // title -> source
for (const [lat, lon] of pts) {
  const r = await q({ action: 'query', list: 'geosearch', gscoord: `${lat}|${lon}`, gsradius: '40', gsnamespace: '6', gslimit: '100' });
  for (const g of r.query?.geosearch ?? []) if (!files.has(g.title)) files.set(g.title, 'geo');
}
const SEARCH = SD.streets.flatMap((s) => [`${s} Chelsea`, `${s} London geograph`]).concat(['Peter Jones Cadogan Gardens', 'Royal Avenue Chelsea houses', 'Sloane Gardens Chelsea', 'Holbein Place shops', 'Bourne Street Belgravia', 'Cliveden Place Belgravia', 'Smith Terrace Chelsea', 'Markham Square Chelsea']);
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
  if (m.how === 'search' && m.lat !== null && !(m.lat > 51.4880 && m.lat < 51.4944 && m.lon > -0.1651 && m.lon < -0.1549)) continue;
  if (n >= 420) break;
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
// trigger 2026-11-13T21:59:41
