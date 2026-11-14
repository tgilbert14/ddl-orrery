// Orbit look test: the shuttle. Small and golden, built in code: a lathed fuselage, two swept
// fins, a dorsal fin and one engine glow. About 14 m long; the nose points along local +z, so
// Object3D.lookAt() aims it.
import * as THREE from 'three/webgpu';
import { float, vec3, uv, length, exp, step } from 'three/tsl';

export function createShuttle() {
  const g = new THREE.Group();
  const gold = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color().setRGB(1.0, 0.66, 0.26), metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide });
  gold.emissiveNode = vec3(0.05, 0.028, 0.008); // the gold keeps a little of its colour in shade
  const dark = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color().setRGB(0.05, 0.04, 0.035), metalness: 0.3, roughness: 0.4 });

  const prof = [[0, 7.2], [0.7, 6.4], [1.3, 5.0], [1.75, 2.6], [1.9, -1.5], [1.75, -4.6], [1.35, -6.4], [0.9, -6.8], [0, -6.8]];
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 24), gold);
  body.rotation.x = Math.PI / 2; // lathe axis y -> z (nose to +z)
  body.scale.set(1, 1, 0.8);     // a little flatter than round
  g.add(body);
  // canopy: a dark band near the nose
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  canopy.scale.set(1.0, 0.7, 2.0);
  canopy.position.set(0, 0.95, 3.4);
  g.add(canopy);
  // swept fins: one shape, mirrored
  const fin = new THREE.Shape();
  fin.moveTo(0, 2.2); fin.lineTo(6.4, -4.6); fin.lineTo(6.4, -6.0); fin.lineTo(0, -5.4); fin.lineTo(0, 2.2);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.28, bevelEnabled: false });
  for (const s of [1, -1]) {
    const f = new THREE.Mesh(finG, gold);
    f.rotation.x = Math.PI / 2;            // shape x -> span, shape y -> along +z, depth -> down
    f.scale.set(s, 1, 1);                  // mirrored for the port fin (double-sided material)
    f.position.set(s * 1.2, -0.1, 0);
    g.add(f);
  }
  const tail = new THREE.Shape();
  tail.moveTo(0, -1.8); tail.lineTo(2.8, -5.6); tail.lineTo(2.8, -6.6); tail.lineTo(0, -6.4); tail.lineTo(0, -1.8);
  const tailM = new THREE.Mesh(new THREE.ExtrudeGeometry(tail, { depth: 0.22, bevelEnabled: false }), gold);
  // shape (x up, y along): rotate so shape x -> world y and shape y -> world z
  tailM.matrixAutoUpdate = false;
  tailM.matrix.set(0, 0, 1, -0.11, 1, 0, 0, 1.0, 0, 1, 0, 0, 0, 0, 0, 1);
  g.add(tailM);
  // the engine: a dark nozzle and one hot glow
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.1, 1.0, 16, 1, true), dark);
  nozzle.rotation.x = Math.PI / 2;
  nozzle.position.z = -7.1;
  g.add(nozzle);
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicNodeMaterial());
  core.material.colorNode = vec3(12.0, 8.0, 3.6);
  core.position.z = -7.3; core.rotation.y = Math.PI;
  g.add(core);
  const gm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const d = length(uv().sub(0.5)).mul(2.0);
  gm.colorNode = vec3(1.0, 0.62, 0.26).mul(exp(d.mul(d).mul(-10.0)).mul(2.2).add(exp(d.mul(-6.0)).mul(0.5))).mul(float(1.0).sub(step(1.0, d)));
  gm.opacityNode = float(1.0);
  const glow = new THREE.Sprite(gm);
  glow.scale.set(9, 9, 1);
  glow.position.z = -8.2;
  g.add(glow);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
