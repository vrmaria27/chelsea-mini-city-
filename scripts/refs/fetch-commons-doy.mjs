// Downloads openly licensed reference photos of the Saatchi Gallery (Duke of York's Headquarters) and
// Duke of York Square from Wikimedia Commons with author/licence/date metadata (modelling reference
// only; never shipped in the app).
// Usage: node scripts/refs/fetch-commons-doy.mjs [outDir]
import { writeFileSync, mkdirSync } from 'node:fs';
const out = process.argv[2] || 'references/doy';
mkdirSync(out, { recursive: true });
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = { 'User-Agent': 'chelsea-mini-city-reference-fetch/1.0 (https://github.com/vrmaria27/chelsea-mini-city-)' };
const q = async (params) => (await fetch(API + '?' + new URLSearchParams({ format: 'json', origin: '*', ...params }), { headers: UA })).json();
const groups = {
  saatchi: { cats: ['Category:Saatchi Gallery', "Category:Duke of York's Headquarters"], search: ['Saatchi Gallery Chelsea exterior', "Duke of York's Headquarters Chelsea", "Duke of York's HQ King's Road", 'Saatchi Gallery portico', 'Saatchi Gallery London building'] },
  square: { cats: ['Category:Duke of York Square'], search: ['Duke of York Square Chelsea', "Duke of York Square King's Road", 'Duke of York Square fountain', 'Duke of York Square shops'] },
  approach: { cats: [], search: ["King's Road Duke of York Square entrance", "King's Road Chelsea Saatchi", "Duke of York Square King's Road junction", 'Cheltenham Terrace Chelsea'] },
  lawn: { cats: [], search: ['Saatchi Gallery lawn', 'Duke of York Square trees', "Duke of York's HQ lawn", 'Saatchi Gallery garden'] },
};
const meta = [];
const seen = new Set();
for (const [g, def] of Object.entries(groups)) {
  const files = new Set();
  for (const c of def.cats) {
    for (const sub of [c]) {
      const r = await q({ action: 'query', list: 'categorymembers', cmtitle: sub, cmtype: 'file|subcat', cmlimit: '200' });
      for (const m of r.query?.categorymembers ?? []) {
        if (m.ns === 14) { const r2 = await q({ action: 'query', list: 'categorymembers', cmtitle: m.title, cmtype: 'file', cmlimit: '100' }); for (const m2 of r2.query?.categorymembers ?? []) files.add(m2.title); }
        else files.add(m.title);
      }
    }
  }
  for (const term of def.search) {
    const r = await q({ action: 'query', list: 'search', srsearch: term, srnamespace: '6', srlimit: '25' });
    for (const s of r.query?.search ?? []) files.add(s.title);
  }
  const list = [...files].filter((f) => /\.(jpe?g|png)$/i.test(f) && !seen.has(f));
  const got = [];
  for (let i = 0; i < list.length; i += 40) {
    const r = await q({ action: 'query', titles: list.slice(i, i + 40).join('|'), prop: 'imageinfo', iiprop: 'url|extmetadata|size', iiurlwidth: '1280' });
    for (const p of Object.values(r.query?.pages ?? {})) {
      const ii = p.imageinfo?.[0]; if (!ii) continue;
      const em = ii.extmetadata ?? {}; const v = (k) => (em[k]?.value ?? '').replace(/<[^>]+>/g, '').trim();
      got.push({ group: g, title: p.title, page: ii.descriptionurl, thumb: ii.thumburl, date: v('DateTimeOriginal') || v('DateTime'), author: v('Artist'), licence: v('LicenseShortName'), description: v('ImageDescription').slice(0, 300) });
    }
  }
  got.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  let n = 0;
  for (const m of got) {
    if (!/cc|public domain|pd/i.test(m.licence) || n >= 40) continue;
    if (/interior|auditorium|inside|stage|platform|train|map|plan|logo|poster|1[89]\d\d[^\d]/i.test(m.title + ' ' + m.description)) continue;
    try {
      const buf = Buffer.from(await (await fetch(m.thumb, { headers: UA })).arrayBuffer());
      m.file = `${g}/${String(++n).padStart(2, '0')}.jpg`;
      mkdirSync(`${out}/${g}`, { recursive: true });
      writeFileSync(`${out}/${m.file}`, buf);
      seen.add(m.title);
      meta.push(m);
    } catch (e) { console.warn(e.message); }
  }
  console.log(g, 'downloaded', n, 'of', got.length);
}
writeFileSync(`${out}/index.json`, JSON.stringify(meta, null, 1));
