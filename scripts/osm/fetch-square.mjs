// Fetches everything OpenStreetMap holds for a small local area (trees, paving, fountains, benches,
// barriers, planters, lamps; or, with --buildings, every building, part and shop node).
// Usage: node scripts/osm/fetch-square.mjs [--area square|doy] [--buildings] [--out file.json]
// Data © OpenStreetMap contributors, available under the Open Database License (ODbL 1.0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SQUARE_BBOX = { south: 51.4914, west: -0.1600, north: 51.4936, east: -0.1552 };
/** Duke of York Square, the Saatchi Gallery (Duke of York's HQ) and their lawns, to King's Road. */
export const DOY_BBOX = { south: 51.4893, west: -0.1614, north: 51.4920, east: -0.1572 };
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const area = arg('--area') ?? 'square';
const BBOX = area === 'doy' ? DOY_BBOX : SQUARE_BBOX;
const out = arg('--out') ?? 'data/osm/square-raw.json';
const { south, west, north, east } = BBOX;
// --buildings: every building, building part and shop/amenity node around the square, with full member
// geometry for multipolygon relations (the main extract has none), for the perimeter reconstruction.
const buildingsMode = process.argv.includes('--buildings');
const buildingQuery = `[out:json][timeout:120][bbox:${south},${west},${north},${east}];
(
  way["building"];
  way["building:part"];
  relation["building"];
  relation["building:part"];
  node["shop"];
  node["amenity"];
  node["office"];
  node["tourism"];
  node["railway"];
  node["public_transport"];
  node["entrance"];
);
out geom tags meta;`;
const squareQuery = `[out:json][timeout:120][bbox:${south},${west},${north},${east}];
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
  nwr["shop"];
  nwr["entrance"];
  nwr["surface"];
  nwr["footway"];
  nwr["fountain"];
  nwr["water"];
  nwr["building"];
  nwr["building:part"];
);
out geom tags meta;`;
const query = buildingsMode ? buildingQuery : squareQuery;
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
      bbox: BBOX, area, query, elements: data.elements,
    }, null, 0));
    console.log(`Wrote ${data.elements.length} elements → ${out}`);
    process.exit(0);
  } catch (e) { lastErr = e; console.warn(`  failed: ${e.message}`); }
}
console.error('All Overpass endpoints failed:', lastErr?.message);
process.exit(1);
