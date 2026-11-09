// Step 1 of the map import: fetch a bounded OpenStreetMap extract from the Overpass API.
// Usage: node scripts/osm/fetch.mjs [--out data/osm/raw.json]
// The extract box is deliberately larger than the playable map; process.mjs clips it.
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const EXTRACT_BBOX = { south: 51.4860, west: -0.1700, north: 51.4975, east: -0.1500 };
const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'data/osm/raw.json';
const { south, west, north, east } = EXTRACT_BBOX;

const query = `[out:json][timeout:180][bbox:${south},${west},${north},${east}];
(
  way["highway"];
  way["building"];
  relation["building"];
  way["building:part"];
  way["leisure"~"^(park|garden|playground|pitch|common)$"];
  relation["leisure"~"^(park|garden)$"];
  way["landuse"~"^(grass|recreation_ground|village_green|religious)$"];
  way["place"="square"];
  relation["place"="square"];
  node["place"="square"];
  way["area:highway"];
  way["amenity"~"^(parking|marketplace)$"];
  nwr["tourism"~"^(museum|gallery|attraction|artwork)$"];
  nwr["amenity"~"^(theatre|place_of_worship|arts_centre|fountain|townhall)$"];
  nwr["railway"="station"];
  nwr["historic"];
);
out geom tags;`;

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
    if (!Array.isArray(data.elements) || data.elements.length < 100) throw new Error(`Suspiciously small result (${data.elements?.length})`);
    const file = {
      source: 'OpenStreetMap via Overpass API',
      endpoint: url,
      licence: 'ODbL 1.0 — © OpenStreetMap contributors — https://www.openstreetmap.org/copyright',
      retrieved: new Date().toISOString(),
      osm_base: data.osm3s?.timestamp_osm_base ?? null,
      bbox: EXTRACT_BBOX,
      query,
      elements: data.elements,
    };
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(file));
    const counts = {};
    for (const e of data.elements) counts[e.type] = (counts[e.type] ?? 0) + 1;
    console.log(`Saved ${data.elements.length} elements to ${out}`, counts, 'OSM base:', file.osm_base);
    process.exit(0);
  } catch (e) {
    lastErr = e;
    console.warn(`  failed: ${e.message}`);
  }
}
console.error('All Overpass endpoints failed:', lastErr?.message);
process.exit(1);
