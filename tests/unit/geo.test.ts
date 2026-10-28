import { describe, expect, it } from "vitest";
import * as Geo from "../../src/core/geo";

describe("geo", () => {
  it("a thousandth degree of latitude is about 111 m", () => {
    expect(Geo.distanceM(42.0, 23.0, 42.001, 23.0)).toBeCloseTo(111.2, 0);
  });

  it("distance to the same point is zero", () => {
    expect(Geo.distanceM(51.5, -0.12, 51.5, -0.12)).toBeCloseTo(0, 6);
  });

  it("tile pixels at zoom zero", () => {
    expect(Geo.lonToPx(-180, 0)).toBeCloseTo(0, 6);
    expect(Geo.lonToPx(0, 0)).toBeCloseTo(128, 6);
    expect(Geo.latToPx(0, 0)).toBeCloseTo(128, 6);
  });

  it("pixel round trip", () => {
    const x = Geo.lonToPx(23.3219, 17);
    const y = Geo.latToPx(42.6977, 17);
    expect(Geo.pxToLon(x, 17)).toBeCloseTo(23.3219, 9);
    expect(Geo.pxToLat(y, 17)).toBeCloseTo(42.6977, 9);
  });

  it("bbox contains the radius", () => {
    const [, , n, e] = Geo.bboxAround(42.0, 23.0, 500);
    expect(Math.abs(Geo.distanceM(42.0, 23.0, n, 23.0) - 500)).toBeLessThan(1);
    expect(Math.abs(Geo.distanceM(42.0, 23.0, 42.0, e) - 500)).toBeLessThan(1);
  });

  it("tile of a point", () => {
    expect(Geo.tileOf(0, 0, 1)).toEqual({ x: 1, y: 1 });
    expect(Geo.tileOf(42.6977, 23.3219, 17)).toEqual({
      x: Math.floor(Geo.lonToPx(23.3219, 17) / 256),
      y: Math.floor(Geo.latToPx(42.6977, 17) / 256),
    });
  });

  it("tile bbox contains its points", () => {
    const t = Geo.tileOf(42.0, 23.0, 15);
    const [s, w, n, e] = Geo.tileBbox(t, 15);
    expect(s).toBeLessThan(42);
    expect(w).toBeLessThan(23);
    expect(n).toBeGreaterThan(42);
    expect(e).toBeGreaterThan(23);
    expect(Geo.tileOf(n - 1e-7, w + 1e-7, 15)).toEqual(t);
    expect(Geo.tileOf(s + 1e-7, e - 1e-7, 15)).toEqual(t);
  });
});
