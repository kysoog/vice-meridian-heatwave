// Keyboard and mouse input. Reads raw key state every frame and reports
// actions (confirm, pause, enter car, shoot) since the last takeActions()
// call, plus a movement vector and the mouse position on the canvas.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_SHOOT = 8;

const CODE_ACTION = {
  Enter: ACTION_CONFIRM,
  NumpadEnter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyF: ACTION_ENTER,
};

export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  const rect = () => canvas.getBoundingClientRect();

  function onKeyDown(event) {
    if (keys.has(event.code)) return;
    keys.add(event.code);
    pressed.add(event.code);
    if (event.code === 'KeyF') pressed.add('KeyF');
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const r = rect();
    mouse.x = (event.clientX - r.left) / (r.width || 1);
    mouse.y = (event.clientY - r.top) / (r.height || 1);
  }
  function onMouseDown(event) {
    if (event.button === 0) mouse.down = true;
  }
  function onMouseUp(event) {
    if (event.button === 0) {
      mouse.down = false;
      mouse.clicked = true;
    }
  }
  function onBlur() {
    keys.clear();
    pressed.clear();
    mouse.down = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Normalised movement vector: x is right/strafe, z is forward/back. */
    direction() {
      let x = 0;
      let z = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) z += 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) z -= 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      const len = Math.sqrt(x * x + z * z);
      if (len > 0) {
        x /= len;
        z /= len;
      }
      return { x, z };
    },
    /** Mouse position as fractions of the canvas (0..1). */
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    /** Action flags raised since the previous call; clears them. */
    takeActions() {
      let actions = 0;
      for (const code of pressed) {
        const mapped = CODE_ACTION[code];
        if (mapped) actions |= mapped;
      }
      if (mouse.clicked) actions |= ACTION_SHOOT;
      pressed.clear();
      mouse.clicked = false;
      return actions;
    },
    justPressed(code) {
      return pressed.has(code);
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('contextmenu', (event) => event.preventDefault());
    },
  };
}
