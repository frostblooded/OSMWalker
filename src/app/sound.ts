// The optional city sound, made in the browser with Web Audio: nothing is
// downloaded. One looped noise buffer, filtered three ways, gives the street
// hum, cafe murmur and wind in the leaves; short sine blips add cups and
// birds. Loaded only when the player turns sound on, and silent while the
// page is hidden.
import { Rng } from "../core/rng";
import type { Soundscape } from "../core/soundscape";

/** Seconds a change of soundscape takes to fade over. */
const FADE_S = 1.5;
const VOLUME = 0.35;
/** Each layer's loudness in each soundscape (street, cafe, park). */
const MIX: Record<Exclude<Soundscape, "">, { hum: number; murmur: number; leaves: number }> = {
  street: { hum: 0.5, murmur: 0, leaves: 0 },
  cafe: { hum: 0.15, murmur: 0.6, leaves: 0 },
  park: { hum: 0.08, murmur: 0, leaves: 0.25 },
};

export class Sound {
  private readonly ctx = new AudioContext();
  private readonly rng = new Rng();
  private readonly master = this.ctx.createGain();
  private readonly layers: Record<"hum" | "murmur" | "leaves", GainNode>;
  private scene: Soundscape = "";
  private blips: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisibility = () => (document.hidden ? void this.ctx.suspend() : void this.ctx.resume());

  constructor() {
    this.master.gain.value = VOLUME;
    this.master.connect(this.ctx.destination);
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer(this.ctx, this.rng);
    noise.loop = true;
    const layer = (type: BiquadFilterType, freq: number, q = 1) => {
      const f = this.ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      noise.connect(f).connect(g).connect(this.master);
      return g;
    };
    this.layers = { hum: layer("lowpass", 300), murmur: layer("bandpass", 700, 0.7), leaves: layer("highpass", 3500) };
    // The murmur swells and fades slowly, like voices around him.
    const lfo = this.ctx.createOscillator();
    const depth = this.ctx.createGain();
    lfo.frequency.value = 0.25;
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(this.layers.murmur.gain);
    lfo.start();
    noise.start();
    document.addEventListener("visibilitychange", this.onVisibility);
    // Browsers keep sound off until a tap when the game opens with the switch already on.
    if (this.ctx.state === "suspended") addEventListener("pointerdown", () => void this.ctx.resume(), { once: true });
  }

  /** Fades over to `scene`; does nothing when it is already playing. */
  set(scene: Soundscape): void {
    if (scene === this.scene) return;
    this.scene = scene;
    const now = this.ctx.currentTime;
    const mix = scene ? MIX[scene] : { hum: 0, murmur: 0, leaves: 0 };
    for (const k of ["hum", "murmur", "leaves"] as const) this.layers[k].gain.setTargetAtTime(mix[k], now, FADE_S / 3);
    if (this.blips) clearTimeout(this.blips);
    this.blips = null;
    if (scene === "cafe" || scene === "park") this.blip(scene);
  }

  /** A cup's clink in a cafe, a short bird call in a park, then the next one a few seconds later. */
  private blip(scene: "cafe" | "park"): void {
    if (!document.hidden) {
      if (scene === "cafe") this.tone(this.rng.randfRange(2400, 3200), 2600, 0.12, 0.05);
      else for (let i = 0, n = this.rng.randiRange(2, 4); i < n; i++) this.tone(this.rng.randfRange(2800, 3400), 4000, 0.08, 0.04, i * 0.13);
    }
    const next = scene === "cafe" ? this.rng.randfRange(2500, 7500) : this.rng.randfRange(1500, 5500);
    this.blips = setTimeout(() => this.blip(scene), next);
  }

  private tone(from: number, to: number, len: number, loud: number, delay = 0): void {
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(loud, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + len);
  }

  stop(): void {
    if (this.blips) clearTimeout(this.blips);
    document.removeEventListener("visibilitychange", this.onVisibility);
    void this.ctx.close();
  }
}

/** Two seconds of soft brown noise, looped under every layer. */
function noiseBuffer(ctx: AudioContext, rng: Rng): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) {
    last = (last + 0.02 * rng.randfRange(-1, 1)) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}
