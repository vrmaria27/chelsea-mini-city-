// Downloads CC0 PBR textures from Poly Haven (https://polyhaven.com, licence: CC0 1.0) for the Sloane
// Square materials. For each material slot the first candidate that exists is used; its 1k JPG diffuse,
// OpenGL normal and roughness maps are saved with the asset's authors and licence in index.json.
// Runs in a GitHub workflow (the build sandbox has no network); the packed, downsized maps are made from
// these by scripts/assets/pack-textures.py and committed under public/tex.
import { mkdirSync, writeFileSync } from 'node:fs';
const out = process.argv[2] ?? 'references/textures';
const SLOTS = {
  brick: ['red_bricks_04', 'brick_wall_001', 'red_brick_03'],
  stockbrick: ['yellow_bricks', 'brick_wall_003', 'brick_wall_001'],
  stone: ['concrete_wall_008', 'beige_wall_001', 'plastered_wall_02', 'concrete_floor_02'],
  paving: ['concrete_floor_02', 'concrete_floor_worn_001', 'rough_concrete', 'concrete_tiles'],
  asphalt: ['asphalt_02', 'asphalt_01', 'asphalt_track'],
  metal: ['metal_plate', 'metal_plate_02', 'rusty_metal_02', 'corrugated_iron'],
  bark: ['bark_willow_02', 'bark_brown_02', 'bark_brown_01', 'bark_willow', 'pine_bark'],
  bronze: ['rusty_metal_02', 'metal_plate_02', 'metal_plate'],
};
const UA = { 'User-Agent': 'chelsea-explorer-asset-fetch (github actions)' };
const get = async (u) => { const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r; };
mkdirSync(out, { recursive: true });
const index = {};
for (const [slot, ids] of Object.entries(SLOTS)) {
  for (const id of ids) {
    try {
      const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
      const info = await (await get(`https://api.polyhaven.com/info/${id}`)).json();
      const pick = (k) => files[k]?.['1k']?.jpg?.url ?? files[k]?.['1k']?.png?.url;
      const maps = { diff: pick('Diffuse') ?? pick('diff'), nor: pick('nor_gl'), rough: pick('Rough') ?? pick('rough') };
      if (!maps.diff) throw new Error('no diffuse');
      for (const [k, u] of Object.entries(maps)) if (u) writeFileSync(`${out}/${slot}_${k}.jpg`, Buffer.from(await (await get(u)).arrayBuffer()));
      index[slot] = { id, name: info.name, authors: Object.keys(info.authors ?? {}), licence: 'CC0 1.0', page: `https://polyhaven.com/a/${id}`, widthM: info.dimensions ? info.dimensions[0] / 1000 : null, maps: Object.keys(maps).filter((k) => maps[k]) };
      console.log(slot, '←', id);
      break;
    } catch (e) { console.log(slot, id, 'skipped:', e.message); }
  }
}
writeFileSync(`${out}/index.json`, JSON.stringify(index, null, 1));
