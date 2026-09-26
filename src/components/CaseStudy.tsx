import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Work } from "../data";
import { WORKS } from "../data";
import { Magnetic } from "./Magnetic";
import { KineticText } from "./KineticText";

interface Props {
  work: Work;
  onClose: () => void;
  onNext: (slug: string) => void;
}

/** The "page" behind each work: a dark glass panel while the world frames the subject. */
export function CaseStudy({ work, onClose, onNext }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const next = WORKS[(WORKS.indexOf(work) + 1) % WORKS.length];

  useEffect(() => {
    const el = root.current!;
    el.scrollTop = 0;
    const ctx = gsap.context(() => {
      gsap.from(".cs-line", { y: 40, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.06, delay: 0.35 });
      gsap.from(".cs-rule", { scaleX: 0, transformOrigin: "left", duration: 1.4, ease: "expo.inOut", delay: 0.3 });
    }, el);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    el.focus();
    return () => {
      ctx.revert();
      window.removeEventListener("keydown", onKey);
    };
  }, [work, onClose]);

  return (
    <div className="case" role="dialog" aria-modal="true" aria-label={work.title} ref={root} tabIndex={-1} data-lenis-prevent>
      <div className="case-panel">
        <div className="case-top cs-line">
          <span className="meta">Case study</span>
          <Magnetic>
            <button className="btn-ghost" onClick={onClose}>Close <span aria-hidden>✕</span></button>
          </Magnetic>
        </div>
        <p className="meta cs-line case-kicker">{work.kicker} — {work.year}</p>
        <KineticText as="h2" text={work.title} className="case-title" mode="attract" reveal="manual" play delay={0.35} />
        <div className="cs-rule" />
        <p className="case-blurb cs-line">{work.blurb}</p>
        <dl className="case-meta cs-line">
          <div><dt>Client</dt><dd>{work.client}</dd></div>
          <div><dt>Role</dt><dd>{work.role}</dd></div>
          <div><dt>Year</dt><dd>{work.year}</dd></div>
        </dl>
        {work.body.map((p, i) => (
          <p key={i} className="case-body cs-line">{p}</p>
        ))}
        <ul className="case-stats">
          {work.stats.map(([v, k]) => (
            <li key={k} className="cs-line"><strong>{v}</strong><span className="meta">{k}</span></li>
          ))}
        </ul>
        <div className="case-next cs-line">
          <span className="meta">Next case</span>
          <Magnetic strength={0.25}>
            <button className="case-next-btn" onClick={() => onNext(next.slug)}>
              <em>{next.title}</em> <span aria-hidden>→</span>
            </button>
          </Magnetic>
        </div>
      </div>
    </div>
  );
}
