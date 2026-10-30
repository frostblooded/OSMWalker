// @vitest-environment happy-dom
// The city sound against a fake AudioContext: no tones pile up while it is
// suspended, and a tap after it stopped does not resume a closed context.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sound } from "../../src/app/sound";

/** A Web Audio node, param or method: callable, and every unknown property is another one, so a.gain.setTargetAtTime() and a.connect(b).connect(c) work. */
const node = (): object => new Proxy(() => node(), { get: (t: Record<string, unknown>, k: string) => (k in t ? t[k] : (t[k] = node())) } as ProxyHandler<object>);

class FakeContext {
  static last: FakeContext;
  state: AudioContextState = "suspended";
  currentTime = 0;
  sampleRate = 8000;
  destination = node();
  tones = 0;
  resumes = 0;
  constructor() {
    FakeContext.last = this;
  }
  createBuffer = () => ({ getChannelData: () => new Float32Array(16000) });
  createBufferSource = node;
  createBiquadFilter = node;
  createGain = node;
  createOscillator = () => (this.tones++, node());
  suspend = async () => void (this.state = "suspended");
  resume = async () => void (this.resumes++, (this.state = "running"));
  close = async () => void (this.state = "closed");
}

describe("Sound", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("AudioContext", FakeContext);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("makes no cafe clinks until the context plays", () => {
    const s = new Sound();
    const ctx = FakeContext.last;
    const base = ctx.tones; // the murmur's LFO
    s.set("cafe");
    vi.advanceTimersByTime(60_000);
    expect(ctx.tones).toBe(base);
    ctx.state = "running";
    vi.advanceTimersByTime(60_000);
    expect(ctx.tones).toBeGreaterThan(base);
    s.stop();
  });

  it("a tap after stop leaves the closed context alone", () => {
    const s = new Sound();
    s.stop();
    dispatchEvent(new Event("pointerdown"));
    expect(FakeContext.last.resumes).toBe(0);
  });
});
