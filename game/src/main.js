// Boot and the one loop. Fixed 1/60 s simulation steps, three.js render,
// Web Audio (all synthesised; per-frame calls wrapped in try/catch so an
// audio error can never stop the render loop), title screen, pause/save menus
// and screenshot shot staging.
//
// ?shot=cover|driving|chase|mission&seed=N stages one scene, paints it twice
// and sets window.__shotReady for the capture harness. Otherwise the game runs
// normally with keyboard and mouse.

import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createWorld } from './world.js';
import { createRenderer } from './render.js';
import { createHUD } from './hud.js';
import { stageShot } from './shots.js';
import { saveGame, loadGame, defaultSave } from './save.js';

const MAX_FRAME = 0.25;
const STEP = 1 / 60;
const ACTION_CONFIRM = 1;
const ACTION_PAUSE = 2;
const ACTION_ENTER = 4;
const ACTION_SHOOT = 8;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isFinite(seedParam) ? seedParam : 0x5a1f3e;

const canvas = document.getElementById('game');
const exceptions = [];
window.addEventListener('error', (event) => exceptions.push(String(event.message)));
window.addEventListener('unhandledrejection', (event) => exceptions.push(String(event.reason)));

let world = null;
let input = null;
let audio = null;
let renderer = null;
let hud = null;
let screen = 'title'; // title | play | paused | menu | save
let briefingTtl = 0;
let accumulator = 0;
let last = performance.now();
let frame = 0;
let footTimer = 0;
let lastStars = 0;

function player() { return world.entities().player; }

function boot(saveData) {
  world = createWorld(seed, saveData || null);
  input = createInput(canvas);
  audio = createAudio();
  renderer = createRenderer(canvas, world);
  hud = createHUD(document);
  screen = 'title';
  briefingTtl = 0;
  accumulator = 0;
  frame = 0;
  footTimer = 0;
  lastStars = 0;
  wireButtons();
  window.addEventListener('resize', onResize);
  onResize();
}

function wireButtons() {
  const click = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
  click('btn-resume', () => { screen = 'play'; });
  click('btn-save', doSave);
  click('btn-load', doLoad);
  click('btn-restart', () => { boot(null); screen = 'play'; });
  click('btn-title', () => { boot(null); screen = 'title'; });
  click('btn-newgame', () => { boot(null); startGame(); });
  click('btn-loadgame', () => { doLoad(); screen = 'play'; });
}

function onResize() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * Math.min(window.devicePixelRatio || 1, 2);
  canvas.height = height * Math.min(window.devicePixelRatio || 1, 2);
  renderer.resize(width, height);
}

function showBriefing(text) { if (text) briefingTtl = 200; }

function startGame() {
  screen = 'play';
  showBriefing(world.getBriefing());
}

function doSave() {
  const ok = saveGame(world.save());
  showBriefing(ok ? 'Game saved.' : 'Save failed (storage blocked?).');
  screen = 'play';
}

function doLoad() {
  const data = loadGame();
  if (data) { boot(data); screen = 'play'; showBriefing('Save loaded.'); }
  else showBriefing('No save found.');
}

function stepSimulation(packet) {
  const res = world.step(STEP, packet);
  const stars = Math.min(5, Math.floor(res.wanted));
  if (stars > 0 && stars !== lastStars) { showBriefing('Wanted level: ' + stars + '.'); lastStars = stars; }
  if (stars === 0) lastStars = 0;
  return res;
}

function playerCar() {
  const ent = world.entities();
  return player().mode === 'car' && player().car !== null ? ent.cars[player().car] : null;
}

let packetShoot = false;
let footStepFlag = false;

function footStep() {
  const result = footStepFlag;
  footStepFlag = false;
  return result;
}

function audioTick(shooting) {
  const ent = world.entities();
  const car = playerCar();
  const policeCars = ent.police.map((i) => ent.cars[i]);
  try {
    audio.tick(car, policeCars, shooting, footStep());
  } catch {
    // Audio must never stop the render loop.
  }
}

function frameTime(now) {
  if (shot) { paintShot(now); return; }
  requestAnimationFrame(frameTime);
  const dt = Math.min((now - last) / 1000, MAX_FRAME);
  last = now;
  frame += 1;

  const actions = input.takeActions();

  if (screen === 'title') {
    if (actions & ACTION_CONFIRM) startGame();
  } else if (screen === 'menu' || screen === 'paused') {
    if (actions & ACTION_PAUSE) screen = 'play';
  } else if (screen === 'save') {
    if (actions & ACTION_PAUSE) screen = 'play';
  } else if (screen === 'play') {
    handlePlay(actions, dt);
  }

  const ent = world.entities();
  const state = world.snapshot();
  const briefing = briefingTtl > 0 ? world.getBriefing() : '';
  if (briefingTtl > 0) briefingTtl -= 1;

  renderer.draw(ent, packetShoot);
  hud.draw(state, ent, screen, briefing);
  audioTick(packetShoot);
  packetShoot = false;
}

function handlePlay(actions, dt) {
  if (actions & ACTION_PAUSE) { screen = 'menu'; return; }
  if (actions & ACTION_SHOOT) packetShoot = true;
  accumulator += dt;
  while (accumulator >= STEP) {
    const move = input.direction();
    stepSimulation({
      move,
      shoot: packetShoot,
      enter: (actions & ACTION_ENTER) !== 0,
      exit: false,
    });
    packetShoot = false;
    accumulator -= STEP;
    if (player().mode === 'foot' && (move.x !== 0 || move.z !== 0)) {
      footTimer += STEP;
      if (footTimer > 0.42) { footTimer = 0; footStepFlag = true; }
    }
  }
}

function paintShot(now) {
  requestAnimationFrame(paintShot);
  const ent = world.entities();
  const state = world.snapshot();
  renderer.draw(ent, false);
  hud.draw(state, ent, 'play', '');
  audioTick(false);
  if (window.__shotReady) return;
  if (frame < 2) { frame += 1; return; }
  // Freeze the animation clock with the frame still being painted, so the
  // harness captures exactly this frame whatever moment it reads the flag.
  window.__shotReady = true;
  renderer.freeze();
}

window.__stateSnapshot = () => world.snapshot();

// Shot inspection: where the hero, the traffic, the police and the objective
// marker land on screen, as fractions of the canvas (y from the top). The
// capture and determinism tools read this to check a frame shows what it
// claims to show; nothing in the game reads it.
window.__sceneCheck = () => {
  const ent = world.entities();
  const p = ent.player;
  const car = p.car !== null ? ent.cars[p.car] : null;
  const focus = car || p;
  const marker = ent.missions ? ent.missions.target : null;
  const inFrame = (x, y, z) => {
    const v = renderer.project(x, y, z);
    return v.visible ? { x: Number(v.x.toFixed(3)), y: Number(v.y.toFixed(3)) } : null;
  };
  const carsInFrame = [];
  for (const c of ent.cars) {
    const v = inFrame(c.x, 1.0, c.z);
    if (v) carsInFrame.push({ police: !!c.police, player: !!c.playerOwned, ...v });
  }
  let pedsInFrame = 0;
  for (const ped of ent.peds) if (inFrame(ped.x, 1.0, ped.z)) pedsInFrame += 1;
  return {
    mode: p.mode,
    speedKmh: Number((p.speed * 3.6).toFixed(0)),
    stars: Math.min(5, Math.floor(world.snapshot().wanted)),
    hero: inFrame(focus.x, car ? 1.1 : 1.1, focus.z),
    marker: marker ? inFrame(marker.x, 6, marker.z) : null,
    carsInFrame,
    policeInFrame: carsInFrame.filter((c) => c.police).length,
    trafficInFrame: carsInFrame.filter((c) => !c.police && !c.player).length,
    pedsInFrame,
  };
};

if (shot) {
  boot(null);
  screen = 'play';
  stageShot(shot, world);
  last = performance.now();
  requestAnimationFrame(paintShot);
} else {
  boot(null);
  last = performance.now();
  requestAnimationFrame(frameTime);
}
