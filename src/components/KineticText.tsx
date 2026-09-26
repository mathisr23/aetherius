import { createElement, useEffect, useRef, type ElementType } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { pointer, reducedMotion, finePointer, Spring } from "../pointer";

gsap.registerPlugin(ScrollTrigger);

type Mode = "slice" | "attract";
type Reveal = "none" | "scroll" | "manual";

interface Props {
  text: string;
  as?: ElementType;
  className?: string;
  mode?: Mode;
  radius?: number;
  reveal?: Reveal;
  /** For reveal="manual": flip to true to play the entrance. */
  play?: boolean;
  delay?: number;
}

/**
 * Headline split into characters, each living in a pointer force field.
 * - slice:   letters part around the cursor and shear into two halves, then spring back together.
 * - attract: letters lean toward the cursor like iron filings.
 */
export function KineticText({ text, as = "div", className = "", mode = "attract", radius = 200, reveal = "scroll", play, delay = 0 }: Props) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current!;
    const chars = Array.from(el.querySelectorAll<HTMLElement>(".kc"));
    const tops = chars.map((c) => c.querySelector<HTMLElement>(".kc-t"));
    const bots = chars.map((c) => c.querySelector<HTMLElement>(".kc-b"));
    let centers: { x: number; y: number }[] = [];
    const measure = () => {
      centers = chars.map((c) => ({ x: c.offsetLeft + c.offsetWidth / 2, y: c.offsetTop + c.offsetHeight / 2 }));
    };
    measure();
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);

    const springs = chars.map(() => ({ x: new Spring(), y: new Spring(), s: new Spring(0.07, 0.8), r: new Spring() }));
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(el);

    const tick = () => {
      if (!visible || reducedMotion || !finePointer) return;
      const rect = el.getBoundingClientRect();
      const lineH = rect.height / Math.max(1, Math.round(rect.height / (chars[0]?.offsetHeight || rect.height)));
      for (let i = 0; i < chars.length; i++) {
        const c = centers[i];
        const dx = rect.left + c.x - pointer.x;
        const dy = rect.top + c.y - pointer.y;
        const sp = springs[i];
        let tx = 0, ty = 0, ts = 0, tr = 0;
        if (mode === "slice") {
          const prox = Math.exp(-(dx * dx) / (2 * radius * radius) - (dy * dy) / (2 * (lineH * 0.7) ** 2));
          const side = Math.tanh(dx / 30);
          tx = side * prox * radius * 0.3;
          ts = prox; // shear between halves
          tr = side * prox * 7;
          ty = -prox * 4;
        } else {
          const d = Math.hypot(dx, dy);
          const f = Math.max(0, 1 - d / radius) ** 2;
          tx = -dx * f * 0.28;
          ty = -dy * f * 0.28;
          ts = f;
          tr = -dx * f * 0.05;
        }
        const x = sp.x.step(tx), y = sp.y.step(ty), s = sp.s.step(ts), r = sp.r.step(tr);
        if (Math.abs(x) + Math.abs(y) + Math.abs(s) + Math.abs(r) < 0.002) {
          chars[i].style.transform = "";
          if (tops[i]) tops[i]!.style.transform = bots[i]!.style.transform = "";
          continue;
        }
        if (mode === "slice") {
          chars[i].style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg)`;
          const shear = s * 18;
          tops[i]!.style.transform = `translate3d(${shear}px, ${-s * 6}px, 0)`;
          bots[i]!.style.transform = `translate3d(${-shear}px, ${s * 6}px, 0)`;
        } else {
          chars[i].style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${r}deg) scale(${1 + s * 0.18})`;
        }
      }
    };
    gsap.ticker.add(tick);

    let st: ScrollTrigger | undefined;
    const inner = el.querySelectorAll<HTMLElement>(".kc-in");
    if (reveal !== "none" && !reducedMotion) {
      gsap.set(inner, { yPercent: 115, rotateX: -75, opacity: 0 });
      if (reveal === "scroll") {
        st = ScrollTrigger.create({
          trigger: el,
          start: "top 88%",
          onEnter: () => enter(),
          onLeaveBack: () => gsap.to(inner, { yPercent: 115, rotateX: -75, opacity: 0, duration: 0.5, stagger: 0.01, ease: "power2.in" }),
        });
      }
    }
    function enter() {
      gsap.to(inner, { yPercent: 0, rotateX: 0, opacity: 1, duration: 1.4, ease: "expo.out", stagger: { each: 0.035, from: "start" }, delay });
    }
    (el as HTMLElement & { __enter?: () => void }).__enter = enter;

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", measure);
      io.disconnect();
      st?.kill();
    };
  }, [text, mode, radius, reveal, delay]);

  useEffect(() => {
    if (reveal === "manual" && play) (ref.current as HTMLElement & { __enter?: () => void })?.__enter?.();
  }, [play, reveal]);

  const words = text.split(" ");
  return createElement(
    as,
    { ref, className: `kt kt-${mode} ${className}`, "aria-label": text },
    words.map((w, wi) => (
      <span className="kw" aria-hidden key={wi}>
        {Array.from(w).map((ch, ci) => (
          <span className="kc" key={ci}>
            <span className="kc-in">
              {mode === "slice" ? (
                <>
                  <span className="kc-t">{ch}</span>
                  <span className="kc-b">{ch}</span>
                </>
              ) : (
                ch
              )}
            </span>
          </span>
        ))}
        {wi < words.length - 1 ? <span className="ksp">&nbsp;</span> : null}
      </span>
    )),
  );
}
