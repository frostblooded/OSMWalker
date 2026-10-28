// The map: MapLibre with OpenFreeMap's Liberty style, him as a marker, his
// goal as a pin, his trail and the ride line as lines. MapLibre only draws
// when something changes, so the game moves the camera a few times a second
// instead of every frame (see app/loop.ts): the main thread stays idle.
import type { GeoJSONSource, Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";
import type { BBox } from "../core/geo";
import type { LatLon } from "../core/trips";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;
const TRAIL_COLOR = "#1a5fb4";
const TRIP_COLOR = "#c01c28";

type Ml = typeof import("maplibre-gl");
export type Padding = { top: number; bottom: number; left: number; right: number };

/**
 * Liberty without what costs most on phones: 3D buildings (fill-extrusion)
 * redraw on every move and need the GPU's depth buffer; flat buildings stay.
 */
export function lightStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.filter((l) => l.type !== "fill-extrusion") };
}

const line = (coords: LatLon[][]): GeoJSON.Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "MultiLineString", coordinates: coords.map((seg) => seg.map(([lat, lon]) => [lon, lat])) },
});

export class MapView {
  map!: MlMap;
  private ml!: Ml;
  private him!: Marker;
  private pin!: Marker;
  private following = true;
  private ready!: Promise<void>;
  private trailKey = "";
  private tripKey = "";
  /** Told when the player drags the map, so the game stops following him. */
  onUserMove: () => void = () => {};

  static async create(container: HTMLElement, center: LatLon, zoom: number): Promise<MapView> {
    const v = new MapView();
    await v.init(container, center, zoom);
    return v;
  }

  private async init(container: HTMLElement, center: LatLon, zoom: number): Promise<void> {
    const [ml, workerUrl, style] = await Promise.all([
      import("maplibre-gl"),
      import("maplibre-gl/dist/maplibre-gl-worker.mjs?url").then((m) => m.default as string),
      fetch(STYLE_URL).then((r) => r.json() as Promise<StyleSpecification>),
      import("maplibre-gl/dist/maplibre-gl.css"),
    ]);
    this.ml = ml;
    ml.setWorkerUrl(workerUrl);
    this.map = new ml.Map({
      container,
      style: lightStyle(style),
      center: [center[1], center[0]],
      zoom,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      // A flat, north-up map: no tilting or turning, so fewer redraws and nothing to get lost in.
      maxPitch: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      fadeDuration: 0,
      pixelRatio: Math.min(devicePixelRatio, 2),
      attributionControl: { compact: true },
    });
    this.map.touchZoomRotate.disableRotation();
    this.him = new ml.Marker({ element: markerEl("him", "🙂"), anchor: "center" }).setLngLat([center[1], center[0]]).addTo(this.map);
    this.pin = new ml.Marker({ element: markerEl("pin", "📍"), anchor: "bottom" }).setLngLat([center[1], center[0]]);
    const stop = () => {
      if (this.following) {
        this.following = false;
        this.onUserMove();
      }
    };
    this.map.on("dragstart", stop);
    this.ready = new Promise((ok) => this.map.once("load", () => ok()));
    await this.ready;
    this.addLine("trail", TRAIL_COLOR, 4, 0.7);
    this.addLine("trip", TRIP_COLOR, 4, 0.85, [2, 1]);
  }

  private addLine(id: string, color: string, width: number, opacity: number, dash?: number[]): void {
    this.map.addSource(id, { type: "geojson", data: line([]) });
    this.map.addLayer({
      id,
      type: "line",
      source: id,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": color, "line-width": width, "line-opacity": opacity, ...(dash ? { "line-dasharray": dash } : {}) },
    });
  }

  isFollowing(): boolean {
    return this.following;
  }

  /** Follow him again (the "Back to him" pill, or a new goal). */
  follow(): void {
    this.following = true;
  }

  /** Puts him at `at`; the camera jumps there too while it follows him. */
  setHim(at: LatLon, walking: boolean): void {
    this.him.setLngLat([at[1], at[0]]);
    this.him.getElement().classList.toggle("still", !walking);
    if (this.following) this.map.jumpTo({ center: [at[1], at[0]] });
  }

  setGoal(at: LatLon | null): void {
    if (!at) {
      this.pin.remove();
      return;
    }
    this.pin.setLngLat([at[1], at[0]]).addTo(this.map);
  }

  /** His trail; only sent to MapLibre when it changed (`key` says so cheaply). */
  setTrail(key: string, segments: () => LatLon[][]): void {
    if (key === this.trailKey) return;
    this.trailKey = key;
    (this.map.getSource("trail") as GeoJSONSource | undefined)?.setData(line(segments()));
  }

  /** The line he rides along on a trip, or none. */
  setTrip(path: LatLon[] | null): void {
    const key = path ? `${path.length}:${path[0]}:${path.at(-1)}` : "";
    if (key === this.tripKey) return;
    this.tripKey = key;
    (this.map.getSource("trip") as GeoJSONSource | undefined)?.setData(line(path ? [path] : []));
  }

  /** Shows the whole box, leaving `padding` free for panels. */
  fit(box: BBox, padding: Padding, maxZoom = MAX_ZOOM): void {
    this.following = false;
    this.map.fitBounds(
      [
        [box[1], box[0]],
        [box[3], box[2]],
      ],
      { padding, maxZoom, duration: 0 },
    );
  }

  /** Room the panels over the map take, so "the middle" is the middle of what you can see. */
  setPadding(p: Padding): void {
    this.map.setPadding(p);
  }

  zoomBy(step: number): number {
    const z = Math.min(Math.max(Math.round(this.map.getZoom()) + step, MIN_ZOOM), MAX_ZOOM);
    this.map.easeTo({ zoom: z, duration: 200 });
    return z;
  }

  zoom(): number {
    return this.map.getZoom();
  }

  /** On-screen pixels per meter at the current zoom, near `lat`. */
  pxPerMeter(lat: number): number {
    return (512 * 2 ** this.map.getZoom()) / (40075016.7 * Math.cos((lat * Math.PI) / 180));
  }

  /** Tiles MapLibre still waits for, for the loading details. */
  loaded(): boolean {
    return this.map.areTilesLoaded();
  }

  destroy(): void {
    this.map.remove();
  }
}

function markerEl(cls: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `marker ${cls}`;
  el.textContent = text;
  el.setAttribute("aria-hidden", "true");
  return el;
}
