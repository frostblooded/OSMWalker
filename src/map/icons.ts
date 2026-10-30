// The game's own map icons: a white picture on a round badge whose colour
// says what kind of place it is (blue travel, green food and rest, amber
// work, purple story, indigo magic), drawn at 32 CSS px, and the map layer
// that shows them. Loaded as its own chunk the first time the map shows an
// icon (see MapView.setMapIcons).
import type { Map as MlMap } from "maplibre-gl";

/** Game icons show from about a whole city in view; their names from street level. */
export const ICON_MIN_ZOOM = 13;
export const ICON_LABEL_ZOOM = 16;
const PULSE_COLOR = "#ffd23f";
/** Liberty's own font, as in mapView.ts, so the names need no extra download. */
const FONT = ["Noto Sans Bold"];
const TRAVEL = "#1a5fb4";
const REST = "#2e7d32";
const WORK = "#b26a00";
const STORY = "#7b3fbf";
const MAGIC = "#3d2a8a";
const GOLD = "#b8860b";

/** A 64 x 64 badge in `color` around `body` (drawn in white; BADGE stands for the badge colour). */
const badge = (color: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="${color}" stroke="#fff" stroke-width="4"/><g fill="#fff" stroke="none">${body.replaceAll("BADGE", color)}</g></svg>`;

/** Pictures by icon name (see ICON_OF in core/mapIcons.ts). */
export const ICONS: Record<string, string> = {
  bus: badge(TRAVEL, `<rect x="19" y="17" width="26" height="25" rx="4"/><rect x="22" y="21" width="20" height="9" fill="BADGE"/><circle cx="25" cy="44" r="3.5"/><circle cx="39" cy="44" r="3.5"/>`),
  plane: badge(TRAVEL, `<path d="M32 14c2 0 3 2 3 5v8l12 7v4l-12-4v8l4 3v3l-7-2-7 2v-3l4-3v-8l-12 4v-4l12-7v-8c0-3 1-5 3-5z"/>`),
  gas: badge(TRAVEL, `<rect x="20" y="17" width="17" height="29" rx="2"/><rect x="23" y="21" width="11" height="8" fill="BADGE"/><path d="M37 23h3l5 5v13a3 3 0 0 1-6 0v-8h-2" fill="none" stroke="#fff" stroke-width="3"/>`),
  food: badge(REST, `<path d="M22 16v10a5 5 0 0 0 4 5v17h3V31a5 5 0 0 0 4-5V16h-2.5v9h-1.5v-9h-2v9h-1.5v-9zM40 16c-4 3-5 10-3 15h2v17h3V16z"/>`),
  bed: badge(REST, `<rect x="15" y="20" width="4" height="26"/><rect x="19" y="32" width="30" height="8"/><rect x="45" y="40" width="4" height="6"/><rect x="21" y="25" width="10" height="7" rx="2"/>`),
  work: badge(WORK, `<path d="M26 26v-5h12v5" fill="none" stroke="#fff" stroke-width="3"/><rect x="17" y="26" width="30" height="19" rx="3"/><rect x="17" y="33" width="30" height="2" fill="BADGE"/>`),
  board: badge(STORY, `<rect x="21" y="38" width="3" height="10"/><rect x="40" y="38" width="3" height="10"/><rect x="17" y="18" width="30" height="21" rx="2"/><rect x="21" y="22" width="9" height="11" fill="BADGE"/><rect x="33" y="22" width="10" height="3" fill="BADGE"/><rect x="33" y="28" width="10" height="3" fill="BADGE"/>`),
  guild: badge(STORY, `<path d="M32 15l14 5v10c0 9-6 15-14 19-8-4-14-10-14-19V20z"/><path d="M30 22h4v8h8v4h-8v8h-4v-8h-8v-4h8z" fill="BADGE"/>`),
  well: badge(STORY, `<path d="M16 27L32 16l16 11z"/><rect x="20" y="27" width="3" height="10"/><rect x="41" y="27" width="3" height="10"/><rect x="18" y="36" width="28" height="11" rx="2"/><rect x="22" y="40" width="20" height="2" fill="BADGE"/>`),
  lookout: badge(STORY, `<circle cx="24" cy="37" r="8"/><circle cx="40" cy="37" r="8"/><circle cx="24" cy="37" r="4" fill="BADGE"/><circle cx="40" cy="37" r="4" fill="BADGE"/><rect x="21" y="20" width="7" height="12" rx="2"/><rect x="36" y="20" width="7" height="12" rx="2"/><rect x="28" y="30" width="8" height="5"/>`),
  shrine: badge(STORY, `<path d="M14 19c6 2 30 2 36 0v5H14z"/><rect x="18" y="28" width="28" height="3"/><rect x="21" y="23" width="4" height="25"/><rect x="39" y="23" width="4" height="25"/>`),
  story: badge(STORY, `<path d="M32 21c-5-3-10-3-15-1v24c5-2 10-2 15 1 5-3 10-3 15-1V20c-5-2-10-2-15 1z"/><rect x="31" y="21" width="2" height="24" fill="BADGE"/>`),
  tower: badge(MAGIC, `<path d="M23 29L32 11l9 18z"/><rect x="26" y="29" width="12" height="18"/><rect x="22" y="46" width="20" height="3"/><rect x="30" y="34" width="4" height="6" rx="2" fill="BADGE"/><path d="M44 16l1.5 3 3 1.5-3 1.5-1.5 3-1.5-3-3-1.5 3-1.5z"/>`),
  plaque: badge(GOLD, `<rect x="16" y="20" width="32" height="20" rx="3"/><rect x="20" y="24" width="24" height="3" fill="BADGE"/><rect x="20" y="30" width="16" height="3" fill="BADGE"/><rect x="22" y="40" width="4" height="8"/><rect x="38" y="40" width="4" height="8"/>`),
};

const none: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Adds the pictures, the "icons" source and its layers (under the History markers, so those stay readable); `onTap` gets a tapped icon's id. */
export async function addIconLayer(map: MlMap, onTap: (id: string) => void): Promise<void> {
  await Promise.all(
    Object.entries(ICONS).map(async ([name, svg]) => {
      const img = new Image(64, 64);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
      await img.decode();
      if (!map.hasImage(name)) map.addImage(name, img, { pixelRatio: 2 });
    }),
  );
  map.addSource("icons", { type: "geojson", data: none });
  map.addLayer({ id: "icons-pulse", type: "circle", source: "icons", minzoom: ICON_MIN_ZOOM, filter: ["==", ["get", "pulse"], true], paint: { "circle-radius": 22, "circle-color": PULSE_COLOR, "circle-opacity": 0.5 } }, "events");
  map.addLayer(
    {
      id: "icons",
      type: "symbol",
      source: "icons",
      minzoom: ICON_MIN_ZOOM,
      layout: {
        "icon-image": ["get", "icon"],
        "icon-allow-overlap": true,
        "text-field": ["step", ["zoom"], "", ICON_LABEL_ZOOM, ["get", "label"]],
        "text-font": FONT,
        "text-size": 11,
        "text-anchor": "top",
        "text-offset": [0, 1.5],
        "text-optional": true,
      },
      paint: { "text-color": "#333", "text-halo-color": "#fff", "text-halo-width": 1.5 },
    },
    "events",
  );
  map.on("click", "icons", (e) => {
    const id = e.features?.[0]?.properties?.id;
    if (id) onTap(String(id));
  });
}
