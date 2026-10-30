// Map icons: which places get one (made-up places, real bus stations and
// airports), nearest first and capped, and a picture for every icon name.
import { describe, expect, it } from "vitest";
import { ICON_CAP, ICON_OF, iconOf, placeIcons } from "../../src/core/mapIcons";
import { ICONS } from "../../src/map/icons";
import type { Place } from "../../src/core/stats";

const p = (name: string, cls: string, sub: string, lat: number, extra: object = {}): Place => ({ name, class: cls, subclass: sub, rank: 1, lat, lon: 23, ...extra });
const BOX: [number, number, number, number] = [41, 22, 44, 24];

describe("map icons", () => {
  it("go on made places and real travel hubs only", () => {
    expect(iconOf(p("Inn", "lodging", "guest_house", 42, { made: true }))).toBe("bed");
    expect(iconOf(p("Tower", "wizard_tower", "wizard_tower", 42, { made: true }))).toBe("tower");
    expect(iconOf(p("Central", "bus", "bus_station", 42))).toBe("bus");
    expect(iconOf(p("Intl", "aerodrome", "airport", 42, { iata: "INT" }))).toBe("plane");
    expect(iconOf(p("Airfield on the map", "aerodrome", "airport", 42))).toBe("");
    expect(iconOf(p("Hotel", "lodging", "hotel", 42))).toBe("");
  });

  it("show the nearest ones first, capped", () => {
    const many = Array.from({ length: ICON_CAP.place + 10 }, (_, i) => p(`Stop ${i}`, "bus", "bus_station", 42 + i * 0.001));
    const icons = placeIcons(many, [], BOX, [42, 23]);
    expect(icons).toHaveLength(ICON_CAP.place);
    expect(icons[0]!.label).toBe("Stop 0");
    expect(icons[0]!.kind).toBe("place");
  });

  it("add airports inside the box, once each", () => {
    const air = p("Intl", "aerodrome", "airport", 42.1, { iata: "INT" });
    const tile = p("Intl from the map", "aerodrome", "airport", 42.1001);
    expect(placeIcons([air, tile], [air, p("Far", "aerodrome", "airport", 50, { iata: "FAR" })], BOX, [42, 23]).map((i) => i.label)).toEqual(["Intl"]);
  });

  it("keep a made place's own id", () => {
    expect(placeIcons([p("Inn", "lodging", "guest_house", 42, { made: true, id: "sofia:guest_house:0" })], [], BOX, [42, 23])[0]!.id).toBe("sofia:guest_house:0");
  });

  it("have a picture for every icon name", () => {
    for (const name of [...Object.values(ICON_OF), "bus", "plane"]) expect(ICONS[name], name).toContain("<svg");
  });
});
