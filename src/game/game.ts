// The game: picks a city, keeps him riding in real time while the app is
// open, and loads streets as he nears new ground. He wanders until an order
// comes (see core/orders.ts), rides to the restaurant, then to the customer's
// door, and is paid there. The Shop sells the upgrades (core/upgrades.ts).
// Time stops while the game is closed: he goes on from where he was. No DOM
// here: the app calls step() and the screens read the state.
import { DebugLog, type Entry } from "../core/debugLog";
import { bboxAround, distanceM, type BBox, type LatLon } from "../core/geo";
import { cellKey, cellOf, cellsByPriority, StreetGraph } from "../core/graph";
import { MONEY_POSE, type Pose } from "../core/look";
import { euro } from "../core/money";
import { addressOf, FOOD, homePlace, Job, makeOrder, waitS, type Home } from "../core/orders";
import { Problems } from "../core/problems";
import { Rng } from "../core/rng";
import { Stats, visitKey, type Place } from "../core/stats";
import { speedX, upgradeOf, WAIT_STEP, waitX, type UpgradeId } from "../core/upgrades";
import { BIKE_MPS, cityBounds, Walker } from "../core/walker";
import type { Api, SearchPlace } from "../net/api";
import type { LoadFn } from "../streets/client";
import { StreetLoader } from "../streets/loader";
import { DEFAULT_ZOOM, SaveFile, type KV } from "./saveFile";

export { DEFAULT_ZOOM, SAVE_KEY, SETTINGS_KEY } from "./saveFile";

/** Orders come from places and doors within this of him. */
export const ORDER_REACH_M = 3000;
/** Street corners taken as doors where the map has no house numbers. */
export const STREET_DOORS = 300;
/** Seconds before he looks for an order again when none could be made (nothing loaded yet). */
export const RETRY_S = 5;
/** Street cells loaded with no places of note before the city counts as having none. */
export const NO_PLACES_CELLS = 3;
export const SAVE_EVERY_S = 5;
/** Longest step that counts as walking, so a stall (or a tab that was hidden) never jumps him ahead. */
export const MAX_STEP_S = 1;
/** Cells kept loaded around him: 1 means 3 x 3 z14 tiles, about 5 x 4 km. */
export const STREET_RING = 1;
/** Past this many street cells (about 2.4 MB each) in one city, he gets a fresh map of just the cells around him, so memory stays flat on long walks. */
export const MAX_CELLS = 25;
/** Seconds the pop over him shows after a reward. */
export const POSE_S = 2;

export type Alert = { level: "error" | "warning"; text: string };

export type GameDeps = {
  api: Api;
  load: LoadFn;
  storage?: KV | null;
  rng?: Rng;
};

const same = (a: Place, b: Pick<Place, "name" | "lat" | "lon">) => visitKey(a) === visitKey(b);

export class Game {
  walker: Walker | null = null;
  stats = new Stats();
  debugLog = new DebugLog();
  /** The order he is on, or the wait for the next. */
  job = new Job();
  readonly problems = new Problems();
  readonly loader: StreetLoader;
  city = "";
  origin: LatLon = [0, 0];
  /** The zoom the player picked. */
  zoom = DEFAULT_ZOOM;
  showCityArea = false;
  /** Draws his planned way to the goal; off until the player turns it on. */
  showRoute = false;
  /** The camera keeps him in view by itself (the menu switch); off, the map stays where the player leaves it. */
  cameraFollows = true;
  cityOutline: LatLon[][] = [];
  /** Bumped on every change worth redrawing a screen for. */
  version = 0;
  /** The pop over him after a reward, with the seconds it still shows; not saved. */
  private popped: { pose: Pose; leftS: number } | null = null;
  private listeners = new Set<() => void>();
  private forced = "";
  private saveTimer = 0;
  private checkTimer = 0;
  private outlineOf = "";
  private noPlacesWarned = "";
  private readonly rng: Rng;
  private readonly file: SaveFile;

  constructor(private readonly deps: GameDeps) {
    this.rng = deps.rng ?? new Rng();
    this.file = deps.storage === undefined ? new SaveFile() : new SaveFile(deps.storage);
    this.loader = new StreetLoader(new StreetGraph(), deps.load);
    const warn = (t: string) => this.problems.warn(t);
    this.loader.onProblem = warn;
    deps.api.onProblem = warn;
    this.loadSettings();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Tells the screens to redraw. */
  changed(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  search(text: string): Promise<SearchPlace[] | null> {
    return this.deps.api.searchPlaces(text);
  }

  /**
   * Starts walking in a city: waits for the streets where he starts, then
   * puts him on the nearest one. Returns an error for the picker, or "".
   */
  async startCity(name: string, lat: number, lon: number, bbox: BBox | null, onWait: (state: string) => void = () => {}): Promise<string> {
    const w = await this.land(name, lat, lon, bbox, onWait);
    if (typeof w === "string") return w;
    this.stats = new Stats();
    this.debugLog = new DebugLog();
    this.job = new Job();
    this.attach(w);
    this.city = name;
    this.origin = [lat, lon];
    this.track();
    this.stats.say(`Set off on his bike in ${name.split(",")[0]}`);
    this.save();
    this.changed();
    return "";
  }

  /** A walker standing on the nearest street at lat, lon once the streets there load; or an error for the picker. */
  private async land(name: string, lat: number, lon: number, bbox: BBox | null, onWait: (state: string) => void): Promise<Walker | string> {
    const w = new Walker();
    this.loader.setGraph(w.graph);
    const home = cellOf(lat, lon);
    while (!w.graph.cells.has(cellKey(home))) {
      if (this.loader.hasFailed(home)) {
        this.loader.resetFailures();
        this.problems.warn(`Couldn't load the streets where he starts in ${name}`);
        return "Couldn't load streets. Check your connection and try again.";
      }
      this.loader.request(cellsByPriority(lat, lon, STREET_RING));
      onWait(this.loader.cellState(home));
      await new Promise((r) => setTimeout(r, 50));
    }
    const start = w.graph.nearestNode(lat, lon);
    if (start === null) {
      this.problems.warn(`No walkable streets at the start of ${name}`);
      return "No walkable streets there. Try another place.";
    }
    w.startAt(start);
    w.bounds = cityBounds(lat, lon, bbox);
    return w;
  }

  private attach(w: Walker): void {
    this.walker = w;
    this.popped = null;
    w.rng = this.rng;
    this.equip();
    w.events = {
      arrived: (p) => this.onArrived(p),
      idle: () => this.onIdle(),
      problem: (t) => this.problems.warn(t),
    };
  }

  /** He rides at the speed his upgrades give. */
  private equip(): void {
    if (this.walker) this.walker.speedMps = BIKE_MPS * speedX(this.stats.upgrades);
  }

  /** Lets `dt` real seconds pass. */
  step(dt: number): void {
    const w = this.walker;
    if (!w) return;
    const here = w.position();
    this.loader.request(cellsByPriority(here[0], here[1], STREET_RING, this.goalHeading()));
    const s = Math.min(dt, MAX_STEP_S);
    const before = w.totalM;
    w.advance(s);
    if (w.totalM > before) {
      this.track();
      // The wait for an order runs while he rides about (not while streets load).
      if (!this.job.order && (this.job.waitLeftS -= s) <= 0) this.newOrder();
    }
    if (this.popped && (this.popped.leftS -= dt) <= 0) {
      this.popped = null;
      this.changed();
    }
    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      this.checkCity();
      if (w.graph.cells.size > MAX_CELLS) this.freshMap();
    }
    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_EVERY_S) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** Drops the streets he has left behind: a walker rebuilt from his own save on an empty graph, so he walks on to the same goal while the cells around him reload (mostly from the cache). */
  private freshMap(): void {
    const popped = this.popped;
    const w = Walker.fromJSON(this.walker!.toJSON());
    this.attach(w);
    this.popped = popped;
    this.loader.setGraph(w.graph);
  }

  /** His spot goes in the history and extends the trail. */
  private track(): void {
    const p = this.walker!.position();
    this.stats.history.moveTo(p[0], p[1]);
  }

  /** At the restaurant he takes the food on to the customer's door; at the door he is paid. */
  private onArrived(place: Place): void {
    this.track();
    const o = this.job.order;
    if (!o) return;
    this.stats.reach(place);
    if (!o.picked && same(o.from, place)) {
      o.picked = true;
      this.stats.say(`Picked up the food at ${o.from.name}`);
      this.walker!.goTo(homePlace(o.to));
    } else if (o.picked && same(homePlace(o.to), place)) {
      this.stats.deliver(o.cents);
      this.stats.say(`Delivered to ${addressOf(o.to)}: +${euro(o.cents)}`);
      this.debugLog.add({ delivered: true, to: addressOf(o.to), cents: o.cents });
      this.popped = { pose: MONEY_POSE, leftS: POSE_S };
      this.endOrder();
    }
    this.save();
    this.changed();
  }

  /** No order on, or the next wait starts. */
  private endOrder(): void {
    this.job.order = null;
    this.job.waitLeftS = waitS(this.rng, waitX(this.stats.upgrades));
  }

  /** An order comes: a food place near him and a door near that (street corners where the map has no house numbers). */
  private newOrder(): void {
    const w = this.walker!;
    const here = w.position();
    const box = bboxAround(here[0], here[1], ORDER_REACH_M);
    const places = w.graph.placesIn(box);
    let doors = w.graph.homesIn(box);
    const streetDoors = doors.length === 0;
    if (streetDoors) doors = this.streetDoors(box);
    const o = makeOrder(this.rng, here, places, doors);
    if (!o) {
      this.job.waitLeftS = RETRY_S;
      return;
    }
    const corner = w.graph.nearestNode(o.to.lat, o.to.lon);
    if (corner !== null && !o.to.street) o.to = { ...o.to, street: w.graph.streetAt(corner) };
    this.job.order = o;
    const e: Entry = { order: true, from: o.from.name, to: addressOf(o.to), cents: o.cents, pickup_m: distanceM(here[0], here[1], o.from.lat, o.from.lon), drop_m: o.dropM, food: places.filter((p) => FOOD.has(p.class)).length, doors: doors.length };
    if (streetDoors) e.street_doors = true;
    if (this.forced) e.forced = this.forced;
    this.forced = "";
    this.debugLog.add(e);
    this.stats.say(`New order: pick up at ${o.from.name} for ${addressOf(o.to)} (${euro(o.cents)})`);
    w.goTo(o.from);
    this.save();
    this.changed();
  }

  /** Up to STREET_DOORS street corners in the box, as doors with only a street name. */
  private streetDoors(box: BBox): Home[] {
    const g = this.walker!.graph;
    const out: Home[] = [];
    for (const [id, p] of g.nodes) {
      if (p[0] < box[0] || p[0] > box[2] || p[1] < box[1] || p[1] > box[3] || !g.neighbors(id).length) continue;
      out.push({ street: g.streetAt(id), number: "", lat: p[0], lon: p[1] });
      if (out.length >= STREET_DOORS) break;
    }
    return out;
  }

  /** The pop over him after he is paid, or null. */
  pose(): Pose | null {
    return this.popped?.pose ?? null;
  }

  /** He has no goal: if he is on an order, he gave up on getting there, so it is cancelled. */
  private onIdle(): void {
    const o = this.job.order;
    if (!o) return;
    const at = o.picked ? addressOf(o.to) : o.from.name;
    this.stats.say(`Couldn't get to ${at}, so the order was cancelled`);
    this.debugLog.add({ cancelled: true, at });
    this.endOrder();
    this.save();
    this.changed();
  }

  /** The Shop: buys one more of upgrade `id`; false when it is not open yet or he can't afford it. */
  buy(id: UpgradeId): boolean {
    const u = upgradeOf(id);
    if (!u || !this.stats.buy(u)) return false;
    this.equip();
    // The wait under way gets shorter too.
    if (id === "orders") this.job.waitLeftS *= WAIT_STEP;
    this.save();
    this.changed();
    return true;
  }

  /** True when no places of note are loaded in the city box. */
  noPlaces(): boolean {
    const w = this.walker;
    return !!w?.bounds && w.graph.placesIn(w.bounds).length === 0;
  }

  /** Debug button: drops the order he is on, and a new one comes at once. */
  debugNewOrder(): void {
    if (!this.walker) return;
    this.walker.stop();
    this.job.order = null;
    this.forced = "order";
    this.newOrder();
    this.changed();
  }

  /** New city: wipes the save but keeps the settings. */
  reset(): void {
    this.walker = null;
    this.stats = new Stats();
    this.debugLog = new DebugLog();
    this.job = new Job();
    this.city = "";
    this.file.clear();
    this.changed();
  }

  /** [lat, lon] of the place or spot he is heading to; null while he has none. */
  goalTarget(): LatLon | null {
    const w = this.walker;
    if (!w) return null;
    if (w.place) return [w.place.lat, w.place.lon];
    return w.goal;
  }

  /** Direction to where he is heading [east, south], so streets that way load first. */
  private goalHeading(): [number, number] {
    const w = this.walker!;
    const here = w.position();
    const to = w.aim();
    if (!to) return [0, 0];
    return [to[1] - here[1], here[0] - to[0]];
  }

  save(): void {
    this.saveSettings();
    const w = this.walker;
    if (!w) return;
    const err = this.file.write({ city: this.city, origin: this.origin, zoom: this.zoom, walker: w, stats: this.stats, debugLog: this.debugLog, job: this.job });
    if (err) this.problems.error(err);
  }

  /** Picks up the saved game, if any. */
  load(): boolean {
    const d = this.file.read();
    if (d === null) return false;
    if (typeof d === "string") {
      this.problems.error(d);
      return false;
    }
    const w = d.walker;
    this.stats = d.stats;
    this.attach(w);
    this.debugLog = d.debugLog;
    this.job = d.job;
    this.loader.setGraph(w.graph);
    this.city = d.city;
    this.zoom = d.zoom;
    this.origin = d.origin;
    this.changed();
    return true;
  }

  private loadSettings(): void {
    const s = this.file.readSettings();
    if (s === null) return;
    if (typeof s === "string") return this.problems.warn(s);
    this.showCityArea = s.showCityArea;
    this.showRoute = s.showRoute;
    this.cameraFollows = s.cameraFollows;
    Object.assign(this.problems, s.problems, { quiet: this.problems.quiet });
  }

  saveSettings(): void {
    this.file.writeSettings({ showCityArea: this.showCityArea, showRoute: this.showRoute, cameraFollows: this.cameraFollows, problems: this.problems });
  }

  setShowCityArea(on: boolean): void {
    this.showCityArea = on;
    this.saveSettings();
    if (on) void this.learnOutline();
    this.changed();
  }

  setShowRoute(on: boolean): void {
    this.showRoute = on;
    this.saveSettings();
    this.changed();
  }

  setCameraFollows(on: boolean): void {
    this.cameraFollows = on;
    this.saveSettings();
    this.changed();
  }

  /** The city's real outline, fetched once per city. */
  async learnOutline(): Promise<void> {
    if (this.outlineOf === this.city) return;
    const asked = this.city;
    this.outlineOf = asked;
    this.cityOutline = [];
    const rings = await this.deps.api.cityOutline(this.origin[0], this.origin[1]);
    if (this.city === asked) {
      this.cityOutline = rings;
      this.changed();
    }
  }

  /** Once a second: warns (once per city) when enough streets are loaded but no places worth going to. */
  private checkCity(): void {
    const w = this.walker;
    if (!w) return;
    if (this.noPlacesWarned !== this.city && w.graph.cells.size >= NO_PLACES_CELLS && this.noPlaces()) {
      this.noPlacesWarned = this.city;
      this.problems.warn(`No places of note in ${this.city}`, [`${w.graph.cells.size} street cells are loaded but none has a place worth going to in the city box.`, "Orders pick up at any place of note; with none, no orders come."]);
    }
  }

  /** What looks wrong with the city right now, most serious first, for Debug. */
  cityAlerts(): Alert[] {
    const w = this.walker;
    if (!w) return [];
    const out: Alert[] = [];
    if (this.loader.isFailing()) out.push({ level: "error", text: "Street downloads are failing" });
    if (w.graph.cells.size >= NO_PLACES_CELLS && this.noPlaces()) out.push({ level: "warning", text: "No places of note in the city box: no food to pick up" });
    const [lat, lon] = w.position();
    const b = w.bounds;
    if (b && (lat < b[0] || lon < b[1] || lat > b[2] || lon > b[3])) out.push({ level: "warning", text: "He is outside the city box" });
    return out;
  }
}
