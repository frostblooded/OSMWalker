// Geo math helpers: distances and Web Mercator (OSM tile) projection.

export const EARTH_RADIUS_M = 6371008.8;
export const TILE_SIZE = 256;

export type Tile = { x: number; y: number };
/** [south, west, north, east] */
export type BBox = [number, number, number, number];

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const worldPx = (zoom: number) => TILE_SIZE * 2 ** zoom;

/** Great-circle distance in meters between two lat/lon points. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p1 = rad(lat1);
  const p2 = rad(lat2);
  const a = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(Math.min(Math.max(a, 0), 1)));
}

/** World pixel x for a longitude at a zoom level. */
export function lonToPx(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * worldPx(zoom);
}

/** World pixel y for a latitude at a zoom level. */
export function latToPx(lat: number, zoom: number): number {
  const r = rad(Math.min(Math.max(lat, -85.0511), 85.0511));
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * worldPx(zoom);
}

export function pxToLon(x: number, zoom: number): number {
  return (x / worldPx(zoom)) * 360 - 180;
}

export function pxToLat(y: number, zoom: number): number {
  return deg(Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / worldPx(zoom))));
}

/** Box that contains a circle of radiusM around a point. */
export function bboxAround(lat: number, lon: number, radiusM: number): BBox {
  const dlat = deg(radiusM / EARTH_RADIUS_M);
  const dlon = dlat / Math.max(Math.cos(rad(lat)), 0.01);
  return [lat - dlat, lon - dlon, lat + dlat, lon + dlon];
}

/** Slippy-map tile that contains a point at a zoom level. */
export function tileOf(lat: number, lon: number, zoom: number): Tile {
  return { x: Math.floor(lonToPx(lon, zoom) / TILE_SIZE), y: Math.floor(latToPx(lat, zoom) / TILE_SIZE) };
}

/** Bounds of a slippy-map tile. */
export function tileBbox(tile: Tile, zoom: number): BBox {
  return [
    pxToLat((tile.y + 1) * TILE_SIZE, zoom),
    pxToLon(tile.x * TILE_SIZE, zoom),
    pxToLat(tile.y * TILE_SIZE, zoom),
    pxToLon((tile.x + 1) * TILE_SIZE, zoom),
  ];
}

/** Meters [east, north] from the first point to the second, on a flat map around the first; fine within a city. */
export function offsetM(lat1: number, lon1: number, lat2: number, lon2: number): [number, number] {
  const m = rad(1) * EARTH_RADIUS_M;
  return [(lon2 - lon1) * m * Math.cos(rad(lat1)), (lat2 - lat1) * m];
}

/** [lat, lon] reached by going [east, north] meters from a point. */
export function moved(lat: number, lon: number, v: [number, number]): [number, number] {
  const m = rad(1) * EARTH_RADIUS_M;
  return [lat + v[1] / m, lon + v[0] / (m * Math.cos(rad(lat)))];
}
