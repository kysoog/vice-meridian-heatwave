import * as THREE from '../vendor/three.module.min.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const TAU = Math.PI * 2;
export function angleDelta(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
export function dampAngle(a, b, lambda, dt) { return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt)); }
export function forward(heading, target = new THREE.Vector3()) {
  return target.set(Math.sin(heading), 0, Math.cos(heading));
}
export function right(heading, target = new THREE.Vector3()) {
  return target.set(Math.cos(heading), 0, -Math.sin(heading));
}
export function circleHitsBox(x, z, radius, box) {
  const cx = clamp(x, box.minX, box.maxX);
  const cz = clamp(z, box.minZ, box.maxZ);
  return (x - cx) ** 2 + (z - cz) ** 2 < radius ** 2;
}
export function resolveCircle(position, radius, colliders) {
  for (const b of colliders) {
    if (!circleHitsBox(position.x, position.z, radius, b)) continue;
    const choices = [
      { d: Math.abs(position.x - b.minX), axis: 'x', value: b.minX - radius },
      { d: Math.abs(b.maxX - position.x), axis: 'x', value: b.maxX + radius },
      { d: Math.abs(position.z - b.minZ), axis: 'z', value: b.minZ - radius },
      { d: Math.abs(b.maxZ - position.z), axis: 'z', value: b.maxZ + radius },
    ].sort((a, c) => a.d - c.d);
    position[choices[0].axis] = choices[0].value;
  }
}
export function nearestStreetPoint(position) {
  const roads = [-240, -120, 0, 120, 240];
  let bestX = roads[0], bestZ = roads[0];
  for (const r of roads) {
    if (Math.abs(position.x - r) < Math.abs(position.x - bestX)) bestX = r;
    if (Math.abs(position.z - r) < Math.abs(position.z - bestZ)) bestZ = r;
  }
  return Math.abs(position.x - bestX) < Math.abs(position.z - bestZ)
    ? { x: bestX + 6, z: position.z, heading: position.x > bestX ? 0 : Math.PI }
    : { x: position.x, z: bestZ + 6, heading: position.z > bestZ ? -Math.PI / 2 : Math.PI / 2 };
}
export function finiteVector(v) { return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
