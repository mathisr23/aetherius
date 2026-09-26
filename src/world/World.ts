import * as THREE from "three";
import { Figure, rng, loft, type Pose } from "./Figure";
import { katana, scimitar, spear, bow, shield } from "./props";
import {
  fogPlaneVert, fogPlaneFrag, glowVert, glowFrag, spillFrag,
  dustVert, dustFrag, postVert, postFrag, inkVert, inkFrag,
} from "./shaders";

THREE.ColorManagement.enabled = false;

interface Station {
  cam: THREE.Vector3;
  look: THREE.Vector3;
  fog: THREE.Color;
  floor: THREE.Color;
  near: number;
  far: number;
  rays: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const C = (h: number) => new THREE.Color(h);

// One station per narrative beat. The DOM decides *when*, this decides *where*.
const STATIONS: Station[] = [
  { cam: V(0, 1.35, 5.5), look: V(0, 2.45, -14), fog: C(0x0c0c0e), floor: C(0x151517), near: 4, far: 42, rays: 1 },       // 0 threshold
  { cam: V(0, 1.75, -19.5), look: V(0, 1.9, -40), fog: C(0xdadada), floor: C(0xd0d0d0), near: 1, far: 11, rays: 0.05 },    // 1 manifesto
  { cam: V(-1.35, 1.1, -27.6), look: V(0.7, 1.2, -35), fog: C(0xd5d5d5), floor: C(0xa9a9a9), near: 3, far: 20, rays: 0 },  // 2 wanderer
  { cam: V(0.3, 0.5, -49.1), look: V(0, 1.72, -54), fog: C(0xe2e2e2), floor: C(0xc2c2c2), near: 2, far: 16, rays: 0 },     // 3 ascension
  { cam: V(0.15, 1.55, -67.3), look: V(0, 1.3, -75), fog: C(0xd8d8d8), floor: C(0xb4b4b4), near: 3, far: 17, rays: 0 },    // 4 legion
  { cam: V(1.8, 0.4, -93.6), look: V(0, 2.45, -99.5), fog: C(0xdfdfdf), floor: C(0xbdbdbd), near: 3, far: 18, rays: 0 },   // 5 collision
  { cam: V(18, 2.4, -106.3), look: V(18, 0.8, -113.5), fog: C(0xcdcdcd), floor: C(0xa6a6a6), near: 5, far: 24, rays: 0 },        // 6 disciplines
  { cam: V(0, 1.35, -137), look: V(0, 2.45, -151), fog: C(0x0c0c0e), floor: C(0x151517), near: 4, far: 42, rays: 1 },      // 7 exit
];

const PORTALS = [V(0, 3, -14), V(0, 3, -151)];

// Disciplines dioramas: a row across the corridor, visited by a lateral tracking shot.
const VIGNETTE_Z = -113.5;
const vignetteX = (i: number) => 18 - i * 9;

export class World {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.05, 200);
  private rt: THREE.WebGLRenderTarget;
  private post: THREE.ShaderMaterial;
  private postScene = new THREE.Scene();
  private postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private fog = new THREE.Fog(0x0c0c0e, 4, 42);
  private floorMat = new THREE.MeshBasicMaterial({ color: 0x151517 });
  private ink = new THREE.ShaderMaterial({
    vertexShader: inkVert,
    fragmentShader: inkFrag,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { uInk: { value: new THREE.Color(0x060606) }, uRimColor: { value: new THREE.Color(0.5, 0.5, 0.5) }, uRim: { value: 0.6 } },
    ]),
  });
  private fogPlanes: THREE.ShaderMaterial[] = [];
  private dust!: THREE.ShaderMaterial;
  private glows: THREE.ShaderMaterial[] = [];
  private animators: ((t: number, dt: number) => void)[] = [];

  private target = 0;
  private progress = 0;
  private focus: number | null = null;
  private focusBlend = 0;
  private focusIndex = 0;
  private mouse = new THREE.Vector2(0.5, 0.5);
  private mouseSmooth = new THREE.Vector2(0.5, 0.5);
  private lens = 0;
  private velocity = 0;
  private flash = 0;
  private fade = 1;
  private revealed = false;
  private last = performance.now();
  private elapsed = 0;
  private pointerSeen = false;
  private raf = 0;
  private walkPhase = 0;
  private discipline = 0;
  private disciplineTarget = 0;
  private shake = 0;
  private reduced: boolean;
  private tmpCam = new THREE.Vector3();
  private tmpLook = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, opts: { reduced: boolean }) {
    this.reduced = opts.reduced;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene.fog = this.fog;
    this.scene.background = new THREE.Color(0x0c0c0e);

    this.rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4 });
    this.post = new THREE.ShaderMaterial({
      vertexShader: postVert,
      fragmentShader: postFrag,
      uniforms: {
        tScene: { value: this.rt.texture },
        uRes: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uLight: { value: new THREE.Vector2(0.5, 0.6) },
        uRays: { value: 1 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uLens: { value: 0 },
        uVel: { value: 0 },
        uFlash: { value: 0 },
        uFade: { value: 1 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));

    this.buildEnvironment();
    this.buildThreshold();
    this.buildWanderer();
    this.buildAscension();
    this.buildLegion();
    this.buildCollision();
    this.buildDisciplines();
    this.buildExit();

    this.resize();
    this.applyStation(0);
    this.loop();
  }

  // ───────────────────────────────────────────── environment

  private buildEnvironment() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 420), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -80;
    this.scene.add(floor);

    // Monoliths: the architecture of the void.
    const r = rng(42);
    const slabMat = new THREE.MeshBasicMaterial({ color: 0x1b1b1d });
    for (let i = 0; i < 70; i++) {
      const z = 2 - r() * 165;
      if (Math.abs(z + 14) < 3 || Math.abs(z + 151) < 3) continue;
      const side = r() > 0.5 ? 1 : -1;
      const w = 0.8 + r() * 3.2, h = 7 + r() * 18, d = 0.8 + r() * 3;
      const x = side * (5 + r() * 14);
      if (STATIONS.some((s) => Math.hypot(s.cam.x - x, s.cam.z - z) < 8 + w)) continue;
      if (Math.abs(z - VIGNETTE_Z) < 11 && Math.abs(x) < 28) continue;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), slabMat);
      m.position.set(x, h / 2, z);
      m.rotation.y = (r() - 0.5) * 0.3;
      this.scene.add(m);
    }

    // Fog sheets at staggered depths: parallax comes for free as the camera travels.
    for (let i = 0; i < 34; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: fogPlaneVert,
        fragmentShader: fogPlaneFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 }, uOpacity: { value: 0.55 + r() * 0.35 }, uSeed: { value: r() * 50 },
          uColor: { value: new THREE.Color() }, uCam: { value: this.camera.position },
        },
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(26 + r() * 14, 7 + r() * 5), mat);
      m.position.set((r() - 0.5) * 12, 1.2 + r() * 3.5, 3 - i * 4.8 - r() * 2);
      this.scene.add(m);
      this.fogPlanes.push(mat);
    }

    // Suspended particulate.
    const N = 2400;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (r() - 0.5) * 16;
      pos[i * 3 + 1] = r() * 6;
      pos[i * 3 + 2] = 4 - r() * 162;
      seed[i] = r();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.dust = new THREE.ShaderMaterial({
      vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uPx: { value: 2 }, uColor: { value: new THREE.Color(1, 1, 1) } },
    });
    const pts = new THREE.Points(g, this.dust);
    pts.frustumCulled = false;
    this.scene.add(pts);

    for (const p of PORTALS) this.buildPortal(p);
  }

  private buildPortal(c: THREE.Vector3) {
    const W = 3.2, H = 6;
    const core = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }),
    );
    core.position.copy(c);
    this.scene.add(core);

    // Thin architectural frame, barely there.
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0a });
    for (const [x, y, w, h] of [[-W / 2 - 0.08, 0, 0.16, H + 0.16], [W / 2 + 0.08, 0, 0.16, H + 0.16], [0, H / 2 + 0.08, W + 0.32, 0.16]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), frameMat);
      f.position.set(c.x + x, c.y + y, c.z - 0.2);
      this.scene.add(f);
    }

    const size = new THREE.Vector2(18, 16);
    const glow = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uSize: { value: size }, uHalf: { value: new THREE.Vector2(W / 2, H / 2) }, uIntensity: { value: 1 }, uTime: { value: 0 } },
    });
    const gm = new THREE.Mesh(new THREE.PlaneGeometry(size.x, size.y), glow);
    gm.position.set(c.x, c.y, c.z + 0.05);
    this.scene.add(gm);
    this.glows.push(glow);

    const spill = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: spillFrag, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, uniforms: { uIntensity: { value: 1 } },
    });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(9, 20), spill);
    sm.rotation.x = -Math.PI / 2;
    sm.position.set(c.x, 0.01, c.z + 10);
    this.scene.add(sm);
    this.glows.push(spill);
  }

  // ───────────────────────────────────────────── scenes

  /** 0 — a lone figure walking into the light, seen from behind. */
  private buildThreshold() {
    const f = new Figure({ build: "female", hair: "bob", material: this.ink });
    f.root.rotation.y = Math.PI;
    this.scene.add(f.root);
    this.animators.push(() => {
      const p = THREE.MathUtils.smoothstep(this.progress, 0.04, 0.62);
      f.root.position.set(0, f.walkBob(this.walkPhase), -5.2 - p * 10);
      f.root.visible = this.progress < 1.2 || this.focus === 0;
      f.setPose(f.walk(this.walkPhase, 0.85, { chest: [0.03, 0, 0], head: [0.05, 0, 0] }));
    });
  }

  /** 2 — the swordswoman on guard, and the cat. She tracks you with the tip of her blade. */
  private buildWanderer() {
    const f = new Figure({ build: "female", hair: "tied", material: this.ink, seed: 3 });
    f.root.position.set(0.55, 0, -34.2);
    f.root.rotation.y = 0.5;
    const blade = katana(this.ink);
    f.attach("rWrist", blade);
    blade.position.y = -0.07;
    blade.rotation.set(0, Math.PI / 2, 0);
    this.scene.add(f.root);

    const cat = new THREE.Group();
    const body = new THREE.Mesh(loft([
      [0, 0.02, 0.03, 0], [0.02, 0.1, 0.13, -0.02], [0.1, 0.11, 0.12, -0.01], [0.2, 0.08, 0.07, 0.02], [0.27, 0.045, 0.045, 0.04], [0.29, 0.01, 0.01, 0.045],
    ], 16), this.ink);
    const head = new THREE.Group();
    head.position.set(0, 0.32, 0.05);
    head.add(new THREE.Mesh(loft([[-0.06, 0.01, 0.01], [-0.05, 0.055, 0.05], [0, 0.07, 0.06], [0.04, 0.06, 0.05], [0.06, 0.01, 0.01]], 14), this.ink));
    const earG = new THREE.ConeGeometry(0.028, 0.075, 4);
    const e1 = new THREE.Mesh(earG, this.ink); e1.position.set(0.04, 0.07, 0); e1.rotation.z = -0.3;
    const e2 = new THREE.Mesh(earG, this.ink); e2.position.set(-0.04, 0.07, 0); e2.rotation.z = 0.3;
    head.add(e1, e2);
    const tail = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 5, 20, Math.PI * 1.1), this.ink);
    tail.position.set(0.1, 0.05, -0.1);
    tail.rotation.set(Math.PI / 2, 0, 0.4);
    cat.add(body, head, tail);
    cat.position.set(-0.85, 0, -35.9);
    cat.rotation.y = 0.5;
    this.scene.add(cat);

    this.animators.push((t) => {
      const b = Math.sin(t * 1.3);            // breath
      const w = Math.sin(t * 0.37);           // slow weight shift
      const aim = (this.mouseSmooth.x - 0.5) * 0.5;
      const lift = (this.mouseSmooth.y - 0.5) * 0.3;
      f.setPose({
        hips: [0.04, 0.38 + w * 0.04, 0],
        spine: [0.03, 0, 0],
        chest: [-0.02 + b * 0.012, -0.36 + aim * 0.3, 0],
        neck: [0.02, -0.1 + aim * 0.3, 0],
        head: [0.1 - lift * 0.3, aim * 0.4, 0],
        // two-handed middle guard: both hands meet in front of the navel
        rShoulder: [-0.72 - lift, 0.1, 0.3], rElbow: [-1.05, 0, 0], rWrist: [-0.55 - lift * 0.5, 0, 0.1 + aim * 0.5],
        lShoulder: [-0.62 - lift, -0.15, -0.28], lElbow: [-1.25, 0, 0], lWrist: [-0.3, 0, -0.3],
        rHip: [-0.62, 0, -0.1], rKnee: [0.62 + w * 0.04, 0, 0], rAnkle: [0.05, 0, 0],
        lHip: [0.42, 0.2, 0.14], lKnee: [0.5 - w * 0.04, 0, 0], lAnkle: [-0.2, 0, 0],
      });
      f.root.position.y = -0.075 - Math.abs(w) * 0.01 + b * 0.004;
      head.rotation.y = Math.sin(t * 0.4) * 0.4;
      tail.rotation.z = 0.4 + Math.sin(t * 1.3) * 0.2;
    });
  }

  /** 3 — arms open, head bowed, filmed from the floor. */
  private buildAscension() {
    const f = new Figure({ build: "heavy", hair: "locs", material: this.ink, seed: 11 });
    f.root.position.set(0, 0, -54);
    this.scene.add(f.root);
    this.animators.push((t) => {
      const b = Math.sin(t * 0.9);
      f.setPose({
        lShoulder: [-0.1, 0, 1.38 + b * 0.03], rShoulder: [-0.1, 0, -1.38 - b * 0.03],
        lElbow: [-0.2, 0, 0.08], rElbow: [-0.2, 0, -0.08],
        lWrist: [0, 0, 0.35], rWrist: [0, 0, -0.35],
        chest: [-0.06 - b * 0.02, 0, 0], head: [0.5 + b * 0.03, 0, 0], neck: [0.12, 0, 0],
        lHip: [0, 0, 0.05], rHip: [0, 0, -0.05],
      });
    });
  }

  /** 4 — one woman, and the army waiting behind her. */
  private buildLegion() {
    const lead = new Figure({ build: "female", hair: "bob", material: this.ink, seed: 5 });
    lead.root.position.set(-0.45, 0, -71);
    lead.root.rotation.y = 0.15;
    lead.setPose({ lShoulder: [0, 0, 0.12], rShoulder: [0, 0, -0.12], head: [0.12, 0, 0], lHip: [0, 0, 0.04], rHip: [0, 0, -0.04] });
    this.scene.add(lead.root);
    this.animators.push((t) => {
      lead.joints.chest.rotation.x = Math.sin(t * 1.1) * 0.015;
      lead.joints.head.rotation.y = Math.sin(t * 0.3) * 0.08;
    });

    const variants: THREE.BufferGeometry[] = [];
    const r = rng(99);
    const builds = ["slender", "heavy", "slender", "female", "heavy", "slender"] as const;
    const hairs = ["spiky", "none", "tied", "bob", "spiky", "none"] as const;
    for (let v = 0; v < 12; v++) {
      const fig = new Figure({ build: builds[v % 6], hair: hairs[(v + 1) % 6], material: this.ink, seed: v });
      const pose: Pose = {
        lShoulder: [(r() - 0.5) * 0.3, 0, 0.1 + r() * 0.2], rShoulder: [(r() - 0.5) * 0.3, 0, -0.1 - r() * 0.2],
        head: [(r() - 0.3) * 0.3, (r() - 0.5) * 0.5, 0], lHip: [0, 0, 0.06], rHip: [0, 0, -0.06],
      };
      const kind = v % 6;
      if (kind === 0 || kind === 4) {
        // spear, butt on the ground
        pose.rShoulder = [-0.45, 0, -0.1];
        pose.rElbow = [-1.25, 0, 0];
        const s = spear(this.ink);
        s.rotation.x = 1.7;
        s.position.y = -0.08;
        fig.attach("rWrist", s);
      } else if (kind === 1) {
        // curved sabre raised
        pose.rShoulder = [-2.65, 0, -0.25];
        pose.rElbow = [-0.35, 0, 0];
        const sc = scimitar(this.ink);
        sc.rotation.y = Math.PI / 2;
        sc.position.y = -0.06;
        fig.attach("rWrist", sc);
        const sh = shield(this.ink);
        sh.position.set(0.06, -0.14, 0);
        fig.attach("lElbow", sh);
        pose.lShoulder = [-0.5, 0, 0.25];
        pose.lElbow = [-1.3, 0, 0];
      } else if (kind === 2) {
        // archer: bow arm out, string hand drawn to the cheek
        pose.lShoulder = [-1.5, 0, 0.12];
        pose.lElbow = [0, 0, 0];
        pose.rShoulder = [-1.45, 0, -0.55];
        pose.rElbow = [-2.1, 0, 0];
        pose.chest = [0, 0.5, 0];
        pose.head = [0, 0.9, 0];
        fig.attach("lWrist", bow(this.ink));
      } else if (kind === 3) {
        const sh = shield(this.ink);
        sh.position.set(0.06, -0.14, 0);
        fig.attach("lElbow", sh);
        pose.lShoulder = [-0.35, 0, 0.2];
        pose.lElbow = [-1.4, 0, 0];
      }
      fig.setPose(pose);
      variants.push(fig.bake());
    }
    for (let i = 0; i < 70; i++) {
      const z = -74 - r() * 20;
      const x = (r() - 0.5) * (8 + (-74 - z) * 0.9);
      if (Math.abs(x) < 0.9 && z > -78) continue;
      const m = new THREE.Mesh(variants[i % variants.length], this.ink);
      m.position.set(x, 0, z);
      m.rotation.y = (r() - 0.5) * 0.6;
      m.scale.setScalar(0.95 + r() * 0.15);
      this.scene.add(m);
    }
  }

  /**
   * 5 — two bodies colliding mid-air. Scroll is the clock: they close in,
   * trailing afterimages, strain, meet, and the air rings with the impact.
   */
  private buildCollision() {
    const a = new Figure({ build: "slender", hair: "spiky", material: this.ink, seed: 21 });
    const b = new Figure({ build: "slender", hair: "spiky", material: this.ink, seed: 22 });
    a.setPose({
      hips: [0.25, 0, 0.35], lHip: [-1.45, 0, 0.1], lKnee: [0.15, 0, 0], rHip: [0.7, 0, -0.1], rKnee: [1.7, 0, 0],
      lShoulder: [-0.4, 0, 1.25], rShoulder: [0.9, 0, -1.0], rElbow: [-1.1, 0, 0], lElbow: [-0.3, 0, 0],
      chest: [0.25, 0.35, 0], head: [-0.15, 0.3, 0],
    });
    b.setPose({
      rShoulder: [-2.75, 0, -0.1], rElbow: [-0.25, 0, 0], lShoulder: [0.5, 0, 0.55], lElbow: [-1.9, 0, 0],
      lHip: [-1.1, 0, 0.1], lKnee: [1.5, 0, 0], rHip: [0.55, 0, -0.05], rKnee: [1.0, 0, 0],
      chest: [-0.25, -0.35, 0], head: [-0.4, 0, 0], hips: [-0.15, 0, 0],
    });
    this.scene.add(a.root, b.root);

    // Afterimages: the same pose, baked, lagging behind on the trajectory.
    const ghostsA: THREE.Mesh[] = [], ghostsB: THREE.Mesh[] = [];
    const ga = a.bake(), gb = b.bake();
    for (let i = 1; i <= 4; i++) {
      const mk = (g: THREE.BufferGeometry) => {
        const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x151515, transparent: true, opacity: 0, depthWrite: false }));
        this.scene.add(m);
        return m;
      };
      ghostsA.push(mk(ga));
      ghostsB.push(mk(gb));
    }

    const A_HIT = new THREE.Vector3(0.62, 1.95, -100.0), B_HIT = new THREE.Vector3(-0.1, 1.2, -99.05);
    const A_FROM = new THREE.Vector3(2.9, 2.9, -101.6), B_FROM = new THREE.Vector3(-2.2, 0.2, -97.7);
    const A_ROT = new THREE.Euler(0.1, -2.3, 0.12), B_ROT = new THREE.Euler(-0.1, 0.8, -0.05);
    const impact = new THREE.Vector3().lerpVectors(A_HIT, B_HIT, 0.5);

    const rings = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), new THREE.MeshBasicMaterial({ color: 0x1a1a1a, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.position.copy(impact);
      this.scene.add(m);
      return m;
    });
    const N = 160;
    const dirs = new Float32Array(N * 3);
    const pr = rng(5);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(pr() - 0.5, (pr() - 0.5) * 0.6, pr() - 0.5).normalize().multiplyScalar(0.6 + pr() * 1.8);
      dirs.set([v.x, v.y, v.z], i * 3);
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    const dustMat = new THREE.PointsMaterial({ color: 0x222222, size: 0.035, transparent: true, opacity: 0, depthWrite: false });
    const burst = new THREE.Points(dustGeo, dustMat);
    burst.frustumCulled = false;
    this.scene.add(burst);

    const place = (fig: THREE.Object3D, from: THREE.Vector3, hit: THREE.Vector3, rot: THREE.Euler, s: number, k: number, recoil: THREE.Vector3, spin: number) => {
      const e = 1 - Math.pow(1 - s, 2.4);
      fig.position.lerpVectors(from, hit, e).addScaledVector(recoil, k);
      fig.rotation.set(rot.x + spin * k * 0.6, rot.y + (1 - e) * 0.35 * Math.sign(spin), rot.z + spin * k);
    };

    let wasHit = false;
    this.animators.push((t) => {
      const p = this.focus === 5 ? 5.05 : this.progress;
      const s = THREE.MathUtils.clamp((p - 4.5) / 0.55, 0, 1);      // approach
      const k = THREE.MathUtils.clamp((p - 5.05) / 0.5, 0, 1);       // aftermath
      const strain = Math.pow(s, 6) * (1 - k) * 0.012;                // the last centimetres fight back
      const jit = (seed: number) => Math.sin(t * 47 + seed) * strain;

      place(a.root, A_FROM, A_HIT, A_ROT, s, k, new THREE.Vector3(0.7, 0.45, -0.35), 0.5);
      place(b.root, B_FROM, B_HIT, B_ROT, s, k, new THREE.Vector3(-0.55, -0.55, 0.3), -0.45);
      a.root.position.x += jit(1); a.root.position.y += jit(2);
      b.root.position.x += jit(3); b.root.position.y += jit(4);
      const hover = (1 - s) * Math.sin(t * 0.8) * 0.05;
      a.root.position.y += hover; b.root.position.y -= hover;

      ghostsA.forEach((g, i) => {
        const sg = Math.max(0, s - (i + 1) * 0.06);
        place(g, A_FROM, A_HIT, A_ROT, sg, 0, new THREE.Vector3(), 0.5);
        (g.material as THREE.MeshBasicMaterial).opacity = (0.3 - i * 0.065) * Math.min(1, s * 8) * (1 - k) * (s < 1 ? 1 : 0.4);
      });
      ghostsB.forEach((g, i) => {
        const sg = Math.max(0, s - (i + 1) * 0.06);
        place(g, B_FROM, B_HIT, B_ROT, sg, 0, new THREE.Vector3(), -0.45);
        (g.material as THREE.MeshBasicMaterial).opacity = (0.3 - i * 0.065) * Math.min(1, s * 8) * (1 - k) * (s < 1 ? 1 : 0.4);
      });

      // shockwave
      rings.forEach((m, i) => {
        const kk = THREE.MathUtils.clamp(k * 1.6 - i * 0.25, 0, 1);
        m.lookAt(this.camera.position);
        m.scale.setScalar(0.05 + kk * (3.2 + i * 1.5));
        (m.material as THREE.MeshBasicMaterial).opacity = kk > 0 ? Math.pow(1 - kk, 1.5) * 0.45 : 0;
      });
      const pos = dustGeo.attributes.position as THREE.BufferAttribute;
      const kd = 1 - Math.pow(1 - k, 3);
      for (let i = 0; i < N; i++) pos.setXYZ(i, impact.x + dirs[i * 3] * kd, impact.y + dirs[i * 3 + 1] * kd - k * k * 0.3, impact.z + dirs[i * 3 + 2] * kd);
      pos.needsUpdate = true;
      dustMat.opacity = k > 0 ? (1 - k) * 0.8 : 0;

      const hit = p >= 5.05;
      if (hit && !wasHit) { this.pulse(0.35); this.shake = 1; }
      wasHit = hit;
    });
  }

  /**
   * 6 — Disciplines: a lateral tracking shot across five small dioramas,
   * one per craft. The DOM tells us which one is being read.
   */
  private buildDisciplines() {
    const Z = VIGNETTE_Z;
    const at = (i: number) => new THREE.Vector3(vignetteX(i), 0, Z);
    const weight = (i: number) => Math.max(0, 1 - Math.abs(this.discipline - i));
    const r = rng(77);

    // 0 · Spatial films — a walker on a strip of light, a crane shot following her.
    {
      const o = at(0);
      const walker = new Figure({ build: "female", hair: "bob", material: this.ink, seed: 61 });
      walker.root.position.copy(o).add(new THREE.Vector3(0.4, 0, 0));
      walker.root.rotation.y = -Math.PI / 2;
      this.scene.add(walker.root);
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(7, 0.35), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
      strip.rotation.x = -Math.PI / 2;
      strip.position.copy(o).add(new THREE.Vector3(0, 0.01, 0));
      this.scene.add(strip);
      const crane = new THREE.Group();
      const mast = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 0.1), this.ink);
      mast.position.y = 1.1;
      const arm = new THREE.Group();
      arm.position.y = 2.2;
      const boom = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.07, 0.07), this.ink);
      boom.position.x = 1.0;
      const cam = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.2), this.ink);
      cam.position.set(2.55, -0.18, 0);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.16, 12), this.ink);
      lens.rotation.z = Math.PI / 2;
      lens.position.set(2.8, -0.18, 0);
      const counter = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.ink);
      counter.position.x = -0.55;
      arm.add(boom, cam, lens, counter);
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.9), this.ink);
      base.position.y = 0.06;
      crane.add(mast, arm, base);
      crane.position.copy(o).add(new THREE.Vector3(-0.3, 0, -1.6));
      this.scene.add(crane);
      this.animators.push((t) => {
        const w = weight(0);
        walker.setPose(walker.walk(t * 2.2, 0.85));
        walker.root.position.x = o.x + 1.2 - ((t * 0.35) % 2.6);
        arm.rotation.y = Math.sin(t * 0.35) * 0.5 - 0.9;
        arm.rotation.z = Math.sin(t * 0.25) * 0.08;
        crane.visible = walker.root.visible = w > 0 || this.progress < 6.8;
      });
    }

    // 1 · Architectural visualisation — a pavilion assembling itself when you look at it.
    {
      const o = at(1);
      const parts: { m: THREE.Mesh; y: number; delay: number }[] = [];
      const add = (w: number, h: number, d: number, x: number, y: number, z: number, delay: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.ink);
        m.position.set(o.x + x, y, o.z + z);
        this.scene.add(m);
        parts.push({ m, y, delay });
      };
      add(5.2, 0.18, 3.4, 0, 0.09, 0, 0);
      for (const [x, z] of [[-2.1, -1.2], [2.1, -1.2], [-2.1, 1.2], [2.1, 1.2], [0, -1.2]]) add(0.16, 2.6, 0.16, x, 1.48, z, 0.12);
      add(4.2, 2.4, 0.12, -0.2, 1.38, -1.45, 0.25);
      add(6.4, 0.16, 4.0, 0.5, 2.86, 0.1, 0.45);
      for (let i = 0; i < 6; i++) add(1.1, 0.09, 0.28, 2.4 + 0.25, 0.14 + i * 0.1, 1.9 - i * 0.28, 0.05 + i * 0.03);
      const scale = new Figure({ build: "slender", hair: "none", material: this.ink, seed: 62 });
      scale.root.position.set(o.x - 0.6, 0.18, o.z + 0.4);
      scale.root.rotation.y = 0.6;
      scale.setPose({ head: [0.35, 0.2, 0], lShoulder: [0, 0, 0.05], rShoulder: [0, 0, -0.05] });
      this.scene.add(scale.root);
      this.animators.push(() => {
        const w = THREE.MathUtils.smoothstep(weight(1), 0.1, 0.9);
        for (const p of parts) {
          const local = THREE.MathUtils.clamp((w - p.delay) / (1 - p.delay), 0, 1);
          const e = 1 - Math.pow(1 - local, 3);
          p.m.position.y = p.y - (1 - e) * 6;
          p.m.visible = e > 0.001 || this.progress < 5.5;
        }
      });
    }

    // 2 · Real-time worlds — a field of pillars rippling live around a figure.
    {
      const o = at(2);
      const G = 15, S = 0.34;
      const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(S * 0.86, 1, S * 0.86), this.ink, G * G);
      inst.frustumCulled = false;
      const m4 = new THREE.Matrix4();
      const standing = new Figure({ build: "slender", hair: "spiky", material: this.ink, seed: 63 });
      standing.root.position.copy(o);
      standing.root.rotation.y = 0.4;
      standing.setPose({ head: [-0.3, 0, 0], lShoulder: [0, 0, 0.2], rShoulder: [0, 0, -0.2] });
      this.scene.add(inst, standing.root);
      this.animators.push((t) => {
        const w = weight(2);
        const mx = (this.mouseSmooth.x - 0.5) * 4, mz = (0.5 - this.mouseSmooth.y) * 3;
        let i = 0;
        for (let gx = 0; gx < G; gx++)
          for (let gz = 0; gz < G; gz++) {
            const x = (gx - (G - 1) / 2) * S, z = (gz - (G - 1) / 2) * S;
            const d = Math.hypot(x, z);
            const dm = Math.hypot(x - mx, z - mz);
            let h = 0.06 + (0.2 + 0.2 * Math.sin(d * 3.2 - t * 2.2)) * w + Math.exp(-dm * dm) * 0.75 * w;
            if (d < 0.5) h = 0.02;
            m4.makeScale(1, h, 1).setPosition(o.x + x, h / 2, o.z + z);
            inst.setMatrixAt(i++, m4);
          }
        inst.instanceMatrix.needsUpdate = true;
      });
    }

    // 3 · Crowd & simulation — tiny walkers circulating like a weather system.
    {
      const o = at(3);
      const baked: THREE.BufferGeometry[] = [];
      for (let v = 0; v < 4; v++) {
        const f = new Figure({ build: v % 2 ? "female" : "slender", hair: v === 1 ? "bob" : "none", material: this.ink, seed: 70 + v });
        f.setPose(f.walk(v * 1.57, 0.9));
        baked.push(f.bake());
      }
      const walkers = Array.from({ length: 46 }, (_, i) => {
        const m = new THREE.Mesh(baked[i % 4], this.ink);
        m.scale.setScalar(0.5);
        this.scene.add(m);
        return { m, lane: 1.1 + r() * 2.4, speed: (0.18 + r() * 0.15) * (r() > 0.25 ? 1 : -1), off: r() * Math.PI * 2 };
      });
      this.animators.push((t) => {
        const w = 0.35 + weight(3) * 0.65;
        for (const k of walkers) {
          const a = k.off + t * k.speed * w;
          const lane = k.lane + Math.sin(a * 3 + k.off) * 0.15;
          k.m.position.set(o.x + Math.cos(a) * lane, Math.abs(Math.sin(t * 6 + k.off)) * 0.012, o.z + Math.sin(a) * lane * 0.7);
          k.m.rotation.y = -a + (k.speed > 0 ? Math.PI : 0);
        }
      });
    }

    // 4 · Title sequences — a 2.39:1 frame, a body frozen mid-leap, credits sliding in.
    {
      const o = at(4);
      const W = 5.2, H = W / 2.39, y0 = 0.9;
      const bar = (w: number, h: number, x: number, y: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), this.ink);
        m.position.set(o.x + x, y, o.z - 0.6);
        this.scene.add(m);
        return m;
      };
      bar(W + 0.12, 0.06, 0, y0 + H);
      bar(W + 0.12, 0.06, 0, y0);
      bar(0.06, H, -W / 2, y0 + H / 2);
      bar(0.06, H, W / 2, y0 + H / 2);
      const credits = [0.9, 1.6, 1.2].map((w, i) => {
        const m = bar(w, 0.07, 0, y0 + 0.35 + i * 0.16);
        m.position.x = o.x - W / 2 + 0.4 + w / 2;
        return { m, w };
      });
      const leap = new Figure({ build: "slender", hair: "spiky", material: this.ink, seed: 64 });
      leap.setPose({
        hips: [0.3, 0, 0], lHip: [-1.3, 0, 0.1], lKnee: [0.2, 0, 0], rHip: [0.9, 0, 0], rKnee: [1.4, 0, 0],
        lShoulder: [-2.6, 0, 0.3], rShoulder: [0.8, 0, -0.5], rElbow: [-0.6, 0, 0], chest: [0.2, 0, 0], head: [-0.2, 0, 0],
      });
      leap.root.rotation.y = Math.PI / 2;
      this.scene.add(leap.root);
      this.animators.push((t) => {
        const w = weight(4);
        leap.root.position.set(o.x + 0.9, y0 + 0.05 + Math.sin(t * 0.6) * 0.04 + (1 - w) * -0.3, o.z - 0.3);
        credits.forEach(({ m, w: cw }, i) => {
          const s = THREE.MathUtils.clamp(w * 1.6 - i * 0.2, 0.001, 1);
          m.scale.x = 1 - Math.pow(1 - s, 3);
          m.position.x = o.x - W / 2 + 0.4 + (cw * m.scale.x) / 2;
        });
      });
    }
  }

  /** 7 — someone walks back out of the light, toward us. */
  private buildExit() {
    const f = new Figure({ build: "slender", hair: "spiky", material: this.ink, seed: 41 });
    this.scene.add(f.root);
    this.animators.push(() => {
      f.setPose(f.walk(this.walkPhase, 0.8, { head: [0.08, 0, 0] }));
      f.root.position.set(0, f.walkBob(this.walkPhase, 0.8), -147);
    });
  }

  // ───────────────────────────────────────────── control

  setProgress(p: number) {
    this.target = THREE.MathUtils.clamp(p, 0, STATIONS.length - 1);
  }

  /** 0..4, continuous: which discipline diorama the camera should frame. */
  setDiscipline(d: number) {
    this.disciplineTarget = THREE.MathUtils.clamp(d, 0, 4);
  }

  setVelocity(v: number) {
    this.velocity = v;
  }

  setPointer(x: number, y: number) {
    this.mouse.set(x / window.innerWidth, 1 - y / window.innerHeight);
    this.lens = 1;
    this.pointerSeen = true;
  }

  setFocus(i: number | null) {
    this.focus = i;
    if (i !== null) this.focusIndex = i;
  }

  pulse(amount = 1) {
    this.flash = Math.max(this.flash, amount);
  }

  /** Pointer parallax stays off until the preloader hands over, so the portal holds still. */
  reveal() {
    this.revealed = true;
  }

  /** Screen rectangle (px) of the first portal, for the preloader to land on. */
  portalRect() {
    const c = PORTALS[0], W = 3.2, H = 6;
    this.camera.updateMatrixWorld();
    const a = new THREE.Vector3(c.x - W / 2, c.y + H / 2, c.z).project(this.camera);
    const b = new THREE.Vector3(c.x + W / 2, c.y - H / 2, c.z).project(this.camera);
    const x0 = ((a.x + 1) / 2) * window.innerWidth, y0 = ((1 - a.y) / 2) * window.innerHeight;
    const x1 = ((b.x + 1) / 2) * window.innerWidth, y1 = ((1 - b.y) / 2) * window.innerHeight;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  get stationCount() {
    return STATIONS.length;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio, w < 768 ? 1.25 : 1.6);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
    this.camera.aspect = w / h;
    // Keep figures framed on portrait screens.
    this.camera.fov = w / h < 0.8 ? 58 : 38;
    this.camera.updateProjectionMatrix();
    (this.post.uniforms.uRes.value as THREE.Vector2).set(w * pr, h * pr);
    this.dust.uniforms.uPx.value = 2.2 * pr;
  }

  private stationAt(p: number, cam: THREE.Vector3, look: THREE.Vector3, fog: THREE.Color, floor: THREE.Color) {
    const i = Math.min(Math.floor(p), STATIONS.length - 2);
    const t = p - i;
    // Dwell at each station, travel in between.
    const e = t * t * t * (t * (t * 6 - 15) + 10);
    const a = STATIONS[i], b = STATIONS[i + 1];
    cam.lerpVectors(a.cam, b.cam, e);
    look.lerpVectors(a.look, b.look, e);
    fog.lerpColors(a.fog, b.fog, e);
    floor.lerpColors(a.floor, b.floor, e);
    return {
      near: THREE.MathUtils.lerp(a.near, b.near, e),
      far: THREE.MathUtils.lerp(a.far, b.far, e),
      rays: THREE.MathUtils.lerp(a.rays, b.rays, e),
    };
  }

  private applyStation(p: number) {
    const fog = new THREE.Color(), floor = new THREE.Color();
    const s = this.stationAt(p, this.tmpCam, this.tmpLook, fog, floor);
    this.camera.position.copy(this.tmpCam);
    this.camera.lookAt(this.tmpLook);
    this.fog.color.copy(fog);
    this.fog.near = s.near;
    this.fog.far = s.far;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    this.elapsed += dt;
    const t = this.elapsed;

    const k = 1 - Math.exp(-dt * (this.reduced ? 20 : 3.2));
    this.progress += (this.target - this.progress) * k;
    this.focusBlend += ((this.focus !== null ? 1 : 0) - this.focusBlend) * (1 - Math.exp(-dt * 2.4));
    this.walkPhase += dt * (2.1 + Math.min(Math.abs(this.velocity) * 0.25, 3));

    this.discipline += (this.disciplineTarget - this.discipline) * (1 - Math.exp(-dt * 2.2));
    const dx = vignetteX(this.discipline);
    STATIONS[6].cam.set(dx - 2.2, 3.4, VIGNETTE_Z + 11.5);
    STATIONS[6].look.set(dx - 1.9, 0.9, VIGNETTE_Z);

    const cam = this.tmpCam, look = this.tmpLook;
    const fog = new THREE.Color(), floor = new THREE.Color();
    const s = this.stationAt(this.progress, cam, look, fog, floor);

    if (this.focusBlend > 0.001) {
      const st = STATIONS[this.focusIndex];
      const dir = st.look.clone().sub(st.cam).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const fc = st.cam.clone().addScaledVector(dir, -0.3).addScaledVector(right, -0.95);
      const fl = st.look.clone().addScaledVector(right, -0.95);
      const e = this.focusBlend * this.focusBlend * (3 - 2 * this.focusBlend);
      cam.lerp(fc, e);
      look.lerp(fl, e);
      fog.lerp(st.fog, e);
      floor.lerp(st.floor, e);
      s.near = THREE.MathUtils.lerp(s.near, st.near, e);
      s.far = THREE.MathUtils.lerp(s.far, st.far, e);
      s.rays = THREE.MathUtils.lerp(s.rays, st.rays, e);
    }

    // Pointer parallax: the camera leans, never swings.
    if (this.revealed) this.mouseSmooth.lerp(this.mouse, 1 - Math.exp(-dt * 3));
    const mx = this.mouseSmooth.x - 0.5, my = this.mouseSmooth.y - 0.5;
    if (!this.reduced) {
      const dir = look.clone().sub(cam).normalize();
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      cam.addScaledVector(right, mx * 0.35).add(new THREE.Vector3(0, my * 0.18, 0));
      cam.y += Math.sin(t * 0.5) * 0.02;
    }
    this.shake *= Math.exp(-dt * 5);
    if (this.shake > 0.001) cam.add(new THREE.Vector3(Math.sin(t * 61), Math.cos(t * 53), 0).multiplyScalar(this.shake * 0.05));
    this.camera.position.copy(cam);
    this.camera.lookAt(look);
    this.camera.rotateZ(-mx * 0.012);

    this.fog.color.copy(fog);
    this.fog.near = s.near;
    this.fog.far = s.far;
    (this.scene.background as THREE.Color).copy(fog);
    this.floorMat.color.copy(floor);

    const lum = fog.r * 0.3 + fog.g * 0.59 + fog.b * 0.11;
    const sheet = fog.clone().lerp(new THREE.Color(1, 1, 1), lum > 0.5 ? 0.35 : 0.08);
    if (lum < 0.5) sheet.offsetHSL(0, 0, 0.05);
    // In the dark the haze is lit by the portal (adds light); in the white it veils (covers).
    const additive = lum < 0.5;
    for (const m of this.fogPlanes) {
      m.uniforms.uTime.value = t;
      (m.uniforms.uColor.value as THREE.Color).copy(additive ? sheet.clone().multiplyScalar(0.9) : sheet);
      const b = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (m.blending !== b) { m.blending = b; m.needsUpdate = true; }
    }
    const iu = this.ink.uniforms;
    (iu.uRimColor.value as THREE.Color).copy(additive ? new THREE.Color(0.3, 0.3, 0.3) : fog);
    iu.uRim.value = additive ? 0.4 : 0.22;
    this.dust.uniforms.uTime.value = t;
    (this.dust.uniforms.uColor.value as THREE.Color).setScalar(lum > 0.5 ? 0.25 : 0.85);
    for (const g of this.glows) {
      if (g.uniforms.uTime) g.uniforms.uTime.value = t;
      g.uniforms.uIntensity.value = lum > 0.5 ? 0.15 : 1;
    }

    for (const a of this.animators) a(t, dt);

    // Light source for scattering = whichever portal is ahead of us.
    const portal = cam.z > PORTALS[0].z ? PORTALS[0] : PORTALS[1];
    const sp = portal.clone().project(this.camera);
    const ahead = sp.z < 1;
    (this.post.uniforms.uLight.value as THREE.Vector2).set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    this.post.uniforms.uRays.value = ahead ? s.rays : 0;

    // Crossing a portal plane floods the frame.
    let cross = 0;
    for (const p of PORTALS) cross = Math.max(cross, 1 - THREE.MathUtils.smoothstep(Math.abs(cam.z - p.z), 0, 3.5));
    this.flash = Math.max(this.flash * Math.exp(-dt * 2.5), 0);
    this.lens += ((this.reduced || !this.pointerSeen ? 0 : 0.55) - this.lens) * (1 - Math.exp(-dt * 1.2));

    this.fade += ((this.fade > 0 ? 1 : 0) - this.fade) * (1 - Math.exp(-dt * 1.4));

    const u = this.post.uniforms;
    u.uTime.value = t;
    (u.uMouse.value as THREE.Vector2).copy(this.mouseSmooth);
    u.uLens.value = this.lens;
    u.uVel.value += (THREE.MathUtils.clamp(this.velocity / 40, -1, 1) - u.uVel.value) * 0.1;
    u.uFlash.value = Math.min(1, Math.max(this.flash, cross * 0.85));
    u.uFade.value = this.fade;

    this.renderer.setRenderTarget(this.rt);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.rt.dispose();
  }
}
