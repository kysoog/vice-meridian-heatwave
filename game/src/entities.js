// Entities: cars, pedestrians and the player's on-foot figure. Each module
// here builds the Three.js mesh for one entity and holds its visual state;
// the simulation in world.js moves the entities.

import * as THREE from '../vendor/three.module.min.js';
import { roadYaw } from './city.js';

const CAR_BODY = new THREE.Group();
const BODY = new THREE.Mesh(new THREE.BoxGeometry(4.4, 1.2, 1.9));
BODY.position.y = 1.02;
BODY.castShadow = true;
BODY.receiveShadow = true;
CAR_BODY.add(BODY);
const CABIN = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.95, 1.7));
CABIN.position.set(-0.15, 1.95, 0);
CABIN.castShadow = true;
CABIN.receiveShadow = true;
CAR_BODY.add(CABIN);
const HOOD = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9));
HOOD.position.set(1.45, 1.6, 0);
HOOD.castShadow = true;
HOOD.receiveShadow = true;
CAR_BODY.add(HOOD);

function wheelMesh() {
  const group = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.4, 16));
  tyre.rotation.z = Math.PI / 2;
  tyre.material = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.95 });
  tyre.castShadow = true;
  tyre.receiveShadow = true;
  group.add(tyre);
  // A lighter rim disc on each side, so the wheel reads as a wheel.
  for (const side of [-1, 1]) {
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 12));
    rim.rotation.z = Math.PI / 2;
    rim.position.x = side * 0.21;
    rim.material = new THREE.MeshStandardMaterial({ color: 0xb9bec7, roughness: 0.5, metalness: 0.3 });
    group.add(rim);
  }
  return group;
}

export function buildCarMesh(color, police) {
  const group = CAR_BODY.clone();
  // Children survive clone only via names; bodies above are shared prototypes
  // so find them by reference-safe traversal instead of by name.
  group.children[0].material = new THREE.MeshStandardMaterial({ color });
  group.children[1].material = new THREE.MeshStandardMaterial({
    color: 0x1a1f2a,
    roughness: 0.6,
  });
  group.children[2].material = new THREE.MeshStandardMaterial({ color });

  const wheels = [];
  // Wheels flush with the body sides and standing proud below it.
  const wheelOffsets = [
    [1.45, 0.46, 0.98],
    [-1.45, 0.46, 0.98],
    [1.45, 0.46, -0.98],
    [-1.45, 0.46, -0.98],
  ];
  for (const [ox, oy, oz] of wheelOffsets) {
    const wheel = wheelMesh();
    wheel.position.set(ox, oy, oz);
    group.add(wheel);
    wheels.push(wheel);
  }

  // Head and tail lights: small DoubleSide quads on the shell.
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfff6cf, emissive: 0xfff0c0, emissiveIntensity: 1, side: THREE.DoubleSide });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff5544, emissive: 0xff3322, emissiveIntensity: 1, side: THREE.DoubleSide });
  for (const [geo, mat, x, z] of [
    [new THREE.PlaneGeometry(0.55, 0.3), headMat, 2.23, 0.62],
    [new THREE.PlaneGeometry(0.55, 0.3), headMat, 2.23, -0.62],
    [new THREE.PlaneGeometry(0.5, 0.28), tailMat, -2.23, 0.62],
    [new THREE.PlaneGeometry(0.5, 0.28), tailMat, -2.23, -0.62],
  ]) {
    const lamp = new THREE.Mesh(geo, mat);
    lamp.position.set(x, 1.1, z);
    lamp.rotation.y = Math.PI / 2;
    lamp.castShadow = false;
    lamp.receiveShadow = false;
    group.add(lamp);
  }

  let lightBar = null;
  if (police) {
    // Black-and-white livery: a wide white door band and a white roof panel,
    // so a cruiser is readable at a glance from behind as well as the side.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.62, 2.30),
      new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.55 })
    );
    band.position.set(-0.1, 1.06, 0);
    band.castShadow = true;
    band.receiveShadow = true;
    group.add(band);
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 0.16, 1.74),
      new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.55 })
    );
    roof.position.set(-0.15, 2.44, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    // A white boot panel across the rear quarters, so the cruiser is readable
    // from directly behind as well as from the side.
    const boot = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.62, 2.30),
      new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.55 })
    );
    boot.position.set(-1.7, 1.06, 0);
    boot.castShadow = true;
    boot.receiveShadow = true;
    group.add(boot);

    // Light bar: a red half and a blue half that swap brightness every frame,
    // so both colours of the livery are in the frame whatever frame is caught.
    lightBar = new THREE.Group();
    lightBar.position.set(-0.1, 2.62, 0);
    for (const side of [-1, 1]) {
      const half = new THREE.Mesh(
        new THREE.BoxGeometry(0.7, 0.22, 0.5),
        new THREE.MeshStandardMaterial({
          color: side < 0 ? 0xe00f0f : 0x1b5cff,
          emissive: side < 0 ? 0xe00f0f : 0x1b5cff,
          emissiveIntensity: 1,
        })
      );
      half.name = side < 0 ? 'bar-red' : 'bar-blue';
      half.position.set(side * 0.42, 0, 0);
      half.castShadow = false;
      half.receiveShadow = false;
      lightBar.add(half);
      // A matching glow quad on the roof housing so the flash reads at range.
      const glow = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.5),
        new THREE.MeshBasicMaterial({
          color: side < 0 ? 0xff5a4a : 0x5a92ff,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      glow.position.set(0, 0.42, 0);
      glow.rotation.x = -Math.PI / 2;
      glow.name = side < 0 ? 'glow-red' : 'glow-blue';
      lightBar.add(glow);
    }
    group.add(lightBar);
  }

  group.traverse((m) => {
    if (m.isMesh && m !== BODY && m !== CABIN && m !== HOOD) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });

  return { group, body: group.children[0], wheels, lightBar };
}

/** A limb that swings from its joint: a pivot with the box hanging below it. */
function limbPivot(width, height, depth, material, jx, jy) {
  const pivot = new THREE.Group();
  pivot.position.set(jx, jy, 0);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.y = -height / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  pivot.add(mesh);
  return pivot;
}

export function buildPlayerOnFoot(color) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0c3a3, roughness: 0.7 });
  const shirt = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const jeans = new THREE.MeshStandardMaterial({ color: 0x2b3550, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.42), shirt);
  body.position.y = 1.28;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
  head.position.y = 1.9;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  // limbs: [armL, legL, armR, legR], each swinging from a shoulder or hip.
  const limbs = [];
  for (const side of [-1, 1]) {
    limbs.push(limbPivot(0.18, 0.74, 0.2, shirt, side * 0.45, 1.62));
    limbs.push(limbPivot(0.26, 0.86, 0.28, jeans, side * 0.18, 0.88));
  }
  for (const limb of limbs) group.add(limb);

  return { group, body, head, limbs };
}

export function buildPedMesh(color) {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xddc7b2, roughness: 0.8 });
  const trousers = new THREE.MeshStandardMaterial({ color: 0x353b46, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.32), coat);
  body.position.y = 1.28;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.34, 0.32), skin);
  head.position.y = 1.88;
  head.castShadow = true;
  head.receiveShadow = true;
  group.add(head);

  const limbs = [];
  for (const side of [-1, 1]) {
    limbs.push(limbPivot(0.14, 0.7, 0.16, coat, side * 0.32, 1.58));
    limbs.push(limbPivot(0.2, 0.82, 0.22, trousers, side * 0.14, 0.86));
  }
  for (const limb of limbs) group.add(limb);

  return { group, body, head, limbs };
}

/** Police siren flash: which half of the light bar is bright on this frame.
 *  -1 = the red half, +1 = the blue half; it swaps a few times a second. */
export function sirenFlash(frame) {
  return Math.floor(frame / 7) % 2 === 0 ? -1 : 1;
}
