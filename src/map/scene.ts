// What the map shows and where its camera points. Each tick it puts him (his
// face, bubble and pose), his goal pin, the ride, his trail, the route line
// and the city area on the map, sending a layer to MapLibre only when it
// changed. The camera follows him; a tap on the goal chip shows him and his
// goal until he picks a new one; a trip zooms out to the whole ride until he
// lands; History fits his trail above its sheet; the Stats sheet shows the
// ley lines. The map itself sits behind MapPort, so tests use a fake.
import type { BBox } from "../core/geo";
import type { Marker as EventMarker } from "../core/history";
import type { Look } from "../core/look";
import type { MapIcon } from "../core/mapIcons";
import type { LatLon } from "../core/trips";
import type { Game } from "../game/game";
import { look } from "../game/hud";

export type Padding = { top: number; bottom: number; left: number; right: number };
export type RouteLine = { streets: LatLon[]; rest: [LatLon, LatLon] | null } | null;

/** The map as the scene uses it; MapView is the real one. */
export interface MapPort {
  /** The camera follows him by itself (the menu switch). */
  autoFollow: boolean;
  /** Told when the player drags the map. */
  onUserMove: () => void;
  setHim(at: LatLon, walking: boolean, glideMs: number): void;
  /** His face, the bubble over his head and his pose. */
  setLook(l: Look): void;
  setGoal(at: LatLon | null): void;
  /** Viktor, his rival, while he is about. */
  setRival(at: LatLon | null): void;
  /** The police car, during a chase. */
  setPolice(at: LatLon | null): void;
  setTrip(path: LatLon[] | null): void;
  showTrail(on: boolean): void;
  setTrail(key: string, segments: () => LatLon[][]): void;
  setRoute(key: string, route: () => RouteLine): void;
  setArea(box: BBox | null, outline: LatLon[][]): void;
  setEvents(markers: EventMarker[]): void;
  /** The ley lines while the Stats sheet is open, sent on only when `key` changes; "" hides them. */
  setLeys(key: string, lines: () => [LatLon, LatLon][]): void;
  /** The game's icons, sent on only when `key` changes. */
  setMapIcons(key: string, icons: () => MapIcon[]): void;
  follow(zoom?: number): void;
  focus(at: LatLon, minZoom: number): void;
  fit(box: BBox, padding: Padding, maxZoom?: number): void;
  setPadding(p: Padding): void;
  /** Zooms in or out a step; returns the new zoom. */
  zoomBy(step: number): number;
  /** Where `at` is on screen, in CSS pixels. */
  screenPoint(at: LatLon): { x: number; y: number };
}

/** Zoom for looking at one History event. */
export const EVENT_ZOOM = 17;
/** Steps per degree at which the icons near him are picked again (1/200 of a degree, about 500 m). */
const ICON_GRID = 200;

export class MapScene {
  /** Told when the camera starts or stops following him, for the "Back to him" pill. */
  onFollowing: (on: boolean) => void = () => {};
  /** How fast he moves on screen, smoothed, in CSS px a second. */
  pxPerSec = 0;
  private lastPx: { x: number; y: number } | null = null;
  /** The goal shown by a tap on the goal chip, "" when none. */
  private goalView = "";
  private tripView = "";
  private history = false;
  private leys = false;
  private eventsKey = "";

  /** `panels`: the room the top card and bottom bar take over the map. */
  constructor(
    private readonly game: Game,
    private readonly map: MapPort,
    private readonly panels: () => Padding,
  ) {
    map.onUserMove = () => this.onFollowing(false);
    map.setPadding(panels());
  }

  /** One tick: `dt` seconds since the last, `glideMs` until the next, which his figure takes to glide to where he is now. */
  draw(dt: number, glideMs: number): void {
    const g = this.game;
    const w = g.walker;
    if (!w) return;
    const v = this.map;
    const at = w.position();
    v.autoFollow = g.cameraFollows;
    v.setHim(at, !w.needsData() && !w.isResting(), glideMs);
    v.setLook(look(g));
    v.setGoal(g.goalTarget());
    v.setRival(g.rivalAt());
    v.setPolice(g.policeAt());
    v.setTrip(w.travel ? w.travel.path : null);
    const h = g.stats.history;
    v.setTrail(`${h.id}:${h.trailVersion}`, () => h.segments());
    // The route line starts at him, so it is redrawn once a second while he walks, not every tick.
    const routeOn = g.showRoute && !w.travel && !!w.goal;
    v.setRoute(routeOn ? `${w.goal}:${w.toNode}:${w.route.length}:${Math.floor(performance.now() / 1000)}` : "", () => w.routeLine());
    v.setArea(g.showCityArea && !w.travel ? w.bounds : null, g.cityOutline);
    // Icons change with the city's places, his monuments, his spot and home, his quests and events, and as he moves about 500 m (the nearest ones show).
    v.setMapIcons(w.travel ? "" : `${g.city}:${w.graph.made.length}:${g.stats.bricks.built.length}:${g.stats.spots.spot(g.stats.where.city)?.name ?? ""}:${g.stats.home.city}:${g.stats.home.bought}:${g.stats.quests.rev}:${w.graph.cells.size}:${Math.round(at[0] * ICON_GRID)}:${Math.round(at[1] * ICON_GRID)}`, () => g.placeIcons());
    v.setLeys(this.leys && !w.travel ? String(g.leysVersion) : "", () => g.leys);
    this.keepView();
    this.drawEvents();
    const p = v.screenPoint(at);
    if (this.lastPx && dt > 0) {
      const speed = Math.hypot(p.x - this.lastPx.x, p.y - this.lastPx.y) / dt;
      this.pxPerSec = 0.7 * this.pxPerSec + 0.3 * speed;
    }
    this.lastPx = p;
  }

  /** History opens or closes: it shows his trail and numbered markers fitted above its sheet (`sheetH` px tall); closing follows him again. */
  showHistory(on: boolean, sheetH = 0): void {
    const v = this.map;
    this.history = on;
    v.showTrail(on);
    this.eventsKey = "";
    if (!on) {
      v.setPadding(this.panels());
      if (!this.goalView) this.backToHim();
      return;
    }
    v.setPadding({ ...this.panels(), bottom: sheetH + 12 });
    this.drawEvents();
    const box = this.game.stats.history.bounds();
    if (box) v.fit(box, { ...this.panels(), bottom: sheetH + 24, left: 32, right: 32 }, EVENT_ZOOM);
    this.onFollowing(false);
  }

  /** The Stats sheet opens or closes: the ley lines show while it is open. */
  showLeys(on: boolean): void {
    this.leys = on;
  }

  /** The goal chip: shows him and his goal together, or follows him again when they already show. */
  toggleGoal(): void {
    const w = this.game.walker;
    const target = this.game.goalTarget();
    if (!w || !target || this.goalView) return this.backToHim();
    const here = w.position();
    const box: BBox = [Math.min(here[0], target[0]), Math.min(here[1], target[1]), Math.max(here[0], target[0]), Math.max(here[1], target[1])];
    const p = this.panels();
    this.map.fit(box, { ...p, top: p.top + 40, bottom: 140, left: 40, right: 40 }, this.game.zoom);
    this.goalView = this.goalKey();
    this.onFollowing(false);
  }

  backToHim(): void {
    this.goalView = "";
    this.map.follow(this.game.zoom);
    this.onFollowing(true);
  }

  /** The zoom buttons; the zoom is kept for the next visit. */
  zoomBy(step: number): void {
    this.game.zoom = this.map.zoomBy(step);
  }

  /** A History row: centres on where it happened. */
  focusEvent(at: LatLon): void {
    this.map.focus(at, EVENT_ZOOM);
  }

  /** A goal view ends by itself when he picks a new goal; a trip shows the whole ride, and landing follows him again. */
  private keepView(): void {
    if (this.history) return;
    if (this.goalView && this.goalView !== this.goalKey()) this.backToHim();
    const t = this.game.walker?.travel;
    const key = t ? `${t.to.name}:${t.path.length}` : "";
    if (key === this.tripView) return;
    this.tripView = key;
    if (t) this.map.fit(pathBox(t.path), { ...this.panels(), bottom: 120, left: 40, right: 40 });
    else this.backToHim();
  }

  private goalKey(): string {
    return String(this.game.goalTarget() ?? "");
  }

  private drawEvents(): void {
    if (!this.history) return;
    const h = this.game.stats.history;
    const key = `${h.id}:${h.entries.length}:${h.entries.at(-1)?.t ?? 0}`;
    if (key === this.eventsKey) return;
    this.eventsKey = key;
    this.map.setEvents(h.markers());
  }
}

function pathBox(path: LatLon[]): BBox {
  const lats = path.map((p) => p[0]);
  const lons = path.map((p) => p[1]);
  return [Math.min(...lats), Math.min(...lons), Math.max(...lats), Math.max(...lons)];
}
