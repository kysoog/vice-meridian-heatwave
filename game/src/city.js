// The city: a grid of blocks separated by roads. All numbers are world
// metres (y is up, roads lie on the xz plane). Buildings sit on blocks;
// everything between blocks is drivable road with lanes.

import * as THREE from '../vendor/three.module.min.js';
import { createRandom } from './math.js';

export const BLOCK_SIZE = 200;
export const ROAD_WIDTH = 30;
export const LANE_WIDTH = 4;
export const BLOCKS = 6;

export function cityLayout() {
  const n = BLOCKS;
  const pitch = BLOCK_SIZE + ROAD_WIDTH;
  const world = n * pitch + ROAD_WIDTH;
  const half = world / 2;
  const roads = []; // centre coordinate of each road, i = 0..n
  for (let i = 0; i <= n; i++) roads.push(-half + ROAD_WIDTH / 2 + i * pitch);
  const blocks = [];
  for (let i = 0; i < n; i++) {
    blocks.push(-half + ROAD_WIDTH + i * pitch + BLOCK_SIZE / 2);
  }
  const laneCount = Math.floor(ROAD_WIDTH / LANE_WIDTH);
  const lanes = [];
  for (let j = 0; j < laneCount; j++) {
    lanes.push(-ROAD_WIDTH / 2 + LANE_WIDTH / 2 + j * LANE_WIDTH);
  }
  return { world, half, roads, blocks, lanes, laneCount, pitch };
}

/** World position of lane j on road i: the road runs along `axis`, so `along`
 *  is the coordinate on that axis and the lane offset is applied across it. */
export function lanePos(layout, axis, roadIndex, laneIndex, along) {
  const lateral = laneLateral(layout, roadIndex, laneIndex);
  return axis === 'z' ? { x: lateral, z: along } : { x: along, z: lateral };
}

/** World coordinate of a lane centre, measured across the road it sits on. */
export function laneLateral(layout, roadIndex, laneIndex) {
  return layout.roads[roadIndex] + layout.lanes[laneIndex];
}

/** Yaw that keeps a car driving along `axis` in direction `dir` (+1/-1). */
export function roadYaw(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

/** A tiling facade: a wall colour with rows of lit windows, drawn on canvas
 *  (no image files, and every run draws the same texture). */
function facadeTexture(wallColour, windowColour) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = wallColour;
  g.fillRect(0, 0, 128, 128);
  // A faint floor line so the tiling reads as storeys.
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 30; y < 128; y += 32) g.fillRect(0, y, 128, 2);
  g.fillStyle = windowColour;
  for (let y = 6; y < 128; y += 32) {
    for (let x = 6; x < 128; x += 32) {
      g.fillRect(x, y, 20, 16);
      g.fillStyle = 'rgba(255,255,255,0.20)';
      g.fillRect(x, y, 20, 4);
      g.fillStyle = windowColour;
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Build the city's Three.js objects: ground road plane, sidewalks, buildings,
 *  lane markings and lamp quads. */
export function buildCity(layout) {
  const { world, half, roads, blocks, laneCount } = layout;
  const group = new THREE.Group();

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x555b64, roughness: 0.95 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xe6e2d4, roughness: 0.8 });
  const centreMat = new THREE.MeshStandardMaterial({ color: 0xe0bb44, roughness: 0.8 });
  const kerbMat = new THREE.MeshStandardMaterial({ color: 0xa4aab6, roughness: 0.9 });
  const wallColours = ['#d9c6a5', '#c9b490', '#e0cfb4', '#b9c2cf'];
  const wallMats = wallColours.map((colour, i) => new THREE.MeshStandardMaterial({
    map: facadeTexture(colour, i === 3 ? '#2f3f57' : '#4a6b86'),
    roughness: 0.85,
  }));
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xffe08a,
    emissive: 0xffe08a,
    emissiveIntensity: 0.9,
    side: THREE.DoubleSide,
  });

  // One continuous road plane under the whole city.
  const road = new THREE.Mesh(new THREE.PlaneGeometry(world, world), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.02, 0);
  road.receiveShadow = true;
  road.castShadow = false;
  group.add(road);

  // Lane markings: lines run between intersections (never across them), so the
  // road reads as streets rather than one grid painted over the whole map.
  const laneBoundary = (k) => -ROAD_WIDTH / 2 + k * LANE_WIDTH;
  const gaps = [];
  for (let i = 0; i + 1 < roads.length; i++) {
    gaps.push([roads[i] + ROAD_WIDTH / 2 + 2, roads[i + 1] - ROAD_WIDTH / 2 - 2]);
  }
  for (const r of roads) {
    for (let k = 1; k < laneCount; k++) {
      const mat = k === laneCount / 2 ? centreMat : stripeMat;
      for (const [g0, g1] of gaps) {
        const len = g1 - g0;
        const mid = (g0 + g1) / 2;
        // Road at x = r runs along z.
        const alongZ = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, len), mat);
        alongZ.position.set(r + laneBoundary(k), 0.07, mid);
        alongZ.receiveShadow = true;
        alongZ.castShadow = false;
        group.add(alongZ);
        // Road at z = r runs along x.
        const alongX = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.06, len), mat);
        alongX.position.set(mid, 0.075, r + laneBoundary(k));
        alongX.rotation.y = Math.PI / 2;
        alongX.receiveShadow = true;
        alongX.castShadow = false;
        group.add(alongX);
      }
    }
  }

  // Sidewalk slabs under each block: they ground the buildings and give the
  // streets a kerb line.
  const slabGeo = new THREE.BoxGeometry(BLOCK_SIZE + 10, 0.3, BLOCK_SIZE + 10);
  for (const bx of blocks) {
    for (const bz of blocks) {
      const slab = new THREE.Mesh(slabGeo, kerbMat);
      slab.position.set(bx, 0.16, bz);
      slab.castShadow = false;
      slab.receiveShadow = true;
      group.add(slab);
    }
  }

  // Buildings: every block carries a 2x2 grid of towers plus two kerb-side
  // shops, so the blocks read as a dense downtown instead of open pavement.
  const rng = createRandom(0x1a3f5b);
  const cell = BLOCK_SIZE / 2;

  function addBuilding(mx, mz, w, d, h, style) {
    const base = wallMats[style % wallMats.length];
    const material = base.clone();
    material.map = base.map.clone();
    material.map.repeat.set(Math.max(1, Math.round(w / 16)), Math.max(1, Math.round(h / 16)));
    material.map.needsUpdate = true;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(mx, h / 2 + 0.3, mz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Roof lamps only on towers tall enough to read from the street.
    if (h > 34) {
      for (const [lx, lz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const lamp = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5), lampMat);
        lamp.position.set(mx + lx * (w / 2 - 2), h + 0.35, mz + lz * (d / 2 - 2));
        lamp.rotation.x = -Math.PI / 2;
        lamp.castShadow = false;
        lamp.receiveShadow = false;
        group.add(lamp);
      }
    }
  }

  for (const bx of blocks) {
    for (const bz of blocks) {
      for (let ix = 0; ix < 2; ix++) {
        for (let iz = 0; iz < 2; iz++) {
          const inset = rng.float(4, 9);
          const w = cell - inset * 2 - rng.float(0, 10);
          const d = cell - inset * 2 - rng.float(0, 10);
          const h = rng.float(20, 62);
          const mx = bx - BLOCK_SIZE / 2 + cell * (ix + 0.5) + rng.float(-1.5, 1.5);
          const mz = bz - BLOCK_SIZE / 2 + cell * (iz + 0.5) + rng.float(-1.5, 1.5);
          addBuilding(mx, mz, w, d, h, ix * 2 + iz);
        }
      }
    }
  }

  // Street lamps along every kerb: a post and a glowing DoubleSide quad,
  // which also gives the streets furniture and scale.
  const postGeo = new THREE.BoxGeometry(0.5, 7, 0.5);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x474d57, roughness: 0.9 });
  const lampQuadGeo = new THREE.PlaneGeometry(2.6, 1.1);
  const kerb = ROAD_WIDTH / 2 + 3;
  for (const r of roads) {
    for (let s = -half + 60; s < half - 60; s += 200) {
      const spots = [
        [r - kerb, s, 0],
        [r + kerb, s, 0],
        [s, r - kerb, Math.PI / 2],
        [s, r + kerb, Math.PI / 2],
      ];
      for (const [px, pz, rot] of spots) {
        const post = new THREE.Mesh(postGeo, postMat);
        post.position.set(px, 3.5, pz);
        post.castShadow = true;
        post.receiveShadow = true;
        group.add(post);
        const lamp = new THREE.Mesh(lampQuadGeo, lampMat);
        lamp.position.set(px, 7.2, pz);
        lamp.rotation.y = rot;
        lamp.castShadow = false;
        lamp.receiveShadow = false;
        group.add(lamp);
      }
    }
  }

  return { group, layout };
}

/** Axis-aligned building boxes for collision (plain data, mirrors the mesh). */
export function buildingBoxes(layout) {
  const { roads, blocks } = layout;
  const boxes = [];
  const rng = createRandom(0x1a3f5b);
  for (const bx of blocks) {
    for (const bz of blocks) {
      const count = rng.int(1, 4);
      for (let k = 0; k < count; k++) {
        const w = rng.float(26, 64);
        const d = rng.float(26, 64);
        const mx = bx + rng.float(-(BLOCK_SIZE / 2 - w - 6), BLOCK_SIZE / 2 - w - 6);
        const mz = bz + rng.float(-(BLOCK_SIZE / 2 - d - 6), BLOCK_SIZE / 2 - d - 6);
        boxes.push({ x: mx, z: mz, w, d });
      }
    }
  }
  return boxes;
}
