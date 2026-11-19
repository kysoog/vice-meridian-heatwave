// The simulation: city traffic, pedestrians, player on foot and in cars,
// collisions, crime and wanted level, police response and missions. One fixed
// step per call, driven only by the seeded RNG and the input packet, so the
// same seed and the same inputs always produce the same state.

import { createRandom, clamp, approach, dist, dist2, yawToward, wrapAngle } from './math.js';
import { cityLayout, lanePos, laneLateral, roadYaw, buildingBoxes, BLOCK_SIZE, LANE_WIDTH } from './city.js';
import { createMissions } from './missions.js';
import { defaultSave } from './save.js';

const STEP = 1 / 60;
const WORLD = null; // set by createWorld

const CRUISING = 20; // m/s for traffic
const MAX_SPEED = 32;
const REVERSE = -9;

export function createWorld(seed, saveData) {
  const rng = createRandom(seed);
  const layout = cityLayout();
  const boxes = buildingBoxes(layout);

  const save = saveData || defaultSave();

  // ---------- player ----------
  const player = {
    mode: 'foot', // foot | car
    x: 0, z: 0, yaw: 0, speed: 0,
    car: null, // index into cars when driving
    onFootYaw: 0,
    money: save.money,
  };

  // ---------- entities ----------
  const cars = [];   // every drivable car
  const peds = [];
  const police = []; // indices into cars of active police cars

  let tick = 0;
  let wanted = 0;
  let wantedTimer = 0; // seconds since last crime / police sighting
  let decayTimer = 0;
  let crimeX = 0, crimeZ = 0;
  let policeSpawnTimer = 0;

  const missions = createMissions(save.completed || 0);
  missions.index = Math.min(Math.max(save.missionIndex || 0, 0), missions.list.length);
  let missionObjective = 'Start a new game from the title screen.';
  let briefing = '';
  let showBriefing = false;
  // A job is waiting to start until updateMission picks it up. Using a flag
  // (not the briefing string) is what lets the chain advance past job one.
  let missionPending = true;

  // ---------- helpers ----------
  function newCar(x, z, yaw, type, color) {
    const axis = Math.abs(Math.sin(yaw)) < 0.5 ? 'z' : 'x';
    const dir = axis === 'z' ? (Math.cos(yaw) > 0 ? 1 : -1) : (Math.sin(yaw) > 0 ? 1 : -1);
    // nearest lane on this road
    let roadIndex = 0, best = 1e9;
    const fixed = axis === 'z' ? z : x;
    for (let i = 0; i < layout.roads.length; i++) {
      const d = Math.abs(fixed - layout.roads[i]);
      if (d < best) { best = d; roadIndex = i; }
    }
    let laneIndex = 0; let laneBest = 1e9;
    const lateral = axis === 'z' ? x : z;
    for (let j = 0; j < layout.lanes.length; j++) {
      const d = Math.abs(lateral - laneLateral(layout, roadIndex, j));
      if (d < laneBest) { laneBest = d; laneIndex = j; }
    }
    return {
      x, z, yaw, speed: 0, health: 100,
      axis, roadIndex, laneIndex, dir,
      type, police: type === 'police',
      color, smoketime: 0, turnTimer: 0,
      mesh: null, wheels: null, lightBar: null,
    };
  }

  function spawnTraffic(count, nearX, nearZ, minDist) {
    for (let i = 0; i < count; i++) {
      const axis = rng.bool() ? 'z' : 'x';
      const roadIndex = rng.int(0, layout.roads.length);
      const laneIndex = rng.int(0, layout.lanes.length);
      const along = rng.float(-layout.half + 20, layout.half - 20);
      const pos = lanePos(layout, axis, roadIndex, laneIndex, along);
      if (nearX !== undefined && dist(pos.x, pos.z, nearX, nearZ) < minDist) continue;
      const yaw = roadYaw(axis, layout.lanes[laneIndex] >= 0 ? 1 : -1);
      const car = newCar(pos.x, pos.z, yaw, 'traffic', pickCarColor(rng));
      cars.push(car);
    }
  }

  const CAR_COLORS = [
    0xd94f3d, 0x2f6fb2, 0xe8e8ea, 0xe8b73a, 0x3f9e6b,
    0x8a5cc4, 0xc86a2a, 0x4fb0c6, 0x9aa0aa, 0x2f3440,
  ];

  function pickCarColor(rng) {
    return CAR_COLORS[rng.int(0, CAR_COLORS.length)];
  }

  /** Traffic on the roads within `radius` of a point: a busy neighbourhood. */
  function spawnTrafficBand(count, cx, cz, radius) {
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const axis = rng.bool() ? 'z' : 'x';
        const roadIndex = rng.int(0, layout.roads.length);
        const laneIndex = rng.int(0, layout.lanes.length);
        const base = axis === 'z' ? cz : cx;
        const along = clamp(base + rng.float(-radius, radius), -layout.half + 20, layout.half - 20);
        const pos = lanePos(layout, axis, roadIndex, laneIndex, along);
        if (dist(pos.x, pos.z, cx, cz) > radius) continue;
        const yaw = roadYaw(axis, layout.lanes[laneIndex] >= 0 ? 1 : -1);
        cars.push(newCar(pos.x, pos.z, yaw, 'traffic', pickCarColor(rng)));
        break;
      }
    }
  }

  function spawnPed() {
    const bx = layout.blocks[rng.int(0, layout.blocks.length)];
    const bz = layout.blocks[rng.int(0, layout.blocks.length)];
    addPedOnBlock(bx, bz);
  }

  /** Pedestrians on the block kerbs within `radius` of a point. */
  function spawnPedNear(count, cx, cz, radius) {
    const near = [];
    for (const bx of layout.blocks) {
      for (const bz of layout.blocks) {
        if (dist(bx, bz, cx, cz) <= radius) near.push([bx, bz]);
      }
    }
    if (near.length === 0) return;
    for (let i = 0; i < count; i++) {
      const [bx, bz] = near[rng.int(0, near.length)];
      addPedOnBlock(bx, bz);
    }
  }

  function addPedOnBlock(bx, bz) {
    const side = rng.int(0, 4);
    let x, z;
    if (side === 0) { x = bx - BLOCK_SIZE/2 + 6 + rng.float(0, BLOCK_SIZE - 12); z = bz + rng.float(-BLOCK_SIZE/2, BLOCK_SIZE/2); }
    else if (side === 1) { x = bx + BLOCK_SIZE/2 - 6 - rng.float(0, BLOCK_SIZE - 12); z = bz + rng.float(-BLOCK_SIZE/2, BLOCK_SIZE/2); }
    else if (side === 2) { z = bz - BLOCK_SIZE/2 + 6 + rng.float(0, BLOCK_SIZE - 12); x = bx + rng.float(-BLOCK_SIZE/2, BLOCK_SIZE/2); }
    else { z = bz + BLOCK_SIZE/2 - 6 - rng.float(0, BLOCK_SIZE - 12); x = bx + rng.float(-BLOCK_SIZE/2, BLOCK_SIZE/2); }
    peds.push({ x, z, state: 'walk', tx: x, tz: z, timer: rng.float(1, 4), down: false, fleeX: 0, fleeZ: 0, mesh: null });
  }

  function nearestCar(x, z, maxDist) {
    let best = null; let bd = maxDist;
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.playerOwned) continue;
      const d = dist(x, z, c.x, c.z);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function stealCar(index) {
    const c = cars[index];
    c.type = 'player';
    c.playerOwned = true;
    player.car = index;
    player.mode = 'car';
    player.x = c.x; player.z = c.z; player.yaw = c.yaw;
    // theft is a crime if police are watching
    for (const pi of police) {
      if (dist(cars[pi].x, cars[pi].z, c.x, c.z) < 90) { wanted = Math.min(5, wanted + 1); break; }
    }
    return c;
  }

  function exitCar() {
    const c = cars[player.car];
    if (c) {
      player.x = c.x - Math.sin(c.yaw) * 3;
      player.z = c.z - Math.cos(c.yaw) * 3;
      player.yaw = c.yaw;
      c.type = 'traffic';
      c.playerOwned = false;
    }
    player.car = null;
    player.mode = 'foot';
  }

  /** A deterministic spot in a road lane: mission markers always sit on a street. */
  function roadSpot(random) {
    const axis = random.bool() ? 'z' : 'x';
    const roadIndex = random.int(0, layout.roads.length);
    const laneIndex = random.int(0, layout.lanes.length);
    const along = random.float(-layout.half + 60, layout.half - 60);
    return lanePos(layout, axis, roadIndex, laneIndex, along);
  }

  function crimeAt(x, z, amount) {
    crimeX = x; crimeZ = z;
    wanted = Math.min(5, wanted + amount);
    wantedTimer = 0;
  }

  function spawnPolice() {
    if (policeSpawnTimer > 0) return;
    if (police.length >= Math.min(4, 1 + Math.floor(wanted))) return;
    // place on a road 70..150 m from the player
    for (let attempt = 0; attempt < 6; attempt++) {
      const axis = rng.bool() ? 'z' : 'x';
      const roadIndex = rng.int(0, layout.roads.length);
      const laneIndex = rng.int(0, layout.lanes.length);
      const along = rng.float(-layout.half + 30, layout.half - 30);
      const pos = lanePos(layout, axis, roadIndex, laneIndex, along);
      const d = dist(player.x, player.z, pos.x, pos.z);
      if (d < 55 || d > 170) continue;
      const dir = layout.lanes[laneIndex] >= 0 ? 1 : -1;
      const yaw = roadYaw(axis, dir);
      const car = newCar(pos.x, pos.z, yaw, 'police', 0x101828);
      car.police = true;
      const idx = cars.push(car) - 1;
      police.push(idx);
      return;
    }
  }

  function policeNear(x, z, radius) {
    for (const pi of police) {
      if (dist(x, z, cars[pi].x, cars[pi].z) < radius) return true;
    }
    return false;
  }

  // ---------- mission progression ----------
  function setObjective(text) { missionObjective = text; }

  function updateMission(dt) {
    const m = missions.list[missions.index];
    if (!m) { missionObjective = 'All jobs done. Drive around, cause some heat.'; return; }
    if (missions.stage === 'idle') {
      if (missionPending) {
        briefing = m.briefing;
        showBriefing = true;
        missionPending = false;
        missions.stage = 'active';
        missions.timer = m.timeLimit || 0;
        missions.target = roadSpot(rng);
        setObjective(m.briefing);
      }
      return;
    }
    if (missions.stage === 'active') {
      if (m.timeLimit) { missions.timer -= dt; if (missions.timer <= 0) { missions.timer = 0; briefing = 'Time ran out. Job failed.'; showBriefing = true; missions.stage = 'idle'; missionPending = true; missions.index = Math.min(missions.index + 1, missions.list.length); return; } }
      let done = false;
      if (m.kind === 'steal') done = player.mode === 'car';
      else if (m.kind === 'go' || m.kind === 'foot') {
        const ok = m.kind === 'foot' ? player.mode === 'foot' : true;
        if (ok && dist(player.x, player.z, missions.target.x, missions.target.z) < 7) done = true;
      }
      else if (m.kind === 'evade') {
        if (wanted === 0 && police.length > 0) done = true;
      }
      if (done) {
        player.money += m.reward;
        m.done = true;
        briefing = 'Job done. +$' + m.reward + '.';
        showBriefing = true;
        missions.stage = 'idle';
        missionPending = true;
        missions.index = Math.min(missions.index + 1, missions.list.length);
        return;
      }
      setObjective(m.briefing + '  Marker on the minimap.');
    }
  }

  // ---------- traffic ----------
  function updateTraffic(dt) {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      if (c.playerOwned) continue;
      const isPolice = police.includes(i);

      const lateral = c.axis === 'z' ? c.x : c.z;
      const along = c.axis === 'z' ? c.z : c.x;
      const targetLateral = laneLateral(layout, c.roadIndex, c.laneIndex);
      const steer = clamp((targetLateral - lateral) * 0.06, -1, 1);
      const targetYaw = roadYaw(c.axis, c.dir);
      c.yaw = wrapAngle(approach(c.yaw, targetYaw, 0.05));

      // intersection ahead?
      const fixed = c.axis === 'z' ? c.z : c.x;
      let turn = false;
      if (c.turnTimer <= 0) {
        for (let r = 0; r < layout.roads.length; r++) {
          const crossing = layout.roads[r];
          const ahead = (c.dir > 0 ? crossing - fixed : fixed - crossing);
          if (ahead > 2 && ahead < 24 && rng.bool(0.12)) {
            turn = true;
          }
        }
      }
      if (turn) {
        const newAxis = c.axis === 'z' ? 'x' : 'z';
        const crossing = layout.roads.findIndex((_, ix) => {
          const cr = layout.roads[ix];
          const ahead = (c.dir > 0 ? cr - fixed : fixed - cr);
          return ahead > 2 && ahead < 24;
        });
        if (crossing >= 0) {
          c.axis = newAxis;
          c.roadIndex = crossing;
          c.dir = (c.dir > 0 ? -1 : 1);
          // pick a lane on the new road going our way
          let picked = 0; let pb = 1e9;
          const latNow = c.axis === 'z' ? c.x : c.z;
          for (let j = 0; j < layout.lanes.length; j++) {
            const d = Math.abs((latNow - layout.roads[crossing]) - layout.lanes[j]);
            if (d < pb) { pb = d; picked = j; }
          }
          c.laneIndex = picked;
          c.yaw = roadYaw(newAxis, c.dir);
          c.turnTimer = 40;
        }
      }
      if (c.turnTimer > 0) c.turnTimer--;

      // ahead car brake
      let targetSpeed = CRUISING;
      if (isPolice) targetSpeed = 27;
      for (let j = 0; j < cars.length; j++) {
        if (j === i) continue;
        const o = cars[j];
        if (o.axis !== c.axis || o.roadIndex !== c.roadIndex) continue;
        const oLat = o.axis === 'z' ? o.x : o.z;
        const oAlong = o.axis === 'z' ? o.z : o.x;
        if (Math.abs(oLat - lateral) > LANE_WIDTH * 1.4) continue;
        const ahead = (c.dir > 0 ? oAlong - along : along - oAlong);
        if (ahead > 0 && ahead < 14 + speed2brake(c.speed)) {
          targetSpeed = Math.min(targetSpeed, o.speed * 0.85);
        }
      }

      c.speed = approach(c.speed, targetSpeed, isPolice ? 6 : 3);
      const fx = Math.sin(c.yaw);
      const fz = Math.cos(c.yaw);
      c.x += fx * c.speed * dt;
      c.z += fz * c.speed * dt;

      if (c.x < -layout.half - 25) c.x = layout.half + 25;
      if (c.x > layout.half + 25) c.x = -layout.half - 25;
      if (c.z < -layout.half - 25) c.z = layout.half + 25;
      if (c.z > layout.half + 25) c.z = -layout.half - 25;
    }
  }

  function speed2brake(s) { return Math.abs(s) * 0.7; }

  // ---------- peds ----------
  function updatePeds(dt, playerX, playerZ) {
    for (const p of peds) {
      if (p.down) continue;
      let flee = false;
      if (player.mode === 'foot' && dist(p.x, p.z, playerX, playerZ) < 14) flee = true;
      if (wanted > 2 && policeNear(p.x, p.z, 90)) flee = true;
      if (flee) {
        const a = yawToward(p.x, p.z, playerX, playerZ) + Math.PI;
        p.fleeX = p.x + Math.sin(a) * 40;
        p.fleeZ = p.z + Math.cos(a) * 40;
        p.tx = p.fleeX; p.tz = p.fleeZ;
      }
      const tx = p.tx !== undefined ? p.tx : p.x;
      const tz = p.tz !== undefined ? p.tz : p.z;
      const d = dist(p.x, p.z, tx, tz);
      if (d < 2 || !p.timer) {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.tx = p.x + rng.float(-18, 18);
          p.tz = p.z + rng.float(-18, 18);
          p.timer = rng.float(2, 6);
        }
      } else {
        const spd = flee ? 2.6 : 1.5;
        const a = yawToward(p.x, p.z, tx, tz);
        p.x += Math.sin(a) * spd * dt;
        p.z += Math.cos(a) * spd * dt;
      }
    }
  }

  // ---------- collisions ----------
  function resolveCarCrash(c, o) {
    // push apart a bit
    const dx = c.x - o.x;
    const dz = c.z - o.z;
    const d = Math.sqrt(dx * dx + dz * dz) || 1;
    const overlap = 2.6 - d;
    if (overlap > 0) {
      c.x += (dx / d) * overlap * 0.5;
      c.z += (dz / d) * overlap * 0.5;
      o.x -= (dx / d) * overlap * 0.5;
      o.z -= (dz / d) * overlap * 0.5;
    }
    c.speed *= 0.55;
    o.speed *= 0.55;
    c.yaw += (rng.float(-0.4, 0.4));
    o.yaw += (rng.float(-0.4, 0.4));
  }

  function collideCars(dt) {
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      for (let j = i + 1; j < cars.length; j++) {
        const o = cars[j];
        if (dist2(c.x, c.z, o.x, o.z) < (2.8 * 2.8)) {
          resolveCarCrash(c, o);
          const playerInvolved = (cars[player.car] === c || cars[player.car] === o);
          if (playerInvolved) {
            const hard = Math.abs(c.speed - o.speed) > 6;
            if (hard) crimeAt((c.x + o.x) / 2, (c.z + o.z) / 2, 0.5);
          }
        }
      }
    }
  }

  function playerCarWall(dt) {
    if (player.mode !== 'car') return;
    const c = cars[player.car];
    const halfW = 2.2; const halfD = 0.95;
    // tentative position already applied; check against buildings
    for (const b of boxes) {
      if (c.x > b.x - b.w/2 - halfW && c.x < b.x + b.w/2 + halfW &&
          c.z > b.z - b.d/2 - halfD && c.z < b.z + b.d/2 + halfD) {
        c.x -= Math.sin(c.yaw) * c.speed * dt;
        c.z -= Math.cos(c.yaw) * c.speed * dt;
        c.yaw += 0.7;
        c.speed *= 0.35;
        crimeAt(c.x, c.z, 0.25);
        return;
      }
    }
  }

  function carHitsPeds(c) {
    for (const p of peds) {
      if (p.down) continue;
      if (dist(p.x, p.z, c.x, c.z) < 1.7) {
        p.down = true;
        crimeAt(p.x, p.z, 1);
        c.speed *= 0.7;
        c.health -= 10;
      }
    }
  }

  // ---------- shooting ----------
  function shoot(originX, originZ, dirX, dirZ) {
    const range = 110;
    const endX = originX + dirX * range;
    const endZ = originZ + dirZ * range;
    let hit = null; let hd = range;
    for (let i = 0; i < peds.length; i++) {
      const p = peds[i];
      if (p.down) continue;
      // distance from ped to ray
      const rx = dirX; const rz = dirZ;
      const t = (p.x - originX) * rx + (p.z - originZ) * rz;
      const tx = originX + rx * clamp(t, 0, range);
      const tz = originZ + rz * clamp(t, 0, range);
      if (dist(p.x, p.z, tx, tz) < 0.9) {
        const d = dist(originX, originZ, p.x, p.z);
        if (d < hd) { hd = d; hit = { kind: 'ped', index: i }; }
      }
    }
    for (let i = 0; i < cars.length; i++) {
      const c = cars[i];
      const t = (c.x - originX) * dirX + (c.z - originZ) * dirZ;
      const tx = originX + dirX * clamp(t, 0, range);
      const tz = originZ + dirZ * clamp(t, 0, range);
      if (dist(c.x, c.z, tx, tz) < 2.2) {
        const d = dist(originX, originZ, c.x, c.z);
        if (d < hd) { hd = d; hit = { kind: 'car', index: i }; }
      }
    }
    crimeAt(originX, originZ, 1);
    if (hit) {
      if (hit.kind === 'ped') {
        const p = peds[hit.index];
        p.down = true;
        player.money += 20;
      } else {
        const c = cars[hit.index];
        c.health -= 40;
        c.smoketime = 180;
        if (c.health <= 0) { c.speed = 0; c.health = 0; c.smoketime = 900; }
      }
    }
    return hit;
  }

  // ---------- wanted / police ----------
  function updateWanted(dt) {
    if (wanted <= 0) {
      policeSpawnTimer = 0;
      for (let i = police.length - 1; i >= 0; i--) {
        const pi = police[i];
        cars[pi].type = 'traffic';
        cars[pi].police = false;
        cars[pi].speed *= 0.5;
      }
      police.length = 0;
      return;
    }
    wantedTimer += dt;
    const near = policeNear(player.x, player.z, 150);
    if (!near) decayTimer += dt; else decayTimer = 0;
    if (decayTimer > 6) {
      wanted = Math.max(0, wanted - 1);
      decayTimer = 0;
      briefing = 'Heat cooling.';
      showBriefing = true;
    }
    if (policeSpawnTimer > 0) policeSpawnTimer -= dt;
    spawnPolice();
    for (const pi of police) {
      const c = cars[pi];
      const a = yawToward(c.x, c.z, player.x, player.z);
      c.yaw = wrapAngle(approach(c.yaw, a, 0.07));
      const d = dist(c.x, c.z, player.x, player.z);
      const targetSpeed = d > 8 ? 25 : 10;
      c.speed = approach(c.speed, targetSpeed, 7);
      const fx = Math.sin(c.yaw); const fz = Math.cos(c.yaw);
      c.x += fx * c.speed * dt;
      c.z += fz * c.speed * dt;
      // ramming the player is a crime for them (funny)
      if (d < 2.6) { resolveCarCrash(c, cars[player.car] || player); crimeAt(player.x, player.z, 0.5); }
    }
  }

  /** Put the hero on a road lane (never inside a block) at a chosen spot. */
  function placeHero(laneIndex = 2, along = 40, roadIndex = 2, axis = 'z') {
    const pos = lanePos(layout, axis, roadIndex, laneIndex, along);
    player.x = pos.x;
    player.z = pos.z;
    player.yaw = roadYaw(axis, 1);
    player.onFootYaw = roadYaw(axis, 1);
    player.mode = 'foot';
    player.car = null;
    return pos;
  }

  // ---------- populate the city ----------
  // The hero's neighbourhood first, so the street they stand on has traffic and
  // pedestrians in view, then a lighter spread across the rest of the city.
  placeHero();
  // Traffic and pedestrians in bands: a busy near field so the street reads as
  // alive in a frame, a busy downtown, and a wider spread for the rest.
  spawnTraffic(9);
  spawnTrafficBand(8, player.x, player.z, 95);
  spawnTrafficBand(14, layout.roads[3], 110, 220);
  spawnTrafficBand(45, player.x, player.z, 300);
  for (let i = 0; i < 10; i++) spawnPed();
  spawnPedNear(10, player.x, player.z, 65);
  spawnPedNear(16, layout.roads[3], 110, 220);
  spawnPedNear(28, player.x, player.z, 300);

  // ---------- main step ----------
  return {
    step(dt, input) {
      tick += 1;
      const move = input.move || { x: 0, z: 0 };

      // Player on foot
      if (player.mode === 'foot') {
        const spd = 3.4;
        if (input.enter) {
          const idx = nearestCar(player.x, player.z, 6.5);
          if (idx !== null) { stealCar(idx); }
        }
        if (move.x !== 0 || move.z !== 0) {
          const a = yawToward(player.x, player.z, player.x + move.x, player.z + move.z);
          player.onFootYaw = a;
          player.x += Math.sin(a) * spd * dt;
          player.z += Math.cos(a) * spd * dt;
        }
        if (input.shoot) {
          // shoot along camera aim? on foot: shoot along facing
          shoot(player.x, player.z, Math.sin(player.onFootYaw), Math.cos(player.onFootYaw));
        }
      } else {
        const c = cars[player.car];
        const steer = move.x;
        const accel = move.z;
        player.yaw = c.yaw;
        player.x = c.x; player.z = c.z; player.speed = c.speed;
        c.yaw = wrapAngle(c.yaw + steer * 0.010 * (Math.abs(c.speed) / 18 + 0.35));
        if (accel > 0) c.speed = approach(c.speed, MAX_SPEED * Math.min(1, accel), 3);
        else if (accel < 0) c.speed = approach(c.speed, REVERSE, 5);
        else c.speed = approach(c.speed, 0, 1);
        if (input.enter) { exitCar(); }
        // handbrake via shoot? no; keep shoot while driving = shoot from car
        if (input.shoot) {
          shoot(c.x, c.z, Math.sin(c.yaw), Math.cos(c.yaw));
        }
        // Integrate the car: this is the step that actually drives it.
        c.x += Math.sin(c.yaw) * c.speed * dt;
        c.z += Math.cos(c.yaw) * c.speed * dt;
        player.x = c.x; player.z = c.z; player.speed = c.speed;
        if (c.x < -layout.half - 25) c.x = layout.half + 25;
        if (c.x > layout.half + 25) c.x = -layout.half - 25;
        if (c.z < -layout.half - 25) c.z = layout.half + 25;
        if (c.z > layout.half + 25) c.z = -layout.half - 25;
        playerCarWall(dt);
        carHitsPeds(c);
      }

      // peds flee from player car
      const px = player.mode === 'car' ? cars[player.car].x : player.x;
      const pz = player.mode === 'car' ? cars[player.car].z : player.z;
      updatePeds(dt, px, pz);

      // traffic + police
      updateTraffic(dt);
      collideCars();
      updateWanted(dt);
      updateMission(dt);

      return {
        wanted,
        stars: Math.min(5, Math.floor(wanted)),
        police: police.length,
        pedsDown: peds.filter((p) => p.down).length,
      };
    },

    snapshot() {
      const p = player.mode === 'car' ? (cars[player.car] || player) : player;
      return {
        tick,
        seed,
        player: {
          mode: player.mode,
          x: Number(p.x.toFixed(3)),
          z: Number(p.z.toFixed(3)),
          yaw: Number(p.yaw.toFixed(4)),
          speed: Number(p.speed.toFixed(2)),
          money: player.money,
        },
        wanted,
        stars: Math.min(5, Math.floor(wanted)),
        mission: {
          index: missions.index,
          stage: missions.stage,
          objective: missionObjective,
          target: missions.target ? { x: Number(missions.target.x.toFixed(3)), z: Number(missions.target.z.toFixed(3)) } : null,
          timer: Number(missions.timer.toFixed(1)),
        },
        enemyCount: cars.length + peds.length,
        policeCount: police.length,
      };
    },

    entities() {
      return { cars, peds, player, layout, boxes, missions, wanted, police };
    },

    placeHeroOnRoad(laneIndex = 2, along = 40, roadIndex = 2, axis = 'z') {
      return placeHero(laneIndex, along, roadIndex, axis);
    },

    /** Place the hero on foot at an exact spot (staging and respawns). */
    placeHeroAt(x, z, yaw = 0) {
      player.x = x;
      player.z = z;
      player.yaw = yaw;
      player.onFootYaw = yaw;
      player.mode = 'foot';
      player.car = null;
      return { x, z };
    },
    /** Staging: point the hero, and the car they are sitting in, along `yaw`. */
    faceHero(yaw) {
      player.yaw = yaw;
      player.onFootYaw = yaw;
      const c = player.car !== null ? cars[player.car] : null;
      if (c) { c.yaw = yaw; c.x = player.x; c.z = player.z; }
      return yaw;
    },

    setWanted(v) { wanted = Math.min(5, Math.max(0, v)); wantedTimer = 0; },
    setObjective(text) { missionObjective = text; },
    /** Staging: move the active job's marker, so a shot can frame it. */
    setMissionTarget(x, z) {
      if (missions.target) { missions.target.x = x; missions.target.z = z; }
      return missions.target;
    },
    setMissionBriefing(b) { briefing = b; showBriefing = true; },
    getBriefing() { const b = briefing; showBriefing = false; return b; },
    save() { return { money: player.money, missionIndex: missions.index, missionStage: missions.stage, completed: missions.list.filter(m => m.done).length }; },
  };
}
