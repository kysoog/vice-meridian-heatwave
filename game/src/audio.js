// Procedural Web Audio score, vehicle, city and effects; no fetched sound files.
export class AudioSystem {
  constructor() { this.ctx = null; this.muted = false; this.started = false; this.lastShot = 0; }
  start() {
    if (this.started) { this.ctx?.resume().catch(() => {}); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.42;
      this.master.connect(c.destination);
      this.music = c.createGain(); this.music.gain.value = 0.055; this.music.connect(this.master);
      this.engine = c.createOscillator(); this.engine.type = 'sawtooth'; this.engine.frequency.value = 45;
      this.engineGain = c.createGain(); this.engineGain.gain.value = 0;
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 280;
      this.engine.connect(filter); filter.connect(this.engineGain); this.engineGain.connect(this.master); this.engine.start();
      this.siren = c.createOscillator(); this.siren.type = 'square';
      this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0;
      this.siren.connect(this.sirenGain); this.sirenGain.connect(this.master); this.siren.start();
      const noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const channel = noise.getChannelData(0);
      let state = 0x6712ab91;
      for (let i = 0; i < channel.length; i++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; channel[i] = ((state >>> 0) / 2147483648 - 1) * 0.4; }
      this.wind = c.createBufferSource(); this.wind.buffer = noise; this.wind.loop = true;
      this.windGain = c.createGain(); this.windGain.gain.value = 0.025;
      this.wind.connect(this.windGain); this.windGain.connect(this.master); this.wind.start();
      this.started = true;
      this.scheduled = 0;
    } catch { this.started = false; }
  }
  tone(frequency, duration = 0.12, volume = 0.13, type = 'sine', delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = type; osc.frequency.setValueAtTime(frequency, t);
      gain.gain.setValueAtTime(0.001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
      osc.connect(gain); gain.connect(this.master); osc.start(t); osc.stop(t + duration + 0.02);
    } catch { /* Audio never interrupts simulation. */ }
  }
  effect(name) {
    if (name === 'shot') this.tone(95, 0.09, 0.22, 'square');
    if (name === 'enter') { this.tone(190, 0.09, 0.1); this.tone(285, 0.12, 0.08, 'sine', 0.07); }
    if (name === 'objective') [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.32, 0.08, 'sine', i * 0.1));
    if (name === 'hit') this.tone(58, 0.18, 0.16, 'sawtooth');
    if (name === 'cash') { this.tone(880, 0.16, 0.09); this.tone(1320, 0.24, 0.08, 'sine', 0.08); }
  }
  update(speed, wanted, active) {
    if (!this.started || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this.engine.frequency.setTargetAtTime(42 + Math.abs(speed) * 3.5, t, 0.08);
      this.engineGain.gain.setTargetAtTime(active ? 0.045 + Math.abs(speed) * 0.002 : 0, t, 0.1);
      this.siren.frequency.setTargetAtTime(690 + Math.sin(t * 8) * 190, t, 0.02);
      this.sirenGain.gain.setTargetAtTime(wanted > 0 ? Math.min(0.045, wanted * 0.012) : 0, t, 0.12);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.42, t, 0.04);
      if (t > this.scheduled) {
        const notes = [110, 130.81, 146.83, 164.81, 196];
        const n = notes[Math.floor(t / 2) % notes.length];
        this.tone(n, 1.85, 0.05, 'triangle');
        this.tone(n * 2, 0.45, 0.026, 'sine', 0.4);
        this.scheduled = t + 1.9;
      }
    } catch { /* setTargetAtTime is guarded for restricted audio contexts. */ }
  }
  setMuted(value) {
    this.muted = value;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(value ? 0 : 0.42, this.ctx.currentTime, 0.03);
  }
}
