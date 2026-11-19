import * as THREE from '../vendor/three.module.min.js';
import { FIXED_DT, PLAYER_START } from './config.js';
import { Random } from './random.js';
import { clamp, dist2, forward } from './math.js';
import { RenderSystem } from './render.js';
import { City } from './city.js';
import { Vehicles } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { Input } from './input.js';
import { AudioSystem } from './audio.js';
import { HUD } from './hud.js';
import { saveGame, loadGame, hasSave, clearSave } from './save.js';
import { getShot, initializeShot, simulationState } from './shots.js';
import { coolHeat, wantedFromHeat } from './world.js';

class Game {
  constructor() {
    this.activeShot = getShot();
    this.seed = this.activeShot?.seed ?? (Number(new URLSearchParams(location.search).get('seed')) || 60426);
    this.rng = new Random(this.seed);
    this.render = new RenderSystem(document.getElementById('game'));
    this.scene = this.render.scene;
    this.city = new City(this.scene, this.seed);
    this.vehicles = new Vehicles(this.scene, this.city, this.seed);
    this.pedestrians = new Pedestrians(this.scene, this.seed);
    this.player = new Player(this.scene, this.city, this.vehicles);
    this.missions = new Missions(this.scene);
    this.hud = new HUD(); this.audio = new AudioSystem();
    this.input = new Input(this.render.renderer.domElement);
    this.tick = 0; this.started = false; this.paused = false; this.mapOpen = false;
    this.gameOver = false; this.wanted = 0; this.heat = 0; this.enemyCount = 0;
    this.elapsed = 0; this.accumulator = 0; this.lastTime = performance.now();
    this.shotMode = null; this.lastCrimeTick = -10000;
    this.bindMenus(); this.hud.refreshStory(this.missions);
    document.getElementById('continue-button').style.display = hasSave() ? '' : 'none';
    if (this.activeShot) initializeShot(this, this.activeShot);
    window.__shotReady = false;
    window.__simState = () => simulationState(this);
    window.__renderStats = () => ({ calls: this.render.renderer.info.render.calls, triangles: this.render.renderer.info.render.triangles, geometries: this.render.renderer.info.memory.geometries, textures: this.render.renderer.info.memory.textures });
    this.audit = this.auditScene();
    window.__audit = this.audit;
    document.getElementById('status').textContent = `Meridian City ready. ${this.audit.meshes} meshes validated.`;
    requestAnimationFrame((time) => this.frame(time));
  }
  bindMenus() {
    const on = (id, action) => document.getElementById(id).addEventListener('click', action);
    on('start-button', () => this.start());
    on('continue-button', () => { this.start(); if (!loadGame(this)) this.showToast('NO VALID SAVE FOUND'); });
    on('resume-button', () => this.setPaused(false));
    on('save-button', () => this.showToast(saveGame(this) ? 'PROGRESS SAVED · PALMETTO RECORDING' : 'SAVE UNAVAILABLE IN THIS BROWSER'));
    on('load-button', () => { if (loadGame(this)) this.setPaused(false); else this.showToast('NO VALID SAVE FOUND'); });
    on('sound-button', () => { this.audio.setMuted(!this.audio.muted); document.getElementById('sound-button').textContent = `SOUND: ${this.audio.muted ? 'OFF' : 'ON'}`; });
    on('restart-button', () => { clearSave(); location.reload(); });
    on('close-map-button', () => this.toggleMap(false));
    on('respawn-button', () => this.respawn());
  }
  start() {
    if (this.started) return;
    this.started = true; this.paused = false; this.audio.start(); this.hud.show();
    document.getElementById('start-screen').classList.remove('active');
    this.render.renderer.domElement.requestPointerLock?.().catch?.(() => {});
    this.showCaption('ROXY', 'Welcome to Meridian, darling. Meet me at the Vice Room. And try not to scratch the paint.', 9);
  }
  setPaused(value) {
    if (!this.started || this.gameOver || this.shotMode) return;
    this.paused = value; this.mapOpen = false;
    document.getElementById('pause-screen').classList.toggle('active', value);
    document.getElementById('map-screen').classList.remove('active');
    if (value) document.exitPointerLock?.();
    else this.render.renderer.domElement.requestPointerLock?.().catch?.(() => {});
  }
  toggleMap(value = !this.mapOpen) {
    if (!this.started || this.shotMode || this.gameOver) return;
    this.mapOpen = value; this.paused = value;
    document.getElementById('map-screen').classList.toggle('active', value);
    document.getElementById('pause-screen').classList.remove('active');
    this.hud.refreshStory(this.missions);
    if (value) { this.hud.drawMap(this.hud.bigMap, this, true); document.exitPointerLock?.(); }
    else this.render.renderer.domElement.requestPointerLock?.().catch?.(() => {});
  }
  globalInput() {
    if (this.shotMode || !this.started) return;
    if (this.input.consume('Escape') || this.input.consume('KeyP')) {
      if (this.mapOpen) this.toggleMap(false); else this.setPaused(!this.paused);
    }
    if (this.input.consume('KeyM')) this.toggleMap();
  }
  showToast(text, duration = 3) { this.hud.toast(text, duration); }
  showCaption(speaker, text, duration = 6) { this.hud.caption(speaker, text, duration); }
  spawnTracer(from, to, color) { this.render.spawnTracer(from, to, color); }
  addHeat(amount) {
    const previous = this.wanted;
    this.heat = clamp(this.heat + amount, 0, 5);
    this.wanted = this.heat < .16 ? 0 : Math.min(5, Math.max(1, Math.ceil(this.heat)));
    this.lastCrimeTick = this.tick;
    if (this.wanted > previous) {
      this.vehicles.summonPolice(this.player.position, Math.min(5, this.wanted + 1), this.player.heading);
      this.showToast(`WANTED LEVEL ${this.wanted} · VCPD RESPONDING`);
    }
  }
  damagePlayer(amount) {
    if (this.gameOver || this.shotMode) return;
    const absorbed = Math.min(this.player.armor, amount * .65);
    this.player.armor -= absorbed; this.player.health -= amount - absorbed;
    this.hud.damage(); this.audio.effect('hit');
    if (this.player.health <= 0) {
      this.player.health = 0; this.gameOver = true; this.paused = true;
      document.getElementById('gameover-screen').classList.add('active'); document.exitPointerLock?.();
    }
  }
  respawn() {
    if (this.player.car) { this.vehicles.exit(this.player.car); this.player.car = null; }
    this.player.teleport(PLAYER_START.x, PLAYER_START.z, PLAYER_START.heading);
    this.player.health = 100; this.player.armor = 35; this.player.cash = Math.max(0, this.player.cash - 250);
    this.heat = 0; this.wanted = 0; this.vehicles.clearPolice(); this.gameOver = false; this.paused = false;
    document.getElementById('gameover-screen').classList.remove('active'); this.showToast('PATCHED UP · HOSPITAL BILL $250');
  }
  fireWeapon() {
    const origin = this.player.position, heading = this.player.car ? this.player.car.heading : this.player.lookYaw;
    const f = forward(heading); const end = new THREE.Vector3(origin.x + f.x * 38, origin.y, origin.z + f.z * 38);
    let hitCop = null, best = 38;
    for (const cop of this.vehicles.police) {
      if (!cop.active) continue;
      const dx = cop.position.x - origin.x, dz = cop.position.z - origin.z, d = Math.hypot(dx, dz);
      if (d < best && (dx * f.x + dz * f.z) / Math.max(.01, d) > .93) { hitCop = cop; best = d; }
    }
    if (hitCop) {
      end.copy(hitCop.position); hitCop.health -= 45; this.addHeat(.3);
      this.render.burst(hitCop.position, 0xff815e);
      if (hitCop.health <= 0) {
        hitCop.active = false; hitCop.mesh.visible = false; this.missions.onKill(this);
        this.player.cash += 75; this.showToast('UNIT DOWN · +$75');
      }
    } else {
      const person = this.pedestrians.hitFrom(origin, heading, 32);
      if (person) { end.copy(person.position); this.addHeat(.8); this.showToast('CIVILIAN DOWN · VCPD ALERTED'); }
      else this.addHeat(.09);
    }
    this.audio.effect('shot'); this.pedestrians.scare(origin, 35); this.render.spawnTracer(origin, end);
  }
  update(dt) {
    this.tick++;
    this.globalInput();
    this.player.update(dt, this.input, this, true);
    this.enemyCount = this.vehicles.update(dt, this);
    this.pedestrians.update(dt, this);
    this.missions.update(dt, this);
    this.city.update(this.tick * FIXED_DT);
    if (this.tick - this.lastCrimeTick > 420) this.heat = coolHeat(this.heat, this.wanted, this.tick, this.lastCrimeTick, dt);
    this.wanted = wantedFromHeat(this.heat); if (!this.wanted && this.enemyCount && this.heat === 0) this.vehicles.clearPolice();
    this.audio.update(this.player.car?.speed ?? 0, this.wanted, Boolean(this.player.car));
    this.hud.update(dt, this); this.hud.refreshStory(this.missions);
    this.input.endFrame();
  }
  auditScene() {
    let meshes = 0, instanced = 0, invalid = 0, shadowed = 0;
    this.scene.traverse((object) => {
      if (!object.isMesh && !object.isInstancedMesh && !object.isPoints && !object.isLine) return;
      meshes++; if (object.isInstancedMesh) instanced++;
      const p = object.position, s = object.scale;
      if (![p.x, p.y, p.z, s.x, s.y, s.z].every(Number.isFinite)) invalid++;
      if (object.castShadow && object.receiveShadow) shadowed++;
      const attributes = object.geometry?.attributes;
      if (attributes) for (const attribute of Object.values(attributes)) {
        const array = attribute.array;
        for (let i = 0; i < array.length; i++) if (!Number.isFinite(array[i])) { invalid++; break; }
      }
    });
    return { meshes, instanced, invalid, shadowed, fog: Boolean(this.scene.fog), three: THREE.REVISION };
  }
  frame(time) {
    const rawDt = Math.min(.05, Math.max(0, (time - this.lastTime) / 1000)); this.lastTime = time;
    this.elapsed += rawDt;
    if (!this.started) this.render.intro(rawDt);
    else if (this.shotMode) {
      if (this.tick < this.activeShot.frame) {
        let steps = 0;
        while (this.tick < this.activeShot.frame && steps < 5) { this.update(FIXED_DT); steps++; }
        this.render.update(this, FIXED_DT * steps);
      } else this.render.renderer.render(this.scene, this.render.camera);
      if (this.tick >= this.activeShot.frame) {
        window.__shotReady = true;
        window.__captureState = simulationState(this);
      }
    } else {
      this.globalInput();
      if (!this.paused) {
        this.accumulator = Math.min(this.accumulator + rawDt, FIXED_DT * 5);
        while (this.accumulator >= FIXED_DT) { this.update(FIXED_DT); this.accumulator -= FIXED_DT; }
        this.render.update(this, rawDt);
      } else { this.hud.update(rawDt, this); this.render.renderer.render(this.scene, this.render.camera); }
    }
    requestAnimationFrame((next) => this.frame(next));
  }
}

const game = new Game();
window.__gameReady = true;
