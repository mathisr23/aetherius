/**
 * Soundtrack: "The Weight of Granite", looping.
 * In the dark (threshold, exit) it sounds muffled, as if heard through fog;
 * crossing into the light opens it up. Browsers only allow sound after a
 * gesture, so it starts on the first click / key / touch, unless muted.
 */
const TRACK = "/audio/the-weight-of-granite.mp3";
const KEY = "aetherius:sound";
const VOICES = ["threshold", "manifesto", "wanderer", "ascension", "legion", "collision", "disciplines", "exit"];

class Sound {
  private ctx: AudioContext | null = null;
  private el: HTMLAudioElement | null = null;
  private gain!: GainNode;
  private tone!: BiquadFilterNode;
  private brightness = 0;
  private duck = 1;
  enabled: boolean;
  private listeners = new Set<(on: boolean) => void>();
  private voiceGain!: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private speaking = false;

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
      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = 0.95;
      this.voiceGain.connect(this.ctx.destination);
      // the narrator's lines are tiny: fetch them all once
      const ctx = this.ctx;
      VOICES.forEach((v) =>
        fetch(`/audio/voice/${v}.mp3`).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
          .then((buf) => this.buffers.set(v, buf)).catch(() => {}),
      );
    }
    this.ctx.resume();
    this.el!.play().catch(() => {});
    this.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 1.4);
  }

  private level() {
    return 0.75 * this.duck * (this.speaking ? 0.4 : 1);
  }

  /** Explicit choice (the "enter" gate): must be called from a click. */
  setEnabled(on: boolean) {
    this.enabled = on;
    try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* ignore */ }
    if (on) this.start(); else this.stop();
    this.listeners.forEach((f) => f(on));
  }

  /** The narrator names the room you just walked into. The score steps back while she speaks. */
  say(name: string) {
    if (!this.ctx || !this.enabled) return;
    const buf = this.buffers.get(name);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    this.speaking = true;
    this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.15);
    src.onended = () => {
      this.speaking = false;
      if (this.ctx && this.enabled) this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.8);
    };
    src.start();
  }

  private stop() {
    if (!this.ctx) return;
    this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    const el = this.el;
    window.setTimeout(() => { if (!this.enabled) el?.pause(); }, 1400);
  }

  toggle() {
    this.setEnabled(!this.enabled);
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
    if (this.ctx && this.enabled) this.gain.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.6);
  }

  private applyBrightness(now = false) {
    if (!this.ctx) return;
    const f = 700 * Math.pow(18000 / 700, this.brightness);
    if (now) this.tone.frequency.value = f;
    else this.tone.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.35);
  }
}

export const sound = new Sound();
