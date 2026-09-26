import * as THREE from "three";
import { loft } from "./Figure";

/** Props are built hanging along -Y from the hand that holds them. */

function bladeShape(len: number, width: number, curve: number, from = 0) {
  const s = new THREE.Shape();
  const N = 24;
  const back: [number, number][] = [];
  const edge: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const c = curve * t * t;
    let w = width * (1 - 0.3 * t);
    if (t > 0.9) w *= (1 - t) / 0.1; // kissaki
    back.push([c, -from - t * len]);
    edge.push([c + w, -from - t * len]);
  }
  s.moveTo(back[0][0], back[0][1]);
  for (const [x, y] of edge) s.lineTo(x, y);
  for (let i = back.length - 1; i >= 0; i--) s.lineTo(back[i][0], back[i][1]);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: false, curveSegments: 1 });
  g.translate(-width / 2, 0, -0.003);
  return g;
}

export function katana(mat: THREE.Material) {
  const g = new THREE.Group();
  const blade = new THREE.Mesh(bladeShape(0.82, 0.03, 0.035, 0.07), mat);
  const grip = new THREE.Mesh(loft([[0.2, 0.012, 0.015], [0.19, 0.016, 0.019], [-0.04, 0.016, 0.019], [-0.05, 0.012, 0.015]], 10), mat);
  const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.01, 18), mat);
  tsuba.position.y = -0.055;
  g.add(blade, grip, tsuba);
  return g;
}

export function scimitar(mat: THREE.Material) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(bladeShape(0.78, 0.05, 0.22, 0.06), mat));
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.018, 0.03), mat);
  guard.position.y = -0.05;
  g.add(guard);
  return g;
}

export function spear(mat: THREE.Material) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, 2.6, 6), mat);
  const tip = new THREE.Mesh(loft([[0, 0.02, 0.006], [0.1, 0.034, 0.008], [0.26, 0.002, 0.002]], 6), mat);
  tip.position.y = 1.3;
  shaft.add(tip);
  g.add(shaft);
  return g;
}

/** Recurve bow with its string, oriented for a hand whose arm points forward. */
export function bow(mat: THREE.Material) {
  const R = 0.62, half = 1.05;
  const arc = new THREE.TorusGeometry(R, 0.011, 5, 36, half * 2);
  arc.rotateZ(-half);
  arc.translate(-R, 0, 0);
  const tipX = R * Math.cos(half) - R, tipY = R * Math.sin(half);
  const str = new THREE.CylinderGeometry(0.0025, 0.0025, tipY * 2, 4);
  str.translate(tipX, 0, 0);
  const grip = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8);
  // bow space: +X toward the target, +Y up → hand space: -Y forward, +Z up
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
  const g = new THREE.Group();
  for (const geo of [arc, str, grip]) {
    geo.applyMatrix4(basis);
    g.add(new THREE.Mesh(geo, mat));
  }
  g.position.y = -0.06;
  return g;
}

export function shield(mat: THREE.Material) {
  const m = new THREE.Mesh(loft([[-0.02, 0.02, 0.02], [-0.012, 0.3, 0.3], [0.012, 0.3, 0.3], [0.03, 0.06, 0.06]], 28), mat);
  m.rotation.z = Math.PI / 2;
  return m;
}
