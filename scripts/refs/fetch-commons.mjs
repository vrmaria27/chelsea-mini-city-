// Downloads openly licensed reference photos of Sloane Square from Wikimedia Commons, with
// author/licence/date metadata, for modelling reference only (they are not shipped in the game).
// Usage: node scripts/refs/fetch-commons.mjs [outDir]
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || 'references/sloane-square';
mkdirSync(out, { recursive: true });
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'chelsea-mini-city-reference-fetch/1.0 (https://github.com/vrmaria27/chelsea-mini-city-)' };
const q = async (params) => (await fetch(API + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params }), { headers: UA })).json();

const roots = ['Category:Sloane Square', 'Category:Venus Fountain, Sloane Square', 'Category:Chelsea War Memorial', 'Category:Sloane Square War Memorial'];
const seenCats = new Set(), files = new Set();
async function walk(cat, depth) {
  if (seenCats.has(cat) || depth > 2) return;
  seenCats.add(cat);
  let cont = {};
  do {
    const r = await q({ action: 'query', list: 'categorymembers', cmtitle: cat, cmtype: 'file|subcat', cmlimit: '500', ...cont });
    for (const m of r.query?.categorymembers ?? []) {
      if (m.ns === 14) { if (/sloane square|venus fountain|war memorial/i.test(m.title) && !/station|hotel|peter jones|royal court|theatre|bus/i.test(m.title)) await walk(m.title, depth + 1); }
      else files.add(m.title);
    }
    cont = r.continue ?? null;
  } while (cont);
}
for (const c of roots) await walk(c, 0);
// also a text search for recent uploads
for (const term of ['Sloane Square fountain', 'Sloane Square trees', 'Sloane Square 2026', 'Sloane Square 2025', 'Venus Fountain Sloane']) {
  const r = await q({ action: 'query', list: 'search', srsearch: term, srnamespace: '6', srlimit: '50' });
  for (const s of r.query?.search ?? []) files.add(s.title);
}
console.log('categories', [...seenCats].join(' | '));
console.log('candidate files', files.size);
const list = [...files].filter((f) => /\.(jpe?g|png)$/i.test(f));
const meta = [];
for (let i = 0; i < list.length; i += 40) {
  const r = await q({ action: 'query', titles: list.slice(i, i + 40).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size|timestamp', iiurlwidth: '1280' });
  for (const p of Object.values(r.query?.pages ?? {})) {
    const ii = p.imageinfo?.[0]; if (!ii) continue;
    const em = ii.extmetadata ?? {};
    const v = (k) => (em[k]?.value ?? '').replace(/<[^>]+>/g, '').trim();
    meta.push({ title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, width: ii.width, height: ii.height,
      date: v('DateTimeOriginal') || v('DateTime'), author: v('Artist'), licence: v('LicenseShortName'), licenceUrl: v('LicenseUrl'), description: v('ImageDescription').slice(0, 300), categories: v('Categories') });
  }
}
meta.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
let n = 0;
for (const m of meta) {
  if (!/cc|public domain|pd/i.test(m.licence)) continue;
  if (/station|tube|underground|platform|hotel|peter jones|royal court|theatre|bus|christmas|night|1909|map|plan/i.test(m.title + ' ' + m.description) && !/fountain|tree|memorial|square/i.test(m.description)) continue;
  if (n >= 70) break;
  try {
    const buf = Buffer.from(await (await fetch(m.thumb, { headers: UA })).arrayBuffer());
    m.file = `${String(++n).padStart(2, '0')}.jpg`;
    writeFileSync(`${out}/${m.file}`, buf);
  } catch (e) { m.error = String(e); }
}
writeFileSync(`${out}/index.json`, JSON.stringify(meta, null, 1));
console.log('downloaded', n, 'of', meta.length);
