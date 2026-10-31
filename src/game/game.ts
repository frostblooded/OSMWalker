// The game: picks a city, keeps the walker moving in real time while the app
// is open (the time it was closed passes in one go when it opens again, see
// core/catchup.ts), loads streets as he
// nears new ground, and now and then sends him on a trip to another city by
// bus, plane or car (he walks to the station first and pays the fare there).
// At each place he does an action that changes his stats. The sky over the
// city (sun, season, Open-Meteo weather, closed places) steers him. No DOM
// here: the app calls step() and the screens read the state.
import { hisPick, momentOf, settle as settleCard, type Pick as CardPick } from "../core/workCards";
import { Activities, choose, minded, placePull, needLine, needOf, restMinutes, type ActionTable } from "../core/activities";
import type { NeedKey } from "../core/goals";
import { catchUpSteps, MAX_AWAY_S, MIN_AWAY_S, type AwayCity, type Line, type Summary } from "../core/catchup";
import * as CityCheck from "../core/cityCheck";
import * as CityFacts from "../core/cityFacts";
import { DebugLog, type Entry } from "../core/debugLog";
import type { Dilemma } from "../core/dilemmas";
import { getCrawler, setCrawler } from "../core/ruins";
import { distanceM, type BBox } from "../core/geo";
import * as Holidays from "../core/holidays";
import * as CC from "../core/cityCards";
import { dayOf } from "../core/gifts";
import { cellKey, cellOf, cellsByPriority, StreetGraph } from "../core/graph";
import { isOpen } from "../core/opening";
import { NAME_MAX, type Postcard } from "../core/postcard";
import { homeIcons, ICON_CAP, monumentIcons, placeIcons, spotIcons, type MapIcon } from "../core/mapIcons";
import { Problems } from "../core/problems";
import { defaultPick, MOMENT_S, MOMENT_TIMERS, type Moment, type Pick } from "../core/moments";
import * as R from "../core/repute";
import { Rng, seedOf } from "../core/rng";
import * as Notes from "../core/sightNotes";
import { isNote, whisperLine, type Letters, type Whisper } from "../core/bond";
import type { DiaryData } from "../core/diary";
import type { MailData } from "../core/mail";
import type { Forecast } from "../core/forecast";
import type { Creature } from "../core/creatures";
import { momentDice, tripMoment, type PlaceMoment, type PlaceMoments } from "../core/placeMoments";
import { type Ancestor, ELDER, walkerName } from "../core/life";
import { leyLines, onLey, type Ley, type Spell } from "../core/magic";
import type { WordBook } from "../core/words";
import type { Incident } from "../core/incidents";
import * as Q from "../core/quests";
import type { Contest } from "../core/rival";
import type { Borders } from "../core/border";
import type { FriendData } from "../core/friends";
import type { Jokes } from "../core/jokes";
import { isLandmark, type Dex } from "../core/keepsakes";
import { offsetFromLon, skyAt, skyNeed, type Sky } from "../core/sky";
import { FLYERS } from "../core/speeds";
import { Stats, visitKey, type Action, type Place } from "../core/stats";
import { STYLES } from "../core/storyteller";
import { cityBounds as tripBounds, cityKey, NO_PLACES_BOOST, Trips, type City, type LatLon, type Plan } from "../core/trips";
import { cityBounds, SPEED_MPS, Walker, type PickInfo, type Travel } from "../core/walker";
import { WEATHER_RETRY_MS, WEATHER_TTL_MS, weatherAt, type WeatherForecast } from "../core/weather";
import type { Api, SearchPlace } from "../net/api";
import type { LoadFn } from "../streets/client";
import { StreetLoader } from "../streets/loader";
import { Journey, type Where } from "./journey";
import { DEFAULT_ZOOM, SaveFile, type HolidayBook, type KV } from "./saveFile";

export { DEFAULT_ZOOM, SAVE_KEY, SETTINGS_KEY } from "./saveFile";

/** core/iso2.ts, loaded once per page on first use so the code table stays out of the startup script. */
let iso2Load: Promise<typeof import("../core/iso2")> | null = null;
const iso2Module = () => (iso2Load ??= import("../core/iso2"));

/** Street cells loaded with no places of note before the city counts as having none. */
export const NO_PLACES_CELLS = 3;
export const SAVE_EVERY_S = 5;
/** The Debug button's moments in turn: a plain choice (""), then each mini-game. */
export const DEBUG_MOMENTS = ["", "timing", "cards", "taps", "odd"] as const;
/** Longest step that counts as walking, so a stall never jumps him ahead. */
export const MAX_STEP_S = 1;
/** Cells kept loaded around him: 1 means 3 x 3 z14 tiles, about 5 x 4 km. */
export const STREET_RING = 1;
/** Longest wait on reopen for the streets around him (from the device's cache), so the catch-up uses real places. */
export const CATCHUP_WAIT_MS = 3000;
/** Longest a reopen waits, after the streets, for the dilemma code; past it there is no dilemma this time. */
export const DILEMMA_WAIT_MS = 500;
/** The catch-up gives the page a break after this many ms of work, so no task gets long. */
export const CATCHUP_SLICE_MS = 8;
/** Cities whose made-up places the save keeps; the oldest is dropped first. */
export const MADE_CITIES = 20;
/** How far east of a meeting Viktor shows, in degrees of longitude (some 25 m), so he stands beside him. */
export const RIVAL_OFFSET_DEG = 0.0003;
/** After the heir's streets failed to load, retiring waits this long before trying again. */
export const RETIRE_RETRY_MS = 60_000;

export type GameData = { actions: ActionTable; flavour: Record<string, ActionTable>; cities: City[]; airports: Trips["airports"]; dex?: Dex; jokes?: Jokes; forecasts?: Forecast[]; letters?: Letters; incidents?: Incident[]; borders?: Borders; contests?: Contest[]; friends?: FriendData; creatures?: Creature[]; quests?: Q.Bank; spells?: Spell[]; words?: WordBook; diary?: DiaryData; mail?: MailData; moments?: PlaceMoments };
export type Alert = { level: "error" | "warning"; text: string };
export type Severe = { title: string; details: string[] };

export type GameDeps = {
  api: Api;
  load: LoadFn;
  data: GameData;
  storage?: KV | null;
  rng?: Rng;
  /** Keepsake rolls (card finishes); tests pin them. */
  cardRng?: Rng;
  /** The trip roll in [0, 1); tests swap in fixed rolls. */
  rollSource?: () => number;
  /** The hour of day (the sun's and the clock's); tests pin it. */
  hour?: () => number;
  /** Unix ms now; tests move it on. */
  clock?: () => number;
};

export class Game {
  walker: Walker | null = null;
  stats = new Stats();
  debugLog = new DebugLog();
  readonly problems = new Problems();
  readonly trips: Trips;
  readonly journey: Journey;
  readonly activities: Activities;
  readonly loader: StreetLoader;
  city = "";
  /** Country code of where he is. */
  country = "";
  origin: LatLon = [0, 0];
  /** The zoom the player picked. */
  zoom = DEFAULT_ZOOM;
  /** Trivia actions for random spots, from Wikidata. */
  cityFacts: Action[] = [];
  /** Today's public holiday where he is, or null. */
  holiday: Holidays.Holiday | null = null;
  /** Holiday lists by "CC:year" (from the device, then Nager.Date), and lists being fetched. */
  private holidayBook: HolidayBook;
  private holidayFetches = new Map<string, Promise<void>>();
  /** When he last looked sights up (unix ms, the past hour), and whether a lookup is under way (see readUp). */
  private noteAsks: number[] = [];
  private noteBusy = false;
  /** The street he walked last (see walkStreet); not saved. */
  private street = "";
  /** Two-letter country codes (see loadIso2). */
  private iso2: ((code: string) => string) | null = null;
  /** The action he does at the place he stays at, for his pose; not saved. */
  doing: Action | null = null;
  /** A police chase under way: the timed moment, where it began, when it ends (ms) and the streets he ran since, once a second. Not saved. */
  chase: { place: string; ends: number; trail: LatLon[]; asked?: boolean } | null = null;
  showCityArea = false;
  /** Draws his planned way to the goal; off until the player turns it on. */
  showRoute = false;
  /** The camera keeps him in view by itself (the menu switch); off, the map stays where the player leaves it. */
  cameraFollows = true;
  /** The optional city sound (the menu switch); off until the player turns it on. */
  sound = false;
  /** Debug switch: every reopen after a long absence brings a dilemma. */
  alwaysDilemma = false;
  /** Seconds a timed moment waits for your tap (the Settings button); 0 is Off: he always picks himself. */
  momentS = MOMENT_S;
  /** The timed moment waiting for your tap, with its seconds left; he stands still until it is settled. */
  moment: { m: Moment; left: number; total: number; done: (p: Pick) => void; his: () => string; played?: string } | null = null;
  /** The name you sign postcards with; "" signs them "a friend". */
  postcardName = "";
  cityOutline: LatLon[][] = [];
  /** The ley lines between the loaded places (core/magic.ts), worked out again as streets load. */
  leys: Ley[] = [];
  /** Counts up each time the ley lines are worked out, so the map knows to draw them again. */
  leysVersion = 0;
  private leysOf = "";
  /** Meters walked since the last check for a ley line under him. */
  private leyM = 0;
  severeNow: Severe[] = [];
  citySummary: CityCheck.Summary | null = null;
  /** Made-up places by city (core/poiGen.ts), saved so a city keeps its own. */
  made: Record<string, Place[]> = {};
  /** What happened while the game was closed, for the summary card; null when there is nothing to show. */
  away: Summary | null = null;
  /** Hourly weather for the city he is in (or was in), null until fetched. */
  weather: WeatherForecast | null = null;
  /** True once the first wake has run, so screens know whether an away card is coming. */
  woke = false;
  /** True when this reopen earned a clover, for the summary card. */
  awayClover = false;
  /** The walker who just retired, for his farewell letter; null once it is closed (the family tree keeps it). */
  retired: Ancestor | null = null;
  private retiring = false;
  private retryRetireAt = 0;
  /** The choice the summary card offers this time, if any; he settles it himself when the card closes or the page is left. */
  dilemma: Dilemma | null = null;
  /** How many moments the Debug button has opened, so the next is another kind. */
  private debugMoments = 0;
  /** Seconds left before he decides the open dilemma himself (the moment timer, see momentS); Infinity until the away card shows it. */
  dilemmaLeft = 0;
  /** core/dilemmas.ts, loaded on a reopen (and warmed at idle by main.tsx) rather than at startup. */
  private dilemmas: typeof import("../core/dilemmas") | null = null;
  /** The Collection's badge rules, loaded once he is awake so they stay out of startup JS and off the reopen; null if they failed. */
  private collection: typeof import("../core/collection") | null = null;
  /** Bumped on every change worth redrawing a screen for. */
  version = 0;
  /** Unix ms of the last save: the catch-up starts from there. */
  private savedAt = 0;
  private waking = false;
  private listeners = new Set<() => void>();
  private forced = "";
  private saveTimer = 0;
  private checkTimer = 0;
  private outlineOf = "";
  /** The city whose trivia lookup has finished. */
  private factsOf = "";
  private noPlacesWarned = "";
  private severeOf = "";
  private madeOf = "";
  private madeIn: StreetGraph | null = null;
  private madePending = false;
  private madeFailed = "";
  private severeLogged = new Set<string>();
  private weatherBusy: Promise<void> | null = null;
  private weatherRetryAt = 0;
  private readonly rng: Rng;
  /** Keepsake rolls, apart from `rng` so a card roll never uses up the dice for his goals, actions and trips. */
  private readonly cardRng: Rng;
  private readonly file: SaveFile;

  constructor(private readonly deps: GameDeps) {
    this.rng = deps.rng ?? new Rng();
    this.cardRng = deps.cardRng ?? new Rng();
    this.file = deps.storage === undefined ? new SaveFile() : new SaveFile(deps.storage);
    this.holidayBook = this.file.readHolidays();
    this.trips = new Trips(deps.data.cities, deps.data.airports);
    this.journey = new Journey({ trips: this.trips, rng: this.rng, roll: deps.rollSource, route: (a, b) => deps.api.route(a, b), problem: (t) => this.problems.warn(t) });
    this.activities = new Activities(deps.data.actions, deps.data.flavour);
    this.loader = new StreetLoader(new StreetGraph(), deps.load);
    const warn = (t: string) => this.problems.warn(t);
    this.loader.onProblem = warn;
    deps.api.onProblem = warn;
    this.loadSettings();
    this.weather = this.file.readWeather();
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

  /** The sun's hour that times of day go by (see core/sky.ts), from the sky kept on his stats. */
  private hour(): number {
    return (this.stats.sky ?? this.sky()).hour;
  }

  /** The sky over him now, or at unix ms over a city in the country with `code`: weather only where the forecast is for, and none while he rides. */
  sky(ms = this.now(), city = this.city, at: LatLon = this.origin, code = this.country): Sky {
    const f = this.weather?.city === city ? this.weather : null;
    const offsetS = f?.offsetS ?? offsetFromLon(at[1]);
    const holiday = this.holidayOn(ms, code, offsetS) !== null;
    const sky = skyAt(ms, at[0], at[1], offsetS, this.walker?.isTraveling() ? null : weatherAt(f, ms), holiday);
    const pinned = this.deps.hour?.();
    return pinned === undefined ? sky : { ...sky, hour: pinned, clock: pinned };
  }

  /** Fetches the city's weather when the forecast is missing, for another city or over WEATHER_TTL_MS old. */
  refreshWeather(): Promise<void> {
    const now = this.now();
    const fresh = this.weather?.city === this.city && now - this.weather.fetchedMs < WEATHER_TTL_MS;
    if (!this.city || fresh || now < this.weatherRetryAt) return Promise.resolve();
    this.weatherBusy ??= (async () => {
      const city = this.city;
      const f = await this.deps.api.weather(city, this.origin[0], this.origin[1], now);
      this.weatherBusy = null;
      if (!f) {
        // The Api has logged why (a repeat right after the same line counts up), so he just goes on by the kept forecast.
        this.weatherRetryAt = this.now() + WEATHER_RETRY_MS;
        return;
      }
      if (city !== this.city) return;
      this.weather = f;
      this.file.writeWeather(f);
      this.stats.sky = this.sky();
      this.changed();
    })();
    return this.weatherBusy;
  }

  /** Unix ms now, by the game's clock. */
  now(): number {
    return this.deps.clock?.() ?? Date.now();
  }

  search(text: string): Promise<SearchPlace[] | null> {
    return this.deps.api.searchPlaces(text);
  }

  /**
   * Starts walking in a city: waits for the streets where he starts, then
   * puts him on the nearest one. Returns an error for the picker, or "".
   */
  async startCity(name: string, lat: number, lon: number, bbox: BBox | null, onWait: (state: string) => void = () => {}, stats = new Stats(), quiet = false): Promise<string> {
    const w = new Walker();
    this.loader.setGraph(w.graph);
    const home = cellOf(lat, lon);
    while (!w.graph.cells.has(cellKey(home))) {
      if (this.loader.hasFailed(home)) {
        this.loader.resetFailures();
        if (!quiet) this.problems.warn(`Couldn't load the streets where he starts in ${name}`);
        return "Couldn't load streets. Check your connection and try again.";
      }
      this.loader.request(cellsByPriority(lat, lon, STREET_RING));
      onWait(this.loader.cellState(home));
      await new Promise((r) => setTimeout(r, 50));
    }
    const start = w.graph.nearestNode(lat, lon);
    if (start === null) {
      if (!quiet) this.problems.warn(`No walkable streets at the start of ${name}`);
      return "No walkable streets there. Try another place.";
    }
    w.startAt(start);
    w.bounds = cityBounds(lat, lon, bbox);
    this.stats = stats;
    // A chase belongs to the walker it was after, not to an heir or a new game.
    this.chase = null;
    this.debugLog = new DebugLog();
    this.attach(w);
    this.city = name;
    this.country = this.trips.countryAt(lat, lon);
    this.origin = [lat, lon];
    this.placeStats();
    this.stats.sky = this.sky();
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
    w.questGoal = () => this.questGoal();
    w.need = (p) => minded(skyNeed(needOf(this.activities.peek(p, this.country), this.stats, this.hour(), p.class), p, this.stats.sky), p, this.stats);
    w.placePull = (p) => placePull(p, this.stats, this.hour());
    w.events = {
      landed: (c, t) => this.onLanded(c, t),
      arrived: (p) => this.onArrived(p),
      picked: (i) => this.onPicked(i),
      boarding: (p) => this.onBoarding(p),
      problem: (t) => this.problems.warn(t),
    };
  }

  /** Lets `dt` seconds pass. */
  step(dt: number): void {
    const w = this.walker;
    if (!w || this.waking || this.retiring) return;
    // The away card's dilemma waits the moment timer too, then he decides.
    if (this.dilemma?.picked === null && (this.dilemmaLeft -= dt) <= 0) this.leaveDilemma();
    // A timed moment holds him where he is until you tap or its time runs out.
    if (this.moment) {
      this.moment.left -= dt;
      if (this.moment.left <= 0) this.settleMoment(null);
      return;
    }
    const from = w.isTraveling() ? null : w.position();
    const graph = w.graph;
    if (from) this.loader.request(cellsByPriority(from[0], from[1], STREET_RING, this.goalHeading()));
    // He walks what is loaded and waits at the edge until more streets arrive.
    const s = Math.min(dt, MAX_STEP_S);
    const before = w.totalM;
    // His dragon eats before he moves, so a fed one flies from the first step of the day.
    if (this.stats.feedDragon(this.rng)) this.changed();
    w.speedMps = this.stats.speedMps(w.afoot);
    w.flies = FLYERS.has(this.stats.getsAbout());
    w.advance(s * SPEED_MPS);
    this.stats.passTime(s / 60, w.totalM - before, w.afoot);
    if (w.totalM > before && !w.isTraveling() && this.stats.walkFor(s / 60, this.rng)) this.changed();
    if (w.totalM > before) this.walkStreet(w.streetName());
    if (!w.isTraveling()) this.leyM += w.totalM - before;
    if (!w.isTraveling()) this.track();
    // Only steps walked from start to end in one city mark squares, so a ride, or a portal that lands within the step (a new graph), never draws a line of them.
    if (from && !w.isTraveling() && w.graph === graph && w.totalM > before) this.stats.explored.walk(from, w.position());
    if (this.stats.fainted()) this.faint();
    const leaving = this.stats.life.leaving;
    if (leaving) void this.retire(leaving);
    this.checkTimer += dt;
    if (this.checkTimer >= 1) {
      this.checkTimer = 0;
      this.checkCity();
      this.checkLey();
      this.checkChase();
      this.rollBoard();
    }
    this.saveTimer += dt;
    if (this.saveTimer >= SAVE_EVERY_S) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /** Notes the street he walks for his street collection, once each time he turns into another one. */
  private walkStreet(name: string): void {
    if (name === this.street) return;
    this.street = name;
    this.stats.streetAt(name);
  }

  /** His spot goes in the history and extends the trail. */
  private track(): void {
    const p = this.walker!.position();
    this.stats.history.moveTo(p[0], p[1]);
  }

  /** At a destination: a first-visit bonus, then an action he can do there, which sets how long he stays. */
  private onArrived(place: Place): void {
    this.track();
    const sky = (this.stats.sky = this.sky());
    if (!isOpen(place, sky.clock, sky.holiday)) {
      this.stats.say(`Found ${place.name} closed`);
      this.doing = null;
      this.changed();
      return;
    }
    const bonus = this.stats.visit(place);
    this.stats.stop(place);
    this.stats.say(bonus > 0 ? `Reached ${place.name} for the first time (+${bonus} XP)` : `Reached ${place.name}`);
    this.stats.care.open(this.stats);
    this.stats.bricksAt(place);
    this.stats.collect(place, this.cardRng);
    void this.readUp(place);
    // A creature that shows up takes this stop's one timed moment.
    const met = this.askCreature(place);
    this.stats.magicAt(place);
    this.stats.wordAt(place);
    this.stats.giantAt(place);
    const nap = this.stats.fairyAt(place, this.hour());
    if (nap) {
      this.doing = { name: "Asleep in a fairy ring", min: nap };
      this.walker!.restFor(nap);
      this.changed();
      return;
    }
    const door = this.stats.portalAt(place, this.trips);
    if (door) {
      this.doing = null;
      this.stats.history.breakTrail();
      this.walker!.rideNow(door, "portal");
      return;
    }
    // The police roll their own dice; a chase takes the place of an action, and he runs on.
    if (!this.chase && this.stats.reputeAt(place)) {
      // He runs on, so a creature still asking gets his own pick.
      if (met && this.moment?.m.id === met.moment.id) this.settleMoment(null);
      const at = this.walker!.position();
      this.chase = { place: place.name, ends: this.now() + R.CHASE_S * 1000, trail: [at] };
      this.doing = null;
      // He runs on at once instead of stopping.
      this.walker!.restFor(0);
      this.changed();
      return;
    }
    // Incidents roll on the card dice, so they leave his walk the same.
    this.stats.happen(place, sky.hour, this.cardRng);
    // Quests roll on the card dice too; a quest step or event takes the place of an action.
    const story = Q.questStop(this.stats, place, this.storyPlaces(), sky.hour, this.cardRng);
    if (story !== null) {
      this.doing = { name: this.stats.quests.active ? "On a quest" : "Helping out", min: story };
      this.walker!.restFor(story);
      this.changed();
      return;
    }
    const action = choose([...this.activities.forPlace(place, this.country, sky.holiday), ...this.cityFacts], this.stats, sky.hour, this.rng.randf(), place.class);
    this.doing = action ?? null;
    if (!action) {
      this.problems.warn(`Nothing to do at ${place.name}`);
      return;
    }
    // Card pulls roll on the card dice, so buying a pack leaves his walk the same.
    this.stats.askCards = true;
    this.stats.do(action, place.name, action.pack ? this.cardRng : this.rng, place.class);
    this.stats.askCards = false;
    this.walker!.restFor(restMinutes(action));
    // A chance card at work takes the place of the place's own moment (with a creature still asking, he plays it himself); so does a creature.
    if (this.stats.workCard) this.askCard(restMinutes(action) * 60);
    else if (!met) this.askAt(place, restMinutes(action) * 60);
    this.changed();
  }

  /**
   * The creature at `place`, if one shows up, asked as a timed moment. His own
   * pick, the dice and the attribute a risky pick leans on are those of the
   * moment it asks, as when Stats.meetAt settles it at once in the catch-up;
   * like the place moments, its effect lands once it is answered, after the
   * stop's activity started. Returns the creature, or null.
   */
  private askCreature(place: Place): Creature | null {
    const c = this.stats.creatureAt(place);
    if (!c) return null;
    const t = this.stats.now();
    const his = this.stats.creaturePick(c, place.name, t);
    const lean = c.risky ? this.stats.attr(c.risky.attr) : 0;
    void this.ask({ ...c.moment, ask: c.moment.ask.replaceAll("{PLACE}", place.name) }, { his: () => his }).then((p) => {
      this.stats.meet(c, place.name, p.id, { you: p.you, t, attr: () => lean });
      this.save();
    });
    return c;
  }

  /** The timed moment of `place` as he starts an activity there, open at most `maxS` seconds. */
  private askAt(place: Place, maxS: number): void {
    this.askPlaceMoment(this.stats.momentAt(place), place.name, momentDice(this.stats.now(), place.name), maxS);
  }

  /** The chance card at work that just came up (workCards.ts), open at most `maxS` seconds; if you don't tap, he picks on its own dice, as in the catch-up. */
  private askCard(maxS: number): void {
    const { d, dice } = this.stats.workCard!;
    this.stats.workCard = null;
    void this.ask(momentOf(d.card), { maxS, his: () => hisPick(this.stats, d.card, dice) }).then((p) => {
      this.stats.say(settleCard(this.stats, d, p.id as CardPick, p.you, dice));
      this.save();
    });
  }

  /** As he boards for `plan`: maybe a moment on the way. */
  private askTrip(plan: Plan): void {
    const dice = momentDice(this.stats.now(), plan.city.name);
    this.askPlaceMoment(tripMoment(this.stats.placeMoments, dice), plan.city.name, dice);
  }

  /** Asks moment `m` at `where` ({PLACE} in its text) and applies the pick, on its own `dice`, so it goes as in the catch-up (Stats.byHimself) and his walk stays the same. */
  private askPlaceMoment(m: PlaceMoment | null, where: string, dice: Rng, maxS?: number): void {
    if (!m) return;
    void this.ask({ ...m, ask: m.ask.replaceAll("{PLACE}", where) }, { maxS, his: () => defaultPick(m, this.stats, dice) }).then((p) => {
      this.stats.settleMoment(m, where, p.id, p.you, dice);
      this.save();
    });
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
    this.doing = null;
    if (w.isTraveling()) return;
    if (w.wakeAt(hospital ? w.graph.nearestNode(hospital.lat, hospital.lon) : null, hospital)) {
      this.stats.history.breakTrail();
      this.track();
    }
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

  /**
   * At a big real sight he hasn't looked up yet, reads up on it in the
   * background (sightNotes.ts): English Wikipedia, then the one in the
   * country's language. One lookup at a time, Notes.PER_HOUR an hour; a
   * failed request leaves the sight to try again another time.
   */
  private async readUp(place: Place): Promise<void> {
    const key = visitKey(place);
    if (place.made || !isLandmark(place) || place.rank > Notes.NOTE_RANK || this.noteBusy || this.stats.sightNotes.knows(key)) return;
    const asks = Notes.ask(this.noteAsks, this.now());
    if (!asks) return;
    this.noteAsks = asks;
    this.noteBusy = true;
    // A new city or game while the answer is on its way gets nothing from it.
    const stats = this.stats;
    try {
      const lang = this.deps.data.words?.countries[this.country];
      const wikis = ["en", ...(lang && Notes.wikiOf(lang) !== "en" ? [Notes.wikiOf(lang)] : [])];
      for (const wiki of wikis) {
        const data = await this.deps.api.sightNote(wiki, place.lat, place.lon);
        if (data === null || this.stats !== stats) return;
        const note = Notes.pick(data, place.name);
        if (note) {
          stats.noteRead(key, place.name, note);
          this.changed();
          return;
        }
      }
      stats.sightNotes.missed(key);
    } finally {
      this.noteBusy = false;
    }
  }

  /** True when no places of note are loaded in the city box. */
  noPlaces(): boolean {
    const w = this.walker;
    return !!w?.bounds && w.graph.placesIn(w.bounds).length === 0;
  }

  /** True until the first destination after choosing a city: no trip dice then. */
  get skipRoll(): boolean {
    return this.journey.skipRoll;
  }

  set skipRoll(on: boolean) {
    this.journey.skipRoll = on;
  }

  /** Where he is, for the trip dice. */
  private where(): Where {
    const w = this.walker!;
    return { here: w.position(), city: this.city, country: this.country, places: w.bounds ? w.graph.placesIn(w.bounds) : [], noPlaces: this.noPlaces() };
  }

  /** The trip dice on a new goal. */
  private planTrip(): Plan | null {
    // He finishes the quest he is on before he leaves the city.
    if (this.stats.quests.active) return null;
    return this.journey.consider(this.where(), this.stats);
  }

  /** At the station: rides off once paid, or stays and saves up when he has spent too much on the way. */
  private onBoarding(plan: Plan): boolean {
    const why = this.journey.board(plan, this.stats);
    if (why) {
      this.debugLog.add({ no_trip: why });
      return false;
    }
    this.askTrip(plan);
    this.changed();
    return true;
  }

  /** Each pick goes in the debug log with the trip roll that came before it. */
  private onPicked(info: PickInfo): void {
    const line = needLine(info.need as NeedKey | undefined ?? "", (info.need_w as number) ?? 1, info.urgent === true, String(info.place ?? ""), this.stats.cents);
    if (line) this.stats.say(line);
    const e: Entry = { ...this.journey.takeLog(), ...info };
    if (this.forced) e.forced = this.forced;
    this.debugLog.add(e);
    this.changed();
  }

  private onLanded(dest: City, t: Travel): void {
    this.city = cityKey(dest);
    this.country = dest.code;
    this.origin = [dest.lat, dest.lon];
    this.placeStats();
    this.track();
    this.stats.week.city(this.city);
    this.stats.say(`Arrived in ${this.city}`);
    for (const line of this.stats.land(t.mode, t.from[1], t.arrive[1], t.road_m, this.city)) this.stats.say(line);
    void this.learnCity(dest.lat, dest.lon);
    this.loader.setGraph(this.walker!.graph);
    this.save();
    this.changed();
  }

  /** Debug button: opens a place moment now, a plain choice and then each mini-game in turn (DEBUG_MOMENTS). */
  debugMoment(): void {
    const kind = DEBUG_MOMENTS[this.debugMoments++ % DEBUG_MOMENTS.length];
    const m = Object.values(this.stats.placeMoments).find((x) => (x.game ?? "") === kind);
    this.askPlaceMoment(m ?? null, this.city.split(",")[0]!, momentDice(this.stats.now(), "debug"));
  }

  /** Debug button: makes him a stage older at once (as an elder, due to retire). */
  debugAge(): void {
    const l = this.stats.life;
    const t = this.stats.now();
    l.born = (l.born || t) - l.leftS(t);
    this.stats.passTime(0, 0);
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
    const dest = this.journey.pickNow(kind, this.where(), this.stats);
    const e: Entry = { ...this.journey.takeLog(), forced: kind };
    if (dest) e.trip = `${dest.name}, ${dest.country}`;
    this.debugLog.add(e);
    this.changed();
    if (!dest) return;
    w.rideNow(dest);
  }

  /** Tells his stats the Placedex data, the diary's and his friends' letters' lines, the jokes, the border lines, the local words, the forecasts, the incident deck, the place creatures, the quest bank, the spells and where he is, after the city changed or a game loaded. */
  private placeStats(): void {
    this.stats.dex = this.deps.data.dex ?? {};
    this.stats.setCityPool(CC.pool(this.deps.data.cities));
    this.stats.jokes = this.deps.data.jokes ?? {};
    this.stats.borders = this.deps.data.borders ?? null;
    this.stats.wordBook = this.deps.data.words ?? null;
    this.stats.forecasts = this.deps.data.forecasts ?? [];
    this.stats.letters = this.deps.data.letters ?? null;
    this.stats.diaryData = this.deps.data.diary ?? null;
    this.stats.mailData = this.deps.data.mail ?? null;
    this.stats.incidents = this.deps.data.incidents ?? [];
    this.stats.creatureKinds = this.deps.data.creatures ?? [];
    this.stats.placeMoments = this.deps.data.moments ?? {};
    this.stats.spellKinds = this.deps.data.spells ?? [];
    this.stats.quests.bank = this.deps.data.quests ?? this.stats.quests.bank;
    this.stats.contests = this.deps.data.contests ?? [];
    this.stats.friendData = this.deps.data.friends ?? this.stats.friendData;
    this.stats.townNews = this.deps.data.friends?.news ?? [];
    this.stats.life.mark(this.city, this.origin);
    this.stats.arrive(this.city, this.country, this.trips.cities.find((c) => c.code === this.country)?.country ?? "");
  }

  /**
   * He retires (see Stats.retire): by age once his elder stage ran out, or
   * by you from the menu while he is an elder. His heir sets out from his
   * favourite city, or where he is when its streets won't load. On a ride he
   * waits until he lands (your ask is kept); if neither loads, he tries again
   * after RETIRE_RETRY_MS.
   */
  async retire(by: Ancestor["by"], inWake = false): Promise<void> {
    const w = this.walker;
    if (!w || this.retiring || this.stats.life.stage < ELDER) return;
    // A choice still open on the away card is the old walker's, so he decides it now; a free ride he takes puts this off until he lands.
    if (!inWake) this.leaveDilemma();
    const first = this.retryRetireAt === 0;
    // Mid catch-up (wake) the walker and his stats are still the catch-up's, so only wake's own call goes on.
    if (w.isTraveling() || this.now() < this.retryRetireAt || (this.waking && !inWake)) {
      // He can't yet: your ask is kept, and he retires at the next chance.
      if (by === "you" && !this.stats.life.asked) {
        this.stats.life.asked = true;
        this.stats.say(`🌅 Will retire as soon as he can`);
        this.changed();
      }
      return;
    }
    this.retiring = true;
    try {
      const life = this.stats.life;
      const home = this.stats.homeCity();
      const known = this.trips.cities.find((c) => `${c.name}, ${c.country}` === home);
      const at = life.cityAt[home] ?? (known ? [known.lat, known.lon] : this.origin);
      const here = { city: this.city, origin: this.origin, bounds: w.bounds };
      // He stands still while the streets load, so the feed says why (once, not on each retry).
      if (first) this.stats.say(`🌅 Retiring in ${home.split(",")[0]}…`);
      this.changed();
      let out = this.stats.retire(by, home);
      let failed = await this.startCity(home, at[0], at[1], known?.bounds ?? null, () => {}, out.heir, true);
      // Where the favourite city's streets won't load, he stops where he is instead, and his letter says so.
      if (failed && home !== here.city) {
        out = this.stats.retire(by, here.city);
        failed = await this.startCity(here.city, here.origin[0], here.origin[1], here.bounds, () => {}, out.heir, true);
      }
      if (failed) {
        // startCity pointed the loader at the heir's streets; he walks on in his own, and tries again later, your ask kept.
        this.loader.setGraph(w.graph);
        if (first) this.problems.warn(`Couldn't load the streets for his heir; he tries again every ${RETIRE_RETRY_MS / 60_000} min`);
        this.retryRetireAt = this.now() + RETIRE_RETRY_MS;
        if (by === "you") life.asked = true;
        return;
      }
      const ancestor = out.ancestor;
      this.stats.say(`🌱 ${walkerName(ancestor.gen + 1)} takes over from ${walkerName(ancestor.gen)}`);
      this.doing = null;
      this.retired = ancestor;
      this.retryRetireAt = 0;
    } finally {
      this.retiring = false;
      this.changed();
    }
  }

  /** Closes the farewell letter. */
  dismissRetired(): void {
    this.retired = null;
    this.changed();
  }

  /** New city: wipes the save but keeps the settings. */
  reset(): void {
    this.walker = null;
    this.stats = new Stats();
    this.chase = null;
    this.debugLog = new DebugLog();
    this.city = "";
    this.file.clear();
    this.changed();
  }

  /** Where the police car is during a chase: on the streets he ran, catching up with him as the chase runs out; null otherwise. */
  policeAt(): LatLon | null {
    const c = this.chase;
    if (!c) return null;
    const p = Math.min(Math.max(1 - (c.ends - this.now()) / (R.CHASE_S * 1000), 0), 1);
    const f = (c.trail.length - 1) * p;
    const i = Math.floor(f);
    const a = c.trail[i]!;
    const b = c.trail[Math.min(i + 1, c.trail.length - 1)]!;
    return [a[0] + (b[0] - a[0]) * (f - i), a[1] + (b[1] - a[1]) * (f - i)];
  }

  /** Once a second in a chase: notes where he ran, and when it runs out, ends it; caught short of money, he sits in jail (a stop, like any other, while you watch). */
  private checkChase(): void {
    const c = this.chase;
    const w = this.walker;
    // While you choose how it ends he stands still, caught up with.
    if (!c || !w || c.asked) return;
    // Nobody to chase once the heat is gone (paid off, or faded), or once he heads for a ride out or boards it (jail mid-trip would leave the trip half set up).
    if (this.stats.law.stars() === 0 || w.isTraveling() || w.isDeparting()) {
      this.chase = null;
      this.stats.say(w.isTraveling() ? "🚓 He got on board just in time and left the police behind" : w.isDeparting() ? "🚓 He hurried off to catch his ride, and the police lost him" : "🚓 The police gave up the chase");
      this.changed();
      return;
    }
    c.trail.push(w.position());
    if (this.now() < c.ends) return;
    // Caught up with: you pick how it ends, or he does when the timer runs out.
    c.asked = true;
    const s = this.stats;
    void this.ask(R.chaseMoment(s.him())).then((p) => {
      if (this.chase === c) this.chase = null;
      // An heir or a new game owes nothing for it.
      if (this.stats !== s) return;
      const jail = s.runChase(c.place, p.you ? (p.id as R.Pick) : undefined);
      if (jail && this.walker) {
        this.doing = { name: "In jail", min: jail };
        this.walker.restFor(jail);
      }
      this.changed();
      this.save();
    });
  }

  /** Where Viktor shows on the map, a few steps east of where they met, for a while after a meeting; null otherwise. */
  rivalAt(): LatLon | null {
    if (this.walker?.isTraveling()) return null;
    const at = this.stats.rival.shownAt(Math.floor(this.now() / 1000), this.stats.where.city);
    return at && [at[0], at[1] + RIVAL_OFFSET_DEG];
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
    const to = w.aim();
    if (!to) return [0, 0];
    return [to[1] - here[1], here[0] - to[0]];
  }

  save(): void {
    this.saveSettings();
    const w = this.walker;
    if (!w) return;
    if (this.waking) return;
    // Badges he has reached (see core/collection.ts), kept by this save.
    this.collection?.award(this.stats);
    this.savedAt = this.now();
    const err = this.file.write({ city: this.city, country: this.country, skipRoll: this.skipRoll, origin: this.origin, zoom: this.zoom, walker: w, stats: this.stats, debugLog: this.debugLog, savedAt: this.savedAt, made: this.made });
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
    this.placeStats();
    this.skipRoll = d.skipRoll;
    this.savedAt = d.savedAt;
    this.stats.sky = this.sky();
    this.made = d.made;
    void this.learnCity(d.origin[0], d.origin[1]);
    this.changed();
    return true;
  }

  /**
   * On reopen and when the tab shows again: the time since the last save
   * passes for him in one go (see core/catchup.ts). On reopen it first waits
   * a moment for the streets around him to come out of the cache, so he
   * visits the real places there.
   */
  async wake(): Promise<void> {
    const w = this.walker;
    // While he retires, the old walker's catch-up would land on the heir; the heir's own wake comes later.
    if (!w || this.waking || this.retiring) return;
    const from = this.savedAt;
    const awayS = (this.now() - from) / 1000;
    if (!from || awayS < MIN_AWAY_S) return this.woken();
    this.leaveDilemma();
    // A chase under way when the page was left is dropped; the catch-up rolls its own.
    this.chase = null;
    this.waking = true;
    // Loads alongside the street wait. A reopen never waits on it for long: without it (offline before it
    // was cached, or a slow fetch) there is just no dilemma this time, and a later reopen tries again.
    const dilemmas = this.dilemmas ? Promise.resolve(this.dilemmas) : import("../core/dilemmas").then((m) => (this.dilemmas = m), () => null);
    // Ruin crawls during the time away need core/crawl.ts too; without it ruins are just castles this time.
    const crawl = getCrawler() ? null : import("../core/crawl").then((m) => setCrawler(m.explore), () => undefined);
    try {
      const until = performance.now() + CATCHUP_WAIT_MS;
      // The catch-up takes no weather, so the reopen doesn't wait for it; it comes in for the watched game.
      void this.refreshWeather();
      while (!w.isTraveling() && !this.areaLoaded() && performance.now() < until) {
        const here = w.position();
        this.loader.request(cellsByPriority(here[0], here[1], STREET_RING));
        await new Promise((r) => setTimeout(r, 50));
      }
      // The code table and the ruin crawl rooms come in the same short wait, so the catch-up knows the holidays kept on the device and can crawl; it never waits on the network for a list.
      const shortWait = () => new Promise<null>((r) => setTimeout(() => r(null), DILEMMA_WAIT_MS));
      const [D] = await Promise.all([Promise.race([dilemmas, shortWait()]), Promise.race([this.loadIso2(), shortWait()]), crawl && Promise.race([crawl, shortWait()])]);
      await this.catchUp(Math.min(awayS, MAX_AWAY_S), awayS, from);
      this.awayClover = this.stats.care.checkIn(awayS, dayOf(this.now()));
      this.stats.wrote(this.stats.bond.checkIn(awayS, this.awayClover));
      // His elder stage ran out while you were away (or you asked on a ride): the catch-up stopped there, and the heir sets out now.
      // Aged to now first, since time past the catch-up's limit counts towards his life too.
      this.stats.passTime(0, 0);
      const old = this.stats;
      const leaving = old.life.leaving;
      if (leaving) await this.retire(leaving, true);
      if (leaving && this.away) this.away.retire = this.stats !== old ? "done" : "soon";
      // A reopen on which he retires, or will once streets load, brings no dilemma.
      this.dilemma = leaving
        ? null
        : D?.rollDilemma(awayS, this.rng, (kind) => {
          // No free ride while he is on a paid one.
          if (w.isTraveling()) return null;
          const here = w.position();
          return this.trips.pick(kind, this.country, here[0], here[1], this.rng, this.stats.bucket.pull());
        }, this.alwaysDilemma ? 1 : D.DILEMMA_CHANCE) ?? null;
      // Its time starts when the card shows (dilemmaShown).
      this.dilemmaLeft = Infinity;
      // With the timer Off he decides at once, and the card shows what he chose.
      if (!this.momentS) this.leaveDilemma();
    } finally {
      this.waking = false;
      this.woken();
    }
    this.save();
  }

  /** The first wake has decided whether there is an away card (or never will: no map, so no loop), so a postcard from a link may show. */
  woken(): void {
    this.woke = true;
    // A failed load tries again at the next wake.
    if (!this.collection) void import("../core/collection").then((m) => (this.collection = m), () => undefined);
    this.changed();
  }

  /** Lets `coverS` of the `awayS` seconds since `fromMs` pass: the rest of any ride first, then life by the catch-up rules. */
  private async catchUp(coverS: number, awayS: number, fromMs: number): Promise<void> {
    const w = this.walker!;
    const ride: Line[] = [];
    const startCity = this.city;
    let rideS = 0;
    if (w.travel) {
      const leftM = Math.min(w.travel.left_m, coverS * SPEED_MPS);
      rideS = leftM / SPEED_MPS;
      const clock = this.stats.now;
      this.stats.now = () => Math.floor(fromMs / 1000 + rideS);
      this.stats.onSay = (text, t) => ride.push({ text, t });
      // Time passes on the ride before he lands, as in the catch-up, so a ride's buff covers it, under the sky at its end.
      this.stats.sky = this.sky(fromMs + rideS * 1000);
      this.stats.passTime(rideS / 60, 0);
      // Exactly what is left, so rounding can't leave him a hair short of landing.
      w.advance(leftM);
      this.stats.now = clock;
      this.stats.onSay = null;
      if (this.stats.fainted()) this.faint();
    }
    w.departing = null;
    // A ride longer than the time away (a long walk, say) goes on when you are back.
    const onRide = w.travel !== null;
    const bounds = w.bounds ?? cityBounds(this.origin[0], this.origin[1]);
    const near = this.trips.cityNear(this.origin[0], this.origin[1]);
    const city: AwayCity = { name: this.city, code: this.country, center: this.origin, bounds, places: w.graph.cells.size ? w.graph.placesIn(bounds) : null, pop: near?.pop ?? 0, key: Q.listedKey(this.city, near, this.origin) };
    const steps = catchUpSteps(this.stats, city, w.position(), onRide ? 0 : coverS - rideS, fromMs + rideS * 1000, {
      activities: this.activities,
      trips: this.trips,
      rng: this.rng,
      cardRng: this.cardRng,
      skyAt: (ms, c) => this.sky(ms, c.name, c.center, c.code),
      roll: this.deps.rollSource,
      facts: this.cityFacts,
      skipRoll: this.skipRoll,
    });
    let slice = performance.now();
    let r = steps.next();
    while (!r.done) {
      if (performance.now() - slice > CATCHUP_SLICE_MS) {
        await new Promise((ok) => setTimeout(ok, 0));
        slice = performance.now();
      }
      r = steps.next();
    }
    const s = r.value;
    s.awayS = awayS;
    s.coveredS += rideS;
    s.lines.unshift(...ride);
    if (this.city !== startCity) s.cities.unshift(this.city);
    const moved = s.end.city.name !== this.city;
    if (moved) {
      this.city = s.end.city.name;
      this.country = s.end.city.code;
      this.origin = s.end.city.center;
      this.placeStats();
      void this.learnCity(...this.origin);
    }
    if (!onRide) {
      w.relocate(s.end.at, s.end.city.bounds, moved);
      this.loader.setGraph(w.graph);
      this.skipRoll = s.end.skipRoll;
      this.track();
    }
    this.away = s;
  }

  /** Closes the summary card. */
  dismissAway(): void {
    if (this.leaveDilemma()) this.save();
    this.dilemma = null;
    this.away = null;
    this.awayClover = false;
    this.stats.week.seen();
    this.changed();
  }

  /** The away card's choice is on screen: its time starts now, if it hasn't yet. Returns the seconds left. */
  dilemmaShown(): number {
    if (this.dilemmaLeft === Infinity) this.dilemmaLeft = this.momentS;
    return this.dilemmaLeft;
  }

  /** Your pick on the summary card's dilemma. */
  chooseDilemma(pick: number): void {
    const d = this.dilemma;
    if (!d || d.picked !== null) return;
    this.settleDilemma(d, pick, "you");
    this.save();
    this.changed();
  }

  /** The page is hidden or closed: nothing waits for you, so he settles an open dilemma, then the game saves. */
  leave(): void {
    this.settleMoment(null);
    this.leaveDilemma();
    this.save();
  }

  /**
   * Shows timed moment `m` and resolves with the option you tap, or with his
   * own pick (`his`, by default defaultPick) once momentS seconds pass, or
   * `maxS` if that is sooner, or the page is left. Off (momentS 0), or with
   * another moment already open, he picks at once. He stands still while it
   * is open.
   */
  ask(m: Moment, opts: { maxS?: number; his?: () => string } = {}): Promise<Pick> {
    const his = opts.his ?? (() => defaultPick(m, this.stats, new Rng(seedOf(`ask${this.now()}${m.id}`))));
    const wait = Math.min(this.momentS, opts.maxS ?? Infinity);
    if (wait <= 0 || this.moment) return Promise.resolve({ id: his(), you: false });
    return new Promise((done) => {
      this.moment = { m, left: wait, total: wait, done, his };
      this.changed();
    });
  }

  /** Settles the open moment with your pick `id`; null when time runs out: the result of a mini-game you started (see play), else his own pick. */
  settleMoment(id: string | null): void {
    const o = this.moment;
    if (!o || (id !== null && !o.m.options.some((x) => x.id === id))) return;
    this.moment = null;
    const mine = id ?? o.played;
    o.done(mine === undefined ? { id: o.his(), you: false } : { id: mine, you: true });
    this.changed();
  }

  /** A mini-game you are playing scores option `id` so far: what you get if time runs out before you finish. */
  play(id: string): void {
    if (this.moment?.m.options.some((x) => x.id === id)) this.moment.played = id;
  }

  /** The Settings button: the next moment timer of MOMENT_TIMERS. */
  nextMomentTimer(): void {
    this.momentS = MOMENT_TIMERS[(MOMENT_TIMERS.indexOf(this.momentS as never) + 1) % MOMENT_TIMERS.length]!;
    this.saveSettings();
    this.changed();
  }

  /** He decides an open dilemma by himself: the card is closing, the page is being left, or a new reopen replaces it. True when he did. */
  leaveDilemma(): boolean {
    const d = this.dilemma;
    if (!d || d.picked !== null || !this.dilemmas) return false;
    this.settleDilemma(d, this.dilemmas.hisPick(d, this.stats, this.rng), "him");
    this.changed();
    return true;
  }

  /** Applies a dilemma's outcome; a trip offer sends him to its city at once, free. */
  private settleDilemma(d: Dilemma, pick: number, by: "you" | "him"): void {
    const w = this.walker;
    // He boarded a paid ride while the card was open: that goes first, so he turns the free one down himself.
    if (d.city && pick === 0 && w?.isTraveling()) [pick, by] = [1, "him"];
    const o = this.dilemmas!.settle(d, pick, by, this.stats, this.rng);
    if (!o.trip || !d.city || !w) return;
    // A free ride replaces a trip he is still walking to the station for.
    this.stats.history.breakTrail();
    w.rideNow({ ...d.city, bounds: tripBounds(d.city) });
  }

  /** You whisper `word`: he follows it for a while by his trust in you, or shrugs it off. Rolls on the card dice, so his walk stays the same. */
  whisper(word: Whisper): void {
    const heeded = this.stats.bond.whisper(word, dayOf(this.now()), this.cardRng);
    if (heeded === null) return;
    this.stats.say(whisperLine(word, heeded));
    this.save();
    this.changed();
  }

  /** His latest line about something he did: not a whisper you sent or a letter to you. */
  lastDeed(): { text: string; t: number } | null {
    return this.stats.history.entries.findLast((e) => !isNote(e.text)) ?? null;
  }

  /** You praise (+1) or scold (-1) his latest deed, which leans him kind or rascal. */
  judge(sign: 1 | -1): void {
    const last = this.lastDeed();
    if (!last || !this.stats.bond.judge(sign, last.t)) return;
    this.stats.law.karma(this.stats.bond.lean);
    this.save();
    this.changed();
  }

  /** Sends him a care package; he opens it at his next stop. */
  sendGift(id: string): void {
    if (!this.stats.care.send(id)) return;
    this.save();
    this.changed();
  }

  private loadSettings(): void {
    const s = this.file.readSettings();
    if (s === null) return;
    if (typeof s === "string") return this.problems.warn(s);
    this.showCityArea = s.showCityArea;
    this.showRoute = s.showRoute;
    this.cameraFollows = s.cameraFollows;
    this.sound = s.sound;
    this.postcardName = s.postcardName;
    this.alwaysDilemma = s.alwaysDilemma;
    this.momentS = s.momentS;
    Object.assign(this.problems, s.problems, { quiet: this.problems.quiet });
  }

  saveSettings(): void {
    this.file.writeSettings({ showCityArea: this.showCityArea, showRoute: this.showRoute, cameraFollows: this.cameraFollows, sound: this.sound, problems: this.problems, postcardName: this.postcardName, alwaysDilemma: this.alwaysDilemma, momentS: this.momentS });
  }

  setShowCityArea(on: boolean): void {
    this.showCityArea = on;
    this.saveSettings();
    if (on) void this.learnOutline();
    this.changed();
  }

  setSound(on: boolean): void {
    this.sound = on;
    this.saveSettings();
    this.changed();
  }

  /** Switches to the next storyteller (Calm, Classic, Chaotic, then Calm again); it paces from the next stop on. */
  nextStoryteller(): void {
    const s = this.stats.story;
    s.style = STYLES[(STYLES.indexOf(s.style) + 1) % STYLES.length]!;
    this.save();
    this.changed();
  }

  setShowRoute(on: boolean): void {
    this.showRoute = on;
    this.saveSettings();
    this.changed();
  }

  /** A postcard of where he is now, signed with `postcardName`. */
  postcard(): Postcard {
    const w = this.walker;
    const place = w?.isTraveling() ? "" : (w?.place?.name ?? w?.streetName() ?? "");
    return { from: this.postcardName, city: this.city, place, level: this.stats.level, line: this.stats.history.latest() };
  }

  setPostcardName(name: string): void {
    this.postcardName = name.slice(0, NAME_MAX);
    this.saveSettings();
    this.changed();
  }

  setAlwaysDilemma(on: boolean): void {
    this.alwaysDilemma = on;
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

  /** Once a second: the ley lines again if more places loaded, and Magic for what he walked along one. */
  private checkLey(): void {
    const w = this.walker;
    if (!w) return;
    const key = `${this.city}:${w.graph.cells.size}:${w.graph.made.length}`;
    if (key !== this.leysOf) {
      this.leysOf = key;
      this.leysVersion++;
      this.leys = leyLines(w.bounds ? w.graph.placesIn(w.bounds) : []);
    }
    if (this.leyM > 0 && onLey(this.leys, w.position())) this.stats.leyWalk(this.leyM);
    this.leyM = 0;
  }

  /** The holiday on the local day of unix ms (`offsetS` ahead of UTC) in the country with `code`, or null; fetches that year's list the first time it is missing. */
  private holidayOn(ms: number, code: string, offsetS?: number): Holidays.Holiday | null {
    if (!this.iso2) {
      void this.loadIso2();
      return null;
    }
    const cc = this.iso2(code);
    if (!cc) return null;
    const day = Holidays.dayOf(ms, offsetS);
    const key = `${cc}:${day.slice(0, 4)}`;
    const list = this.holidayBook.lists[key];
    if (list) return Holidays.on(list, ms, offsetS);
    if (!this.holidayFetches.has(key)) {
      const fetching = this.deps.api.holidays(Number(day.slice(0, 4)), cc).then((got) => {
        if (!got) return; // failed: asked again next session
        this.holidayBook.lists[key] = got;
        this.file.writeHolidays(this.holidayBook, new Date(this.now()).getFullYear());
      });
      this.holidayFetches.set(key, fetching);
    }
    return null;
  }

  private async loadIso2(): Promise<void> {
    this.iso2 = (await iso2Module()).iso2;
  }

  /** Once a second: today's holiday where he is, told in the feed once a day. */
  private checkHoliday(): void {
    const now = this.now();
    const offsetS = this.stats.sky?.offsetS;
    this.holiday = this.country ? this.holidayOn(now, this.country, offsetS) : null;
    const said = `${this.country}:${Holidays.dayOf(now, offsetS)}`;
    if (!this.holiday || this.holidayBook.said === said) return;
    this.holidayBook.said = said;
    this.file.writeHolidays(this.holidayBook, new Date(now).getFullYear());
    const h = this.holiday;
    const local = h.localName && h.localName !== h.name ? ` (${h.localName})` : "";
    this.stats.say(`It's ${h.name}${local} here, a public holiday`);
    this.changed();
  }

  /**
   * Once a second: warns (once per city) when enough streets are loaded but
   * no places of note, and once the streets all around him are loaded checks
   * that the city has a way out and a way to earn money (severe if not).
   */
  private checkCity(): void {
    this.stats.sky = this.sky();
    this.checkHoliday();
    void this.refreshWeather();
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
    if (!this.placesMade(w, w.bounds)) return;
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

  /**
   * True once the city's made-up places are on the map, or they can't be made
   * now. Until then (once per city, when the streets around him are loaded)
   * it starts putting them there, so the city check doesn't run before them.
   */
  private placesMade(w: Walker, bounds: BBox): boolean {
    if (this.madeOf === this.city && this.madeIn === w.graph) return true;
    // Browsers remember a chunk that failed to load, so trying again before a reload is no use: the check runs without them.
    if (this.madeFailed === this.city) return true;
    if (!this.madePending) {
      this.madePending = true;
      void this.makePlaces(w, bounds).finally(() => (this.madePending = false));
    }
    return false;
  }

  /**
   * Puts the city's made-up places on the map: made now (from what the real
   * ones lack) or the ones it got before. The maker (core/poiGen.ts) loads as
   * its own chunk, off the startup path; if it can't load (offline before it
   * was cached) the city goes without them until the game is opened again.
   */
  private async makePlaces(w: Walker, bounds: BBox): Promise<void> {
    const city = this.city;
    let list = this.made[city];
    if (!list) {
      w.graph.made = [];
      let Gen: typeof import("../core/poiGen");
      try {
        Gen = await import("../core/poiGen");
      } catch {
        this.madeFailed = city;
        return;
      }
      if (this.city !== city || this.walker !== w) return;
      const real = w.graph.placesIn(bounds);
      const missing = CityCheck.missing(CityCheck.summary(real, this.activities, this.country));
      const near = this.trips.cityNear(this.origin[0], this.origin[1]);
      const snap = (lat: number, lon: number): LatLon | null => {
        const id = w.graph.nearestNode(lat, lon);
        return id === null ? null : w.graph.nodes.get(id)!;
      };
      list = Gen.generate({ name: city, center: this.origin, pop: near?.pop ?? 0 }, real, missing, snap);
    }
    // The city he was in last goes to the end, so the save drops the one he has been away from longest.
    delete this.made[city];
    const keys = Object.keys(this.made);
    if (keys.length >= MADE_CITIES) delete this.made[keys[0]!];
    this.made[city] = list;
    w.graph.made = list;
    this.madeOf = city;
    this.madeIn = w.graph;
    this.changed();
  }

  /** The places of his city that quests and events can use: loaded real ones and the made-up ones. */
  private storyPlaces(): Place[] {
    const w = this.walker;
    return w?.bounds && !w.isTraveling() ? w.graph.placesIn(w.bounds) : [];
  }

  /** Rolls the city's quest board (core/quests.ts) once enough of its places are loaded, so its icons show before his first quest. */
  private rollBoard(): void {
    const q = this.stats.quests;
    if (!this.city || (q.city === this.city && q.rolled) || !q.bank.quests.length) return;
    const rev = q.rev;
    const near = this.trips.cityNear(this.origin[0], this.origin[1]);
    q.roll(this.city, near?.pop ?? 0, this.storyPlaces(), this.cardRng, Q.listedKey(this.city, near, this.origin), this.stats.bond.leaning());
    if (q.rev !== rev) this.changed();
  }

  /** A quest step or world event to walk to (core/quests.ts). */
  private questGoal(): Place | null {
    const w = this.walker!;
    if (w.isTraveling()) return null;
    this.rollBoard();
    return Q.questGoal(this.stats, this.storyPlaces(), w.position(), this.cardRng);
  }

  /** The quest and event icons: the board's quest givers, the step he is on, and the events near him. */
  questIcons(): MapIcon[] {
    const q = this.stats.quests;
    if (q.city !== this.city) return [];
    const out: MapIcon[] = q.board.slice(0, ICON_CAP.quest).map((o) => ({ id: `quest:${o.key}`, at: [o.at.lat, o.at.lon], icon: "quest", label: q.kind(o.kind)?.title ?? "Quest", kind: "quest" }));
    const t = q.active?.target;
    if (t) out.push({ id: `quest:${q.active!.key}`, at: [t.lat, t.lon], icon: "quest-step", label: q.kind(q.active!.kind)?.title ?? "Quest", kind: "quest", pulse: true });
    for (const e of q.events.filter((x) => x.ends > this.stats.now()).slice(0, ICON_CAP.event)) out.push({ id: `event:${e.id}`, at: [e.at.lat, e.at.lon], icon: "event", label: q.eventKind(e.kind)?.title ?? "Event", kind: "event", ends_at: Math.floor(e.ends / 60) });
    return out;
  }

  /** What a tapped quest or event icon tells you, or null for another icon. */
  storyCard(id: string): { icon: string; title: string; text: string; rows: [string, string][]; state: "open" | "nudged" | "on" } | null {
    const q = this.stats.quests;
    const town = this.city.split(",")[0]!;
    if (id.startsWith("event:")) {
      const e = q.events.find((x) => `event:${x.id}` === id);
      const k = e && q.eventKind(e.kind);
      if (!e || !k) return null;
      const left = Math.max(Math.round((e.ends - this.stats.now()) / 60), 0);
      return { icon: k.icon, title: k.title, text: Q.fill(k.text[e.line] ?? k.text[0]!, { place: e.at.name, town }), rows: [["📍 Where", e.at.name], ["⏳ Time left", `${left} min`]], state: q.nudge === e.id ? "nudged" : "open" };
    }
    if (!id.startsWith("quest:")) return null;
    const key = id.slice("quest:".length);
    if (q.active?.key === key) {
      const card = q.describe(q.active, town);
      const k = q.kind(q.active.kind)!;
      const rows: [string, string][] = [["👣 Step", `${q.active.step + 1} / ${k.steps.length}`]];
      if (q.active.target) rows.push(["🎯 Goal", q.active.target.name]);
      return card && { ...card, rows, state: "on" };
    }
    const o = q.board.find((x) => x.key === key);
    const card = o && q.describe(o, town);
    return card ? { ...card, rows: [["📍 Giver", o.at.name]], state: q.nudge === key ? "nudged" : "open" } : null;
  }

  /** Go help: he takes the tapped quest next, or joins the tapped event, once he is free. Optional; he does fine without it. */
  nudge(id: string): void {
    const q = this.stats.quests;
    q.nudge = id.replace(/^(quest|event):/, "");
    q.rev++;
    this.changed();
  }

  /** The game icons around him (core/mapIcons.ts): made-up places, travel hubs and his monuments, none on a ride. */
  placeIcons(): MapIcon[] {
    const w = this.walker;
    if (!w?.bounds || w.isTraveling()) return [];
    const here = w.position();
    const air = this.trips.nearestAirport(here[0], here[1]);
    return [...placeIcons(w.graph.placesIn(w.bounds), air ? [...this.trips.airports, air] : this.trips.airports, w.bounds, here), ...monumentIcons(this.stats.bricks.built, this.city), ...spotIcons(this.stats.spots.spot(this.stats.where.city)), ...homeIcons(this.stats.home, this.stats.atHome()), ...this.questIcons()];
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
}
