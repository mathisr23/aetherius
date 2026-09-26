import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Articulated silhouette. Every body part is a *loft*: a stack of elliptical
 * rings with its own profile (calf bulge, waist, ribcage, skull), so the outline
 * reads as one continuous surface instead of stacked primitives.
 * Facing +Z by default. Arms/legs hang along -Y from their joint.
 */

export type Build = "slender" | "female" | "heavy";
export type Hair = "spiky" | "bob" | "locs" | "tied" | "none";

export type Joint =
  | "hips" | "spine" | "chest" | "neck" | "head"
  | "lShoulder" | "lElbow" | "lWrist"
  | "rShoulder" | "rElbow" | "rWrist"
  | "lHip" | "lKnee" | "lAnkle"
  | "rHip" | "rKnee" | "rAnkle";

export type Pose = Partial<Record<Joint, [number, number, number]>>;

interface Dims {
  shoulderW: number; hipW: number;
  hip: number; waist: number; rib: number; chest: number; depth: number; bust: number; trap: number;
  arm: number; fore: number; thigh: number; shin: number; headR: number; neck: number;
  upperArm: number; forearm: number; thighLen: number; shinLen: number;
}

const BUILDS: Record<Build, Dims> = {
  slender: { shoulderW: 0.19, hipW: 0.09, hip: 0.15, waist: 0.125, rib: 0.155, chest: 0.175, depth: 0.68, bust: 0, trap: 1,
    arm: 0.046, fore: 0.04, thigh: 0.078, shin: 0.052, headR: 0.1, neck: 0.043, upperArm: 0.29, forearm: 0.26, thighLen: 0.44, shinLen: 0.43 },
  female: { shoulderW: 0.165, hipW: 0.095, hip: 0.172, waist: 0.112, rib: 0.132, chest: 0.148, depth: 0.7, bust: 0.028, trap: 0.8,
    arm: 0.038, fore: 0.032, thigh: 0.08, shin: 0.05, headR: 0.097, neck: 0.036, upperArm: 0.28, forearm: 0.25, thighLen: 0.45, shinLen: 0.44 },
  heavy: { shoulderW: 0.265, hipW: 0.1, hip: 0.165, waist: 0.15, rib: 0.215, chest: 0.25, depth: 0.62, bust: 0.012, trap: 1.7,
    arm: 0.074, fore: 0.058, thigh: 0.094, shin: 0.064, headR: 0.1, neck: 0.066, upperArm: 0.31, forearm: 0.27, thighLen: 0.45, shinLen: 0.44 },
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [y, rx, rz, zOffset, xOffset] */
type Ring = [number, number, number, number?, number?];

/** Skin a list of elliptical rings (ordered along Y) into a closed smooth surface. */
export function loft(rings: Ring[], seg = 20): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (const [y, rx, rz, zo = 0, xo = 0] of rings) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2;
      pos.push(xo + Math.cos(a) * rx, y, zo + Math.sin(a) * rz);
    }
  }
  const n = rings.length;
  for (let i = 0; i < n - 1; i++)
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg);
      const c = a + seg, d = b + seg;
      idx.push(a, c, b, b, c, d);
    }
  // caps
  const cap = (ring: number, flip: boolean) => {
    const [y, , , zo = 0, xo = 0] = rings[ring];
    const center = pos.length / 3;
    pos.push(xo, y, zo);
    for (let j = 0; j < seg; j++) {
      const a = ring * seg + j, b = ring * seg + ((j + 1) % seg);
      if (flip) idx.push(center, b, a);
      else idx.push(center, a, b);
    }
  };
  cap(0, false);
  cap(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * A limb hanging from its joint: profile samples [t along length 0..1, rx, rz, zOffset].
 * Ends are rounded automatically so joints overlap without seams.
 */
function limbRings(len: number, prof: [number, number, number, number?][], dir = -1): Ring[] {
  const first = prof[0], last = prof[prof.length - 1];
  const out: Ring[] = [];
  const r0 = Math.max(first[1], first[2]);
  out.push([dir * -r0 * 0.95, first[1] * 0.25, first[2] * 0.25, first[3] ?? 0]);
  out.push([dir * -r0 * 0.7, first[1] * 0.72, first[2] * 0.72, first[3] ?? 0]);
  for (const [t, rx, rz, zo = 0] of prof) out.push([dir * t * len, rx, rz, zo]);
  const r1 = Math.max(last[1], last[2]);
  out.push([dir * (len + r1 * 0.7), last[1] * 0.72, last[2] * 0.72, last[3] ?? 0]);
  out.push([dir * (len + r1 * 0.95), last[1] * 0.25, last[2] * 0.25, last[3] ?? 0]);
  return dir < 0 ? out.reverse() : out;
}

export class Figure {
  readonly root = new THREE.Group();
  readonly joints = {} as Record<Joint, THREE.Group>;
  readonly hipHeight: number;
  private mat: THREE.Material;
  private d: Dims;

  constructor(opts: { build?: Build; hair?: Hair; material: THREE.Material; seed?: number }) {
    const d = (this.d = BUILDS[opts.build ?? "slender"]);
    this.mat = opts.material;
    const J = (name: Joint, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      this.joints[name] = g;
      return g;
    };
    const dz = d.depth;

    this.hipHeight = d.thighLen + d.shinLen + 0.08;
    const hips = J("hips", this.root, 0, this.hipHeight, 0);
    // Pelvis: crotch → hips → lower belly. Glutes push the back out.
    this.mesh(hips, loft([
      [-0.13, 0.04, 0.035, -0.005],
      [-0.1, d.hip * 0.72, d.hip * 0.62, -0.01],
      [-0.05, d.hip * 0.97, d.hip * 0.74, -0.018],
      [0.0, d.hip, d.hip * 0.72, -0.012],
      [0.06, (d.hip + d.waist) / 2, d.waist * 0.8, 0],
      [0.13, d.waist * 0.9, d.waist * 0.7, 0.004],
    ]));

    const spine = J("spine", hips, 0, 0.05, 0);
    this.mesh(spine, loft([
      [-0.05, d.waist * 0.95, d.waist * 0.72, 0.004],
      [0.03, d.waist * 1.04, d.waist * 0.79, 0.004],
      [0.1, d.waist, d.waist * 0.76, 0.006],
      [0.22, d.waist * 1.02, d.waist * 0.78, 0.004],
    ]));

    const chest = J("chest", spine, 0, 0.19, 0);
    const bust = d.bust;
    this.mesh(chest, loft([
      [-0.04, d.waist * 1.0, d.waist * 0.76, 0.004],
      [0.04, (d.waist + d.rib) / 2, d.rib * dz, 0.006],
      [0.12, d.rib, d.rib * dz + bust * 0.6, 0.01 + bust * 0.5],
      [0.18, d.chest, d.chest * dz * 0.95 + bust, 0.012 + bust * 0.6],
      [0.235, d.shoulderW * 0.98, d.chest * dz * 0.85, 0.004],
      [0.275, d.shoulderW * 0.94, d.chest * dz * 0.7, -0.008],
      [0.305, d.shoulderW * 0.62, d.neck * 2.1 * Math.min(1.3, d.trap), -0.012],
      [0.33, d.neck * (1.2 + d.trap * 0.5), d.neck * 1.4, -0.01],
      [0.345, d.neck * 1.1, d.neck * 1.05, -0.006],
    ]));

    const neck = J("neck", chest, 0, 0.3, 0);
    this.mesh(neck, loft([
      [-0.02, d.neck * 1.15, d.neck * 1.1, -0.004],
      [0.05, d.neck, d.neck * 1.02, 0.002],
      [0.11, d.neck * 0.95, d.neck, 0.006],
    ]));

    const head = J("head", neck, 0, 0.075, 0);
    const h = d.headR / 0.1;
    this.mesh(head, loft([
      [0.0 * h, 0.022 * h, 0.02 * h, 0.05 * h],
      [0.012 * h, 0.042 * h, 0.035 * h, 0.042 * h],   // chin
      [0.045 * h, 0.064 * h, 0.07 * h, 0.022 * h],    // jaw
      [0.09 * h, 0.074 * h, 0.088 * h, 0.006 * h],    // cheekbones
      [0.14 * h, 0.082 * h, 0.1 * h, -0.006 * h],     // temples
      [0.19 * h, 0.076 * h, 0.094 * h, -0.012 * h],   // crown
      [0.225 * h, 0.052 * h, 0.066 * h, -0.012 * h],
      [0.243 * h, 0.018 * h, 0.022 * h, -0.01 * h],
    ], 22));
    this.hair(head, opts.hair ?? "none", h, rng(opts.seed ?? 7));

    const sy = 0.255;
    for (const side of [1, -1] as const) {
      const p = side === 1 ? "l" : "r";
      const sh = J(`${p}Shoulder` as Joint, chest, side * (d.shoulderW - d.arm * 0.6), sy, 0);
      // Upper arm: deltoid cap, bicep swell, narrow elbow.
      this.mesh(sh, loft(limbRings(d.upperArm, [
        [0.0, d.arm * 1.35, d.arm * 1.3],
        [0.12, d.arm * 1.22, d.arm * 1.12, 0.003],
        [0.45, d.arm * 1.1, d.arm * 1.15, 0.006],
        [0.8, d.arm * 0.88, d.arm * 0.9],
        [1.0, d.arm * 0.78, d.arm * 0.8],
      ])));
      const el = J(`${p}Elbow` as Joint, sh, 0, -d.upperArm, 0);
      this.mesh(el, loft(limbRings(d.forearm, [
        [0.0, d.fore * 1.05, d.fore * 1.0],
        [0.25, d.fore * 1.25, d.fore * 1.05, 0.003],
        [0.7, d.fore * 0.85, d.fore * 0.7],
        [1.0, d.fore * 0.68, d.fore * 0.52],
      ])));
      const wr = J(`${p}Wrist` as Joint, el, 0, -d.forearm, 0);
      this.hand(wr, side, d.fore);

      const hp = J(`${p}Hip` as Joint, hips, side * d.hipW, -0.04, 0);
      this.mesh(hp, loft(limbRings(d.thighLen, [
        [0.0, d.thigh * 1.12, d.thigh * 1.1],
        [0.18, d.thigh * 1.14, d.thigh * 1.1, 0.008],
        [0.55, d.thigh * 0.94, d.thigh * 0.95, 0.006],
        [0.88, d.thigh * 0.72, d.thigh * 0.74],
        [1.0, d.shin * 1.12, d.shin * 1.1],
      ])));
      const kn = J(`${p}Knee` as Joint, hp, 0, -d.thighLen, 0);
      this.mesh(kn, loft(limbRings(d.shinLen, [
        [0.0, d.shin * 1.1, d.shin * 1.08],
        [0.22, d.shin * 1.2, d.shin * 1.38, -0.016],  // calf
        [0.5, d.shin * 0.95, d.shin * 1.0, -0.006],
        [0.88, d.shin * 0.62, d.shin * 0.66],
        [1.0, d.shin * 0.64, d.shin * 0.7],
      ])));
      const an = J(`${p}Ankle` as Joint, kn, 0, -d.shinLen, 0);
      this.foot(an, d.shin);
    }
  }

  private mesh(parent: THREE.Object3D, g: THREE.BufferGeometry) {
    const m = new THREE.Mesh(g, this.mat);
    parent.add(m);
    return m;
  }

  private hand(wrist: THREE.Group, side: number, fore: number) {
    const s = fore / 0.04;
    const palm = loft([
      [0.01, 0.026 * s, 0.014 * s],
      [-0.02, 0.036 * s, 0.017 * s],
      [-0.07, 0.042 * s, 0.016 * s],
      [-0.12, 0.036 * s, 0.012 * s, 0.004],
      [-0.165, 0.022 * s, 0.009 * s, 0.008],
      [-0.18, 0.008 * s, 0.005 * s, 0.009],
    ].reverse() as Ring[], 14);
    this.mesh(wrist, palm);
    const thumb = loft(limbRings(0.06 * s, [[0, 0.012 * s, 0.011 * s], [1, 0.009 * s, 0.008 * s]]), 8);
    const t = this.mesh(wrist, thumb);
    t.position.set(side * 0.02 * s, -0.035, 0.012);
    t.rotation.set(-0.5, 0, side * 0.55);
  }

  private foot(ankle: THREE.Group, shin: number) {
    const s = shin / 0.052;
    const g = loft([
      // zOffset becomes -Y after the rotation: keeps the sole flat while the toes thin out.
      [-0.06, 0.02 * s, 0.022 * s, 0.012],
      [-0.045, 0.034 * s, 0.036 * s, 0.006],
      [0.0, 0.036 * s, 0.04 * s, 0.005],
      [0.08, 0.042 * s, 0.03 * s, 0.015],
      [0.15, 0.04 * s, 0.018 * s, 0.027],
      [0.18, 0.018 * s, 0.01 * s, 0.033],
    ], 12);
    g.rotateX(Math.PI / 2); // lay it along +Z, heel at the ankle
    const m = this.mesh(ankle, g);
    m.position.y = -0.03;
  }

  private hair(head: THREE.Group, kind: Hair, h: number, rand: () => number) {
    if (kind === "bob" || kind === "tied") {
      // A shell slightly larger than the skull, falling to the jaw at the sides and back.
      const short = kind === "tied";
      this.mesh(head, loft([
        [(short ? 0.1 : 0.03) * h, (short ? 0.078 : 0.094) * h, (short ? 0.09 : 0.1) * h, -0.028 * h],
        [0.09 * h, 0.09 * h, 0.106 * h, -0.02 * h],
        [0.15 * h, 0.092 * h, 0.11 * h, -0.012 * h],
        [0.205 * h, 0.084 * h, 0.1 * h, -0.014 * h],
        [0.245 * h, 0.058 * h, 0.07 * h, -0.016 * h],
        [0.262 * h, 0.02 * h, 0.024 * h, -0.016 * h],
      ], 22));
      if (short) {
        const bun = loft(limbRings(0.05 * h, [[0, 0.035 * h, 0.03 * h], [0.6, 0.042 * h, 0.036 * h], [1, 0.03 * h, 0.026 * h]]), 12);
        const b = this.mesh(head, bun);
        b.position.set(0, 0.2 * h, -0.095 * h);
        b.rotation.x = -2.2;
      }
      return;
    }
    const c = new THREE.Vector3(0, 0.14 * h, -0.01);
    if (kind === "spiky") {
      this.mesh(head, loft([
        [0.1 * h, 0.086 * h, 0.1 * h, -0.016 * h],
        [0.17 * h, 0.088 * h, 0.104 * h, -0.014 * h],
        [0.23 * h, 0.066 * h, 0.08 * h, -0.016 * h],
        [0.258 * h, 0.022 * h, 0.03 * h, -0.016 * h],
      ], 20));
      for (let i = 0; i < 30; i++) {
        const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 0.9 + 0.15, -rand() * 1.1 - 0.05);
        if (i < 7) dir.set(rand() * 1.4 - 0.7, 0.1 + rand() * 0.35, 0.8); // fringe
        dir.normalize();
        const len = (0.07 + rand() * 0.11) * h;
        const r = (0.024 + rand() * 0.012) * h;
        const cone = loft([[0, r, r * 0.8], [len * 0.55, r * 0.55, r * 0.45], [len, 0.002, 0.002]], 6);
        const m = this.mesh(head, cone);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        m.position.copy(c).addScaledVector(dir, 0.085 * h);
      }
      return;
    }
    if (kind === "locs") {
      this.mesh(head, loft([
        [0.1 * h, 0.084 * h, 0.1 * h, -0.014 * h],
        [0.2 * h, 0.082 * h, 0.098 * h, -0.014 * h],
        [0.25 * h, 0.05 * h, 0.06 * h, -0.014 * h],
        [0.266 * h, 0.016 * h, 0.02 * h, -0.014 * h],
      ], 20));
      for (let i = 0; i < 34; i++) {
        const a = (i / 34) * Math.PI * 2 + rand() * 0.2;
        const up = 0.25 + rand() * 0.7;
        const dir = new THREE.Vector3(Math.sin(a), up, Math.cos(a) * 0.9 - 0.15).normalize();
        const len = (0.1 + rand() * 0.1) * h;
        const g = loft(limbRings(len, [[0, 0.014, 0.014], [1, 0.01, 0.01]], 1), 6);
        const m = this.mesh(head, g);
        const droop = new THREE.Vector3(dir.x * 1.3, -0.35 - rand() * 0.4, dir.z * 1.3).normalize();
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), droop);
        m.position.copy(c).addScaledVector(dir, 0.095 * h);
      }
    }
  }

  /** Attach an arbitrary prop (sword, spear) to a joint. */
  attach(joint: Joint, obj: THREE.Object3D) {
    this.joints[joint].add(obj);
    return obj;
  }

  setPose(p: Pose) {
    for (const k in this.joints) {
      const v = p[k as Joint];
      const j = this.joints[k as Joint];
      if (v) j.rotation.set(v[0], v[1], v[2]);
      else j.rotation.set(0, 0, 0);
    }
  }

  /** Procedural walk layered on a base pose. */
  walk(phase: number, amt = 1, base: Pose = {}): Pose {
    const s = Math.sin(phase), c = Math.cos(phase);
    const add = (k: Joint, x: number, y = 0, z = 0): [number, number, number] => {
      const b = base[k] ?? [0, 0, 0];
      return [b[0] + x * amt, b[1] + y * amt, b[2] + z * amt];
    };
    const pose: Pose = { ...base };
    pose.lHip = add("lHip", -s * 0.42, 0, 0.02);
    pose.rHip = add("rHip", s * 0.42, 0, -0.02);
    pose.lKnee = add("lKnee", 0.08 + 0.75 * Math.pow(Math.max(0, c), 1.6));
    pose.rKnee = add("rKnee", 0.08 + 0.75 * Math.pow(Math.max(0, -c), 1.6));
    pose.lAnkle = add("lAnkle", s * 0.18);
    pose.rAnkle = add("rAnkle", -s * 0.18);
    pose.lShoulder = add("lShoulder", s * 0.32, 0, 0.06);
    pose.rShoulder = add("rShoulder", -s * 0.32, 0, -0.06);
    pose.lElbow = add("lElbow", -0.2 - Math.max(0, -s) * 0.25);
    pose.rElbow = add("rElbow", -0.2 - Math.max(0, s) * 0.25);
    pose.hips = add("hips", 0, s * 0.09, c * 0.025);
    pose.chest = add("chest", 0.04, -s * 0.13, 0);
    pose.head = add("head", 0.02, s * 0.05, 0);
    return pose;
  }

  /** Vertical bob to layer with walk() (hips drop at double-support). */
  walkBob(phase: number, amt = 1) {
    return -Math.abs(Math.sin(phase)) * 0.03 * amt;
  }

  /** Bake the current pose into one geometry (for crowds and ghosts). */
  bake(): THREE.BufferGeometry {
    this.root.updateMatrixWorld(true);
    const inv = this.root.matrixWorld.clone().invert();
    const parts: THREE.BufferGeometry[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      let g = m.geometry.clone();
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) g.computeVertexNormals();
      for (const name of Object.keys(g.attributes)) if (name !== "position" && name !== "normal") g.deleteAttribute(name);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      parts.push(g);
    });
    return mergeGeometries(parts)!;
  }

  get dims() {
    return this.d;
  }
}

export { rng };
