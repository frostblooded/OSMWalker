# Outside services

All of them free and keyless. File at `a87edab`: `src/net/api.ts` (fetch is
injected, so tests fake it; `tests/unit/api.test.ts`). The map style and map
tiles were fetched by MapLibre itself.

| Service | Used for | Request | Notes |
| --- | --- | --- | --- |
| OpenFreeMap TileJSON | current tile URL template | `GET https://tiles.openfreemap.org/planet` → `.tiles[0]` | fetched once, shared |
| OpenFreeMap vector tiles | streets, places, doors (z14) and the base map (all zooms) | `GET <template>` with z/x/y | sometimes gzipped; 20 s timeout; after a failure the tile server "rests" 60 s and Overpass is used |
| OpenFreeMap style | the map look | `GET https://tiles.openfreemap.org/styles/liberty` | 3D buildings removed in code |
| Overpass API | backup street data | `GET <server>?data=<query>` (see [streets.md](streets.md#overpass-fallback-compactcells)) | servers tried in turn: overpass-api.de, overpass.private.coffee, maps.mail.ru; 35 s timeout (the query has its own 25 s); a failed server rests 60 s and goes last; a `remark` with "error" in a 200 answer counts as a failure |
| Photon (komoot) | city search as you type | `GET https://photon.komoot.io/api/?limit=6&layer=city&layer=district&layer=locality&q=<text>` | GeoJSON; name built from name, city, state, country without repeats; `extent` is [west, north, east, south] |
| Nominatim search | backup search when Photon fails | `GET https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&featureType=city&q=<text>` | its policy forbids autocomplete, so only as a fallback; `boundingbox` is [south, north, west, east] |
| Nominatim reverse | the city's real outline (City area switch) | `GET .../reverse?format=jsonv2&zoom=10&polygon_geojson=1&polygon_threshold=0.001&lat=..&lon=..` | Polygon or MultiPolygon; once per city |

Search answers were cached for the session by the lower-cased text. Failures
were turned into plain words for the Debug panel: "HTTP 429 (server busy)",
"HTTP 504 (server timed out)", "HTTP 503 (server overloaded)", "no answer in
time", "can't connect". Per-host stats (ok, fail, last error, resting until)
were shown in Debug.

Native apps should send a real User-Agent; Nominatim and Overpass require an
identifying one, and the OSM tile usage policies ask for it too.

## Services used by cut features (at `2d468a4`)

OSRM (road routes between cities), Wikidata SPARQL (city trivia), Open-Meteo
(weather and the city's clock), Nager.Date (public holidays), Wikipedia
(first sentence about big sights).
