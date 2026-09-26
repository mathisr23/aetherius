import { useEffect, useRef } from "react";
import gsap from "gsap";
import { pointer, finePointer, Spring } from "../pointer";

/**
 * The cursor is a blade. Its tip is the hotspot; the hilt trails behind with
 * a pendulum lag, it straightens over anything clickable, and a click cuts
 * a slash into the page.
 */
export function Cursor() {
  const blade = useRef<HTMLDivElement>(null);
  const label = useRef<HTMLSpanElement>(null);
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!finePointer) return;
    document.documentElement.classList.add("has-cursor");
    let target: HTMLElement | null = null;
    const swing = { v: 0 };
    const tilt = new Spring(0.08, 0.82);
    const lift = new Spring(0.12, 0.7);
    let x = pointer.x, y = pointer.y;

    const over = (e: PointerEvent) => {
      target = (e.target as HTMLElement).closest<HTMLElement>("[data-magnetic], a, button");
      const text = target?.closest<HTMLElement>("[data-cursor]")?.getAttribute("data-cursor") ?? "";
      if (label.current) {
        label.current.textContent = text;
        label.current.classList.toggle("on", !!text);
      }
    };

    const slash = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      gsap.fromTo(swing, { v: 0 }, { v: 1, duration: 0.42, ease: "power3.out", yoyo: true, repeat: 1, repeatDelay: 0 });
      const cut = document.createElement("i");
      cut.className = "slash";
      const ang = -28 + (Math.random() - 0.5) * 24;
      cut.style.left = `${e.clientX}px`;
      cut.style.top = `${e.clientY}px`;
      cut.style.setProperty("--a", `${ang}deg`);
      layer.current?.appendChild(cut);
      gsap.timeline({ onComplete: () => cut.remove() })
        .fromTo(cut, { scaleX: 0 }, { scaleX: 1, duration: 0.18, ease: "power4.out" })
        .to(cut, { scaleY: 0, opacity: 0, duration: 0.5, ease: "power2.in" }, 0.12);
    };

    window.addEventListener("pointerover", over);
    window.addEventListener("pointerdown", slash);

    const tick = () => {
      const el = blade.current!;
      x += (pointer.x - x) * 0.55;
      y += (pointer.y - y) * 0.55;
      const hot = !!target && target.isConnected;
      // The hilt lags like a pendulum: moving right swings it left.
      const t = tilt.step(Math.max(-38, Math.min(38, pointer.vx * 1.6)));
      const l = lift.step(hot ? 1 : 0);
      const angle = -34 + t + l * 22 - swing.v * 70;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg) scale(${1 + l * 0.12})`;
      if (label.current) label.current.style.transform = `translate3d(${x + 22}px, ${y + 14}px, 0)`;
    };
    gsap.ticker.add(tick);
    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("pointerover", over);
      window.removeEventListener("pointerdown", slash);
    };
  }, []);

  if (!finePointer) return null;
  return (
    <div className="cursor" aria-hidden ref={layer}>
      <div ref={blade} className="sword">
        <svg width="22" height="84" viewBox="0 0 22 84" fill="none">
          <path d="M11 0 L13.4 7 L13.2 54 L8.8 54 L8.6 7 Z" fill="#fff" />
          <path d="M11 8 L11 52" stroke="#000" strokeOpacity="0.35" strokeWidth="0.8" />
          <rect x="2" y="54" width="18" height="3.4" rx="1.7" fill="#fff" />
          <rect x="9.2" y="57.4" width="3.6" height="19" fill="#fff" />
          <path d="M9.2 61 L12.8 64 M9.2 65 L12.8 68 M9.2 69 L12.8 72" stroke="#000" strokeOpacity="0.5" strokeWidth="0.8" />
          <circle cx="11" cy="79.4" r="3.2" fill="#fff" />
        </svg>
      </div>
      <span ref={label} className="cursor-label" />
    </div>
  );
}
