import * as THREE from '../vendor/three.module.min.js';
import { LOCATIONS, MISSION_NAMES } from './config.js';
import { dist2 } from './math.js';

const JOBS = [
  { title: MISSION_NAMES[0], location: 'club', type: 'travel', description: 'Roxy has a proposition. Meet her under the Vice Room sign.', objective: 'Meet Roxy at the Vice Room', speaker: 'ROXY', line: 'You want Meridian? Start with a fast car and a quiet delivery. Come see me.', reward: 250 },
  { title: MISSION_NAMES[1], location: 'marina', type: 'collect', description: 'A stranger left a turquoise case at Vesper Marina. Collect it.', objective: 'Recover the Vesper case', speaker: 'ROXY', line: 'The case is by the marina. No names, no questions. And watch the water.', reward: 800 },
  { title: MISSION_NAMES[2], location: 'hotel', type: 'chase', description: 'The case contains a Hotel Solara access drive. Deliver it to the concierge.', objective: 'Reach Hotel Solara', speaker: 'ROXY', line: 'VCPD scanners just lit up. Lose the tail or give them a reason to keep chasing.', reward: 1200 },
  { title: MISSION_NAMES[3], location: 'plaza', type: 'fight', description: 'The Solara deal was a setup. Break the VCPD cordon at Meridian Plaza.', objective: 'Disable 3 pursuing units', speaker: 'ROXY', line: 'They sold us out. Three units between you and the bridge. Clear a path!', reward: 1800 },
  { title: MISSION_NAMES[4], location: 'safehouse', type: 'escape', description: 'The city is hot. Survive the pursuit and get back to Palmetto.', objective: 'Escape to the Palmetto safehouse', speaker: 'ROXY', line: 'Last mile, darling. Bring that beautiful car home and the city is yours.', reward: 3000 },
];

export class Missions {
  constructor(scene) {
    this.stage = 0; this.progress = 0; this.count = 0; this.complete = false;
    this.marker = new THREE.Group(); this.marker.name = 'StoryMarker'; scene.add(this.marker);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x39f3ed, transparent: true, opacity: .9, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.2, 48), ringMaterial); ring.rotation.x = -Math.PI / 2; ring.position.y = .2; this.marker.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.55, 2.55, 5.5, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x30e8eb, transparent: true, opacity: .075, side: THREE.DoubleSide, depthWrite: false })); beam.position.y = 2.8; this.marker.add(beam);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(.55), new THREE.MeshBasicMaterial({ color: 0xff65a8 })); diamond.name = 'MarkerDiamond'; diamond.position.y = 4; this.marker.add(diamond);
    this.positionMarker();
  }
  get job() { return JOBS[Math.min(this.stage, JOBS.length - 1)]; }
  get target() { return this.complete ? LOCATIONS.safehouse : LOCATIONS[this.job.location]; }
  positionMarker() { this.marker.position.set(this.target.x, .05, this.target.z); }
  restore(data) {
    this.stage = Math.max(0, Math.min(5, data.mission | 0));
    this.progress = Number(data.missionProgress) || 0; this.count = Number(data.missionCount) || 0;
    this.complete = this.stage >= JOBS.length; this.positionMarker(); this.marker.visible = !this.complete;
  }
  advance(game) {
    const finished = this.job;
    game.player.cash += finished.reward;
    game.heat = Math.max(0, game.heat - .4);
    game.audio.effect('objective'); game.audio.effect('cash');
    game.showToast(`JOB COMPLETE · +$${finished.reward.toLocaleString()}`);
    this.stage++; this.progress = 0; this.count = 0; this.complete = this.stage >= JOBS.length;
    this.positionMarker(); this.marker.visible = !this.complete;
    if (!this.complete) game.showCaption(this.job.speaker, this.job.line, 7);
    else {
      game.wanted = 0; game.heat = 0; game.vehicles.clearPolice();
      game.showCaption('ROXY', 'You did it. Meridian knows your name now. The next move is ours.', 12);
      game.showToast('STORY COMPLETE · $8,050 EARNED · FREE ROAM UNLOCKED');
    }
  }
  onKill(game) {
    if (!this.complete && this.job.type === 'fight') {
      this.count++;
      game.showToast(`PURSUIT UNIT DISABLED · ${Math.min(3, this.count)} / 3`);
      if (this.count >= 3) this.advance(game);
    }
  }
  update(dt, game) {
    const tick = game.tick * .0166667;
    const diamond = this.marker.getObjectByName('MarkerDiamond');
    if (diamond) { diamond.rotation.y = tick * 1.4; diamond.position.y = 4 + Math.sin(tick * 2) * .35; }
    this.marker.rotation.y = tick * .35;
    if (this.complete || game.paused) return;
    const distance = dist2(game.player.position, this.target);
    if (this.job.type === 'travel' && distance < 7) this.advance(game);
    else if (this.job.type === 'collect' && distance < 7) {
      game.wanted = Math.max(1, game.wanted); game.heat = Math.max(game.heat, 1.12); game.vehicles.summonPolice(game.player.position, 2);
      this.advance(game);
    } else if (this.job.type === 'chase' && distance < 8) {
      game.wanted = 2; game.heat = 2.15; game.vehicles.summonPolice(game.player.position, 3);
      this.advance(game);
    } else if (this.job.type === 'escape') {
      if (distance < 8) {
        this.progress += dt;
        if (this.progress > 2.5) this.advance(game);
      } else this.progress = Math.max(0, this.progress - dt);
    }
  }
  objectiveText() {
    if (this.complete) return 'Free roam · make your own story';
    if (this.job.type === 'fight') return `Disable pursuing units · ${this.count} / 3`;
    if (this.job.type === 'escape' && this.progress > 0) return `Hold the safehouse · ${Math.ceil(2.5 - this.progress)}s`;
    return this.job.objective;
  }
  storyStates() {
    return JOBS.map((job, i) => ({ title: job.title, state: i < this.stage ? 'done' : i === this.stage && !this.complete ? 'current' : '' }));
  }
}
