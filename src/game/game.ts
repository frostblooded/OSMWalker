// The game: picks a city, keeps the walker moving in real time while the app
// is open (he waits where he is while it is closed), loads streets as he
// nears new ground, and now and then sends him on a trip to another city by
// bus, plane or car (he walks to the station first and pays the fare there).
// At each place he does an action that changes his stats. No DOM here: the
// app calls step() and the screens read the state.
import { Activities, choose, needWeight, restMinutes, type ActionTable } from "../core/activities";
import * as CityCheck from "../core/cityCheck";
import * as CityFacts from "../core/cityFacts";
import { DebugLog, type Entry } from "../core/debugLog";
import { distanceM, type BBox } from "../core/geo";
import { cellKey, cellOf, cellsByPriority, StreetGraph } from "../core/graph";
import { euro, signed } from "../core/money";
import { Problems } from "../core/problems";
import { Rng } from "../core/rng";
import { Stats, type Action, type Place } from "../core/stats";
import { cityBounds as tripCityBounds, isPlan, NO_PLACES_BOOST, roll, Trips, type City, type Kind, type LatLon, type Plan } from "../core/trips";
import { cityBounds, pathLengthM, SPEED_MPS, tripLimitM, Walker, type PickInfo } from "../core/walker";
import type { Api, SearchPlace } from "../net/api";
import type { LoadFn } from "../streets/client";
import { StreetLoader } from "../streets/loader";
import { DEFAULT_ZOOM, SaveFile, type KV } from "./saveFile";

export { DEFAULT_ZOOM, SAVE_KEY, SETTINGS_KEY } from "./saveFile";

/** Street cells loaded with no places of note before the city counts as having none. */
export const NO_PLACES_CELLS = 3;
export const SAVE_EVERY_S = 5;
/** Longest step that counts as walking, so a stall never jumps him ahead. */
export const MAX_STEP_S = 1;
/** Cells kept loaded around him: 1 means 3 x 3 z14 tiles, about 5 x 4 km. */
export const STREET_RING = 1;

export type GameData = { actions: ActionTable; flavour: Record<string, ActionTable>; cities: City[]; airports: Trips["airports"] };
export type Alert = { level: "error" | "warning"; text: string };
export type Severe = { title: string; details: string[] };

export type GameDeps = {
  api: Api;
  load: LoadFn;
  data: GameData;
  storage?: KV | null;
  rng?: Rng;
  /** The trip roll in [0, 1); tests swap in fixed rolls. */
  rollSource?: () => number;
  /** The hour of day; tests pin it. */
  hour?: () => number;
};

export class Game {
  walker: Walker | null = null;
  stats = new Stats();
  debugLog = new DebugLog();
  readonly problems = new Problems();
  readonly trips: Trips;
  readonly activities: Activities;
  readonly loader: StreetLoader;
  city = "";
  /** Country code of where he is. */
  country = "";
  /** True until the first destination after choosing a city. */
  skipRoll = false;
  origin: LatLon = [0, 0];
  /** The zoom the player picked. */
  zoom = DEFAULT_ZOOM;
  /** Trivia actions for random spots, from Wikidata. */
  cityFacts: Action[] = [];
  showCityArea = false;
  /** Draws his planned way to the goal; off until the player turns it on. */
  showRoute = false;
  /** The camera keeps him in view by itself (the menu switch); off, the map stays where the player leaves it. */
  cameraFollows = true;
  cityOutline: LatLon[][] = [];
  severeNow: Severe[] = [];
  citySummary: CityCheck.Summary | null = null;
  /** Bumped on every change worth redrawing a screen for. */
  version = 0;
  private listeners = new Set<() => void>();
  private rollInfo: PickInfo = {};
  private forced = "";
  private saveTimer = 0;
  private checkTimer = 0;
  private outlineOf = "";
  /** The city whose trivia lookup has finished. */
  private factsOf = "";
  private noPlacesWarned = "";
  private severeOf = "";
  private severeLogged = new Set<string>();
  private readonly rng: Rng;
  private readonly file: SaveFile;

  constructor(private readonly deps: GameDeps) {
    this.rng = deps.rng ?? new Rng();
    this.file = deps.storage === undefined ? new SaveFile() : new SaveFile(deps.storage);
    this.trips = new Trips(deps.data.cities, deps.data.airports);
    this.activities = new Activities(deps.data.actions, deps.data.flavour);
    this.loader = new StreetLoader(new StreetGraph(), deps.load);
    const warn = (t: string) => this.problems.warn(t);
    this.loader.onProblem = warn;
    deps.api.onProblem = warn;
    this.loadSettings();
  }

  /** The bundled game data (actions, cities, airports). */
  get data(): GameData {
    return this.deps.data;
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

  private hour(): number {
    return this.deps.hour?.() ?? new Date().getHours();
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
    this.country = this.trips.countryAt(lat, lon);
    this.origin = [lat, lon];
    this.skipRoll = true;
    this.track();
    void this.learnCity(lat, lon);
    this.save();
    this.changed();
    return "";
  }

  private attach(w: Walker): void {
    this.walker = w;
    w.rng = this.rng;
    w.tripPlanner = () => this.planTrip();
    w.needWeight = (p) => needWeight(this.activities.peek(p, this.country), this.stats);
    w.events = {
      landed: (c) => this.onLanded(c),
      arrived: (p) => this.onArrived(p),
      picked: (i) => this.onPicked(i),
      boarding: (p) => this.onBoarding(p),
      problem: (t) => this.problems.warn(t),
    };
  }

  /** Lets `dt` seconds pass. */
  step(dt: number): void {
    const w = this.walker;
    if (!w) return;
    if (!w.isTraveling()) {
      const here = w.position();
      this.loader.request(cellsByPriority(here[0], here[1], STREET_RING, this.goalHeading()));
    }
    // He walks what is loaded and waits at the edge until more streets arrive.
    const s = Math.min(dt, MAX_STEP_S);
    const before = w.totalM;
    w.speedMps = this.stats.speedMps();
    w.advance(s * SPEED_MPS);
    this.stats.passTime(s / 60, w.totalM - before);
    if (w.totalM > before && !w.isTraveling() && this.stats.walkFor(s / 60, this.rng)) this.changed();
    if (!w.isTraveling()) this.track();
    if (this.stats.fainted()) this.faint();
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

  /** At a destination: a first-visit bonus, then an action he can do there, which sets how long he stays. */
  private onArrived(place: Place): void {
    this.track();
    const bonus = this.stats.visit(place);
    this.stats.say(bonus > 0 ? `Reached ${place.name} for the first time (+${bonus} XP)` : `Reached ${place.name}`);
    const action = choose([...this.activities.forPlace(place, this.country), ...this.cityFacts], this.stats, this.hour(), this.rng.randf());
    if (!action) {
      this.problems.warn(`Nothing to do at ${place.name}`);
      return;
    }
    this.stats.do(action, place.name, this.rng);
    this.walker!.restFor(restMinutes(action));
    this.changed();
  }

  /** Health at zero: he wakes at the nearest known hospital, poorer. */
  private faint(): void {
    const w = this.walker!;
    const here = w.position();
    let hospital: Place | null = null;
    let best = Infinity;
    for (const p of w.bounds ? w.graph.placesIn(w.bounds) : []) {
      const d = distanceM(here[0], here[1], p.lat, p.lon);
      if (p.class === "hospital" && d < best) {
        best = d;
        hospital = p;
      }
    }
    if (!hospital) this.problems.warn("Fainted with no hospital loaded nearby; he wakes where he is");
    this.stats.wakeInHospital(hospital?.name ?? "");
    if (w.isTraveling()) return;
    if (hospital) {
      const node = w.graph.nearestNode(hospital.lat, hospital.lon);
      if (node !== null) {
        w.startAt(node);
        this.stats.history.breakTrail();
        this.track();
      }
    }
    w.restFor(1);
    w.place = hospital;
    this.changed();
  }

  /** Looks the city up on Wikidata in the background, for trivia at random spots. */
  private async learnCity(lat: number, lon: number): Promise<void> {
    this.cityFacts = [];
    const asked = this.city;
    const rows = await this.deps.api.cityFacts(lat, lon);
    if (this.city !== asked) return;
    this.cityFacts = CityFacts.actions(rows);
    this.factsOf = asked;
    if (this.cityFacts.length === 0) this.problems.warn(`No Wikidata trivia for ${this.city}`);
  }

  /** True when no places of note are loaded in the city box. */
  noPlaces(): boolean {
    const w = this.walker;
    return !!w?.bounds && w.graph.placesIn(w.bounds).length === 0;
  }

  /** Asked on each new destination: maybe a trip to another city instead. */
  private planTrip(): Plan | null {
    if (this.skipRoll) {
      this.skipRoll = false;
      this.rollInfo = { skipped: "first pick in a new city" };
      return null;
    }
    const w = this.walker!;
    const r = this.deps.rollSource?.() ?? this.rng.randf();
    const boost = this.noPlaces() ? NO_PLACES_BOOST : 1;
    const kind = roll(r, boost);
    this.rollInfo = { roll: r, boost, outcome: kind };
    if (kind === "stay") return null;
    const here = w.position();
    const found = this.tripTo(kind, here);
    if (!found) return null;
    const dest = { ...found, bounds: tripCityBounds(found) };
    const plan = this.trips.planTrip(dest, here, w.bounds ? w.graph.placesIn(w.bounds) : [], this.stats.cents, this.stats.vehicle() === "car", this.rng.randf());
    if (!isPlan(plan)) {
      this.rollInfo.no_trip = plan.error;
      if (plan.short_of !== undefined) {
        this.stats.savingFor = plan.short_of;
        this.stats.say(`Wants to go to ${dest.name} but can't afford it yet, so he's saving up`);
      }
      return null;
    }
    this.stats.savingFor = 0;
    this.stats.say(`Heading to ${plan.station.name} for the ${plan.mode} to ${dest.name} (${euro(plan.fare)})`);
    if (plan.mode !== "plane") void this.fetchRoute(plan);
    return plan;
  }

  /** Asks for the road the bus or car takes; a ride that starts before the answer goes in a straight line. */
  private async fetchRoute(plan: Plan): Promise<void> {
    const path = await this.deps.api.route([plan.station.lat, plan.station.lon], plan.arrive);
    if (path.length > 0 && this.walker?.departing === plan) plan.path = path;
  }

  /** At the station: pays the fare, or stays and saves up when he has spent too much on the way. */
  private onBoarding(plan: Plan): void {
    const dest = plan.city;
    if (this.stats.cents < plan.fare) {
      plan.cancel = `can't afford the ${plan.mode}: needs ${euro(plan.fare)}, has ${euro(this.stats.cents)}`;
      this.stats.savingFor = plan.fare;
      this.stats.say(`Can't afford the ${plan.mode} to ${dest.name} any more, so he's saving up`);
      this.debugLog.add({ no_trip: plan.cancel });
      return;
    }
    this.stats.cents -= plan.fare;
    const how = plan.mode === "car" ? "Filled up and drove" : `Took the ${plan.mode}`;
    this.setOff(dest, `${how} to ${dest.name}, ${dest.country} from ${plan.station.name} (${signed(-plan.fare)})`);
  }

  /** A city for a trip of `kind`, with how many there were and its odds noted for the debug log. */
  private tripTo(kind: Kind, here: LatLon): City | null {
    const opts = this.trips.options(kind, this.country, here[0], here[1]);
    const dest = this.trips.pick(kind, this.country, here[0], here[1], this.rng);
    if (!dest) {
      this.rollInfo.no_trip = "no other city to go to";
      this.problems.warn(`A trip was rolled but there is no city to go to from ${this.city}`);
      return null;
    }
    const total = opts.reduce((a, c) => a + c.pop, 0);
    Object.assign(this.rollInfo, { options: opts.length, chance: dest.pop / Math.max(total, 1) });
    return dest;
  }

  private setOff(dest: City, line = ""): void {
    this.stats.say(line || `Set off for ${dest.name}, ${dest.country}`);
    this.stats.history.breakTrail();
    this.changed();
  }

  /** Each pick goes in the debug log with the trip roll that came before it. */
  private onPicked(info: PickInfo): void {
    const e: Entry = { ...this.rollInfo, ...info };
    if (this.forced) e.forced = this.forced;
    this.debugLog.add(e);
    this.rollInfo = {};
    this.changed();
  }

  private onLanded(dest: City): void {
    this.city = `${dest.name}, ${dest.country}`;
    this.country = dest.code;
    this.origin = [dest.lat, dest.lon];
    this.track();
    this.stats.say(`Arrived in ${this.city}`);
    void this.learnCity(dest.lat, dest.lon);
    this.loader.setGraph(this.walker!.graph);
    this.save();
    this.changed();
  }

  /** Debug button: ends any rest or trip and picks a new goal now, rolling the trip dice again. */
  debugNewGoal(): void {
    if (!this.walker) return;
    this.skipRoll = false;
    this.forced = "goal";
    this.walker.forceNewGoal();
    this.forced = "";
  }

  /** Debug button: lands him at once in another city of the country or abroad. */
  debugTrip(kind: "city" | "country"): void {
    const w = this.walker;
    if (!w) return;
    this.rollInfo = {};
    const dest = this.tripTo(kind, w.position());
    const e: Entry = { ...this.rollInfo, forced: kind };
    this.rollInfo = {};
    if (!dest) {
      this.debugLog.add(e);
      this.changed();
      return;
    }
    e.trip = `${dest.name}, ${dest.country}`;
    this.debugLog.add(e);
    this.setOff(dest);
    w.restM = 0;
    w.startTravel({ ...dest, bounds: tripCityBounds(dest) });
    w.landNow();
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

  /** [lat, lon] of the place or spot he is heading to or resting at; null while he has none or travels. */
  goalTarget(): LatLon | null {
    const w = this.walker;
    if (!w || w.isTraveling()) return null;
    if (w.place) return [w.place.lat, w.place.lon];
    return w.goal;
  }

  /** Direction to where he is heading [east, south], so streets that way load first. */
  private goalHeading(): [number, number] {
    const w = this.walker!;
    const here = w.position();
    const to = w.goal ?? (w.toNode !== null ? w.graph.nodes.get(w.toNode)! : null);
    if (!to) return [0, 0];
    return [to[1] - here[1], here[0] - to[0]];
  }

  save(): void {
    this.saveSettings();
    const w = this.walker;
    if (!w) return;
    const err = this.file.write({ city: this.city, country: this.country, skipRoll: this.skipRoll, origin: this.origin, zoom: this.zoom, walker: w, stats: this.stats, debugLog: this.debugLog });
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
    this.country = d.country || this.trips.countryAt(d.origin[0], d.origin[1]);
    this.skipRoll = d.skipRoll;
    void this.learnCity(d.origin[0], d.origin[1]);
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

  /**
   * Once a second: warns (once per city) when enough streets are loaded but
   * no places of note, and once the streets all around him are loaded checks
   * that the city has a way out and a way to earn money (severe if not).
   */
  private checkCity(): void {
    const w = this.walker;
    if (!w || w.isTraveling()) {
      this.severeNow = [];
      return;
    }
    if (this.noPlacesWarned !== this.city && w.graph.cells.size >= NO_PLACES_CELLS && this.noPlaces()) {
      this.noPlacesWarned = this.city;
      this.problems.warn(`No places of note in ${this.city}`, [
        `${w.graph.cells.size} street cells are loaded but none has a place of note in the city box.`,
        `Goals are random spots, and trips are ${NO_PLACES_BOOST}x as likely.`,
      ]);
    }
    if (this.severeOf !== this.city) {
      this.severeOf = this.city;
      this.severeNow = [];
      this.severeLogged.clear();
      this.citySummary = null;
    }
    if (!this.areaLoaded() || !w.bounds) return;
    const sm = CityCheck.summary(w.graph.placesIn(w.bounds), this.activities, this.country);
    this.citySummary = sm;
    this.severeNow = CityCheck.problems(sm, this.city);
    for (const p of this.severeNow) {
      if (this.severeLogged.has(p.title)) continue;
      this.severeLogged.add(p.title);
      this.problems.addSevere(p.title, [
        ...p.details,
        `Loaded in the city box: ${sm.bus} bus stations, ${sm.airport} airports, ${sm.gas} gas stations, ${sm.dealer} car dealers, ${sm.earn} places that pay.`,
      ]);
    }
  }

  /** What looks wrong with the city right now, most serious first, for Debug. */
  cityAlerts(): Alert[] {
    const w = this.walker;
    if (!w) return [];
    const out: Alert[] = this.severeNow.map((p) => ({ level: "error", text: `⛔ ${p.title}` }));
    if (this.loader.isFailing()) out.push({ level: "error", text: "Street downloads are failing" });
    if (w.isTraveling()) return out;
    if (w.graph.cells.size >= NO_PLACES_CELLS && this.noPlaces()) out.push({ level: "warning", text: "No places of note in the city box: he walks to random spots" });
    if (this.factsOf === this.city && this.cityFacts.length === 0) out.push({ level: "warning", text: "No trivia for this city" });
    const [lat, lon] = w.position();
    const b = w.bounds;
    if (b && (lat < b[0] || lon < b[1] || lat > b[2] || lon > b[3])) out.push({ level: "warning", text: "He is outside the city box" });
    return out;
  }

  /** True once every street cell around him is loaded. */
  areaLoaded(): boolean {
    const w = this.walker!;
    const here = w.position();
    return cellsByPriority(here[0], here[1], STREET_RING).every((c) => w.graph.cells.has(cellKey(c)));
  }

  /** What he is up to, in plain words, for the debug panel. */
  doingText(): string {
    const w = this.walker;
    if (!w) return "not started";
    if (w.travel) {
      const t = w.travel;
      return `travelling to ${t.to.name} by ${t.mode}, ${((t.left_m / Math.max(t.total_m, 0.001)) * pathLengthM(t.path) / 1000).toFixed(0)} km left`;
    }
    if (w.isResting()) return `staying ${w.restLeftS().toFixed(0)} s more at ${w.place?.name ?? "a spot"}`;
    const target = this.goalTarget();
    if (!target) return "no goal yet";
    const here = w.position();
    return `heading for ${w.place?.name ?? "a random spot"} ${distanceM(here[0], here[1], target[0], target[1]).toFixed(0)} m away (walked ${w.tripM.toFixed(0)} m of at most ${tripLimitM(w.tripStartM).toFixed(0)} m)`;
  }
}
