import * as THREE from 'three';
import { clamp, damp } from './mathUtils.js';

const CHASE = { distance: 7.2, height: 3.05, look: 6.5, lookHeight: 1.15 };
const HOOD = { forward: 0.42, height: 1.24 };

/**
 * Smooth third person chase camera with a hood camera alternative.
 * The rig damps position and aim separately so fast direction changes still
 * feel connected to the car.
 */
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'chase';
    this.position = new THREE.Vector3(0, 5, -12);
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this.baseFov = 62;
    this.fov = 62;
    this._desired = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._offset = new THREE.Vector3();
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'hood') this.snap = true;
  }

  toggle() {
    this.setMode(this.mode === 'chase' ? 'hood' : 'chase');
    return this.mode;
  }

  addShake(amount) {
    this.shake = Math.min(1.4, this.shake + amount);
  }

  reset(physics) {
    this.snap = true;
    this.update(0.016, physics, true);
  }

  update(dt, physics, immediate = false) {
    const fx = Math.sin(physics.heading);
    const fz = Math.cos(physics.heading);
    const rx = -Math.cos(physics.heading);
    const rz = Math.sin(physics.heading);
    const speed = Math.abs(physics.speed);
    const snap = immediate || this.snap;
    this.snap = false;

    if (this.mode === 'hood') {
      this._desired.set(physics.x + fx * HOOD.forward, HOOD.height, physics.z + fz * HOOD.forward);
      this._target.set(physics.x + fx * 22, HOOD.height - 0.9, physics.z + fz * 22);
      this.position.copy(this._desired);
      const lookLambda = snap ? 60 : 14;
      this.lookAt.x = damp(this.lookAt.x, this._target.x, lookLambda, dt);
      this.lookAt.y = damp(this.lookAt.y, this._target.y, lookLambda, dt);
      this.lookAt.z = damp(this.lookAt.z, this._target.z, lookLambda, dt);
    } else {
      // Pull back and rise slightly with speed, and lead into the corner.
      const speedT = clamp(speed / 45, 0, 1);
      const distance = CHASE.distance + speedT * 1.9;
      const height = CHASE.height + speedT * 0.35;
      const drift = clamp(-physics.lateral * 0.11, -1.5, 1.5);

      this._desired.set(
        physics.x - fx * distance + rx * drift,
        height,
        physics.z - fz * distance + rz * drift
      );
      this._target.set(
        physics.x + fx * CHASE.look,
        CHASE.lookHeight,
        physics.z + fz * CHASE.look
      );

      const posLambda = snap ? 60 : 5.5;
      const lookLambda = snap ? 60 : 7.5;
      this.position.x = damp(this.position.x, this._desired.x, posLambda, dt);
      this.position.y = damp(this.position.y, this._desired.y, posLambda, dt);
      this.position.z = damp(this.position.z, this._desired.z, posLambda, dt);
      this.lookAt.x = damp(this.lookAt.x, this._target.x, lookLambda, dt);
      this.lookAt.y = damp(this.lookAt.y, this._target.y, lookLambda, dt);
      this.lookAt.z = damp(this.lookAt.z, this._target.z, lookLambda, dt);
      if (this.position.y < 0.9) this.position.y = 0.9;
    }

    // Collision shake.
    if (this.shake > 0.001) {
      const s = this.shake;
      this._offset.set(
        (Math.random() - 0.5) * s * 0.85,
        (Math.random() - 0.5) * s * 0.6,
        (Math.random() - 0.5) * s * 0.85
      );
      this.shake = Math.max(0, this.shake - dt * 2.6);
    } else {
      this._offset.set(0, 0, 0);
      this.shake = 0;
    }

    this.camera.position.copy(this.position).add(this._offset);
    this.camera.lookAt(this.lookAt);

    // Speed widens the field of view for a sense of pace.
    const targetFov = this.baseFov + clamp(speed / 55, 0, 1) * 14;
    this.fov = damp(this.fov, targetFov, 3, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
