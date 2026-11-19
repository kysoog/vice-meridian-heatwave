// Three.js renderer: lit city, traffic and pedestrians, follow camera,
// muzzle-flash and hit-spark effects. All meshes cast and receive shadows
// (glass panes and lamp quads are DoubleSide and shadow-free), fog is on.

import * as THREE from '../vendor/three.module.min.js';
import { buildCity, cityLayout } from './city.js';
import { buildCarMesh, buildPlayerOnFoot, buildPedMesh, sirenFlash } from './entities.js';

const BG = 0x3a4a66;

export function createRenderer(canvas, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  scene.fog = new THREE.FogExp2(BG, 0.0012);

  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / Math.max(canvas.clientHeight, 1), 0.5, 1200);

  const ambient = new THREE.AmbientLight(0xffffff, 0.52);
  scene.add(ambient);

  // Sky/ground bounce so nothing reads as a black slab.
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x7d7566, 0.72);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff0d0, 1.65);
  sun.position.set(120, 180, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -160;
  sun.shadow.camera.right = 160;
  sun.shadow.camera.top = 160;
  sun.shadow.camera.bottom = -160;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.4;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);

  // Sky dome: a vertex-coloured hemisphere so the horizon reads as haze
  // instead of a hard seam against the fog.
  const skyGeo = new THREE.SphereGeometry(900, 24, 16);
  const skyColors = new Float32Array(skyGeo.attributes.position.count * 3);
  const horizon = new THREE.Color(0x8fa2bd);
  const zenith = new THREE.Color(0x2f4a7a);
  for (let i = 0; i < skyGeo.attributes.position.count; i++) {
    const y = skyGeo.attributes.position.getY(i) / 900;
    const t = Math.max(0, y);
    const c = horizon.clone().lerp(zenith, t);
    skyColors[i * 3] = c.r;
    skyColors[i * 3 + 1] = c.g;
    skyColors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  scene.add(sky);

  /** Keep the shadow frustum around the player: crisp local contact shadows. */
  function followSun(x, z) {
    sun.position.set(x + 120, 180, z + 60);
    sun.target.position.set(x, 0, z);
    sun.target.updateMatrixWorld();
  }

  const { group: city } = buildCity(cityLayout());
  city.traverse((object) => {
    if (object.isMesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  // The road plane must not cast onto itself; it only receives shadows.
  city.traverse((object) => {
    if (object.isMesh && object.geometry instanceof THREE.PlaneGeometry && object.material.color.getHex() === 0x2d323e) {
      object.castShadow = false;
      object.receiveShadow = true;
    }
  });
  scene.add(city);

  // Per-entity meshes, created on demand as entities spawn (police cars arrive
  // during the simulation, so the mesh list grows with the car list).
  const carMeshes = [];
  const pedMeshes = [];
  let footMesh = null;

  function ensureCarMesh(index, cars) {
    let m = carMeshes[index];
    if (m) return m;
    const c = cars[index];
    const built = buildCarMesh(c.color, c.police);
    scene.add(built.group);
    m = { group: built.group, wheels: built.wheels, lightBar: built.lightBar, body: built.body, spin: 0 };
    carMeshes[index] = m;
    return m;
  }

  function ensurePedMesh(index, peds) {
    let m = pedMeshes[index];
    if (m) return m;
    const p = peds[index];
    const color = 0x6b7a8c + (index * 0x030507);
    const built = buildPedMesh(color);
    scene.add(built.group);
    m = { group: built.group, limbs: built.limbs, phase: (index * 0.77) % 6.28 };
    pedMeshes[index] = m;
    return m;
  }

  function ensureFootMesh() {
    if (footMesh) return footMesh;
    const built = buildPlayerOnFoot(0xd9542b);
    scene.add(built.group);
    footMesh = { group: built.group, limbs: built.limbs };
    return footMesh;
  }

  /** Swing a limb set: [armL, legL, armR, legR] about their joints. */
  function swing(limbs, phase, amplitude) {
    if (!limbs || limbs.length < 4) return;
    const s = Math.sin(phase) * amplitude;
    limbs[0].rotation.x = -s * 0.8;
    limbs[2].rotation.x = s * 0.8;
    limbs[1].rotation.x = s;
    limbs[3].rotation.x = -s;
  }

  // Mission marker: a bobbing yellow pylon plus a tall translucent beam, so
  // the objective reads from down the street as well as up close.
  const markerGeo = new THREE.CylinderGeometry(0.7, 0.7, 1.8, 16);
  const markerMat = new THREE.MeshStandardMaterial({ color: 0xffd93a, emissive: 0xffd93a, emissiveIntensity: 0.8 });
  const marker = new THREE.Mesh(markerGeo, markerMat);
  marker.position.y = 0.9;
  marker.castShadow = true;
  marker.receiveShadow = true;
  scene.add(marker);
  const beamGeo = new THREE.CylinderGeometry(0.9, 1.1, 30, 14, 1, true);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffd93a,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 13;
  marker.add(beam);
  marker.visible = false;

  // Muzzle flash: a bright plane facing the camera, shown for a few frames.
  const muzzleGeo = new THREE.PlaneGeometry(0.6, 0.6);
  const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide });
  const muzzle = new THREE.Mesh(muzzleGeo, muzzleMat);
  scene.add(muzzle);
  muzzle.visible = false;
  let muzzleFrames = 0;

  // Hit sparks: a small burst of points at the hit point.
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(24);
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ color: 0xffaa22, size: 0.25, transparent: true, opacity: 0 });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  scene.add(sparks);
  let sparkFrames = 0;

  // Follow camera, smoothed; snapped on the first frame it runs.
  let camX = 0, camY = 0, camZ = 0;
  let camInit = false;
  let frame = 0;
  // Once a shot frame is staged, the animation clock stops, so the captured
  // frame is the same pixels however many times the page repaints it.
  let frozen = false;
  let heroWalk = 0;
  let heroSwing = 0;
  let lastHeroX = null;
  let lastHeroZ = null;

  function positionCamera(dt, entities) {
    const { cars, peds, player } = entities;
    const c = player.car !== null ? cars[player.car] : null;
    const tx = c ? c.x : player.x;
    const tz = c ? c.z : player.z;
    const ty = c ? 0 : 1.2;
    const yaw = c ? c.yaw : player.onFootYaw;
    const height = c ? 4.2 : 2.4;
    const dist = c ? 11 : 7;
    const lookAhead = c ? 15 : 11;

    const idealX = tx - Math.sin(yaw) * dist;
    const idealZ = tz - Math.cos(yaw) * dist;
    const idealY = ty + height;
    if (!camInit) {
      // First frame after boot: snap, so frame one already frames the hero
      // (a screenshot staged over two frames must not ease in from the origin).
      camX = idealX;
      camY = idealY;
      camZ = idealZ;
      camInit = true;
    } else {
      const lag = 0.18;
      camX += (idealX - camX) * lag;
      camY += (idealY - camY) * lag;
      camZ += (idealZ - camZ) * lag;
    }

    camera.position.set(camX, camY, camZ);
    const lx = tx + Math.sin(yaw) * lookAhead;
    const lz = tz + Math.cos(yaw) * lookAhead;
    const ly = ty + 1.4;
    camera.lookAt(lx, ly, lz);
  }

  function updateEntities(entities) {
    const { cars, peds, player, missions, wanted, police } = entities;

    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const m = ensureCarMesh(i, cars);
      m.group.position.set(c.x, 0, c.z);
      m.group.rotation.y = c.yaw;
      m.spin += frozen ? 0 : c.speed * 0.05;
      for (const w of m.wheels) w.rotation.x = m.spin;
      if (m.lightBar) {
        // The siren swaps between the red and blue halves of the bar.
        const bright = sirenFlash(frame);
        const on = c.police ? 1 : 0;
        const red = m.lightBar.getObjectByName('bar-red');
        const blue = m.lightBar.getObjectByName('bar-blue');
        const glowRed = m.lightBar.getObjectByName('glow-red');
        const glowBlue = m.lightBar.getObjectByName('glow-blue');
        if (red) red.material.emissiveIntensity = on * (bright < 0 ? 1.5 : 0.28);
        if (blue) blue.material.emissiveIntensity = on * (bright > 0 ? 1.5 : 0.28);
        if (glowRed) glowRed.material.opacity = on * (bright < 0 ? 0.5 : 0.1);
        if (glowBlue) glowBlue.material.opacity = on * (bright > 0 ? 0.5 : 0.1);
      }
      if (c.health < 60) {
        m.body.material.color.setHex(0x5a2222);
      }
      m.group.visible = true;
    }
    // hide stale meshes if cars despawned (none despawn in this build)
    for (let i = cars.length; i < carMeshes.length; i++) carMeshes[i].group.visible = false;

    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      const m = ensurePedMesh(i, peds);
      if (p.down) {
        m.group.position.set(p.x, 0.35, p.z);
        m.group.rotation.x = -Math.PI / 2;
      } else {
        m.group.position.set(p.x, Math.abs(Math.sin(frame * 0.12 + m.phase)) * 0.06, p.z);
        m.group.rotation.x = 0;
        swing(m.limbs, frame * 0.16 + m.phase, p.state === 'walk' ? 0.5 : 0.08);
      }
      m.group.visible = !p.down || frame % 10 < 7; // down peds flicker slightly while "injured"
    }

    const fm = ensureFootMesh();
    if (player.mode === 'foot') {
      const moved = lastHeroX === null ? 0 : Math.hypot(player.x - lastHeroX, player.z - lastHeroZ);
      heroWalk += frozen ? 0 : moved * 2.6;
      heroSwing += frozen ? 0 : ((moved > 0.01 ? 1 : 0) - heroSwing) * 0.25;
      fm.group.position.set(player.x, 0, player.z);
      fm.group.rotation.y = player.onFootYaw;
      fm.group.visible = true;
      swing(fm.limbs, heroWalk, 0.6 * heroSwing);
    } else {
      fm.group.visible = false;
    }
    lastHeroX = player.x;
    lastHeroZ = player.z;

    const active = missions.stage === 'active' && missions.index < missions.list.length;
    marker.visible = active;
    if (active) {
      const t = missions.target;
      marker.position.set(t.x, 0.9 + Math.sin(frame * 0.1) * 0.15, t.z);
      marker.rotation.y += frozen ? 0 : 0.03;
    }
  }

  function flashMuzzle() {
    muzzle.visible = true;
    muzzle.material.opacity = 0.9;
    muzzleFrames = 4;
  }

  function flashSpark(x, y, z) {
    const count = 8;
    // Deterministic spread: a fixed spiral, so a capture is reproducible.
    for (let i = 0; i < count * 3; i += 3) {
      const k = i / 3;
      const a = k * 0.9;
      const r = 0.35 + k * 0.07;
      sparkPos[i] = x + Math.sin(a) * r;
      sparkPos[i + 1] = y + 0.5 + k * 0.09;
      sparkPos[i + 2] = z + Math.cos(a) * r;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkMat.opacity = 0.9;
    sparkFrames = 8;
  }

  return {
    resize(width, height) {
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    },
    draw(entities, shooting) {
      if (!frozen) frame += 1;
      updateEntities(entities);
      const p = entities.player;
      const focus = p.mode === 'car' && p.car !== null ? entities.cars[p.car] : p;
      followSun(focus.x, focus.z);
      if (!frozen) positionCamera(1 / 60, entities);

      if (muzzleFrames > 0) {
        muzzleFrames -= 1;
        const cam = camera.position;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        muzzle.position.set(cam.x + dir.x * 1.2, cam.y + 0.1, cam.z + dir.z * 1.2);
        muzzle.lookAt(cam.x + dir.x * 2, cam.y + 0.1, cam.z + dir.z * 2);
        muzzle.material.opacity = 0.9 * (muzzleFrames / 4);
        if (muzzleFrames === 0) muzzle.visible = false;
      }
      if (sparkFrames > 0) {
        sparkFrames -= 1;
        sparkMat.opacity = sparkFrames / 8;
        if (sparkFrames === 0) sparkMat.opacity = 0;
      }
      if (shooting) flashMuzzle();

      renderer.render(scene, camera);
    },
    flashSpark,
    /** Stop the animation clock: a staged shot frame then repaints identically. */
    freeze() { frozen = true; },
    /** Screen position of a world point as fractions of the canvas, for the
     *  shot checks: {x, y, visible} with y measured from the top. */
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return {
        x: (v.x + 1) / 2,
        y: (1 - v.y) / 2,
        visible: v.z > -1 && v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1,
      };
    },
  };
}
