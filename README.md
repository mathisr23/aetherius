# AETHERIUS — Shaping the Unseen

A monochrome, scroll-driven showreel for a fictional immersive production house.
One camera travels a corridor of fog; every section is a station along the way.

- **World** — Three.js scene with linear depth fog on ink silhouettes (the "depth-map" look), volumetric light scattering, fog sheets, dust, film grain.
- **Figures** — procedural, articulated bodies built from lofted elliptical rings (no imported models), baked into crowds.
- **Motion** — GSAP + ScrollTrigger + Lenis. Scroll drives the camera, the collision choreography and the disciplines tracking shot.
- **Type** — kinetic headlines that slice apart around the cursor, a difference-blended text layer (white on ink, ink on light).
- **Interaction** — sword cursor with pendulum lag and slash on click, magnetic elements, hash-routed case studies with a light-slit page transition.

## Run

```bash
npm install
npm run dev     # http://localhost:3012
npm run build
```

Stack: Vite · React 18 · TypeScript · Three.js · GSAP · Lenis.
