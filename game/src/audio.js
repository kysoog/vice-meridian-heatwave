// Synthesised sound. Everything is generated with Web Audio oscillators and
// noise buffers: no audio files, no network. Per-frame calls are wrapped in
// try/catch by the render loop because a thrown audio error every frame
// stops rendering.

let ctx = null;
function boot() {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch { /* blocked without a gesture: audio stays off */ }
    }
  } catch {
    ctx = null;
  }
  return ctx;
}

let master = null;
let engine = null;      // player car engine drone
let siren = null;       // police siren tone
let noiseBuffer = null; // crashes, shots, footsteps

export function createAudio() {
  const c = boot();
  if (!c) return { tick() {}, engine() {}, siren() {}, crash() {}, shot() {}, step() {} };

  master = c.createGain();
  master.connect(c.destination);
  master.gain.value = 0.35;

  const engineOsc = c.createOscillator();
  engineOsc.type = 'sawtooth';
  const engineGain = c.createGain();
  engineOsc.connect(engineGain);
  engineGain.connect(master);
  engineOsc.frequency.setValueAtTime(92, c.currentTime);
  engineOsc.start();
  engine = { osc: engineOsc, gain: engineGain, active: false };

  const sirenOsc = c.createOscillator();
  sirenOsc.type = 'square';
  const sirenGain = c.createGain();
  sirenGain.gain.value = 0;
  sirenOsc.connect(sirenGain);
  sirenGain.connect(master);
  sirenOsc.frequency.setValueAtTime(880, c.currentTime);
  sirenOsc.start();
  siren = { osc: sirenOsc, gain: sirenGain, high: true, next: c.currentTime + 0.4 };

  const noiseLen = Math.floor(c.sampleRate * 0.5);
  const noise = c.createBuffer(1, noiseLen, c.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 0x9e3779b9;
  for (let i = 0; i < noiseLen; i++) {
    // Seeded noise, so the same run sounds the same every time.
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = ((seed >>> 8) / 0xffffff - 0.5) * 0.6;
  }
  noiseBuffer = noise;

  let lastSpeed = 0;

  /** One short seeded-noise burst through its own gain: crash, shot, footstep. */
  function burst(gain, seconds, oscHz) {
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    const g = c.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start();
    try { src.stop(c.currentTime + seconds); } catch { /* already stopped */ }
    if (oscHz) {
      const osc = c.createOscillator();
      const og = c.createGain();
      og.gain.setValueAtTime(gain, c.currentTime);
      try { og.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + seconds); } catch { /* ignore */ }
      osc.frequency.setValueAtTime(oscHz, c.currentTime);
      osc.connect(og);
      og.connect(master);
      osc.start();
      try { osc.stop(c.currentTime + seconds); } catch { /* already stopped */ }
    }
  }

  return {
    tick(playerCar, policeCars, shooting, footsteps) {
      const now = c.currentTime;
      // Player-car engine drone: pitch and loudness follow RPM-ish speed.
      if (engine) {
        const rpm = playerCar ? Math.min(1, Math.abs(playerCar.speed) / 26) : 0;
        const targetFreq = 70 + rpm * 140;
        try { engine.osc.frequency.setTargetAtTime(targetFreq, now, 0.05); } catch { /* ignore */ }
        const targetGain = playerCar ? 0.015 + rpm * 0.05 : 0.002;
        try { engine.gain.gain.setTargetAtTime(targetGain, now, 0.05); } catch { /* ignore */ }
        engine.active = playerCar ? true : engine.active;
        // A sudden loss of speed is a crash.
        const speed = playerCar ? Math.abs(playerCar.speed) : 0;
        if (lastSpeed - speed > 9) burst(0.16, 0.4);
        lastSpeed = speed;
      }
      // Police siren: one shared wailing voice while any cruiser is out.
      if (siren) {
        const active = policeCars.length > 0;
        try { siren.gain.gain.setTargetAtTime(active ? 0.14 : 0, now, 0.05); } catch { /* ignore */ }
        if (active && now >= siren.next) {
          siren.high = !siren.high;
          try { siren.osc.frequency.setTargetAtTime(siren.high ? 1040 : 740, now, 0.1); } catch { /* ignore */ }
          siren.next = now + 0.42;
        }
      }
      if (shooting) burst(0.1, 0.12, 780);
      if (footsteps) burst(0.03, 0.06);
    },
    destroy() {
      try { master.gain.setTargetAtTime(0, c.currentTime, 0.2); } catch { /* ignore */ }
      try { engine.osc.stop(); } catch { /* already stopped */ }
      try { siren.osc.stop(); } catch { /* already stopped */ }
    },
  };
}
