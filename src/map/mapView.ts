// The map: MapLibre with OpenFreeMap's Liberty style, him as a marker (a
// face with a bubble over his head), his goal as a pin, Viktor while he is
// about, his trail and the ride line as lines. MapLibre only draws when something changes, so the
// game moves the camera a few times a second instead of every frame (see
// app/loop.ts): the main thread stays idle.
import type { GeoJSONSource, Map as MlMap, Marker, StyleSpecification } from "maplibre-gl";
import type { BBox } from "../core/geo";
import type { Marker as EventMarker } from "../core/history";
import { POSE_EVERY_S, type Look } from "../core/look";
import type { MapIcon } from "../core/mapIcons";
import { RIVAL_ICON } from "../core/rival";
import type { LatLon } from "../core/trips";
import type { MapPort, Padding } from "./scene";

export const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;
const TRAIL_COLOR = "#1a5fb4";
const TRIP_COLOR = "#c01c28";
const AREA_COLOR = "#e8730c";
const OUTLINE_COLOR = "#7b3fbf";
const ROUTE_COLOR = "#ff7a3d";
/** Indigo `--magic` (app.css), as the magic icons (map/icons.ts); MapLibre can't read CSS tokens. */
const LEY_COLOR = "#3d2a8a";
/** Liberty's own font, so the event numbers need no extra download. */
const FONT = ["Noto Sans Bold"];

type Ml = typeof import("maplibre-gl");

/** How far from the middle of the view he may walk (a share of its width and height, each way) before the camera glides after him. */
export const MIDDLE = 0.2;
/** How long the camera takes to glide over to him. */
export const RECENTRE_MS = 800;
export type { Padding } from "./scene";

/**
 * Liberty without what costs most on phones: 3D buildings (fill-extrusion)
 * redraw on every move and need the GPU's depth buffer; flat buildings stay.
 */
export function lightStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.filter((l) => l.type !== "fill-extrusion") };
}

const none: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const line = (coords: LatLon[][]): GeoJSON.Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "MultiLineString", coordinates: coords.map((seg) => seg.map(([lat, lon]) => [lon, lat])) },
});

export class MapView implements MapPort {
  map!: MlMap;
  private him!: Marker;
  private pin!: Marker;
  private rival!: Marker;
  private following = true;
  /** The camera follows him by itself (the menu switch). Off, it moves only when the player moves it. */
  autoFollow = true;
  /** The map's size, read only when it changes: reading it every tick would force a layout while he glides. */
  private size = { width: 0, height: 0 };
  private ready!: Promise<void>;
  private trailKey = "";
  private tripKey = "";
  private leyKey = "";
  private trailOn = false;
  private areaKey = "";
  private routeKey = "";
  private lookKey = "";
  /** performance.now() when his pose last moved. */
  private poseAt = 0;
  private iconKey = "";
  /** The icon pictures and layer, added the first time there is an icon to show. */
  private iconLayer: Promise<boolean> | null = null;
  /** Told when the player drags the map, so the game stops following him. */
  onUserMove: () => void = () => {};
  /** Told the `id` of a game icon the player taps. */
  onIconTap: (id: string) => void = () => {};

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
      attributionControl: false,
    });
    creditControl(ml, this.map);
    this.map.touchZoomRotate.disableRotation();
    this.him = new ml.Marker({ element: himMarker(), anchor: "center" }).setLngLat([center[1], center[0]]).addTo(this.map);
    this.pin = new ml.Marker({ element: markerEl("pin", "📍"), anchor: "bottom" }).setLngLat([center[1], center[0]]);
    this.rival = new ml.Marker({ element: markerEl("rival", RIVAL_ICON), anchor: "center" }).setLngLat([center[1], center[0]]);
    const stop = () => {
      if (this.following) {
        this.following = false;
        this.onUserMove();
      }
    };
    this.map.on("dragstart", stop);
    const measure = () => {
      const c = this.map.getContainer();
      this.size = { width: c.clientWidth, height: c.clientHeight };
    };
    measure();
    this.map.on("resize", measure);
    // While the map moves MapLibre places him every frame; a transition then would make him lag behind the streets.
    const himEl = this.him.getElement();
    himEl.classList.add("glide");
    this.map.on("movestart", () => himEl.classList.remove("glide"));
    this.map.on("moveend", () => himEl.classList.add("glide"));
    this.ready = new Promise((ok) => this.map.once("load", () => ok()));
    await this.ready;
    this.map.addSource("area", { type: "geojson", data: none });
    this.map.addLayer({ id: "area-fill", type: "fill", source: "area", filter: ["==", ["get", "kind"], "box"], paint: { "fill-color": AREA_COLOR, "fill-opacity": 0.1 } });
    this.map.addLayer({
      id: "area-line",
      type: "line",
      source: "area",
      paint: { "line-color": ["match", ["get", "kind"], "box", AREA_COLOR, OUTLINE_COLOR], "line-width": 3, "line-opacity": 0.8 },
    });
    // His planned route: solid along the streets, dashed in a straight line where they are not loaded yet.
    this.map.addSource("route", { type: "geojson", data: none });
    for (const [id, kind, dash] of [["route", "streets", undefined], ["route-rest", "rest", [1, 1.5]]] as const) {
      this.map.addLayer({
        id,
        type: "line",
        source: "route",
        filter: ["==", ["get", "kind"], kind],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 5, "line-opacity": 0.9, ...(dash ? { "line-dasharray": [...dash] } : {}) },
      });
    }
    this.addLine("trail", TRAIL_COLOR, 4, 0.7);
    this.map.setLayoutProperty("trail", "visibility", "none");
    this.addLine("trip", TRIP_COLOR, 4, 0.85, [2, 1]);
    this.addLine("leys", LEY_COLOR, 3, 0.6, [1, 2]);
    this.map.addSource("events", { type: "geojson", data: none });
    this.map.addLayer({ id: "events", type: "circle", source: "events", paint: { "circle-radius": 11, "circle-color": TRAIL_COLOR, "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
    this.map.addLayer({
      id: "event-labels",
      type: "symbol",
      source: "events",
      layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 11, "text-allow-overlap": true, "text-ignore-placement": true },
      paint: { "text-color": "#fff" },
    });
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

  /** Follow him again (the "Back to him" pill, or a new goal): the camera glides to him, at `zoom` if given. */
  follow(zoom?: number): void {
    this.following = true;
    const at = this.him.getLngLat();
    this.map.easeTo({ center: at, zoom: zoom ?? this.map.getZoom(), duration: RECENTRE_MS });
  }

  /**
   * Puts him at `at`. His figure glides there over `glideMs` (a CSS transition, so
   * the map is not redrawn). While it follows him, the camera stays put until he
   * walks out of the middle of the view, then glides over to him.
   */
  setHim(at: LatLon, walking: boolean, glideMs = 0): void {
    const el = this.him.getElement();
    el.style.setProperty("--glide", `${Math.round(glideMs)}ms`);
    this.him.setLngLat([at[1], at[0]]);
    el.classList.toggle("still", !walking);
    if (this.following && this.autoFollow && !this.map.isMoving() && !this.inMiddle(at)) {
      this.map.easeTo({ center: [at[1], at[0]], duration: RECENTRE_MS });
    }
  }

  /**
   * His face, bubble and pose, written to the page only when one changes. A
   * new pose plays its CSS animation a few times and then holds still, so the
   * GPU is idle in between; while he stays it plays again each POSE_EVERY_S.
   */
  setLook(l: Look): void {
    const key = `${l.face}|${l.bubble}|${l.pose?.icon ?? ""}|${l.mount}`;
    const el = this.him.getElement();
    const bubble = el.querySelector<HTMLElement>(".bubble")!;
    const now = performance.now();
    if (key === this.lookKey) {
      if (!l.pose || now - this.poseAt < POSE_EVERY_S * 1000) return;
      // Dropping the pose's class and a reflow restart its CSS animation.
      this.poseAt = now;
      const cls = bubble.className;
      bubble.className = "bubble";
      void bubble.offsetWidth;
      bubble.className = cls;
      return;
    }
    this.lookKey = key;
    this.poseAt = now;
    el.querySelector(".face")!.textContent = l.face;
    const mount = el.querySelector<HTMLElement>(".mount")!;
    mount.textContent = l.mount;
    mount.hidden = !l.mount;
    bubble.textContent = l.pose?.icon ?? l.bubble;
    bubble.className = `bubble${l.pose ? ` pose ${l.pose.motion}` : ""}`;
    bubble.hidden = !bubble.textContent;
  }

  /** Whether `at` is within the middle of what the player can see (the panels left out). */
  inMiddle(at: LatLon): boolean {
    const p = this.map.project([at[1], at[0]]);
    const { top = 0, bottom = 0, left = 0, right = 0 } = this.map.getPadding();
    const { width, height } = this.size;
    const w = width - left - right;
    const h = height - top - bottom;
    return Math.abs(p.x - (left + w / 2)) <= w * MIDDLE && Math.abs(p.y - (top + h / 2)) <= h * MIDDLE;
  }

  setGoal(at: LatLon | null): void {
    if (!at) {
      this.pin.remove();
      return;
    }
    this.pin.setLngLat([at[1], at[0]]).addTo(this.map);
  }

  setRival(at: LatLon | null): void {
    if (!at) {
      this.rival.remove();
      return;
    }
    this.rival.setLngLat([at[1], at[0]]).addTo(this.map);
  }

  /** Shows or hides his trail and the History markers. */
  showTrail(on: boolean): void {
    if (on === this.trailOn) return;
    this.trailOn = on;
    this.trailKey = "";
    this.map.setLayoutProperty("trail", "visibility", on ? "visible" : "none");
    if (!on) this.setEvents([]);
  }

  /** His trail while it shows; only sent to MapLibre when it changed (`key` says so cheaply). */
  setTrail(key: string, segments: () => LatLon[][]): void {
    if (!this.trailOn || key === this.trailKey) return;
    this.trailKey = key;
    (this.map.getSource("trail") as GeoJSONSource | undefined)?.setData(line(segments()));
  }

  /** The ley lines, or none when `key` is ""; only sent to MapLibre when `key` changes. */
  setLeys(key: string, lines: () => LatLon[][]): void {
    if (key === this.leyKey) return;
    this.leyKey = key;
    (this.map.getSource("leys") as GeoJSONSource | undefined)?.setData(line(key ? lines() : []));
  }

  /** The line he rides along on a trip, or none. */
  setTrip(path: LatLon[] | null): void {
    const key = path ? `${path.length}:${path[0]}:${path.at(-1)}` : "";
    if (key === this.tripKey) return;
    this.tripKey = key;
    (this.map.getSource("trip") as GeoJSONSource | undefined)?.setData(line(path ? [path] : []));
  }

  /** His planned route to the goal, or none; only sent to MapLibre when `key` changes. */
  setRoute(key: string, route: () => { streets: LatLon[]; rest: [LatLon, LatLon] | null } | null): void {
    if (key === this.routeKey) return;
    this.routeKey = key;
    const r = key ? route() : null;
    const features: GeoJSON.Feature[] = [];
    if (r) {
      if (r.streets.length > 1) features.push({ ...line([r.streets]), properties: { kind: "streets" } });
      if (r.rest) features.push({ ...line([r.rest]), properties: { kind: "rest" } });
    }
    (this.map.getSource("route") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }

  /** Numbered markers where things in his History happened. */
  setEvents(markers: EventMarker[]): void {
    (this.map.getSource("events") as GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: markers.map((m) => ({ type: "Feature", properties: { label: m.label }, geometry: { type: "Point", coordinates: [m.at[1], m.at[0]] } })),
    });
  }

  /**
   * The game's icons (made-up places, travel hubs, quests); only sent to
   * MapLibre when `key` changes. The pictures load as their own chunk the
   * first time there is one to show.
   */
  setMapIcons(key: string, icons: () => MapIcon[]): void {
    if (key === this.iconKey) return;
    this.iconKey = key;
    const list = icons();
    if (!list.length && !this.iconLayer) return;
    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: list.map((i) => ({
        type: "Feature",
        properties: { id: i.id, icon: i.icon, label: i.label, kind: i.kind ?? "place", pulse: !!i.pulse, ends_at: i.ends_at ?? -1 },
        geometry: { type: "Point", coordinates: [i.at[1], i.at[0]] },
      })),
    };
    // A chunk that can't load (offline before it was cached) leaves the map without icons until the game is opened again.
    this.iconLayer ??= import("./icons")
      .then((m) => m.addIconLayer(this.map, (id) => this.onIconTap(id)))
      .then(
        () => true,
        () => false,
      );
    void this.iconLayer.then((ok) => {
      if (ok && this.iconKey === key) (this.map.getSource("icons") as GeoJSONSource | undefined)?.setData(data);
    });
  }

  /** The box his goals are picked in (orange) and the city's real border (purple), or nothing. */
  setArea(box: BBox | null, outline: LatLon[][]): void {
    const key = box ? `${box.join()}:${outline.length}:${outline[0]?.length ?? 0}` : "";
    if (key === this.areaKey) return;
    this.areaKey = key;
    const ring = (r: LatLon[]) => r.map(([lat, lon]) => [lon, lat]);
    const features: GeoJSON.Feature[] = [];
    if (box) {
      const [s, w, n, e] = box;
      features.push({ type: "Feature", properties: { kind: "box" }, geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } });
      if (outline.length) features.push({ type: "Feature", properties: { kind: "outline" }, geometry: { type: "MultiLineString", coordinates: outline.map(ring) } });
    }
    (this.map.getSource("area") as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features });
  }

  /** Stops following and centres on `at`, zoomed in at least to `minZoom`. */
  focus(at: LatLon, minZoom: number): void {
    this.following = false;
    this.map.jumpTo({ center: [at[1], at[0]], zoom: Math.max(this.map.getZoom(), minZoom) });
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

  screenPoint(at: LatLon): { x: number; y: number } {
    const p = this.map.project([at[1], at[0]]);
    return { x: p.x, y: p.y };
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

/** The map credit as a small ⓘ bottom left. MapLibre opens it whenever the credit text
 *  changes; it stays folded until the player taps it. */
function creditControl(ml: Ml, map: MlMap): void {
  const ctrl = new ml.AttributionControl({ compact: true });
  map.addControl(ctrl, "bottom-left");
  const box = map.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-attrib")!;
  let tapped = false;
  box.querySelector(".maplibregl-ctrl-attrib-button")?.addEventListener("click", () => (tapped = true));
  const fold = () => {
    if (!tapped) box.classList.remove("maplibregl-compact-show");
  };
  map.on("styledata", fold);
  map.on("sourcedata", fold);
}

/** Him: a face in an orange disc, with a bubble over his head and his fantasy mount, if any, at his side. */
function himMarker(): HTMLElement {
  const el = markerEl("him", "");
  const face = document.createElement("span");
  face.className = "face";
  face.textContent = "🙂";
  const bubble = document.createElement("span");
  bubble.className = "bubble";
  bubble.hidden = true;
  const mount = document.createElement("span");
  mount.className = "mount";
  mount.hidden = true;
  el.append(face, bubble, mount);
  return el;
}

function markerEl(cls: string, text: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `marker ${cls}`;
  el.textContent = text;
  el.setAttribute("aria-hidden", "true");
  return el;
}
