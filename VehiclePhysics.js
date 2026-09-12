import { CAR } from './config.js';
import { clamp, damp } from './mathUtils.js';

/**
 * Arcade oriented bicycle model.
 * The car keeps a real 2D velocity vector so it can slide, understeer and be
 * pushed around by collisions, but the tuning favours a car that is fun and
 * predictable rather than a full tyre simulation.
 *
 * Convention used everywhere in the project:
 *   forward = (sin(heading), cos(heading))   in the XZ plane
 *   right   = (-cos(heading), sin(heading))
 */
export class VehiclePhysics {
  constructor() {
    this.x = 0;
    this.z = 0;
    this.heading = 0;

    this.vx = 0;
    this.vz = 0;

    this.steer = 0;
    this.speed = 0; // signed forward speed
    this.lateral = 0; // sideways speed, drives the skid effects
    this.accelLong = 0;
    this.accelLat = 0;
    this.yawRate = 0;

    this.gear = 1;
    this.rpm = 900;
    this.slip = 0;
    this.airborne = false;
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.vx = 0;
    this.vz = 0;
    this.steer = 0;
    this.speed = 0;
    this.lateral = 0;
    this.yawRate = 0;
    this.slip = 0;
    this.rpm = 900;
    this.gear = 1;
  }

  get forwardX() {
    return Math.sin(this.heading);
  }

  get forwardZ() {
    return Math.cos(this.heading);
  }

  get rightX() {
    return -Math.cos(this.heading);
  }

  get rightZ() {
    return Math.sin(this.heading);
  }

  /** input: { throttle, brake, steer, handbrake } */
  update(dt, input) {
    const fx = this.forwardX;
    const fz = this.forwardZ;
    const rx = this.rightX;
    const rz = this.rightZ;

    let vLong = this.vx * fx + this.vz * fz;
    let vLat = this.vx * rx + this.vz * rz;
    const absLong = Math.abs(vLong);

    // ---- steering -------------------------------------------------------
    const speedFactor = 1 - CAR.highSpeedSteerFactor * clamp(absLong / CAR.maxSpeed, 0, 1);
    const targetSteer = input.steer * CAR.maxSteer * speedFactor;
    const rate = Math.abs(input.steer) > 0.01 ? CAR.steerSpeed : CAR.steerReturn;
    this.steer = damp(this.steer, targetSteer, rate, dt);

    // ---- longitudinal forces -------------------------------------------
    let accel = 0;
    const wantsReverse = input.brake > 0.05 && vLong < 0.6;

    if (input.throttle > 0.01 && vLong > -0.5) {
      // Flat torque under the power band, constant power above it.
      const power = absLong < CAR.powerVelocity ? CAR.peakAccel : (CAR.peakAccel * CAR.powerVelocity) / absLong;
      accel += power * input.throttle;
    }

    if (wantsReverse) {
      accel -= CAR.reverseAccel * input.brake;
    } else if (input.brake > 0.01 && vLong > 0) {
      accel -= CAR.brakeDecel * input.brake;
    }

    if (input.handbrake) {
      accel -= Math.sign(vLong) * CAR.brakeDecel * 0.55;
    }

    // Resistance: rolling plus aerodynamic drag.
    accel -= vLong * CAR.rollingResist;
    accel -= CAR.airDrag * vLong * absLong;

    // Engine braking when coasting.
    if (input.throttle < 0.01 && input.brake < 0.01) {
      accel -= Math.sign(vLong) * Math.min(2.2, absLong * 0.6);
    }

    vLong += accel * dt;

    if (wantsReverse) vLong = Math.max(vLong, -CAR.maxReverse);
    vLong = clamp(vLong, -CAR.maxReverse, CAR.maxSpeed);
    if (Math.abs(vLong) < 0.06 && input.throttle < 0.01 && input.brake < 0.01) vLong = 0;

    // ---- lateral grip ---------------------------------------------------
    let grip = input.handbrake ? CAR.handbrakeGrip : CAR.grip;
    // Grip falls away a little at very high speed so the car feels alive.
    grip *= 1 - 0.18 * clamp(absLong / CAR.maxSpeed, 0, 1);
    const lateralAccel = clamp(-vLat * 9.5, -grip, grip);
    vLat += lateralAccel * dt;

    this.slip = Math.min(1, Math.abs(vLat) / 6.5);

    // ---- yaw ------------------------------------------------------------
    const yaw = (vLong / CAR.wheelBase) * Math.tan(this.steer);
    this.yawRate = yaw;
    this.heading += yaw * dt;

    // ---- integrate ------------------------------------------------------
    const nfx = Math.sin(this.heading);
    const nfz = Math.cos(this.heading);
    const nrx = -Math.cos(this.heading);
    const nrz = Math.sin(this.heading);

    this.vx = nfx * vLong + nrx * vLat;
    this.vz = nfz * vLong + nrz * vLat;

    const total = Math.hypot(this.vx, this.vz);
    if (total > CAR.maxSpeed) {
      const s = CAR.maxSpeed / total;
      this.vx *= s;
      this.vz *= s;
    }

    this.x += this.vx * dt;
    this.z += this.vz * dt;

    this.accelLong = (vLong - this.speed) / Math.max(dt, 1e-4);
    this.accelLat = lateralAccel;
    this.speed = vLong;
    this.lateral = vLat;

    this.updateDrivetrain();
  }

  /** Fake gearbox used by the HUD and by the engine sound. */
  updateDrivetrain() {
    const kmh = Math.abs(this.speed) * 3.6;
    const bands = [0, 26, 52, 82, 116, 155, 240];
    if (this.speed < -0.4) {
      this.gear = -1;
      this.rpm = 900 + Math.min(1, Math.abs(this.speed) / CAR.maxReverse) * 3400;
      return;
    }
    let g = 1;
    for (let i = 1; i < bands.length - 1; i++) {
      if (kmh >= bands[i]) g = i + 1;
    }
    this.gear = g;
    const low = bands[g - 1];
    const high = bands[g];
    const t = clamp((kmh - low) / Math.max(1, high - low), 0, 1);
    this.rpm = 950 + t * 5900;
  }

  /** Used by the collision solver. */
  addImpulse(ix, iz) {
    this.vx += ix;
    this.vz += iz;
  }
}
