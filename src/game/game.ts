// The game: picks a city, keeps the walker moving in real time while the app
// is open, and loads streets as he nears new ground. At each place he gets
// its reward (see core/places.ts). Time stops while the game is closed: he
// goes on from where he was. No DOM here: the app calls step() and the
// screens read the state.
import { DebugLog, type Entry } from "../core/debugLog";
import type { BBox, LatLon } from "../core/geo";
import { cellKey, cellOf, cellsByPriority, StreetGraph } from "../core/graph";
import { MONEY_POSE, XP_POSE, type Pose } from "../core/look";
import { kindOf } from "../core/places";
import { Problems } from "../core/problems";
import { Rng } from "../core/rng";
import { Stats, type Place } from "../core/stats";
import { cityBounds, Walker, type PickInfo } from "../core/walker";
import type { Api, SearchPlace } from "../net/api";
import type { LoadFn } from "../streets/client";
import { StreetLoader } from "../streets/loader";
import { DEFAULT_ZOOM, SaveFile, type KV } from "./saveFile";

export { DEFAULT_ZOOM, SAVE_KEY, SETTINGS_KEY } from "./saveFile";

/** Street cells loaded with no places of note before the city counts as having none. */
export const NO_PLACES_CELLS = 3;
export const SAVE_EVERY_S = 5;
/** Longest step that counts as walking, so a stall (or a tab that was hidden) never jumps him ahead. */
export const MAX_STEP_S = 1;
/** Cells kept loaded around him: 1 means 3 x 3 z14 tiles, about 5 x 4 km. */
export const STREET_RING = 1;
/** Seconds the pop over him shows after a reward. */
export const POSE_S = 2;

export type Alert = { level: "error" | "warning"; text: string };

export type GameDeps = {
  api: Api;
  load: LoadFn;
  storage?: KV | null;
  rng?: Rng;
};

/** The places worth heading for: those that give him something. */
const rewarding = (p: Place) => kindOf(p) !== null;

export class Game {
  walker: Walker | null = null;
  stats = new Stats();
  debugLog = new DebugLog();
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
    this.stats = new Stats();
    this.debugLog = new DebugLog();
    this.attach(w);
    this.city = name;
    this.origin = [lat, lon];
    this.track();
    this.stats.say(`Set off in ${name.split(",")[0]}`);
    this.save();
    this.changed();
    return "";
  }

  private attach(w: Walker): void {
    this.walker = w;
    this.popped = null;
    w.rng = this.rng;
    w.wants = rewarding;
    w.events = {
      arrived: (p) => this.onArrived(p),
      picked: (i) => this.onPicked(i),
      problem: (t) => this.problems.warn(t),
    };
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
    if (w.totalM > before) this.track();
    if (this.popped && (this.popped.leftS -= dt) <= 0) {
      this.popped = null;
      this.changed();
    }
    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      this.checkCity();
    }
    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_EVERY_S) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** His spot goes in the history and extends the trail. */
  private track(): void {
    const p = this.walker!.position();
    this.stats.history.moveTo(p[0], p[1]);
  }

  /** At a place: its reward lands, with a pop over him. */
  private onArrived(place: Place): void {
    this.track();
    const r = this.stats.reach(place);
    if (r.cents || r.xp) this.popped = { pose: r.cents ? MONEY_POSE : XP_POSE, leftS: POSE_S };
    this.changed();
  }

  /** The pop over him after a reward, or null. */
  pose(): Pose | null {
    return this.popped?.pose ?? null;
  }

  /** Each pick goes in the debug log. */
  private onPicked(info: PickInfo): void {
    const e: Entry = { ...info };
    if (this.forced) e.forced = this.forced;
    this.debugLog.add(e);
    this.changed();
  }

  /** True when no places of note are loaded in the city box. */
  noPlaces(): boolean {
    const w = this.walker;
    return !!w?.bounds && w.graph.placesIn(w.bounds).filter(rewarding).length === 0;
  }

  /** Debug button: picks a new goal now. */
  debugNewGoal(): void {
    if (!this.walker) return;
    this.forced = "goal";
    this.walker.pickGoal();
    this.forced = "";
  }

  /** New city: wipes the save but keeps the settings. */
  reset(): void {
    this.walker = null;
    this.stats = new Stats();
    this.debugLog = new DebugLog();
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
    const err = this.file.write({ city: this.city, origin: this.origin, zoom: this.zoom, walker: w, stats: this.stats, debugLog: this.debugLog });
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
    this.attach(w);
    this.stats = d.stats;
    this.debugLog = d.debugLog;
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
      this.problems.warn(`No places of note in ${this.city}`, [`${w.graph.cells.size} street cells are loaded but none has a place worth going to in the city box.`, "Goals are random spots."]);
    }
  }

  /** What looks wrong with the city right now, most serious first, for Debug. */
  cityAlerts(): Alert[] {
    const w = this.walker;
    if (!w) return [];
    const out: Alert[] = [];
    if (this.loader.isFailing()) out.push({ level: "error", text: "Street downloads are failing" });
    if (w.graph.cells.size >= NO_PLACES_CELLS && this.noPlaces()) out.push({ level: "warning", text: "No places of note in the city box: he walks to random spots" });
    const [lat, lon] = w.position();
    const b = w.bounds;
    if (b && (lat < b[0] || lon < b[1] || lat > b[2] || lon > b[3])) out.push({ level: "warning", text: "He is outside the city box" });
    return out;
  }
}
