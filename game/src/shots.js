// Shot staging for the entry's screenshots. Each scene runs the real
// simulation forward with scripted, deterministic input derived only from the
// seeded state, so one seed always stages the same frame. The renderer then
// paints it and the capture harness reads window.__shotReady.
//
// The four scenes deliberately show four different moments of the game:
// cover    - the hero on foot, traffic filing past, mission briefing on screen
// driving  - the hero at the wheel, fast, in dense traffic
// chase    - four stars, cruisers closing head on
// mission  - a job in progress, the objective marker and the clock on the HUD

import { dist, yawToward, clamp, wrapAngle } from './math.js';

const STEP = 1 / 60;

const SCENES = {
  cover: { lane: 2, along: -70, road: 2, axis: 'z', steps: 150 },
  driving: { lane: 5, along: 120, road: 2, axis: 'z', steps: 520 },
  chase: { lane: 3, along: 20, road: 3, axis: 'z', steps: 900 },
  mission: { lane: 4, along: 60, road: 3, axis: 'z', steps: 700 },
};

const NO_INPUT = { move: { x: 0, z: 0 }, shoot: false, enter: false, exit: false };

function nearestCarIndex(player, cars, allowPolice) {
  let best = null;
  let bd = 1e9;
  for (let j = 0; j < cars.length; j++) {
    if (!allowPolice && cars[j].police) continue;
    const d = dist(player.x, player.z, cars[j].x, cars[j].z);
    if (d < bd) { bd = d; best = j; }
  }
  return { best, bd };
}

/**
 * Stand the hero at the driver's door of the closest street car, so the scene
 * can press enter and drive it on the next step. Staging only.
 */
function standAtCarDoor(world) {
  const ent = world.entities();
  const { player, cars } = ent;
  if (player.mode === 'car') return true;
  const { best } = nearestCarIndex(player, cars, false);
  if (best === null) return false;
  const car = cars[best];
  const yaw = car.yaw;
  world.placeHeroAt(car.x + Math.cos(yaw) * 2.2, car.z - Math.sin(yaw) * 2.2, yaw);
  return true;
}

/** The first traffic car in the hero's forward cone within `range`, with the
 *  lane offset it sits at, so the driving scene can steer around it. */
function carAhead(ent, range) {
  const { player, cars } = ent;
  const fx = Math.sin(player.yaw);
  const fz = Math.cos(player.yaw);
  let best = null;
  let bd = range;
  for (const c of cars) {
    if (c.playerOwned) continue;
    const dx = c.x - player.x;
    const dz = c.z - player.z;
    const ahead = dx * fx + dz * fz;
    if (ahead < 3 || ahead > range) continue;
    const side = -dx * fz + dz * fx;
    if (Math.abs(side) > 4.6) continue; // not in this lane's line
    if (ahead < bd) { bd = ahead; best = { ahead, side }; }
  }
  return best;
}

/** The closest police cruiser, as a car object, or null when none is out. */
function nearestPolice(ent) {
  let best = null;
  let bd = 1e9;
  for (const index of ent.police) {
    const c = ent.cars[index];
    if (!c) continue;
    const d = dist(ent.player.x, ent.player.z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function stageShot(name, world) {
  const { step, entities, setWanted, placeHeroOnRoad, faceHero } = world;
  const scene = SCENES[name] || SCENES.cover;
  placeHeroOnRoad(scene.lane, scene.along, scene.road, scene.axis);

  let boarded = false;
  let wantedSet = false;
  let policeClose = 0;
  let targetClose = 0;
  let goodFrames = 0;
  let targetSet = false;

  for (let i = 0; i < scene.steps; i++) {
    const ent = entities();
    const { player, missions } = ent;
    const input = { ...NO_INPUT, move: { x: 0, z: 0 } };

    if (name === 'cover') {
      // Walking the kerb lane while traffic files past.
      if (i % 120 < 70) input.move = { x: 0, z: 0.45 };
    } else if (name === 'driving') {
      if (player.mode === 'foot') {
        if (!boarded) boarded = standAtCarDoor(world);
        input.enter = true;
      } else {
        // Weaving through the traffic: brake behind the car ahead, steer
        // around it, and freeze the moment the frame is a fast one with
        // traffic in front.
        const ahead = carAhead(ent, 40);
        const steer = ahead ? clamp(-ahead.side * 0.35, -0.7, 0.7) : 0;
        input.move = { x: steer, z: ahead && ahead.ahead < 16 ? 0.25 : 0.8 };
        if (i === scene.steps - 90) setWanted(0); // the drive itself was clean
        if (player.speed > 19 && ahead && ahead.ahead > 13) {
          goodFrames++;
          if (goodFrames > 5) break;
        }
        // If traffic opens up, take the frame anyway while still downtown.
        if (i > 150 && player.speed > 17) break;
      }
    } else if (name === 'chase') {
      if (player.mode === 'foot') {
        if (!boarded) boarded = standAtCarDoor(world);
        input.enter = true;
      } else {
        // Four stars from the first moment of the drive, so the cruisers are
        // closing in while the streets are still busy.
        if (!wantedSet) { setWanted(4); wantedSet = true; }
        // Turn into the pursuit, then freeze the moment a cruiser is close
        // ahead of the hero so the chase is in frame, not behind the camera.
        const cruiser = nearestPolice(ent);
        if (cruiser === null) {
          input.move = { x: 0, z: 0 };
        } else {
          const d = dist(player.x, player.z, cruiser.x, cruiser.z);
          const a = wrapAngle(yawToward(player.x, player.z, cruiser.x, cruiser.z) - player.yaw);
          input.move = { x: clamp(a * 2.4, -1, 1), z: 0.85 };
          if (d < 26) policeClose++;
          if (policeClose > 6) break;
        }
      }
    } else if (name === 'mission') {
      if (player.mode === 'foot') {
        if (!boarded) boarded = standAtCarDoor(world);
        input.enter = true;
      } else if (missions.target) {
        // The job's marker is picked across town when the job starts; once the
        // timed delivery is running, stage the marker a short drive ahead so
        // the frame shows the objective coming up.
        if (!targetSet && missions.timer > 0) {
          world.setMissionTarget(
            player.x + Math.sin(player.yaw) * 150,
            player.z + Math.cos(player.yaw) * 150
          );
          targetSet = true;
        }
        const t = missions.target;
        const d = dist(player.x, player.z, t.x, t.z);
        const a = wrapAngle(yawToward(player.x, player.z, t.x, t.z) - player.yaw);
        // Drive at the marker, but steer around anything stopped in the way.
        const blocked = carAhead(ent, 26);
        let steer = clamp(a * 2.0, -1, 1);
        let throttle = 0.9;
        if (blocked && blocked.ahead < 18) {
          steer = clamp(-blocked.side * 0.5, -0.8, 0.8);
          throttle = blocked.ahead < 9 ? 0.15 : 0.5;
        }
        input.move = { x: steer, z: throttle };
        if (d < 90) targetClose++;
        if (targetClose > 6) break;
      }
    }

    step(STEP, input);
  }

  const ent = entities();
  // Point the camera at what the frame is about, and state what it shows.
  if (name === 'chase') {
    const cruiser = nearestPolice(ent);
    if (cruiser) faceHero(yawToward(ent.player.x, ent.player.z, cruiser.x, cruiser.z));
    world.setObjective('Heat 4. Police on you: lose them or ride it out.');
  } else if (name === 'driving') {
    // A clean drive: no heat on the bar for this frame.
    setWanted(0);
    world.setObjective('Behind the wheel: WASD to drive, F to step out.');
  } else if (name === 'cover') {
    world.setObjective('Vice Meridian, 2026. Walk the streets, then press F at a car to take it.');
  }
}
