import { describe, expect, it } from "vitest";
import { bboxAround, distanceM, moved } from "../../src/core/geo";
import { CELL_M, cellOf, Explored } from "../../src/core/explored";

const SOFIA: [number, number] = [42.6977, 23.3219];

describe("explored squares", () => {
  it("squares are about CELL_M on each side, at any latitude", () => {
    for (const lat of [0, 42.7, 64]) {
      const box = new Explored().squareOf(cellOf(lat, 10.001));
      expect(distanceM(box[0], box[1], box[2], box[1])).toBeCloseTo(CELL_M, -1);
      expect(distanceM(box[0], box[1], box[0], box[3])).toBeCloseTo(CELL_M, -1);
    }
  });

  it("a point lies in its own square", () => {
    const e = new Explored();
    for (const [lat, lon] of [SOFIA, [-33.86, 151.21], [40.71, -74.0], [0.0001, -0.0001]] as const) {
      const [s, w, n, east] = e.squareOf(cellOf(lat, lon));
      expect(lat).toBeGreaterThanOrEqual(s);
      expect(lat).toBeLessThan(n);
      expect(lon).toBeGreaterThanOrEqual(w);
      expect(lon).toBeLessThan(east);
    }
  });

  it("walking marks every square along the way, once", () => {
    const e = new Explored();
    const end = moved(SOFIA[0], SOFIA[1], [1000, 0]);
    expect(e.walk(SOFIA, end)).toBe(true);
    // 1 km east crosses five or six squares.
    expect(e.size).toBeGreaterThanOrEqual(5);
    expect(e.size).toBeLessThanOrEqual(6);
    const v = e.version;
    expect(e.walk(SOFIA, end)).toBe(false);
    expect(e.version).toBe(v);
  });

  it("a long step leaves no gaps", () => {
    const e = new Explored();
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [0, 2000]));
    expect(e.size).toBeGreaterThanOrEqual(10);
  });

  it("counts the squares of a city box and the ones he walked in it", () => {
    const e = new Explored();
    const box = bboxAround(SOFIA[0], SOFIA[1], 1500);
    const c = e.inBox(box);
    // A 3 km box holds about 15 x 15 squares.
    expect(c.total).toBeGreaterThan(200);
    expect(c.total).toBeLessThan(260);
    expect(c.walked).toBe(0);
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [600, 0]));
    const here = e.size;
    e.walk([-33.86, 151.21], [-33.86, 151.22]);
    expect(e.inBox(box).walked).toBe(here);
    expect(e.size).toBeGreaterThan(here);
  });

  it("joins squares next to each other in a row into one box", () => {
    const e = new Explored();
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [1000, 0]));
    expect(e.boxes()).toHaveLength(1);
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [0, 1000]));
    expect(e.boxes().length).toBeGreaterThan(1);
    expect(e.boxes().length).toBeLessThan(e.size);
  });

  it("the box around his squares in a city", () => {
    const e = new Explored();
    const box = bboxAround(SOFIA[0], SOFIA[1], 1500);
    expect(e.bounds(box)).toBeNull();
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [600, 0]));
    const b = e.bounds(box)!;
    expect(b[0]).toBeLessThanOrEqual(SOFIA[0]);
    expect(b[3]).toBeGreaterThan(SOFIA[1]);
  });

  it("saves as a short string and loads back", () => {
    const e = new Explored();
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [3000, 3000]));
    e.walk([-33.86, 151.21], [-33.87, 151.22]);
    const s = e.toJSON();
    expect(typeof s).toBe("string");
    // A few bytes a square, not the ~14 of a plain number.
    expect(s.length / e.size).toBeLessThan(8);
    const back = Explored.fromJSON(JSON.parse(JSON.stringify(s)));
    expect(back.size).toBe(e.size);
    expect(back.inBox(bboxAround(SOFIA[0], SOFIA[1], 5000))).toEqual(e.inBox(bboxAround(SOFIA[0], SOFIA[1], 5000)));
  });

  it("a new square changes the save and the counts", () => {
    const e = new Explored();
    const box = bboxAround(SOFIA[0], SOFIA[1], 1500);
    e.walk(SOFIA, SOFIA);
    const [s, c] = [e.toJSON(), e.inBox(box).walked];
    e.walk(SOFIA, moved(SOFIA[0], SOFIA[1], [500, 0]));
    expect(Explored.fromJSON(e.toJSON()).size).toBe(e.size);
    expect(e.toJSON()).not.toBe(s);
    expect(e.inBox(box).walked).toBeGreaterThan(c);
  });

  it("an old save, or a broken one, starts with nothing walked", () => {
    expect(Explored.fromJSON(undefined).size).toBe(0);
    expect(Explored.fromJSON("!!,??").size).toBe(0);
  });
});

