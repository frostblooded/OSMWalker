// @vitest-environment happy-dom
// His look on the real map marker: the bubble shows the kind of place he
// heads for, a pop after a reward takes its place, and nothing is rewritten
// while the look stays the same.
import { describe, expect, it } from "vitest";
import { MONEY_POSE, type Look } from "../../src/core/look";
import { MapView } from "../../src/map/mapView";

/** A MapView with only his marker, no MapLibre. */
function view(): { v: MapView; face: HTMLElement; bubble: HTMLElement } {
  const el = document.createElement("div");
  el.innerHTML = '<span class="face"></span><span class="bubble"></span>';
  const v = new MapView();
  Object.assign(v, { him: { getElement: () => el } });
  return { v, face: el.querySelector(".face")!, bubble: el.querySelector(".bubble")! };
}

const walking: Look = { face: "🙂", bubble: "☕", pose: null };

describe("MapView.setLook", () => {
  it("shows the kind of place he heads for, then the pop after a reward", () => {
    const { v, face, bubble } = view();
    v.setLook(walking);
    expect(face.textContent).toBe("🙂");
    expect(bubble.textContent).toBe("☕");
    expect(bubble.className).toBe("bubble");
    v.setLook({ ...walking, bubble: "", pose: MONEY_POSE });
    expect(bubble.textContent).toBe("💶");
    expect(bubble.className).toBe("bubble pose rise");
  });

  it("hides the bubble on the way to a random spot", () => {
    const { v, bubble } = view();
    v.setLook({ ...walking, bubble: "" });
    expect(bubble.hidden).toBe(true);
  });

  it("leaves a still bubble alone", () => {
    const { v, bubble } = view();
    v.setLook(walking);
    const changes: string[] = [];
    new MutationObserver((ms) => changes.push(...ms.map((m) => m.type))).observe(bubble, { attributes: true, childList: true });
    v.setLook({ ...walking });
    return Promise.resolve().then(() => expect(changes).toEqual([]));
  });
});
