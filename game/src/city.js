import * as THREE from '../vendor/three.module.min.js';
import { Random } from './random.js';
import { ROAD_LINES, COLORS } from './config.js';

function canvasTexture(width, height, paint) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  paint(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function windowTexture(seed, hue) {
  const rng = new Random(seed);
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = hue; ctx.fillRect(0, 0, w, h);
    for (let y = 8; y < h; y += 17) {
      ctx.fillStyle = 'rgba(0,0,0,.20)'; ctx.fillRect(0, y + 10, w, 2);
      for (let x = 7; x < w; x += 16) {
        const lit = rng.chance(0.48);
        ctx.fillStyle = lit ? rng.pick(['#ffd89e', '#87e8e5', '#ffb4cb', '#ddd5ac']) : '#122d39';
        ctx.fillRect(x, y, 10, 9);
        if (lit) { ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(x + 1, y + 1, 2, 7); }
      }
    }
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, 'rgba(255,255,255,.15)'); gradient.addColorStop(.5, 'rgba(255,255,255,0)'); gradient.addColorStop(1, 'rgba(0,0,0,.2)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
  });
}

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'MeridianCity';
    scene.add(this.group);
    this.colliders = [];
    this.rng = new Random(seed ^ 0x51c17);
    this.lamps = [];
    this.neons = [];
    this.water = null;
    this.materials = this.createMaterials();
    this.buildGround();
    this.buildBlocks();
    this.buildRoadDetails();
    this.buildWaterfront();
    this.buildLandmarks();
    this.buildStreetFurniture();
    this.group.traverse((object) => {
      if (object.isMesh || object.isInstancedMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        object.frustumCulled = true;
      }
    });
  }

  createMaterials() {
    const palettes = ['#35505c', '#765963', '#315965', '#8b8075', '#33424f', '#725a4b', '#254d59', '#61526f'];
    return {
      sidewalk: new THREE.MeshStandardMaterial({ color: 0x77888c, roughness: .86, metalness: .05 }),
      curb: new THREE.MeshStandardMaterial({ color: 0xa8b2ac, roughness: .8 }),
      asphalt: new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: .76, metalness: .15 }),
      line: new THREE.MeshBasicMaterial({ color: 0xb9cac0 }),
      yellow: new THREE.MeshBasicMaterial({ color: 0xf5bf58 }),
      grass: new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 1 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x6b5140, roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x21664f, roughness: .9, side: THREE.DoubleSide }),
      metal: new THREE.MeshStandardMaterial({ color: 0x293c44, roughness: .36, metalness: .8 }),
      glow: new THREE.MeshBasicMaterial({ color: 0xffdfae }),
      buildings: palettes.map((color, i) => {
        const texture = windowTexture(900 + i * 73, color);
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        return new THREE.MeshStandardMaterial({ color: 0xa9b3b3, map: texture, emissiveMap: texture, emissive: new THREE.Color(0x5b6666), emissiveIntensity: .42, roughness: .69, metalness: .08 });
      }),
      roofs: palettes.map((color) => new THREE.MeshStandardMaterial({ color, roughness: .87 })),
    };
  }

  mesh(geometry, material, x, y, z, parent = this.group) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }

  box(x, y, z, w, h, d, material, parent = this.group) {
    const mesh = this.mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, parent);
    return mesh;
  }

  buildGround() {
    this.box(0, -.32, 0, 650, .5, 650, this.materials.asphalt);
    const sand = new THREE.MeshStandardMaterial({ color: 0xba9b77, roughness: 1 });
    this.box(-286, -.03, 0, 48, .16, 650, sand);
    const waterMaterial = new THREE.MeshStandardMaterial({ color: COLORS.ocean, roughness: .2, metalness: .45, transparent: true, opacity: .92 });
    this.water = this.box(-393, -.12, 0, 170, .12, 720, waterMaterial);
    const shore = this.box(-307, -.04, 0, 5, .05, 650, new THREE.MeshBasicMaterial({ color: 0x58c9c5, transparent: true, opacity: .35 }));
    shore.castShadow = false;
  }

  buildBlocks() {
    for (let ix = 0; ix < ROAD_LINES.length - 1; ix++) {
      for (let iz = 0; iz < ROAD_LINES.length - 1; iz++) {
        const x = (ROAD_LINES[ix] + ROAD_LINES[ix + 1]) / 2;
        const z = (ROAD_LINES[iz] + ROAD_LINES[iz + 1]) / 2;
        this.box(x, .04, z, 88, .18, 88, this.materials.sidewalk);
        const park = (ix === 2 && iz === 1) || (ix === 0 && iz === 2);
        if (park) this.buildPark(x, z, ix * 10 + iz);
        else this.buildCityBlock(x, z, ix, iz);
      }
    }
  }

  buildCityBlock(cx, cz, ix, iz) {
    const coastal = ix === 0;
    const downtown = ix >= 1 && ix <= 2 && iz >= 1 && iz <= 2;
    const slots = [[-22, -22], [22, -22], [-22, 22], [22, 22]];
    for (let i = 0; i < slots.length; i++) {
      if (this.rng.chance(.14)) continue;
      const [ox, oz] = slots[i];
      const x = cx + ox + this.rng.range(-2, 2), z = cz + oz + this.rng.range(-2, 2);
      const w = this.rng.range(26, 35), d = this.rng.range(25, 35);
      let h = this.rng.range(13, downtown ? 66 : coastal ? 24 : 40);
      if ((ix === 3 && iz === 2 && i === 0) || (ix === 1 && iz === 3 && i === 2)) h = 78;
      const style = this.rng.int(0, this.materials.buildings.length - 1);
      const material = this.materials.buildings[style].clone();
      material.map = this.materials.buildings[style].map.clone();
      material.map.repeat.set(Math.max(1, Math.round(w / 23)), Math.max(1, Math.round(h / 31)));
      material.emissiveMap = material.map;
      const side = material;
      const roof = this.materials.roofs[style];
      const building = this.mesh(new THREE.BoxGeometry(w, h, d), [side, side, roof, roof, side, side], x, h / 2 + .14, z);
      building.name = `Building_${ix}_${iz}_${i}`;
      this.colliders.push({ minX: x - w / 2 - .5, maxX: x + w / 2 + .5, minZ: z - d / 2 - .5, maxZ: z + d / 2 + .5 });
      this.box(x, h + .35, z, w + .5, .55, d + .5, roof);
      this.box(x - w * .22, h + 1.1, z + d * .15, w * .23, 1.4, d * .24, this.materials.metal);
      if (h > 35) {
        this.box(x, h + 4, z, .35, 7, .35, this.materials.metal);
        this.box(x, h + 7.4, z, .8, .4, .8, new THREE.MeshBasicMaterial({ color: 0xff477f }));
      }
      if (coastal || h < 25) {
        const awning = new THREE.MeshStandardMaterial({ color: this.rng.pick([0x40c5bd, 0xd95d85, 0xf0c780]), roughness: .7 });
        this.box(x, 3.1, z + d / 2 + .65, w * .82, .25, 1.3, awning);
      }
      if (this.rng.chance(.28)) {
        const color = this.rng.pick([0x36e7e0, 0xff3e92, 0xffc661]);
        const strip = new THREE.MeshBasicMaterial({ color });
        const xSide = this.rng.chance(.5) ? -1 : 1;
        const neon = this.box(x + xSide * (w / 2 + .07), h * .63, z, .12, h * .63, .28, strip);
        this.neons.push(neon);
      }
    }
  }

  buildPark(cx, cz, salt) {
    this.box(cx, .18, cz, 80, .2, 80, this.materials.grass);
    const path = new THREE.MeshStandardMaterial({ color: 0xb1a78f, roughness: 1 });
    this.box(cx, .3, cz, 8, .06, 80, path);
    this.box(cx, .31, cz, 80, .06, 7, path);
    const fountainBase = new THREE.MeshStandardMaterial({ color: 0x9aa8a7, roughness: .55 });
    this.mesh(new THREE.CylinderGeometry(9, 10, 1.1, 32), fountainBase, cx, .6, cz);
    this.mesh(new THREE.CylinderGeometry(7.9, 8.1, .4, 32), new THREE.MeshStandardMaterial({ color: 0x20a2b5, metalness: .5, roughness: .15 }), cx, 1.2, cz);
    this.mesh(new THREE.CylinderGeometry(.9, 1.8, 5, 16), fountainBase, cx, 2.8, cz);
    for (const [ox, oz] of [[-28, -28], [28, -28], [-28, 28], [28, 28], [-26, 0], [26, 0]]) this.palm(cx + ox, cz + oz, 8 + (salt % 3));
  }

  buildRoadDetails() {
    const whiteTransforms = [], yellowTransforms = [];
    const dummy = new THREE.Object3D();
    for (const r of ROAD_LINES) {
      for (let p = -298; p <= 298; p += 13) {
        for (const offset of [-10.6, 10.6]) {
          dummy.position.set(r + offset, .012, p); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
          whiteTransforms.push(dummy.matrix.clone());
          dummy.position.set(p, .013, r + offset); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); whiteTransforms.push(dummy.matrix.clone());
        }
        if (ROAD_LINES.some((cross) => Math.abs(p - cross) < 18)) continue;
        dummy.position.set(r, .015, p); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); yellowTransforms.push(dummy.matrix.clone());
        dummy.position.set(p, .016, r); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); yellowTransforms.push(dummy.matrix.clone());
      }
    }
    const laneGeo = new THREE.BoxGeometry(.17, .018, 5);
    const lanes = new THREE.InstancedMesh(laneGeo, this.materials.line, whiteTransforms.length);
    whiteTransforms.forEach((matrix, i) => lanes.setMatrixAt(i, matrix)); lanes.instanceMatrix.needsUpdate = true; this.group.add(lanes);
    const center = new THREE.InstancedMesh(laneGeo, this.materials.yellow, yellowTransforms.length);
    yellowTransforms.forEach((matrix, i) => center.setMatrixAt(i, matrix)); center.instanceMatrix.needsUpdate = true; this.group.add(center);

    const crossTransforms = [];
    for (const x of ROAD_LINES) for (const z of ROAD_LINES) {
      for (let j = -4; j <= 4; j++) {
        dummy.position.set(x + j * 1.65, .024, z + 14); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); crossTransforms.push(dummy.matrix.clone());
        dummy.position.set(x + 14, .024, z + j * 1.65); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); crossTransforms.push(dummy.matrix.clone());
      }
    }
    const cross = new THREE.InstancedMesh(new THREE.BoxGeometry(.85, .018, 4), this.materials.line, crossTransforms.length);
    crossTransforms.forEach((m, i) => cross.setMatrixAt(i, m)); cross.instanceMatrix.needsUpdate = true; this.group.add(cross);
  }

  buildWaterfront() {
    const railMat = new THREE.MeshStandardMaterial({ color: 0xcedbd3, metalness: .5, roughness: .4 });
    for (let z = -280; z < 290; z += 13) {
      this.box(-261, .6, z, .18, 1.2, .18, railMat);
      this.box(-261, 1.13, z + 5, .18, .15, 11, railMat);
    }
    for (let z = -260; z <= 260; z += 33) this.palm(-252, z, 9 + this.rng.range(-1, 2));
    const umbrellas = [0xe66591, 0xf4cc80, 0x3ac4bd];
    for (let z = -230; z < 260; z += 45) {
      const x = this.rng.range(-292, -273);
      this.mesh(new THREE.ConeGeometry(3.2, 1.2, 12), new THREE.MeshStandardMaterial({ color: this.rng.pick(umbrellas), side: THREE.DoubleSide }), x, 2.5, z);
      this.box(x, 1.2, z, .13, 2.4, .13, railMat);
      this.box(x + 3, .28, z, 1.7, .2, 4, new THREE.MeshStandardMaterial({ color: 0xefd6b6 }));
    }
    const craneMat = new THREE.MeshStandardMaterial({ color: 0xd19848, roughness: .65, metalness: .4 });
    for (const z of [-220, -160]) {
      this.box(273, 13, z, 3, 26, 3, craneMat);
      this.box(259, 26, z, 32, 2.2, 2.2, craneMat);
      this.box(245, 17, z, .25, 18, .25, this.materials.metal);
    }
  }

  buildLandmarks() {
    this.sign('SOLARA', 126, 24, 85, 22, 6, 0xff5a9f, Math.PI / 2);
    this.sign('VICE ROOM', -126, 11, 85, 25, 5, 0x49ffff, Math.PI / 2);
    this.sign('PALMETTO', 31, 10, 176, 27, 5, 0xffb272, Math.PI);
    this.sign('MERIDIAN', -31, 35, -78, 23, 6, 0x54e8e0, 0);
    this.sign('HEATWAVE', -247, 8, 13, 26, 6, 0xff629f, -Math.PI / 2);
    this.sign('PORT 06', 267, 16, -113, 20, 5, 0xffcd63, Math.PI / 2);
    const roof = new THREE.MeshStandardMaterial({ color: 0xc6b292, roughness: .65 });
    this.box(160, 5, 60, 14, 10, 46, roof);
    const canopy = new THREE.MeshStandardMaterial({ color: 0x2bddd1, metalness: .4, roughness: .35 });
    this.box(145, 3.8, 64, 19, .3, 18, canopy);
    const fountain = new THREE.MeshBasicMaterial({ color: 0x6fe8e6, transparent: true, opacity: .7, side: THREE.DoubleSide });
    this.mesh(new THREE.CylinderGeometry(.03, 2.2, 6, 16, 1, true), fountain, 135, 3.3, 59);
  }

  sign(text, x, y, z, w, h, color, rotation = 0) {
    const cssColor = `#${color.toString(16).padStart(6, '0')}`;
    const texture = canvasTexture(512, 128, (ctx, width, height) => {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = 'rgba(4,16,25,.91)'; ctx.fillRect(2, 2, width - 4, height - 4);
      ctx.strokeStyle = cssColor; ctx.lineWidth = 5; ctx.strokeRect(5, 5, width - 10, height - 10);
      ctx.font = '900 62px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = cssColor; ctx.shadowBlur = 20; ctx.fillStyle = '#fff4e9'; ctx.fillText(text, width / 2, height / 2 + 2);
    });
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    const sign = this.mesh(new THREE.PlaneGeometry(w, h), material, x, y, z);
    sign.rotation.y = rotation; sign.castShadow = false; this.neons.push(sign);
  }

  buildStreetFurniture() {
    const dummy = new THREE.Object3D();
    const positions = [];
    for (const road of ROAD_LINES) for (let p = -270; p <= 270; p += 30) {
      if (ROAD_LINES.some((c) => Math.abs(p - c) < 22)) continue;
      positions.push([road + 16, p, 0], [p, road + 16, Math.PI / 2]);
    }
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.1, .15, 6, 6), this.materials.metal, positions.length);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(.65, .22, 1.25), this.materials.glow, positions.length);
    positions.forEach(([x, z, rotation], i) => {
      dummy.position.set(x, 3.1, z); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix(); poles.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 6.15; dummy.updateMatrix(); lamps.setMatrixAt(i, dummy.matrix);
    });
    poles.instanceMatrix.needsUpdate = lamps.instanceMatrix.needsUpdate = true;
    this.group.add(poles, lamps);
    for (const [x, z] of [[-114, 130], [18, 174], [111, 29], [-106, -139], [213, -149], [-18, -103], [139, 178]]) {
      const light = new THREE.PointLight(0x59e8e0, 15, 36, 2);
      light.position.set(x, 5.5, z); this.group.add(light); this.lamps.push(light);
    }
    for (const road of [-120, 120]) for (let z = -260; z <= 260; z += 52) {
      if (ROAD_LINES.some((r) => Math.abs(z - r) < 35)) continue;
      this.palm(road + 18, z, this.rng.range(7, 11));
    }
  }

  palm(x, z, height) {
    const trunk = this.mesh(new THREE.CylinderGeometry(.22, .42, height, 7), this.materials.trunk, x, height / 2 + .2, z);
    trunk.rotation.z = .04;
    for (let i = 0; i < 7; i++) {
      const leaf = this.mesh(new THREE.ConeGeometry(1.15, 5.6, 4), this.materials.leaf, x, height + .4, z);
      leaf.rotation.z = Math.PI / 2 + .25;
      leaf.rotation.y = i * Math.PI * 2 / 7;
      leaf.position.x += Math.sin(leaf.rotation.y) * 1.65;
      leaf.position.z += Math.cos(leaf.rotation.y) * 1.65;
    }
  }

  update(time) {
    if (this.water) {
      this.water.material.color.setHSL(.53 + Math.sin(time * .15) * .006, .78, .25);
      this.water.position.y = -.12 + Math.sin(time * .55) * .025;
    }
    for (let i = 0; i < this.lamps.length; i++) this.lamps[i].intensity = 13 + Math.sin(time * 1.8 + i) * 2;
  }

  districtAt(x, z) {
    if (x < -225) return ['OCEAN DRIVE', 'HEATWAVE BEACH'];
    if (x > 205 && z < -80) return ['PORT MERIDIAN', 'THE DOCKS'];
    if (z < -120 && x < -50) return ['VESPER MARINA', 'VESPER'];
    if (Math.abs(x) < 80 && z < 50) return ['MERIDIAN PLAZA', 'DOWNTOWN'];
    if (z > 110) return ['PALMETTO STRIP', 'PALMETTO'];
    if (x > 70) return ['SOLARA BOULEVARD', 'SOLARA'];
    return ['NEON MILE', 'VICE ROOM'];
  }
}
