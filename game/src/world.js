// Crime heat is simulation state, independent from rendering and audio.
export function wantedFromHeat(heat) {
  return heat < .16 ? 0 : Math.min(5, Math.max(1, Math.ceil(heat)));
}

export function coolHeat(heat, wanted, tick, lastCrimeTick, dt) {
  if (tick - lastCrimeTick <= 420) return heat;
  return Math.max(0, heat - dt * (wanted ? .018 : .05));
}

export function missionReward(stage) {
  return [250, 800, 1200, 1800, 3000][Math.max(0, Math.min(4, stage))];
}
