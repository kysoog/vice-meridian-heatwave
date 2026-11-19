import * as THREE from '../vendor/three.module.min.js';
import { Random } from './random.js';
import { ROAD_LINES } from './config.js';
import { clamp, dist2 } from './math.js';

const skinTones = [0x6d3f2d, 0xa56845, 0xd99b75, 0xf0bd98, 0x7d4938];
const shirts = [0xf16d95, 0x43bac4, 0xf2bd64, 0x7869bb, 0xe3e4d3, 0x3d6874];
const pants = [0x152837, 0x273846, 0x765d51, 0x3c2b46];
const headGeometry = new THREE.SphereGeometry(.22, 8, 6);
const torsoGeometry = new THREE.BoxGeometry(.52, .68, .3);
const limbGeometry = new THREE.BoxGeometry(.16, .68, .18);
const legGeometry = new THREE.BoxGeometry(.2, .78, .23);

function createPerson(rng, police = false) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: rng.pick(skinTones), roughness: .85 });
  const shirt = new THREE.MeshStandardMaterial({ color: police ? 0x193751 : rng.pick(shirts), roughness: .8 });
  const trouser = new THREE.MeshStandardMaterial({ color: police ? 0x132736 : rng.pick(pants), roughness: .88 });
  const head = new THREE.Mesh(headGeometry, skin); head.position.y = 1.82; group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.227, 8, 4, 0, Math.PI * 2, 0, Math.PI * .52), new THREE.MeshStandardMaterial({ color: rng.pick([0x211b1b, 0x543928, 0xc29458]), roughness: 1 }));
  hair.position.y = 1.87; group.add(hair);
  const torso = new THREE.Mesh(torsoGeometry, shirt); torso.position.y = 1.24; group.add(torso);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const armPivot = new THREE.Group(); armPivot.position.set(side * .36, 1.53, 0); group.add(armPivot);
    const arm = new THREE.Mesh(limbGeometry, skin); arm.position.y = -.32; armPivot.add(arm); arms.push(armPivot);
    const legPivot = new THREE.Group(); legPivot.position.set(side * .16, .87, 0); group.add(legPivot);
    const leg = new THREE.Mesh(legGeometry, trouser); leg.position.y = -.38; legPivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.22, .15, .37), new THREE.MeshStandardMaterial({ color: 0x151c23, roughness: .8 })); shoe.position.set(0, -.78, .055); legPivot.add(shoe); legs.push(legPivot);
  }
  if (police) {
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(.25, .26, .12, 8), shirt); hat.position.y = 2.04; group.add(hat);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(.08, .1, .025), new THREE.MeshBasicMaterial({ color: 0xffd77c })); badge.position.set(-.14, 1.35, .165); group.add(badge);
  }
  group.userData.arms = arms; group.userData.legs = legs;
  group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
  return group;
}

export class Pedestrians {
  constructor(scene, seed) {
    this.scene = scene; this.rng = new Random(seed ^ 0x93ca2); this.people = [];
    for (let i = 0; i < 42; i++) this.spawn(i);
  }
  spawn(i) {
    const ix = i % 4, iz = Math.floor(i / 4) % 4;
    const cx = (ROAD_LINES[ix] + ROAD_LINES[ix + 1]) / 2;
    const cz = (ROAD_LINES[iz] + ROAD_LINES[iz + 1]) / 2;
    const side = i % 4;
    const along = this.rng.range(-38, 38);
    const x = cx + (side < 2 ? (side === 0 ? -40 : 40) : along);
    const z = cz + (side >= 2 ? (side === 2 ? -40 : 40) : along);
    const heading = side === 0 ? 0 : side === 1 ? Math.PI : side === 2 ? -Math.PI / 2 : Math.PI / 2;
    const mesh = createPerson(this.rng);
    mesh.position.set(x, .19, z); mesh.rotation.y = heading; this.scene.add(mesh);
    this.people.push({
      mesh, position: mesh.position, heading, desiredHeading: heading, cx, cz, side,
      speed: this.rng.range(1, 1.65), phase: this.rng.range(0, Math.PI * 2),
      active: true, panic: 0, health: 40, index: i,
    });
  }
  scare(position, radius = 28) {
    for (const person of this.people) if (person.active && dist2(person.position, position) < radius) person.panic = 6;
  }
  hitFrom(origin, heading, range = 32) {
    let best = null, bestDistance = range;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (const person of this.people) {
      if (!person.active) continue;
      const dx = person.position.x - origin.x, dz = person.position.z - origin.z;
      const distance = Math.hypot(dx, dz);
      const alignment = (dx * fx + dz * fz) / Math.max(.001, distance);
      if (distance < bestDistance && alignment > .94) { best = person; bestDistance = distance; }
    }
    if (best) {
      best.health -= 40; best.panic = 10;
      if (best.health <= 0) { best.active = false; best.mesh.rotation.z = Math.PI / 2; best.mesh.position.y = .35; }
      return best;
    }
    return null;
  }
  update(dt, game) {
    let alive = 0;
    for (const p of this.people) {
      if (!p.active) continue;
      alive++;
      p.panic = Math.max(0, p.panic - dt);
      let speed = p.speed;
      if (p.panic > 0 || (game.wanted > 1 && dist2(p.position, game.player.position) < 18)) {
        p.panic = Math.max(p.panic, 1);
        p.desiredHeading = Math.atan2(p.position.x - game.player.position.x, p.position.z - game.player.position.z);
        speed = 4.2;
      } else {
        const localX = p.position.x - p.cx, localZ = p.position.z - p.cz;
        if (p.side === 0 && localZ > 39) { p.side = 2; p.desiredHeading = Math.PI / 2; }
        else if (p.side === 2 && localX > 39) { p.side = 1; p.desiredHeading = Math.PI; }
        else if (p.side === 1 && localZ < -39) { p.side = 3; p.desiredHeading = -Math.PI / 2; }
        else if (p.side === 3 && localX < -39) { p.side = 0; p.desiredHeading = 0; }
      }
      let delta = Math.atan2(Math.sin(p.desiredHeading - p.heading), Math.cos(p.desiredHeading - p.heading));
      p.heading += clamp(delta, -4 * dt, 4 * dt);
      p.position.x += Math.sin(p.heading) * speed * dt;
      p.position.z += Math.cos(p.heading) * speed * dt;
      p.position.x = clamp(p.position.x, -295, 295); p.position.z = clamp(p.position.z, -295, 295);
      p.mesh.rotation.y = p.heading;
      const phase = game.tick * .13 * speed + p.phase;
      const swing = Math.sin(phase) * (p.panic > 0 ? .75 : .42);
      p.mesh.userData.arms[0].rotation.x = swing; p.mesh.userData.arms[1].rotation.x = -swing;
      p.mesh.userData.legs[0].rotation.x = -swing; p.mesh.userData.legs[1].rotation.x = swing;
      p.mesh.position.y = .19 + Math.abs(Math.sin(phase)) * .025;
    }
    return alive;
  }
}
