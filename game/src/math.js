// Seeded randomness and small math helpers. Every random draw in the game
// comes from createRandom(seed), so one seed always simulates the same city,
// traffic and captured shot. Nothing here depends on the browser.

export function createRandom(seed) {
  let s = seed >>> 0;
  function next() {
    s = (s + 0x6d2b79f5) & 0xffffffff;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) & 0xffffffff;
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296;
  }
  next.int = (min, maxExclusive) =>
    min + Math.floor(next() * (maxExclusive - min));
  next.float = (min, max) => min + next() * (max - min);
  next.pick = (a) => a[Math.floor(next() * a.length)];
  next.bool = (p = 0.5) => next() < p;
  return next;
}

export const TAU = Math.PI * 2;

export function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function approach(value, target, step) {
  const diff = target - value;
  if (Math.abs(diff) <= step) return target;
  return value + (diff < 0 ? -step : step);
}

export function dist2(x1, z1, x2, z2) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return dx * dx + dz * dz;
}

export function dist(x1, z1, x2, z2) {
  return Math.sqrt(dist2(x1, z1, x2, z2));
}

/** Yaw (radians, 0 = +z) pointing from (x1,z1) to (x2,z2), wrapped to [-PI, PI]. */
export function yawToward(x1, z1, x2, z2) {
  let a = Math.atan2(x2 - x1, z2 - z1);
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}
