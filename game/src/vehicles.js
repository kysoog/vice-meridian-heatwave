import * as THREE from '../vendor/three.module.min.js';
import { CAR_COLORS, ROAD_LINES, WORLD_LIMIT } from './config.js';
import { Random } from './random.js';
import { clamp, damp, forward, resolveCircle, dist2 } from './math.js';

const bodyGeometry = new THREE.BoxGeometry(2.3, .62, 4.7);
const cabinGeometry = new THREE.BoxGeometry(1.85, .68, 2.25);
const wheelGeometry = new THREE.CylinderGeometry(.43, .43, .32, 12);
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x10161b, roughness: .88 });
const rimMaterial = new THREE.MeshStandardMaterial({ color: 0xa3b6ba, roughness: .3, metalness: .85 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x21495c, roughness: .13, metalness: .35, transparent: true, opacity: .9, side: THREE.DoubleSide });
const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xffecc6 });
const tailMaterial = new THREE.MeshBasicMaterial({ color: 0xff174f });

export function createCarMesh(color = 0x24c8cc, police = false, type = 'coupe') {
  const group = new THREE.Group();
  group.name = police ? 'PoliceVCPD' : 'Vehicle';
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .28, metalness: .48 });
  const lower = new THREE.Mesh(bodyGeometry, paint); lower.position.y = .75; group.add(lower);
  const hood = new THREE.Mesh(new THREE.BoxGeometry(2.16, .22, 1.25), paint); hood.position.set(0, 1.08, 1.55); group.add(hood);
  const trunk = new THREE.Mesh(new THREE.BoxGeometry(2.16, .26, .8), paint); trunk.position.set(0, 1.06, -1.78); group.add(trunk);
  const cabin = new THREE.Mesh(cabinGeometry, glassMaterial); cabin.position.set(0, 1.38, -.18); if (type === 'van') cabin.scale.set(1.05, 1.35, 1.65); group.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, .12, type === 'van' ? 2.9 : 1.42), paint); roof.position.set(0, type === 'van' ? 2.18 : 1.77, type === 'van' ? -.2 : -.36); group.add(roof);
  const bumperMat = new THREE.MeshStandardMaterial({ color: 0x253038, roughness: .38, metalness: .72 });
  for (const z of [-2.37, 2.37]) {
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(2.37, .18, .13), bumperMat); bumper.position.set(0, .62, z); group.add(bumper);
  }
  for (const x of [-.77, .77]) {
    const headlamp = new THREE.Mesh(new THREE.BoxGeometry(.48, .22, .08), lightMaterial); headlamp.position.set(x, .88, 2.36); group.add(headlamp);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(.51, .19, .08), tailMaterial); tail.name = 'tailLight'; tail.position.set(x, .87, -2.36); group.add(tail);
  }
  const wheels = [];
  for (const x of [-1.18, 1.18]) for (const z of [-1.55, 1.55]) {
    const wheel = new THREE.Group(); wheel.position.set(x, .56, z); group.add(wheel);
    const tire = new THREE.Mesh(wheelGeometry, tireMaterial); tire.rotation.z = Math.PI / 2; wheel.add(tire);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.23, .23, .335, 8), rimMaterial); rim.rotation.z = Math.PI / 2; wheel.add(rim);
    wheels.push(wheel);
  }
  if (type === 'sport') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.05, .1, .38), bumperMat); spoiler.position.set(0, 1.28, -2.02); group.add(spoiler);
    for (const x of [-.7, .7]) { const strut = new THREE.Mesh(new THREE.BoxGeometry(.08, .4, .08), bumperMat); strut.position.set(x, 1.13, -2.02); group.add(strut); }
  }
  if (police) {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xe5e9e6, roughness: .45, metalness: .25 });
    for (const x of [-1.161, 1.161]) { const door = new THREE.Mesh(new THREE.BoxGeometry(.02, .42, 1.45), doorMat); door.position.set(x, .86, -.2); group.add(door); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.55, .09, .25), bumperMat); bar.position.set(0, 1.93, -.3); group.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(.65, .17, .32), new THREE.MeshBasicMaterial({ color: 0xff124c })); red.name = 'sirenRed'; red.position.set(-.4, 2.04, -.3); group.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(.65, .17, .32), new THREE.MeshBasicMaterial({ color: 0x168cff })); blue.name = 'sirenBlue'; blue.position.set(.4, 2.04, -.3); group.add(blue);
  }
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  group.userData.wheels = wheels;
  return group;
}

export class Vehicles {
  constructor(scene, city, seed) {
    this.scene = scene; this.city = city; this.rng = new Random(seed ^ 0x7a11c);
    this.all = []; this.traffic = []; this.parked = []; this.police = [];
    this.spawnTraffic(); this.spawnParked(); this.spawnPolicePool();
  }
  add(x, z, heading, options = {}) {
    const color = options.color ?? this.rng.pick(CAR_COLORS);
    const type = options.type ?? this.rng.pick(['coupe', 'coupe', 'sport', 'van']);
    const mesh = createCarMesh(color, options.police, type);
    mesh.position.set(x, .08, z); mesh.rotation.y = heading; this.scene.add(mesh);
    const car = {
      mesh, position: mesh.position, heading, speed: options.speed ?? 0,
      cruise: options.cruise ?? this.rng.range(9, 16), traffic: Boolean(options.traffic),
      police: Boolean(options.police), active: options.active !== false,
      occupied: false, health: 100, color, type, collisionCooldown: 0,
    };
    mesh.visible = car.active; this.all.push(car); return car;
  }
  spawnTraffic() {
    for (let i = 0; i < 28; i++) {
      const vertical = i % 2 === 0;
      const road = ROAD_LINES[i % ROAD_LINES.length];
      const positive = i % 4 < 2;
      const heading = vertical ? (positive ? 0 : Math.PI) : (positive ? Math.PI / 2 : -Math.PI / 2);
      const lane = positive ? 6 : -6;
      const along = -270 + (i * 47 % 540);
      const x = vertical ? road + lane : along;
      const z = vertical ? along : road - lane;
      const car = this.add(x, z, heading, { traffic: true, speed: 10 + i % 4, cruise: 10 + i % 6 });
      this.traffic.push(car);
    }
  }
  spawnParked() {
    const spots = [[-6, 145, Math.PI], [6, 113, 0], [-126, 53, Math.PI], [114, 83, 0], [126, -140, 0], [-114, -151, Math.PI], [234, -136, 0], [-6, -102, Math.PI], [6, 207, 0], [-234, 103, Math.PI], [246, 139, 0]];
    for (let i = 0; i < spots.length; i++) {
      const [x, z, heading] = spots[i]; this.parked.push(this.add(x, z, heading, { speed: 0, type: i === 0 ? 'sport' : 'coupe', color: i === 0 ? 0xf2507b : undefined }));
    }
  }
  spawnPolicePool() {
    for (let i = 0; i < 8; i++) {
      const car = this.add(0, -400 - i * 7, 0, { police: true, active: false, color: 0x15202c, type: 'sport' });
      this.police.push(car);
    }
  }
  nearest(position, maxDistance = 6) {
    let best = null, distance = maxDistance;
    for (const car of this.all) {
      if (!car.active || car.police || car.occupied) continue;
      const d = dist2(position, car.position);
      if (d < distance) { best = car; distance = d; }
    }
    return best;
  }
  enter(car) { if (!car) return false; car.occupied = true; car.traffic = false; return true; }
  exit(car) { if (car) car.occupied = false; }
  drive(car, input, dt, colliders) {
    const accelerating = input.y > 0, reversing = input.y < 0;
    const top = car.type === 'sport' ? 32 : car.type === 'van' ? 20 : 26;
    if (accelerating) car.speed += (car.speed < 0 ? 20 : 11.5) * dt;
    else if (reversing) car.speed -= (car.speed > 0 ? 22 : 8) * dt;
    else car.speed = damp(car.speed, 0, .65, dt);
    if (input.handbrake) car.speed = damp(car.speed, 0, 3.8, dt);
    car.speed = clamp(car.speed, -9, top);
    const steerFactor = clamp(Math.abs(car.speed) / 3, 0, 1);
    car.heading -= input.x * Math.sign(car.speed) * steerFactor * (input.handbrake ? 1.35 : .82) * dt;
    const oldX = car.position.x, oldZ = car.position.z;
    const direction = forward(car.heading);
    car.position.addScaledVector(direction, car.speed * dt);
    resolveCircle(car.position, 1.6, colliders);
    const collided = Math.hypot(car.position.x - oldX - direction.x * car.speed * dt, car.position.z - oldZ - direction.z * car.speed * dt) > .05;
    if (collided) { car.speed *= -.18; car.collisionCooldown = .5; }
    car.position.x = clamp(car.position.x, -WORLD_LIMIT, WORLD_LIMIT); car.position.z = clamp(car.position.z, -WORLD_LIMIT, WORLD_LIMIT);
    car.position.y = .08; car.mesh.rotation.y = car.heading;
    for (const wheel of car.mesh.userData.wheels || []) wheel.rotation.x -= car.speed * dt * 1.6;
    return collided;
  }
  updateTraffic(dt, playerCar) {
    for (const car of this.traffic) {
      if (!car.active || car.occupied) continue;
      const dir = forward(car.heading);
      let desired = car.cruise;
      for (const other of this.all) {
        if (other === car || !other.active) continue;
        const dx = other.position.x - car.position.x, dz = other.position.z - car.position.z;
        const ahead = dx * dir.x + dz * dir.z, side = Math.abs(dx * dir.z - dz * dir.x);
        if (ahead > 0 && ahead < 9 && side < 3.2) { desired = 0; break; }
      }
      if (playerCar && playerCar !== car) {
        const d = dist2(car.position, playerCar.position);
        if (d < 8) desired = 0;
      }
      car.speed = damp(car.speed, desired, 2, dt);
      car.position.addScaledVector(dir, car.speed * dt);
      if (car.position.z > 305) car.position.z = -305;
      if (car.position.z < -305) car.position.z = 305;
      if (car.position.x > 305) car.position.x = -305;
      if (car.position.x < -305) car.position.x = 305;
      car.mesh.rotation.y = car.heading;
      for (const wheel of car.mesh.userData.wheels || []) wheel.rotation.x -= car.speed * dt * 1.6;
    }
  }
  summonPolice(position, amount, heading = 0) {
    let spawned = 0;
    for (const cop of this.police) {
      if (cop.active) continue;
      const angle = heading + Math.PI + (spawned - amount / 2) * .55;
      cop.position.set(position.x + Math.sin(angle) * (38 + spawned * 6), .08, position.z + Math.cos(angle) * (38 + spawned * 6));
      cop.heading = heading; cop.speed = 13; cop.active = true; cop.mesh.visible = true; cop.health = 100;
      if (++spawned >= amount) break;
    }
  }
  clearPolice() { for (const cop of this.police) { cop.active = false; cop.mesh.visible = false; cop.speed = 0; } }
  updatePolice(dt, game) {
    let count = 0;
    const target = game.player.position;
    for (let i = 0; i < this.police.length; i++) {
      const cop = this.police[i];
      if (!cop.active) continue;
      count++;
      const dx = target.x - cop.position.x, dz = target.z - cop.position.z;
      const distance = Math.hypot(dx, dz);
      const targetHeading = Math.atan2(dx, dz);
      let delta = Math.atan2(Math.sin(targetHeading - cop.heading), Math.cos(targetHeading - cop.heading));
      cop.heading += clamp(delta, -1.7 * dt, 1.7 * dt);
      cop.speed = damp(cop.speed, game.wanted > 0 ? 14 + game.wanted * 2.8 : 0, 1.7, dt);
      cop.position.addScaledVector(forward(cop.heading), cop.speed * dt);
      resolveCircle(cop.position, 1.5, game.city.colliders);
      cop.mesh.rotation.y = cop.heading;
      const flash = Math.floor(game.tick / 8) % 2 === 0;
      const red = cop.mesh.getObjectByName('sirenRed'), blue = cop.mesh.getObjectByName('sirenBlue');
      if (red) red.visible = flash; if (blue) blue.visible = !flash;
      for (const wheel of cop.mesh.userData.wheels || []) wheel.rotation.x -= cop.speed * dt * 1.6;
      if (distance < 32 && game.wanted > 0 && (game.tick + i * 13) % 90 === 0) {
        game.damagePlayer(3 + game.wanted * .8);
        game.spawnTracer(cop.position, target, 0xff375f);
      }
      if (distance < 4.6 && game.player.car && Math.abs(game.player.car.speed) > 7 && game.tick % 20 === 0) {
        game.damagePlayer(4); cop.health -= 18;
      }
      if (cop.health <= 0) { cop.active = false; cop.mesh.visible = false; game.showToast('VCPD UNIT DISABLED'); }
    }
    return count;
  }
  updateParkedCollisions(game) {
    const car = game.player.car;
    if (!car || Math.abs(car.speed) < 6) return;
    for (const other of this.traffic) {
      if (other === car || other.occupied || !other.active) continue;
      if (dist2(car.position, other.position) < 3.5 && car.collisionCooldown <= 0) {
        car.speed *= -.3; other.speed = 0; car.collisionCooldown = 1;
        game.addHeat(.6); game.damagePlayer(2); game.showToast('RECKLESS DRIVING · VCPD ALERTED');
      }
    }
  }
  update(dt, game) {
    this.updateTraffic(dt, game.player.car);
    for (const car of this.all) car.collisionCooldown = Math.max(0, car.collisionCooldown - dt);
    if (!game.shotMode) this.updateParkedCollisions(game);
    return this.updatePolice(dt, game);
  }
}
