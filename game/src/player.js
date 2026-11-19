import * as THREE from '../vendor/three.module.min.js';
import { PLAYER_START, WORLD_LIMIT } from './config.js';
import { clamp, dampAngle, dist2, forward, right, resolveCircle } from './math.js';

function heroModel() {
  const group = new THREE.Group(); group.name = 'Hero';
  const skin = new THREE.MeshStandardMaterial({ color: 0xa96848, roughness: .75 });
  const shirt = new THREE.MeshStandardMaterial({ color: 0x20b6b5, roughness: .72 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xe8ddca, roughness: .8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x13202b, roughness: .68 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.62, .75, .34), shirt); torso.position.y = 1.28; group.add(torso);
  const openShirt = new THREE.Mesh(new THREE.BoxGeometry(.12, .66, .02), cream); openShirt.position.set(0, 1.3, .181); group.add(openShirt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 10, 7), skin); head.position.y = 1.91; group.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.247, 10, 5, 0, Math.PI * 2, 0, Math.PI * .47), dark); hair.position.y = 1.98; group.add(hair);
  for (const x of [-.115, .115]) {
    const lens = new THREE.Mesh(new THREE.BoxGeometry(.16, .065, .025), new THREE.MeshStandardMaterial({ color: 0x091925, metalness: .6, roughness: .15 })); lens.position.set(x, 1.94, .217); group.add(lens);
  }
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * .4, 1.56, 0); group.add(arm);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(.23, .34, .26), shirt); sleeve.position.y = -.12; arm.add(sleeve);
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(.17, .49, .19), skin); forearm.position.y = -.49; arm.add(forearm); arms.push(arm);
    const leg = new THREE.Group(); leg.position.set(side * .17, .92, 0); group.add(leg);
    const trouser = new THREE.Mesh(new THREE.BoxGeometry(.24, .8, .26), cream); trouser.position.y = -.39; leg.add(trouser);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(.26, .16, .43), dark); shoe.position.set(0, -.82, .06); leg.add(shoe); legs.push(leg);
  }
  const gun = new THREE.Group(); gun.name = 'Handgun';
  const slide = new THREE.Mesh(new THREE.BoxGeometry(.09, .11, .38), new THREE.MeshStandardMaterial({ color: 0x2f3b40, metalness: .9, roughness: .25 })); gun.add(slide);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.09, .24, .12), dark); grip.position.set(0, -.14, -.1); gun.add(grip);
  gun.position.set(0, -.62, .18); arms[1].add(gun);
  group.userData.arms = arms; group.userData.legs = legs;
  group.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

export class Player {
  constructor(scene, city, vehicles) {
    this.city = city; this.vehicles = vehicles;
    this.mesh = heroModel(); scene.add(this.mesh);
    this.position = new THREE.Vector3(PLAYER_START.x, .16, PLAYER_START.z);
    this.heading = PLAYER_START.heading;
    this.lookYaw = PLAYER_START.heading;
    this.lookPitch = .25;
    this.car = null; this.nearestCar = null;
    this.health = 100; this.armor = 50; this.cash = 2450;
    this.speed = 0; this.lastShot = -100; this.moving = false;
    this.syncMesh();
  }
  syncMesh() {
    this.mesh.position.copy(this.position); this.mesh.rotation.y = this.heading;
    this.mesh.visible = !this.car;
  }
  teleport(x, z, heading = this.heading) {
    if (this.car) { this.vehicles.exit(this.car); this.car = null; }
    this.position.set(x, .16, z); this.heading = heading; this.lookYaw = heading;
    this.syncMesh();
  }
  update(dt, input, game, allowControl = true) {
    const mouse = input.mouse();
    if (allowControl) {
      this.lookYaw -= mouse[0] * .0024;
      this.lookPitch = clamp(this.lookPitch + mouse[1] * .0013, -.1, .72);
    }
    if (allowControl && input.consume('KeyE')) {
      if (this.car) this.leaveCar(game);
      else if (this.nearestCar) this.enterCar(this.nearestCar, game);
    }
    if (this.car) {
      const axes = allowControl ? input.axis() : { x: 0, y: 0 };
      const handbrake = allowControl && input.down('Space');
      const collided = this.vehicles.drive(this.car, { x: axes.x, y: axes.y, handbrake }, dt, this.city.colliders);
      if (collided && Math.abs(this.car.speed) > 8) game.addHeat(.04);
      this.position.copy(this.car.position); this.position.y = .16;
      this.heading = this.car.heading; this.speed = this.car.speed;
      this.lookYaw = allowControl && (Math.abs(axes.x) > 0 || Math.abs(mouse[0]) > 0) ? this.lookYaw : dampAngle(this.lookYaw, this.car.heading, 2.7, dt);
    } else if (allowControl) {
      const axes = input.axis();
      const length = Math.hypot(axes.x, axes.y);
      this.moving = length > 0;
      if (this.moving) {
        const normalizedX = axes.x / Math.max(1, length), normalizedY = axes.y / Math.max(1, length);
        const f = forward(this.lookYaw), r = right(this.lookYaw);
        const dx = f.x * normalizedY + r.x * normalizedX, dz = f.z * normalizedY + r.z * normalizedX;
        const targetHeading = Math.atan2(dx, dz);
        this.heading = dampAngle(this.heading, targetHeading, 13, dt);
        this.speed = input.down('ShiftLeft', 'ShiftRight') ? 8.5 : 5.1;
        this.position.x += dx * this.speed * dt;
        this.position.z += dz * this.speed * dt;
        resolveCircle(this.position, .52, this.city.colliders);
        this.position.x = clamp(this.position.x, -WORLD_LIMIT, WORLD_LIMIT);
        this.position.z = clamp(this.position.z, -WORLD_LIMIT, WORLD_LIMIT);
      } else this.speed = 0;
      if (input.down('KeyF')) { this.heading = this.lookYaw; this.tryFire(game); }
      this.nearestCar = this.vehicles.nearest(this.position, 5.8);
    } else this.speed = 0;
    if (this.car && allowControl && input.down('KeyF')) this.tryFire(game);
    this.animate(game.tick);
    this.syncMesh();
  }
  enterCar(car, game) {
    if (!this.vehicles.enter(car)) return;
    this.car = car; this.nearestCar = null; this.speed = car.speed;
    game.addHeat(car.traffic ? .35 : .08);
    game.audio.effect('enter'); game.showToast(`${car.type === 'sport' ? 'COMET S' : car.type === 'van' ? 'MERIDIAN VAN' : 'VICE COUPE'} · ACQUIRED`);
    game.pedestrians.scare(this.position, 16);
  }
  leaveCar(game) {
    const car = this.car;
    if (!car) return;
    const side = right(car.heading);
    this.position.set(car.position.x + side.x * 2.6, .16, car.position.z + side.z * 2.6);
    resolveCircle(this.position, .52, this.city.colliders);
    car.speed *= .8; this.vehicles.exit(car); this.car = null; this.speed = 0;
    game.audio.effect('enter');
  }
  tryFire(game) {
    if (game.tick - this.lastShot < 10) return;
    this.lastShot = game.tick; game.fireWeapon();
  }
  animate(tick) {
    const moving = this.moving && !this.car;
    const phase = tick * (this.speed > 6 ? .25 : .16);
    const swing = moving ? Math.sin(phase) * .68 : 0;
    this.mesh.userData.legs[0].rotation.x = swing;
    this.mesh.userData.legs[1].rotation.x = -swing;
    this.mesh.userData.arms[0].rotation.x = -swing * .75;
    this.mesh.userData.arms[1].rotation.x = tick - this.lastShot < 14 ? -1.15 : swing * .75;
    this.mesh.position.y = .16 + (moving ? Math.abs(Math.sin(phase)) * .035 : Math.sin(tick * .04) * .008);
  }
  distanceTo(point) { return dist2(this.position, point); }
}
