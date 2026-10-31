// The map scene with a real game and walker on the "+" streets, and a fake map
// that records what it was told.
import { beforeEach, describe, expect, it } from "vitest";
import type { BBox } from "../../src/core/geo";
import type { MapIcon } from "../../src/core/mapIcons";
import type { Look } from "../../src/core/look";
import { StreetGraph } from "../../src/core/graph";
import { Walker } from "../../src/core/walker";
import type { City } from "../../src/core/trips";
import { Game } from "../../src/game/game";
import * as R from "../../src/core/repute";
import { EVENT_ZOOM, MapScene, type MapPort, type Padding } from "../../src/map/scene";
import { Api } from "../../src/net/api";
import { plus, PLUS_BBOX } from "../support/osm";

const n = (osm: number) => -osm;
const PANELS: Padding = { top: 100, bottom: 80, left: 0, right: 0 };

class FakeMap implements MapPort {
  autoFollow = true;
  onUserMove = () => {};
  calls: string[] = [];
  fits: { box: BBox; padding: Padding; maxZoom?: number }[] = [];
  him: [number, number] = [0, 0];
  look: Look | null = null;
  looks = 0;
  zoom = 15;
  setHim(at: [number, number]) {
    this.him = at;
  }
  setLook(l: Look) {
    this.look = l;
    this.looks++;
  }
  setGoal() {}
  setRival() {}
  police: [number, number] | null = null;
  setPolice(at: [number, number] | null) {
    this.police = at;
  }
  setTrip() {}
  showTrail(on: boolean) {
    this.calls.push(`trail:${on}`);
  }
  setTrail() {}
  setRoute() {}
  leys: [number, number][][] = [];
  leyKey = "";
  setLeys(key: string, lines: () => [[number, number], [number, number]][]) {
    if (key === this.leyKey) return;
    this.leyKey = key;
    this.leys = key ? lines() : [];
  }
  explored: BBox[] = [];
  exploredKey = "";
  setExplored(key: string, boxes: () => BBox[]) {
    if (key === this.exploredKey) return;
    this.exploredKey = key;
    this.explored = key ? boxes() : [];
  }
  setArea() {}
  setEvents() {
    this.calls.push("events");
  }
  icons: MapIcon[] = [];
  iconKey = "";
  setMapIcons(key: string, icons: () => MapIcon[]) {
    if (key === this.iconKey) return;
    this.iconKey = key;
    this.icons = icons();
  }
  follow(zoom?: number) {
    this.calls.push(`follow:${zoom}`);
  }
  focus(_at: [number, number], minZoom: number) {
    this.calls.push(`focus:${minZoom}`);
  }
  fit(box: BBox, padding: Padding, maxZoom?: number) {
    this.fits.push({ box, padding, maxZoom });
    this.calls.push("fit");
  }
  setPadding(p: Padding) {
    this.calls.push(`padding:${p.bottom}`);
  }
  zoomBy(step: number) {
    return (this.zoom += step);
  }
  /** 1 px per 0.00001 degrees. */
  screenPoint(at: [number, number]) {
    return { x: at[1] * 1e5, y: -at[0] * 1e5 };
  }
}

let game: Game;
let map: FakeMap;
let scene: MapScene;
let following: boolean[];

beforeEach(() => {
  game = new Game({ api: new Api(async () => new Response("", { status: 503 })), load: async () => ({ error: "offline" }), data: { actions: {}, flavour: {}, cities: [], airports: [] }, storage: null });
  game.problems.quiet = true;
  const g = new StreetGraph();
  g.addOverpass(plus(), PLUS_BBOX);
  const w = new Walker(g);
  w.startAt(n(2));
  game.walker = w;
  game.zoom = 17;
  map = new FakeMap();
  scene = new MapScene(game, map, () => PANELS);
  following = [];
  scene.onFollowing = (on) => following.push(on);
});

describe("map scene", () => {
  it("shows made-up places and travel hubs as game icons, none on a ride", () => {
    const w = game.walker!;
    w.bounds = PLUS_BBOX;
    const [lat, lon] = w.position();
    w.graph.made = [{ name: "Notice board", class: "notice_board", subclass: "notice_board", rank: 2, lat, lon, id: "x:notice_board:0", made: true }];
    scene.draw(0.25, 250);
    expect(map.icons.map((i) => i.icon)).toEqual(["board"]);
    expect(map.icons[0]!.id).toBe("x:notice_board:0");
    w.startTravel({ name: "Paris", code: "FRA", country: "France", lat: 48.85, lon: 2.35, pop: 1 }, "plane");
    scene.draw(0.25, 250);
    expect(map.icons).toEqual([]);
  });

  it("draws his squares only while the Explored sheet is open, fitted above it, and again when he walks a new one", () => {
    const w = game.walker!;
    w.bounds = PLUS_BBOX;
    const at = w.position();
    game.stats.explored.walk(at, at);
    scene.draw(0.25, 250);
    expect(map.explored).toEqual([]);
    scene.showExplored(true, 300);
    scene.draw(0.25, 250);
    expect(map.explored).toHaveLength(1);
    expect(map.fits.at(-1)!.padding.bottom).toBe(324);
    expect(following.at(-1)).toBe(false);
    game.stats.explored.walk(at, [at[0] + 0.01, at[1]]);
    scene.draw(0.25, 250);
    expect(map.explored.length).toBeGreaterThan(1);
    scene.showExplored(false);
    scene.draw(0.25, 250);
    expect(map.explored).toEqual([]);
    expect(following.at(-1)).toBe(true);
    // Opening History tells Explored it is closed, which leaves History's view alone.
    scene.showHistory(true, 300);
    scene.showExplored(false);
    expect(following.at(-1)).toBe(false);
  });

  it("draws the ley lines only while the Stats sheet is open, again when they change, and none on a ride", () => {
    const [lat, lon] = game.walker!.position();
    game.leys = [
      [
        [lat, lon],
        [lat + 0.001, lon],
      ],
    ];
    scene.draw(0.25, 250);
    expect(map.leys).toEqual([]);
    scene.showLeys(true);
    scene.draw(0.25, 250);
    expect(map.leys).toEqual(game.leys);
    game.leys = [
      [
        [lat, lon],
        [lat, lon + 0.001],
      ],
    ];
    game.leysVersion++;
    scene.draw(0.25, 250);
    expect(map.leys).toEqual(game.leys);
    scene.showLeys(false);
    scene.draw(0.25, 250);
    expect(map.leys).toEqual([]);
    scene.showLeys(true);
    game.walker!.startTravel({ name: "Paris", code: "FRA", country: "France", lat: 48.85, lon: 2.35, pop: 1 }, "plane");
    scene.draw(0.25, 250);
    expect(map.leys).toEqual([]);
  });

  it("leaves room for the panels from the start", () => {
    expect(map.calls).toEqual(["padding:80"]);
  });

  it("puts him on the map and passes the camera switch on", () => {
    game.cameraFollows = false;
    scene.draw(0.25, 250);
    expect(map.him).toEqual([42.001, 23.0]);
    expect(map.autoFollow).toBe(false);
  });

  it("puts the police car on his trail during a chase, and takes it off after", () => {
    game.chase = { place: "Kiosk", ends: game.now() + R.CHASE_S * 1000, trail: [[42, 23], [42.002, 23]] };
    scene.draw(0.25, 250);
    // Just begun: the car is at the start of his trail (a millisecond may have passed).
    expect(map.police![0]).toBeCloseTo(42, 4);
    expect(map.police![1]).toBeCloseTo(23, 4);
    game.chase = null;
    scene.draw(0.25, 250);
    expect(map.police).toBeNull();
  });

  it("shows his face, with his most pressing need over his head", () => {
    scene.draw(0.25, 250);
    expect(map.look).toEqual({ face: "🙂", bubble: "", pose: null, mount: "", pet: "" });
    game.stats.meters.fullness = 10;
    scene.draw(0.25, 250);
    expect(map.look!.bubble).toBe("🍔");
  });

  it("shows a pose while he stays, and drops it when he moves on", () => {
    game.doing = { name: "Nap on a bench", min: 1, fx: { energy: 20 } };
    game.walker!.restFor(1);
    scene.draw(0.25, 250);
    expect(map.look!.pose).toEqual({ icon: "💤", motion: "rise" });
    game.walker!.advance(1e6);
    scene.draw(0.25, 250);
    expect(map.look!.pose).toBeNull();
  });

  it("measures how fast he moves on screen", () => {
    scene.draw(1, 100);
    game.walker!.advance(50);
    scene.draw(1, 100);
    expect(scene.pxPerSec).toBeGreaterThan(10);
  });

  it("shows him and his goal on a tap, then follows him again on the next", () => {
    game.walker!.setGoal(42.0, 23.00135);
    scene.toggleGoal();
    expect(map.fits.at(-1)).toMatchObject({ box: [42.0, 23.0, 42.001, 23.00135], maxZoom: 17 });
    expect(following).toEqual([false]);
    scene.toggleGoal();
    expect(map.calls.at(-1)).toBe("follow:17");
    expect(following).toEqual([false, true]);
  });

  it("ends the goal view when he picks a new goal", () => {
    game.walker!.setGoal(42.0, 23.00135);
    scene.toggleGoal();
    scene.draw(0.25, 250);
    expect(map.calls.at(-1)).toBe("fit");
    game.walker!.setGoal(41.999, 23.0);
    scene.draw(0.25, 250);
    expect(map.calls).toContain("follow:17");
  });

  it("zooms out to the whole ride and follows him again on landing", () => {
    const paris: City = { name: "Paris", code: "FRA", country: "France", lat: 48.85, lon: 2.35, pop: 1 };
    game.walker!.startTravel(paris, "plane");
    scene.draw(0.25, 250);
    expect(map.fits.at(-1)!.box).toEqual([42.001, 2.35, 48.85, 23.0]);
    expect(map.fits.at(-1)!.padding.bottom).toBe(120);
    game.walker!.landNow();
    scene.draw(0.25, 250);
    expect(map.calls.at(-1)).toBe("follow:17");
  });

  it("fits his trail above the History sheet and follows him again when it closes", () => {
    game.stats.history.moveTo(42.001, 23.0);
    game.stats.history.moveTo(42.0, 23.00135);
    scene.showHistory(true, 300);
    expect(map.calls).toContain("trail:true");
    expect(map.calls).toContain("padding:312");
    expect(map.calls).toContain("events");
    expect(map.fits.at(-1)).toMatchObject({ maxZoom: EVENT_ZOOM, padding: { bottom: 324, left: 32 } });
    scene.showHistory(false);
    expect(map.calls.slice(-3)).toEqual(["trail:false", "padding:80", "follow:17"]);
  });

  it("shows a History row's place with Back to him, even after he was followed again", () => {
    scene.showHistory(true, 300);
    scene.backToHim();
    scene.focusEvent([42.001, 23.0]);
    expect(map.calls.at(-1)).toBe(`focus:${EVENT_ZOOM}`);
    expect(following.at(-1)).toBe(false);
  });

  it("keeps the camera still while History is open", () => {
    const paris: City = { name: "Paris", code: "FRA", country: "France", lat: 48.85, lon: 2.35, pop: 1 };
    scene.showHistory(true, 300);
    const fits = map.fits.length;
    game.walker!.startTravel(paris, "plane");
    scene.draw(0.25, 250);
    expect(map.fits.length).toBe(fits);
  });

  it("keeps the zoom the player picks", () => {
    scene.zoomBy(1);
    expect(game.zoom).toBe(16);
  });
});
