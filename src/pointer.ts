/** Single shared pointer + per-frame bus. Everything kinetic reads from here. */
import gsap from "gsap";

export const pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };

let lx = 0, ly = 0;
if (typeof window !== "undefined") {
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.active = true;
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.active = false; pointer.x = pointer.y = -9999; });
  gsap.ticker.add(() => {
    pointer.vx = pointer.x - lx;
    pointer.vy = pointer.y - ly;
    lx = pointer.x; ly = pointer.y;
  });
}

export const reducedMotion =
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer =
  typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** A damped spring, the only easing interactive elements use. */
export class Spring {
  x = 0; v = 0;
  constructor(public k = 0.09, public damp = 0.76) {}
  step(target: number) {
    this.v = (this.v + (target - this.x) * this.k) * this.damp;
    this.x += this.v;
    return this.x;
  }
  get settled() { return Math.abs(this.v) < 0.01 && Math.abs(this.x) < 0.01; }
}
