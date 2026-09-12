import * as THREE from 'three';
import { CAR } from './config.js';
import { VehiclePhysics } from './VehiclePhysics.js';
import { buildPlayerCar, createCarMaterials } from './carParts.js';
import { clamp, damp } from './mathUtils.js';
import { makeGlowTexture } from './textures.js';

/**
 * The player's car: physics, model, wheel animation, body roll and lights.
 */
export class Vehicle {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.physics = new VehiclePhysics();
    this.materials = createCarMaterials(options.paint ?? 0x1b3f78);
    const built = buildPlayerCar(this.materials);

    this.group = built.root;
    this.chassis = built.chassis;
    this.wheels = built.wheels;
    this.frontWheels = built.frontWheels;
    this.rearWheels = built.rearWheels;

    this.wheelSpin = 0;
    this.rollSmooth = 0;
    this.pitchSmooth = 0;
    this.bounce = 0;
    this.braking = false;
    this.reversing = false;
    this.headlightsOn = false;

    // Night lighting: two spot lights plus additive glow cards so the
    // headlights read from the front without paying for extra shadow maps.
    const glowTex = makeGlowTexture();
    this.glowMaterial = new THREE.SpriteMaterial({
      map: glowTex,
      color: 0xfff0cc,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glows = [];
    for (const x of [0.62, -0.62]) {
      const sprite = new THREE.Sprite(this.glowMaterial);
      sprite.scale.set(2.2, 1.4, 1);
      sprite.position.set(x, 0.8, 2.45);
      this.chassis.add(sprite);
      this.glows.push(sprite);
    }

    this.spots = [];
    for (const x of [0.62, -0.62]) {
      const spot = new THREE.SpotLight(0xfff1d5, 0, 62, 0.52, 0.55, 1.1);
      spot.position.set(x, 0.82, 2.3);
      spot.target.position.set(x * 1.4, -0.6, 26);
      spot.castShadow = false;
      this.chassis.add(spot);
      this.chassis.add(spot.target);
      this.spots.push(spot);
    }

    scene.add(this.group);
  }

  reset(x, z, heading) {
    this.physics.reset(x, z, heading);
    this.rollSmooth = 0;
    this.pitchSmooth = 0;
    this.bounce = 0;
    this.wheelSpin = 0;
    this.syncTransform();
  }

  get position() {
    return this.group.position;
  }

  syncTransform() {
    const p = this.physics;
    this.group.position.set(p.x, 0, p.z);
    this.group.rotation.y = p.heading;
  }

  update(dt, input) {
    const p = this.physics;
    this.braking = input.brake > 0.05 && p.speed > 0.5;
    this.reversing = p.speed < -0.3;

    this.syncTransform();

    // Wheels roll with the real ground speed and steer at the front.
    this.wheelSpin += (p.speed / CAR.wheelRadius) * dt;
    const steerVisual = clamp(p.steer * 1.15, -0.6, 0.6);
    for (const w of this.wheels) w.rotation.x = this.wheelSpin;
    for (const w of this.frontWheels) w.rotation.y = steerVisual;

    // Suspension: lean into corners, squat under power, dive under braking.
    const targetRoll = clamp(-p.accelLat * CAR.bodyRoll * 0.09, -0.09, 0.09);
    const targetPitch = clamp(-p.accelLong * CAR.bodyPitch * 0.05, -0.055, 0.055);
    this.rollSmooth = damp(this.rollSmooth, targetRoll, 7, dt);
    this.pitchSmooth = damp(this.pitchSmooth, targetPitch, 7, dt);

    // A little vertical float so the car never looks welded to the road.
    this.bounce = damp(this.bounce, Math.sin(this.wheelSpin * 0.6) * 0.006 * Math.min(1, Math.abs(p.speed) / 12), 6, dt);

    this.chassis.rotation.z = this.rollSmooth;
    this.chassis.rotation.x = this.pitchSmooth;
    this.chassis.position.y = this.bounce;

    // Lights.
    const tail = this.materials.tail;
    tail.emissiveIntensity = this.braking || input.handbrake ? 4.2 : this.headlightsOn ? 1.4 : 0.45;
    this.materials.reverse.emissiveIntensity = this.reversing ? 3.2 : 0.05;
    this.materials.head.emissiveIntensity = this.headlightsOn ? 3.4 : 0.3;
  }

  setNight(night) {
    this.headlightsOn = night;
    const intensity = night ? 120 : 0;
    for (const spot of this.spots) spot.intensity = intensity;
    this.glowMaterial.opacity = night ? 0.85 : 0;
  }

  /** World position of a wheel contact patch, used by the skid mark system. */
  getWheelPoint(index, out) {
    const w = this.wheels[index];
    out.set(w.position.x, 0.02, w.position.z);
    out.applyAxisAngle(UP, this.physics.heading);
    out.x += this.physics.x;
    out.z += this.physics.z;
    return out;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
