import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { World } from "./world/World";
import { KineticText } from "./components/KineticText";
import { Magnetic } from "./components/Magnetic";
import { Cursor } from "./components/Cursor";
import { Preloader } from "./components/Preloader";
import { CaseStudy } from "./components/CaseStudy";
import { WORKS, CHAPTERS, DISCIPLINES } from "./data";
import { reducedMotion } from "./pointer";

gsap.registerPlugin(ScrollTrigger);

const slugFromHash = () => {
  const m = location.hash.match(/^#\/work\/([\w-]+)/);
  return m && WORKS.some((w) => w.slug === m[1]) ? m[1] : null;
};

const MANIFESTO =
  "We do not render objects. We render the space between them — the fog that gives light a body, the silhouette that gives absence a shape. Aetherius builds worlds you feel before you see them.";

export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const lenis = useRef<Lenis | null>(null);
  const veil = useRef<HTMLDivElement>(null);
  const veilText = useRef<HTMLSpanElement>(null);
  const tc = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const busy = useRef(false);
  const current = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [chapter, setChapter] = useState(0);
  const [disc, setDisc] = useState(0);
  const [slug, setSlug] = useState<string | null>(null);

  // ── world + smooth scroll + scroll→station mapping
  useEffect(() => {
    const w = new World(canvas.current!, { reduced: reducedMotion });
    world.current = w;

    const l = new Lenis({ lerp: reducedMotion ? 1 : 0.085, smoothWheel: !reducedMotion });
    lenis.current = l;
    l.on("scroll", ScrollTrigger.update);
    const raf = (time: number) => l.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    // Always begin at the threshold, whatever the browser restored.
    history.scrollRestoration = "manual";
    l.scrollTo(0, { immediate: true, force: true });
    l.stop();

    // Each section pins the camera to its station: at its middle (default),
    // or for its whole sticky duration ("hold") so nothing moves while you read.
    let anchors: { y: number; s: number }[] = [];
    let discBox = { top: 0, len: 1 };
    const measure = () => {
      const vh = window.innerHeight;
      anchors = [];
      document.querySelectorAll<HTMLElement>("[data-station]").forEach((el) => {
        const top = el.getBoundingClientRect().top + window.scrollY;
        const s = Number(el.dataset.station);
        const span = Math.max(0, el.offsetHeight - vh);
        if (el.dataset.anchor === "hold") anchors.push({ y: top, s }, { y: top + span, s });
        else anchors.push({ y: top + span * 0.5, s });
      });
      const d = document.getElementById("disciplines");
      if (d) discBox = { top: d.getBoundingClientRect().top + window.scrollY, len: Math.max(1, d.offsetHeight - vh) };
    };
    let lastDisc = -1;
    let lastChapter = -1;
    const update = () => {
      const y = window.scrollY;
      let p = 0;
      if (anchors.length) {
        if (y <= anchors[0].y) p = anchors[0].s;
        else if (y >= anchors[anchors.length - 1].y) p = anchors[anchors.length - 1].s;
        else
          for (let i = 0; i < anchors.length - 1; i++) {
            const a = anchors[i], b = anchors[i + 1];
            if (y >= a.y && y < b.y) { p = a.s + ((y - a.y) / Math.max(1, b.y - a.y)) * (b.s - a.s); break; }
          }
      }
      w.setProgress(p);
      const dt = Math.min(1, Math.max(0, (y - discBox.top) / discBox.len));
      w.setDiscipline(dt * 5 - 0.5);
      const di = Math.min(4, Math.floor(dt * 5));
      if (di !== lastDisc) { lastDisc = di; setDisc(di); }
      w.setVelocity(l.velocity);
      const ch = Math.round(p);
      if (ch !== lastChapter) { lastChapter = ch; setChapter(ch); }
      // Showreel timecode: the scroll *is* the playhead.
      const secs = p * 11.7, f = Math.floor((secs % 1) * 24);
      const s = Math.floor(secs);
      if (tc.current) tc.current.textContent = `00:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
      if (bar.current) bar.current.style.transform = `scaleX(${p / (w.stationCount - 1)})`;
    };
    measure();
    update();
    l.on("scroll", update);
    const onResize = () => { w.resize(); measure(); update(); ScrollTrigger.refresh(); };
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => { measure(); update(); ScrollTrigger.refresh(); });
    const onMove = (e: PointerEvent) => e.pointerType !== "touch" && w.setPointer(e.clientX, e.clientY);
    window.addEventListener("pointermove", onMove, { passive: true });

    return () => {
      gsap.ticker.remove(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onMove);
      l.destroy();
      w.dispose();
    };
  }, []);

  // ── scroll-scrubbed choreography
  useEffect(() => {
    if (reducedMotion) return;
    const ctx = gsap.context(() => {
      // The manifesto only exists on the far side of the portal.
      gsap.fromTo(".manifesto .sticky", { autoAlpha: 0 }, {
        autoAlpha: 1, ease: "none",
        scrollTrigger: { trigger: ".manifesto", start: "top 4%", end: "top -14%", scrub: 0.4 },
      });
      gsap.to(".mf-inner", {
        autoAlpha: 0, y: -50, ease: "power2.in",
        scrollTrigger: { trigger: ".manifesto", start: "bottom 70%", end: "bottom 25%", scrub: 0.6 },
      });
      gsap.fromTo(".mf-word", { opacity: 0.08, filter: "blur(8px)", y: 18 }, {
        opacity: 1, filter: "blur(0px)", y: 0, ease: "none", stagger: 0.12,
        scrollTrigger: { trigger: ".manifesto", start: "top -8%", end: "bottom 110%", scrub: 0.6 },
      });
      gsap.utils.toArray<HTMLElement>(".work").forEach((sec) => {
        gsap.fromTo(sec.querySelector(".vf"), { clipPath: "inset(48% 48% 48% 48%)", opacity: 0 }, {
          clipPath: "inset(0% 0% 0% 0%)", opacity: 1, ease: "expo.out",
          scrollTrigger: { trigger: sec, start: "top 60%", end: "top 0%", scrub: 1 },
        });
        gsap.fromTo(sec.querySelector(".work-copy"), { clipPath: "inset(100% 0% 0% 0%)", y: 40 }, {
          clipPath: "inset(0% 0% 0% 0%)", y: 0, ease: "power3.out",
          scrollTrigger: { trigger: sec, start: "top 30%", end: "top -10%", scrub: 1 },
        });
        gsap.to(sec.querySelector(".work-inner"), {
          opacity: 0, y: -60, ease: "power2.in",
          scrollTrigger: { trigger: sec, start: "bottom 95%", end: "bottom 45%", scrub: 1 },
        });
      });
      gsap.to(".hero-inner", {
        opacity: 0, scale: 1.12, ease: "power2.in",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom 30%", scrub: 0.5 },
      });
      gsap.fromTo(".disc-inner", { autoAlpha: 0 }, {
        autoAlpha: 1, ease: "none",
        scrollTrigger: { trigger: ".disciplines", start: "top 30%", end: "top top", scrub: 0.5 },
      });
    });
    return () => ctx.revert();
  }, []);

  // ── page transition: a slit of light opens, floods, and wipes away
  const go = useCallback((next: string | null, push = true) => {
    if (busy.current || next === current.current) return;
    busy.current = true;
    current.current = next;
    const w = WORKS.find((x) => x.slug === next) ?? null;
    if (veilText.current) veilText.current.textContent = w ? `Entering — ${w.title}` : "Returning — Showreel";
    world.current?.pulse(0.5);
    const k = reducedMotion ? 0.3 : 1;
    gsap.timeline({ onComplete: () => { busy.current = false; } })
      .set(veil.current, { display: "flex", clipPath: "inset(50% 50% 50% 50%)" })
      .to(veil.current, { clipPath: "inset(0% 49.7% 0% 49.7%)", duration: 0.5 * k, ease: "expo.out" })
      .to(veil.current, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.75 * k, ease: "expo.inOut" })
      .fromTo(veilText.current, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4 }, "-=0.3")
      .add(() => {
        setSlug(next);
        document.documentElement.classList.toggle("case-open", !!next);
        // Behind the veil, park the page on this work so closing lands on it.
        const sec = next ? document.getElementById(next) : null;
        if (sec) {
          const y = sec.getBoundingClientRect().top + window.scrollY + (sec.offsetHeight - window.innerHeight) / 2;
          lenis.current?.scrollTo(y, { immediate: true, force: true });
        }
        world.current?.setFocus(w ? w.station : null);
        if (next) lenis.current?.stop();
        else lenis.current?.start();
        if (push) history.pushState(null, "", next ? `#/work/${next}` : location.pathname + location.search);
      })
      .to(veilText.current, { opacity: 0, duration: 0.3 }, "+=0.3")
      .to(veil.current, { clipPath: "inset(0% 0% 0% 100%)", duration: 1.05 * k, ease: "expo.inOut" })
      .set(veil.current, { display: "none" });
  }, []);

  const close = useCallback(() => go(null), [go]);

  useEffect(() => {
    const onPop = () => go(slugFromHash(), false);
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, [go]);

  const portalRect = useCallback(() => world.current?.portalRect() ?? null, []);
  const onLoaded = useCallback(() => {
    setLoaded(true);
    world.current?.reveal();
    const initial = slugFromHash();
    if (initial) go(initial, false);
    else lenis.current?.start();
  }, [go]);

  const scrollTo = (sel: string) => lenis.current?.scrollTo(sel, { duration: 2.4 });
  const goDiscipline = (i: number) => {
    const d = document.getElementById("disciplines");
    if (!d) return;
    const top = d.getBoundingClientRect().top + window.scrollY;
    lenis.current?.scrollTo(top + (d.offsetHeight - window.innerHeight) * ((i + 0.5) / 5), { duration: 1.6 });
  };
  const D = DISCIPLINES[disc];
  const work = WORKS.find((w) => w.slug === slug) ?? null;

  return (
    <>
      <canvas ref={canvas} className="world" aria-hidden />
      <Preloader onDone={onLoaded} portal={portalRect} />

      {/* Everything typographic lives in one difference-blended layer: white on ink, ink on light. */}
      <header className="hud">
        <Magnetic>
          <button className="logo" onClick={() => scrollTo("#top")}>AETHERIUS<sup>®</sup></button>
        </Magnetic>
        <div className="hud-chapter meta" aria-live="polite">
          <span key={chapter} className="roll">{CHAPTERS[chapter]}</span>
        </div>
        <Magnetic>
          <button className="hud-link meta" onClick={() => scrollTo("#contact")}>Contact</button>
        </Magnetic>
        <div className="hud-bottom meta">
          <span>TC <span ref={tc}>00:00:00:00</span></span>
          <span className="hud-bar"><span ref={bar} /></span>
          <span className="hide-sm">Fog · Light · Silhouette</span>
        </div>
      </header>

      <main className="content" aria-hidden={!!slug} id="top">
        <section className="hero" data-station="0">
          <div className="hero-inner">
            <p className="meta hero-kicker">Immersive production house — Est. MMXIX</p>
            <KineticText as="h1" text="AETHERIUS" className="hero-title" mode="slice" radius={170} reveal="manual" play={loaded} />
            <div className="hero-row">
              <p className="hero-sub serif">Shaping the Unseen.</p>
              <div className="scroll-cue meta"><span>Scroll to cross the threshold</span><i /></div>
              <p className="hero-lede">Films, spaces and real-time worlds made of fog, light and silhouette.</p>
            </div>
          </div>
        </section>

        <section className="manifesto" data-station="1" data-anchor="hold">
          <div className="sticky">
            <div className="mf-inner">
              <p className="label">Manifesto</p>
              <p className="mf-text">
                {MANIFESTO.split(" ").map((w, i) => (
                  <span className="mf-word" key={i}>{w} </span>
                ))}
              </p>
            </div>
          </div>
        </section>

        {WORKS.map((w) => (
          <section className="work" data-station={w.station} key={w.slug} id={w.slug}>
            <div className="sticky work-inner">
              <div className="vf" aria-hidden>
                <i /><i /><i /><i />
                <span className="vf-meta">Rec — {w.title}</span>
              </div>
              <p className="meta work-index">{w.kicker}</p>
              <KineticText as="h2" text={w.title} className="work-title" mode="attract" />
              <div className="work-copy">
                <p>{w.blurb}</p>
                <Magnetic>
                  <button className="btn-disc" onClick={() => go(w.slug)} aria-label={`Open case: ${w.title}`}>
                    <span>Enter<br />the case</span>
                  </button>
                </Magnetic>
              </div>
            </div>
          </section>
        ))}

        <section className="disciplines" data-station="6" data-anchor="hold" id="disciplines">
          <div className="sticky disc-inner">
            <nav className="disc-nav" aria-label="Disciplines">
              <p className="label">Disciplines</p>
              {DISCIPLINES.map((d, i) => (
                <button key={d.name} className={"disc-tab" + (i === disc ? " is-on" : "")} onClick={() => goDiscipline(i)} aria-current={i === disc}>
                  {d.name}
                </button>
              ))}
            </nav>
            <div className="disc-panel" key={disc}>
              <KineticText as="h3" text={D.name} className="disc-title" mode="attract" radius={160} reveal="manual" play />
              <p className="disc-line serif">{D.line}</p>
              <p className="disc-detail">{D.detail}</p>
              <ul className="disc-deliv">
                {D.deliverables.map((x) => <li key={x}>{x}</li>)}
              </ul>
              <div className="disc-seen">
                <span className="meta">Seen in</span>
                {D.seenIn.map((slug) => (
                  <Magnetic key={slug} strength={0.25}>
                    <button className="disc-link" onClick={() => go(slug)}>{WORKS.find((w) => w.slug === slug)?.title} →</button>
                  </Magnetic>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="contact" data-station="7" id="contact">
          <p className="label">Contact</p>
          <KineticText as="h2" text="Step into" className="contact-title" mode="slice" radius={150} />
          <KineticText as="h2" text="the light." className="contact-title serif-title" mode="slice" radius={150} />
          <div className="contact-row">
            <Magnetic strength={0.3}>
              <a className="contact-mail" href="mailto:studio@aetherius.studio">studio@aetherius.studio</a>
            </Magnetic>
            <div className="contact-meta meta">
              <span>Paris — Rotterdam — Remote</span>
              <span>New commissions from Q1 MMXXVII</span>
            </div>
          </div>
          <footer className="foot meta">
            <span>© MMXXVI Aetherius</span>
            <Magnetic><button onClick={() => scrollTo("#top")}>Back to the threshold ↑</button></Magnetic>
          </footer>
        </section>
      </main>

      {work && <CaseStudy key={work.slug} work={work} onClose={close} onNext={(s) => go(s)} />}

      <div ref={veil} className="veil" aria-hidden>
        <span ref={veilText} className="meta" />
      </div>
      <Cursor />
    </>
  );
}
