const KEY_MAP = {
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  Space: 'handbrake',
};

const BLOCK_SCROLL = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/**
 * Collects keyboard and on screen input into one normalised input object.
 * Commands (camera, reset, pause, day/night) are fired as callbacks so the
 * React layer and the game stay in sync.
 */
export class Controls {
  constructor(onCommand) {
    this.onCommand = onCommand || (() => {});
    this.keys = { up: false, down: false, left: false, right: false, handbrake: false };
    this.touch = { up: false, down: false, left: false, right: false, handbrake: false };
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    this.enabled = true;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);
  }

  attach() {
    window.addEventListener('keydown', this.handleKeyDown, { passive: false });
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  detach() {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }

  handleKeyDown(event) {
    if (event.repeat) {
      if (BLOCK_SCROLL.has(event.code)) event.preventDefault();
      return;
    }
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

    if (BLOCK_SCROLL.has(event.code)) event.preventDefault();

    const mapped = KEY_MAP[event.code];
    if (mapped) {
      this.keys[mapped] = true;
      return;
    }
    switch (event.code) {
      case 'KeyC':
        this.onCommand('camera');
        break;
      case 'KeyR':
        this.onCommand('reset');
        break;
      case 'KeyN':
        this.onCommand('night');
        break;
      case 'KeyM':
        this.onCommand('mute');
        break;
      case 'Escape':
        this.onCommand('pause');
        break;
      default:
        break;
    }
  }

  handleKeyUp(event) {
    const mapped = KEY_MAP[event.code];
    if (mapped) this.keys[mapped] = false;
  }

  handleBlur() {
    this.releaseAll();
  }

  releaseAll() {
    for (const key of Object.keys(this.keys)) this.keys[key] = false;
    for (const key of Object.keys(this.touch)) this.touch[key] = false;
  }

  setTouch(name, active) {
    if (name in this.touch) this.touch[name] = active;
  }

  /** Merge every source into the input the physics reads. */
  sample() {
    const up = this.keys.up || this.touch.up;
    const down = this.keys.down || this.touch.down;
    const left = this.keys.left || this.touch.left;
    const right = this.keys.right || this.touch.right;
    const handbrake = this.keys.handbrake || this.touch.handbrake;

    this.input.throttle = this.enabled && up ? 1 : 0;
    this.input.brake = this.enabled && down ? 1 : 0;
    this.input.steer = this.enabled ? (left ? 1 : 0) - (right ? 1 : 0) : 0;
    this.input.handbrake = this.enabled && !!handbrake;
    return this.input;
  }
}
