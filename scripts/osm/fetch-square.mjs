// Fetches everything OpenStreetMap holds for the central space of Sloane Square (trees, paving,
// fountain, benches, barriers, planters, lamps) from a small box around it.
// Usage: node scripts/osm/fetch-square.mjs [--out data/osm/square-raw.json]
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SQUARE_BBOX = { south: 51.4914, west: -0.1600, north: 51.4936, east: -0.1552 };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'data/osm/square-raw.json';
const { south, west, north, east } = SQUARE_BBOX;
const query = `[out:json][timeout:120][bbox:${south},${west},${north},${east}];
(
  nwr["natural"];
  nwr["amenity"];
  nwr["leisure"];
  nwr["landuse"];
  nwr["barrier"];
  nwr["man_made"];
  nwr["highway"];
  nwr["area:highway"];
  nwr["historic"];
  nwr["tourism"];
  nwr["memorial"];
  nwr["artwork_type"];
  nwr["place"];
  nwr["denotation"];
  nwr["species"];
  nwr["genus"];
);
out geom tags meta;`;
const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
let lastErr;
for (const url of endpoints) {
  try {
    console.log(`Querying ${url} …`);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'chelsea-mini-city-map-importer/1.0 (https://github.com/vrmaria27/chelsea-mini-city-)' },
      body: 'data=' + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    if (!Array.isArray(data.elements) || data.elements.length < 20) throw new Error(`Suspiciously small result (${data.elements?.length})`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify({
      source: 'OpenStreetMap via Overpass API', endpoint: url,
      licence: 'ODbL 1.0 — © OpenStreetMap contributors — https://www.openstreetmap.org/copyright',
      retrieved: new Date().toISOString(), osm_base: data.osm3s?.timestamp_osm_base ?? null,
      bbox: SQUARE_BBOX, query, elements: data.elements,
    }, null, 0));
    console.log(`Wrote ${data.elements.length} elements → ${out}`);
    process.exit(0);
  } catch (e) { lastErr = e; console.warn(`  failed: ${e.message}`); }
}
console.error('All Overpass endpoints failed:', lastErr?.message);
process.exit(1);
