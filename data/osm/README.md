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

**Focused extracts.** These cover smaller areas and are fetched by `scripts/osm/fetch-square.mjs`, through the matching GitHub Action on its own branch:
- `square-*.json`: Sloane Square.
- `doy-*.json`: Duke of York Square.
- `kr-raw.json` and `kr-buildings.json`: the King's Road corridor, retrieved 2026-11-12 by *Import King's Road corridor OSM detail* on the `osm-kr` branch.

The King's Road building extract replaces the main extract's footprints along the corridor, because it is newer: for example, it adds No. 138, Nos 114–116 and Whitelands House. All of them are © OpenStreetMap contributors, ODbL 1.0.
