export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.enabled = true;
    addEventListener('keydown', (event) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
    });
    addEventListener('keyup', (event) => this.keys.delete(event.code));
    addEventListener('blur', () => { this.keys.clear(); this.pressed.clear(); });
    addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === canvas && this.enabled) {
        this.mouseDX += event.movementX;
        this.mouseDY += event.movementY;
      }
    });
    canvas.addEventListener('mousedown', () => {
      if (this.enabled && document.pointerLockElement !== canvas) canvas.requestPointerLock?.().catch?.(() => {});
    });
  }
  down(...codes) { return this.enabled && codes.some((code) => this.keys.has(code)); }
  consume(code) {
    if (!this.enabled || !this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }
  axis() {
    return {
      x: Number(this.down('KeyD', 'ArrowRight')) - Number(this.down('KeyA', 'ArrowLeft')),
      y: Number(this.down('KeyW', 'ArrowUp')) - Number(this.down('KeyS', 'ArrowDown')),
    };
  }
  mouse() { const result = [this.mouseDX, this.mouseDY]; this.mouseDX = this.mouseDY = 0; return result; }
  endFrame() { this.pressed.clear(); }
  setEnabled(value) { this.enabled = value; if (!value) this.keys.clear(); }
}
