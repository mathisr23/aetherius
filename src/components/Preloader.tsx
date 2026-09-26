import { useEffect, useRef } from "react";
import gsap from "gsap";
import { reducedMotion } from "../pointer";

type Rect = { x: number; y: number; w: number; h: number } | null;

/**
 * A slit of light opens exactly where the portal stands in the 3D world
 * (already rendered underneath), widens to its true width, then the dark
 * dissolves around it — so the slit simply *becomes* the portal.
 */
interface Props { onDone: () => void; portal: () => Rect; onChoose: (withSound: boolean) => void }

export function Preloader({ onDone, portal, onChoose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  useEffect(() => {
    const el = root.current!;
    const slit = el.querySelector<HTMLElement>(".pl-slit")!;
    const bg = el.querySelector<HTMLElement>(".pl-bg")!;
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const d = reducedMotion ? 0.3 : 2.1;
    let tl: gsap.core.Timeline | undefined;

    const place = () => {
      const r = portal() ?? { x: innerWidth / 2 - 60, y: innerHeight * 0.2, w: 120, h: innerHeight * 0.6 };
      gsap.set(slit, { left: r.x + r.w / 2, top: r.y, height: r.h });
      return r;
    };

    fonts.then(() => {
      // Give the world a couple of frames so the camera is settled before measuring.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const r = place();
        tl = gsap.timeline();
        tlRef.current = tl;
        tl.fromTo(slit, { scaleY: 0 }, { scaleY: 1, duration: d, ease: "power3.inOut" }, 0)
          .fromTo(el.querySelectorAll(".pl-word"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.9, stagger: 0.35, ease: "power2.out" }, 0.2)
          // widen by real width (crisp edges), glow swelling like the portal's halo
          .to(slit, { width: r.w, boxShadow: "0 0 120px 40px rgba(255,255,255,0.45)", duration: 1.1, ease: "expo.inOut" })
          .to(el.querySelectorAll(".pl-meta"), { opacity: 0, duration: 0.4 }, "<")
          // the door is open: wait for the visitor to step through (this click also unlocks sound)
          .set(el.querySelector(".pl-enter"), { top: r.y + r.h + 36, display: "flex" })
          .fromTo(el.querySelectorAll(".pl-enter button"), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.8, stagger: 0.12, ease: "power3.out" })
          .addPause()
          .to(el.querySelector(".pl-enter"), { opacity: 0, duration: 0.35 })
          .add(onDone, "-=0.15")
          // the dark dissolves; the slit hands over to the real portal underneath
          .to(bg, { opacity: 0, duration: 1.4, ease: "power2.inOut" }, "-=0.15")
          .to(slit, { opacity: 0, boxShadow: "0 0 160px 60px rgba(255,255,255,0)", duration: 1.6, ease: "power1.inOut" }, "<0.2")
          .set(el, { display: "none" });
      }));
    });
    const onResize = () => { if (tl && tl.progress() < 0.6) place(); };
    window.addEventListener("resize", onResize);
    return () => { tl?.kill(); window.removeEventListener("resize", onResize); };
  }, [onDone, portal]);

  return (
    <div ref={root} className="preloader">
      <div className="pl-bg" />
      <div className="pl-slit" />
      <div className="pl-meta pl-tl" aria-hidden>Aetherius</div>
      <div className="pl-enter" role="group" aria-label="Enter">
        <button onClick={() => { onChoose(true); tlRef.current?.resume(); }}>Enter with sound</button>
        <button onClick={() => { onChoose(false); tlRef.current?.resume(); }}>Enter in silence</button>
      </div>
      <div className="pl-meta pl-bl" aria-hidden>
        <span className="pl-word">Finding</span> <span className="pl-word">the light</span> <span className="pl-word">in the fog…</span>
      </div>
    </div>
  );
}
