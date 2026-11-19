import { SHOTS } from './config.js';

export function getShot() {
  const params = new URLSearchParams(location.search);
  const name = params.get('shot');
  if (!name || !SHOTS[name]) return null;
  return { name, seed: Number(params.get('seed')) || 60426, ...SHOTS[name] };
}

class ShotInput {
  constructor(game, scene) { this.game = game; this.scene = scene; this.enabled = true; }
  axis() {
    const tick = this.game.tick;
    if (this.scene === 0) return { x: 0, y: tick < 65 ? 1 : 0 };
    if (this.scene === 1) return { x: Math.sin(tick / 95) * .08, y: 1 };
    if (this.scene === 2) return { x: 0, y: 1 };
    if (this.scene === 3) return { x: 0, y: this.game.player.distanceTo(this.game.missions.target) > 12 ? 1 : 0 };
    return { x: 0, y: 0 };
  }
  down() { return false; }
  consume() { return false; }
  mouse() { return [0, 0]; }
  endFrame() {}
  setEnabled() {}
}

export function initializeShot(game, shot) {
  game.shotMode = shot.name;
  document.body.classList.add('capture-mode');
  game.started = true; game.paused = false;
  const [x, z] = shot.position;
  game.wanted = shot.scene === 2 ? 3 : shot.scene === 3 ? 1 : 0;
  game.heat = shot.scene === 2 ? 2.85 : shot.scene === 3 ? .85 : 0;
  game.missions.restore({ mission: shot.scene === 0 || shot.scene === 1 ? 0 : shot.scene === 2 ? 3 : 1, missionProgress: 0, missionCount: shot.scene === 2 ? 1 : 0 });
  game.player.teleport(x, z, shot.heading);
  game.player.health = shot.scene === 2 ? 82 : 100; game.player.armor = shot.scene === 2 ? 31 : 50;
  if (shot.scene === 1 || shot.scene === 2) {
    const car = game.vehicles.parked[0];
    car.position.set(x, .08, z); car.heading = shot.heading; car.mesh.rotation.y = shot.heading; car.speed = shot.scene === 2 ? 24 : 19;
    game.vehicles.enter(car); game.player.car = car; car.occupied = true;
    game.player.position.copy(car.position); game.player.position.y = .16;
    game.player.lookYaw = shot.heading; game.player.heading = shot.heading;
    if (shot.scene === 2) game.vehicles.summonPolice(game.player.position, 5, shot.heading);
  } else if (shot.scene === 3) game.vehicles.summonPolice({ x: x + 35, z: z - 30 }, 2, shot.heading);
  game.hud.show();
  document.getElementById('start-screen').classList.remove('active');
  game.showCaption(shot.scene === 2 ? 'VCPD DISPATCH' : 'ROXY', shot.scene === 2 ? 'All units: suspect heading east on Solara. Intercept. Do not let them reach the docks.' : shot.scene === 3 ? 'The Vesper case is straight ahead. Keep your cool, pick it up, and we are one step closer.' : 'Welcome to Meridian, darling. The whole city is listening.', 60);
  game.input = new ShotInput(game, shot.scene);
  game.activeShot = shot;
  return game.input;
}

export function simulationState(game) {
  const position = game.player.position;
  const round = (value) => Math.round(value * 10000) / 10000;
  return {
    tick: game.tick, seed: game.seed, shot: game.shotMode || null,
    player: { x: round(position.x), y: round(position.y), z: round(position.z), heading: round(game.player.heading), health: round(game.player.health) },
    speed: round(game.player.car ? game.player.car.speed : game.player.speed),
    wanted: game.wanted, heat: round(game.heat),
    mission: { stage: game.missions.stage, count: game.missions.count, progress: round(game.missions.progress) },
    enemies: game.vehicles.police.filter((car) => car.active).length,
    pedestrians: game.pedestrians.people.filter((person) => person.active).length,
    traffic: game.vehicles.traffic.filter((car) => car.active).length,
    rng: game.rng.state,
  };
}
