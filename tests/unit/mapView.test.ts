// @vitest-environment happy-dom
// His look on the real map marker: a pose plays when he gets there and again
// each POSE_EVERY_S while he stays, and nothing is rewritten in between.
import { afterEach, describe, expect, it, vi } from "vitest";
import { POSE_EVERY_S, type Look } from "../../src/core/look";
import { MapView } from "../../src/map/mapView";

/** A MapView with only his marker, no MapLibre. */
function view(): { v: MapView; bubble: HTMLElement; pet: HTMLElement; aura: HTMLElement; say: HTMLElement } {
  const el = document.createElement("div");
  el.innerHTML = '<span class="face"></span><span class="mount"></span><span class="bubble"></span><span class="pet"></span><span class="aura"></span><span class="say"></span>';
  const v = new MapView();
  Object.assign(v, { him: { getElement: () => el } });
  return { v, bubble: el.querySelector(".bubble")!, pet: el.querySelector(".pet")!, aura: el.querySelector(".aura")!, say: el.querySelector(".say")! };
}

const napping: Look = { face: "🙂", bubble: "", pose: { icon: "💤", motion: "rise" }, mount: "", pet: "" };

describe("MapView.setLook", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows his pet at his side, and hides the spot without one", () => {
    const { v, pet } = view();
    v.setLook({ ...napping, pet: "🐕" });
    expect(pet.textContent).toBe("🐕");
    expect(pet.hidden).toBe(false);
    v.setLook(napping);
    expect(pet.hidden).toBe(true);
  });

  it("shows his words in the speech bubble after a little moment, and hides it after", () => {
    const { v, say } = view();
    v.setLook({ ...napping, say: "Shoo, pigeon!" });
    expect(say.textContent).toBe("Shoo, pigeon!");
    expect(say.hidden).toBe(false);
    v.setLook(napping);
    expect(say.hidden).toBe(true);
  });

  it("shows a halo or horns at either end of his karma, and nothing in between", () => {
    const { v, aura } = view();
    v.setLook({ ...napping, aura: "halo" });
    expect(aura.className).toBe("aura halo");
    expect(aura.hidden).toBe(false);
    v.setLook({ ...napping, aura: "horns" });
    expect(aura.className).toBe("aura horns");
    v.setLook(napping);
    expect(aura.hidden).toBe(true);
  });

  it("replays the pose each POSE_EVERY_S while he stays", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { v, bubble } = view();
    v.setLook(napping);
    expect(bubble.className).toBe("bubble pose rise");
    const changes: string[] = [];
    new MutationObserver((ms) => changes.push(...ms.map((m) => m.oldValue ?? ""))).observe(bubble, { attributeFilter: ["class"], attributeOldValue: true });
    now = POSE_EVERY_S * 1000 - 1;
    v.setLook(napping);
    expect(changes).toEqual([]);
    now = POSE_EVERY_S * 1000;
    v.setLook(napping);
    return Promise.resolve().then(() => {
      // Its class was dropped and put back: the animation starts over.
      expect(changes).toEqual(["bubble pose rise", "bubble"]);
      expect(bubble.className).toBe("bubble pose rise");
    });
  });

  it("a new face mid-pose keeps the pose's minute running", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { v, bubble } = view();
    v.setLook(napping);
    now = 30_000;
    v.setLook({ ...napping, face: "😩" });
    const changes: string[] = [];
    new MutationObserver((ms) => changes.push(...ms.map((m) => m.oldValue ?? ""))).observe(bubble, { attributeFilter: ["class"], attributeOldValue: true });
    now = POSE_EVERY_S * 1000;
    v.setLook({ ...napping, face: "😩" });
    return Promise.resolve().then(() => expect(changes).toEqual(["bubble pose rise", "bubble"]));
  });

  it("leaves a still bubble alone", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const { v, bubble } = view();
    v.setLook({ ...napping, bubble: "☕", pose: null });
    const before = bubble.className;
    now = POSE_EVERY_S * 2000;
    v.setLook({ ...napping, bubble: "☕", pose: null });
    expect(bubble.className).toBe(before);
  });
});
