/**
 * Soundtrack: "The Weight of Granite", looping.
 * In the dark (threshold, exit) it sounds muffled, as if heard through fog;
 * crossing into the light opens it up. Browsers only allow sound after a
 * gesture, so it starts on the first click / key / touch, unless muted.
 */
const TRACK = "/audio/the-weight-of-granite.mp3";
const KEY = "aetherius:sound";

class Sound {
  private ctx: AudioContext | null = null;
  private el: HTMLAudioElement | null = null;
  private gain!: GainNode;
  private tone!: BiquadFilterNode;
  private brightness = 0;
  private duck = 1;
  enabled: boolean;
  private listeners = new Set<(on: boolean) => void>();

  constructor() {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* private mode */ }
    this.enabled = saved !== "off";
    if (typeof window === "undefined") return;
    const unlock = () => {
      if (this.enabled) this.start();
      if (this.ctx) ["pointerdown", "keydown", "touchend"].forEach((e) => window.removeEventListener(e, unlock));
    };
    ["pointerdown", "keydown", "touchend"].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
  }

  private start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.el = new Audio(TRACK);
      this.el.loop = true;
      this.el.preload = "auto";
      this.tone = this.ctx.createBiquadFilter();
      this.tone.type = "lowpass";
      this.tone.Q.value = 0.5;
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      this.ctx.createMediaElementSource(this.el).connect(this.tone).connect(this.gain).connect(this.ctx.destination);
      this.applyBrightness(true);
    }
    this.ctx.resume();
    this.el!.play().catch(() => {});
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setTargetAtTime(0.75 * this.duck, this.ctx.currentTime, 1.4);
  }

  private stop() {
    if (!this.ctx) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    const el = this.el;
    window.setTimeout(() => { if (!this.enabled) el?.pause(); }, 1400);
  }

  toggle() {
    this.enabled = !this.enabled;
    try { localStorage.setItem(KEY, this.enabled ? "on" : "off"); } catch { /* ignore */ }
    if (this.enabled) this.start(); else this.stop();
    this.listeners.forEach((f) => f(this.enabled));
  }

  onChange(f: (on: boolean) => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** 0 = dark fog (muffled), 1 = white light (open). */
  setBrightness(b: number) {
    if (Math.abs(b - this.brightness) < 0.02) return;
    this.brightness = b;
    this.applyBrightness();
  }

  /** Case studies: the score steps back so the page can be read. */
  setDucked(d: boolean) {
    this.duck = d ? 0.45 : 1;
    if (this.ctx && this.enabled) this.gain.gain.setTargetAtTime(0.75 * this.duck, this.ctx.currentTime, 0.6);
  }

  private applyBrightness(now = false) {
    if (!this.ctx) return;
    const f = 700 * Math.pow(18000 / 700, this.brightness);
    if (now) this.tone.frequency.value = f;
    else this.tone.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.35);
  }
}

export const sound = new Sound();
