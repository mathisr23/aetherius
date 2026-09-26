import { useEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { pointer, reducedMotion, finePointer, Spring } from "../pointer";

interface Props {
  children: ReactNode;
  strength?: number;
  pad?: number;
  cursor?: string;
  className?: string;
}

/** Pulls its content toward the cursor when it comes within `pad` px, springs back on release. */
export function Magnetic({ children, strength = 0.38, pad = 70, cursor, className = "" }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reducedMotion || !finePointer) return;
    const el = ref.current!, inn = inner.current!;
    const sx = new Spring(0.1, 0.72), sy = new Spring(0.1, 0.72);
    const tick = () => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2 - sx.x, cy = r.top + r.height / 2 - sy.x;
      const dx = pointer.x - cx, dy = pointer.y - cy;
      const inside = Math.abs(dx) < r.width / 2 + pad && Math.abs(dy) < r.height / 2 + pad;
      const x = sx.step(inside ? dx * strength : 0);
      const y = sy.step(inside ? dy * strength : 0);
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      inn.style.transform = `translate3d(${x * 0.35}px, ${y * 0.35}px, 0) skewX(${-sx.v * 0.8}deg)`;
    };
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [strength, pad]);

  return (
    <span ref={ref} className={`magnetic ${className}`} data-magnetic data-cursor={cursor}>
      <span ref={inner} className="magnetic-in">{children}</span>
    </span>
  );
}
