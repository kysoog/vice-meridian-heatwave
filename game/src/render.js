import * as THREE from '../vendor/three.module.min.js';
import { clamp, damp, forward, right } from './math.js';

export class RenderSystem {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.36;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x648b9f);
    this.scene.fog = new THREE.Fog(0x658c9e, 105, 490);
    this.camera = new THREE.PerspectiveCamera(61, innerWidth / innerHeight, .1, 1100);
    this.camera.position.set(12, 7, 160);
    this.cameraTarget = new THREE.Vector3();
    this.cameraPosition = this.camera.position.clone();
    this.introTime = 0; this.tracers = []; this.effects = [];
    this.createAtmosphere(); this.createLights(); this.createParticles();
    addEventListener('resize', () => this.resize());
  }
  createAtmosphere() {
    const sky = new THREE.Mesh(new THREE.SphereGeometry(850, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { topColor: { value: new THREE.Color(0x183958) }, horizonColor: { value: new THREE.Color(0xf28e9f) }, lowColor: { value: new THREE.Color(0x6199ac) } },
      vertexShader: 'varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vPosition; uniform vec3 topColor;uniform vec3 horizonColor;uniform vec3 lowColor;void main(){float h=normalize(vPosition).y;vec3 c=mix(horizonColor,topColor,smoothstep(0.02,.72,h));c=mix(lowColor,c,smoothstep(-.2,.03,h));gl_FragColor=vec4(c,1.0);}',
    }));
    this.scene.add(sky);
    const sunTexture = this.radialTexture();
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture, color: 0xffbc8d, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sun.position.set(-440, 135, -570); sun.scale.set(125, 125, 1); this.scene.add(sun);
    const starPositions = [];
    for (let i = 0; i < 170; i++) {
      const angle = i * 2.399963, y = 160 + (i * 67 % 410), radius = Math.sqrt(780 * 780 - y * y);
      starPositions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcbe6ed, size: 1.5, sizeAttenuation: true, transparent: true, opacity: .45, depthWrite: false })));
  }
  radialTexture() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'); const g = ctx.createRadialGradient(64, 64, 6, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,246,214,1)'); g.addColorStop(.18, 'rgba(255,178,137,.9)'); g.addColorStop(.48, 'rgba(255,92,149,.25)'); g.addColorStop(1, 'rgba(255,80,130,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
  }
  createLights() {
    this.hemi = new THREE.HemisphereLight(0x93d5e5, 0x24303c, 2.1); this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0x799cac, .62); this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffc2a2, 3.25);
    this.sun.position.set(-70, 120, 65); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -75; this.sun.shadow.camera.right = 75; this.sun.shadow.camera.top = 75; this.sun.shadow.camera.bottom = -75;
    this.sun.shadow.camera.near = 10; this.sun.shadow.camera.far = 270;
    this.sun.shadow.bias = -.00025; this.sun.shadow.normalBias = .035;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight(0x2de9e0, 1.25); rim.position.set(90, 30, -70); this.scene.add(rim);
  }
  createParticles() {
    const positions = [];
    for (let i = 0; i < 210; i++) positions.push(((i * 47) % 560) - 280, 2 + (i * 31 % 340) / 20, ((i * 83) % 560) - 280);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.motes = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffc6a3, size: .09, transparent: true, opacity: .38, depthWrite: false }));
    this.scene.add(this.motes);
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight, false);
  }
  spawnTracer(from, to, color = 0xffe6a1) {
    const start = new THREE.Vector3(from.x, from.y + 1.15, from.z);
    const end = new THREE.Vector3(to.x, to.y + 1, to.z);
    const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(line); this.tracers.push({ line, life: .12 });
    const flash = new THREE.PointLight(color, 18, 12, 2); flash.position.copy(start); this.scene.add(flash); this.effects.push({ light: flash, life: .065 });
  }
  burst(position, color = 0xff5b91) {
    const points = [];
    for (let i = 0; i < 12; i++) points.push(position.x, position.y + 1, position.z);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    const particle = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .22, transparent: true, opacity: 1, depthWrite: false }));
    this.scene.add(particle); this.effects.push({ particle, life: .35, velocity: Array.from({ length: 12 }, (_, i) => [Math.sin(i * 2.4) * (2 + i % 3), 1 + i % 4, Math.cos(i * 2.4) * (2 + i % 3)]) });
  }
  updateEffects(dt) {
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]; t.life -= dt; t.line.material.opacity = Math.max(0, t.life / .12);
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); this.tracers.splice(i, 1); }
    }
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i]; effect.life -= dt;
      if (effect.light) effect.light.intensity = effect.life * 220;
      if (effect.particle) {
        const attr = effect.particle.geometry.attributes.position;
        for (let j = 0; j < 12; j++) { attr.array[j * 3] += effect.velocity[j][0] * dt; attr.array[j * 3 + 1] += effect.velocity[j][1] * dt; attr.array[j * 3 + 2] += effect.velocity[j][2] * dt; }
        attr.needsUpdate = true; effect.particle.material.opacity = effect.life / .35;
      }
      if (effect.life <= 0) {
        if (effect.light) this.scene.remove(effect.light);
        if (effect.particle) { this.scene.remove(effect.particle); effect.particle.geometry.dispose(); effect.particle.material.dispose(); }
        this.effects.splice(i, 1);
      }
    }
  }
  updateCamera(game, dt) {
    const player = game.player;
    const f = forward(player.lookYaw), r = right(player.lookYaw);
    const driving = Boolean(player.car);
    const speed = driving ? Math.abs(player.car.speed) : player.speed;
    const distance = driving ? 11.8 + speed * .075 : 7.5;
    const height = driving ? 5.5 + player.lookPitch * 5 : 3.8 + player.lookPitch * 4;
    const shoulder = driving ? .35 : 1.1;
    const desired = new THREE.Vector3(
      player.position.x - f.x * distance + r.x * shoulder,
      player.position.y + height,
      player.position.z - f.z * distance + r.z * shoulder,
    );
    const look = new THREE.Vector3(player.position.x + f.x * (driving ? 7 : 4.4), player.position.y + (driving ? 1.05 : 1.35) - player.lookPitch, player.position.z + f.z * (driving ? 7 : 4.4));
    const follow = game.shotMode ? 1 : 1 - Math.exp(-8 * dt);
    this.cameraPosition.lerp(desired, follow); this.cameraTarget.lerp(look, game.shotMode ? 1 : 1 - Math.exp(-10 * dt));
    this.camera.position.copy(this.cameraPosition); this.camera.lookAt(this.cameraTarget);
    const targetFov = 61 + clamp(speed * .28, 0, 9);
    this.camera.fov = damp(this.camera.fov, targetFov, 4, dt); this.camera.updateProjectionMatrix();
    this.sun.position.set(player.position.x - 70, 120, player.position.z + 65);
    this.sun.target.position.set(player.position.x, 0, player.position.z); this.sun.target.updateMatrixWorld();
  }
  update(game, dt) {
    this.updateCamera(game, dt); this.updateEffects(dt);
    this.motes.rotation.y = game.tick * .000015;
    this.renderer.render(this.scene, this.camera);
  }
  intro(dt) {
    this.introTime += dt;
    const t = this.introTime;
    this.camera.position.set(42 + Math.sin(t * .08) * 12, 30 + Math.sin(t * .13) * 3, 206 + Math.cos(t * .09) * 9);
    this.camera.lookAt(2, 11, 75);
    this.sun.position.set(-70, 120, 210); this.sun.target.position.set(0, 0, 120); this.sun.target.updateMatrixWorld();
    this.updateEffects(dt); this.renderer.render(this.scene, this.camera);
  }
}
