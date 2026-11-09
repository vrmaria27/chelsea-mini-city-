# OpenStreetMap extract

`raw.json` is an unmodified Overpass API response for the extract box in `scripts/osm/fetch.mjs`,
wrapped with the query, endpoint and retrieval time.

**Map data © OpenStreetMap contributors**, available under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See https://www.openstreetmap.org/copyright.

`src/map/osm/chelsea-osm.json` is a derived database produced from this extract by
`scripts/osm/process.mjs` (projection to local metres, clipping, simplification, triangulation,
labels and fictional game plots). It is likewise made available under the ODbL 1.0.

Re-import: `npm run import:map:fetch && npm run import:map`. If this machine can't reach Overpass,
run the **Import OSM map data** GitHub Action (it commits a fresh `raw.json`), or place any
Overpass JSON extract covering the box at `data/osm/raw.json` and run `npm run import:map`.
