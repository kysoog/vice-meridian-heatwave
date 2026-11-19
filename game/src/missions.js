// The mission table: four short original jobs in one story thread. Each entry
// is plain data; the state machine that runs them lives in world.js, so the
// HUD, the save file and the minimap all read the same source.
//
//   kind 'steal' - be in any car when the check runs
//   kind 'go'    - reach the marker before the clock runs out
//   kind 'evade' - lose the police until the heat is gone
//   kind 'foot'  - reach the marker on foot

export const MISSIONS = [
  {
    id: 'first-job',
    title: 'First job',
    briefing: 'Vice Meridian, 2026. The client wants a car moved across town. Steal a car and bring it to the marker.',
    kind: 'steal',
    reward: 250,
  },
  {
    id: 'delivery',
    title: 'Express delivery',
    briefing: 'A package needs to be at the far industrial block before the clock runs out. Drive there.',
    kind: 'go',
    reward: 300,
    timeLimit: 180,
  },
  {
    id: 'heat',
    title: 'Heat',
    briefing: 'A cop on the take spotted you picking up the package. Lose the police until the heat cools.',
    kind: 'evade',
    reward: 400,
  },
  {
    id: 'drop',
    title: 'Drop',
    briefing: 'Meet the contact in the old district. On foot, no cars, no guns.',
    kind: 'foot',
    reward: 350,
  },
];

/** A fresh mission list, already marked up to `completed` jobs as done. */
export function createMissions(completed = 0) {
  const list = MISSIONS.map((mission, index) => ({ ...mission, done: index < completed }));
  return {
    list,
    index: completed,
    stage: 'idle',
    target: null,
    timer: 0,
  };
}
