import * as THREE from 'three';
import { CITY, TRAFFIC, CAR_PAINTS } from './config.js';
import { buildSimpleCarGeometries } from './carParts.js';
import { clamp, lerp, smoothstep, makeRandom } from './mathUtils.js';
import { GREEN } from './TrafficLights.js';

const tmpA = { x: 0, z: 0 };
const tmpB = { x: 0, z: 0 };
const tmpC = { x: 0, z: 0 };

/**
 * Lane following AI traffic.
 * Cars ride the right hand lane of a directed segment, blend through
 * junctions along a smooth corner, queue behind each other, brake for the
 * player and stop at red lights.
 */
export class Traffic {
  constructor(scene, city, lights, options = {}) {
    this.scene = scene;
    this.city = city;
    this.lights = lights;
    this.rnd = makeRandom(778899);
    this.count = options.mobile ? TRAFFIC.countMobile : TRAFFIC.count;

    this.cars = [];
    this.positions = new Float32Array(this.count * 2);
    this.materials = [];

    this.buildMeshes();
    this.spawn();
  }

  buildMeshes() {
    const { bodyGeo, detailGeo, lightGeo, headGeo } = buildSimpleCarGeometries();
    this.geometries = [bodyGeo, detailGeo, lightGeo, headGeo];

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.36,
      metalness: 0.5,
      envMapIntensity: 1.05,
    });
    const detailMat = new THREE.MeshStandardMaterial({
      color: 0x131519,
      roughness: 0.45,
      metalness: 0.45,
      envMapIntensity: 0.9,
    });
    this.brakeMat = new THREE.MeshBasicMaterial({ color: 0x5a1010, toneMapped: false });
    this.headMat = new THREE.MeshBasicMaterial({ color: 0x4a4a44, toneMapped: false });
    this.materials.push(bodyMat, detailMat, this.brakeMat, this.headMat);

    this.bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, this.count);
    this.details = new THREE.InstancedMesh(detailGeo, detailMat, this.count);
    this.brakes = new THREE.InstancedMesh(lightGeo, this.brakeMat, this.count);
    this.heads = new THREE.InstancedMesh(headGeo, this.headMat, this.count);

    for (const mesh of [this.bodies, this.details, this.brakes, this.heads]) {
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
    this.bodies.castShadow = true;
    this.details.castShadow = true;

    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  spawn() {
    const segments = this.city.segments;
    for (let i = 0; i < this.count; i++) {
      let seg = segments[Math.floor(this.rnd() * segments.length)];
      let s = 6 + this.rnd() * (seg.len - 12);
      // Keep some distance from anything already spawned.
      for (let tries = 0; tries < 20; tries++) {
        let clear = true;
        const p = this.city.laneAt(seg, s, tmpA);
        for (const other of this.cars) {
          if (Math.hypot(other.x - p.x, other.z - p.z) < 12) {
            clear = false;
            break;
          }
        }
        if (clear) break;
        seg = segments[Math.floor(this.rnd() * segments.length)];
        s = 6 + this.rnd() * (seg.len - 12);
      }

      const start = this.city.laneAt(seg, s, tmpA);
      const car = {
        cur: seg.index,
        prev: -1,
        next: this.pickNext(seg.index),
        s,
        speed: TRAFFIC.cruise * 0.6,
        maxSpeed: TRAFFIC.cruise + (this.rnd() - 0.5) * TRAFFIC.cruiseVariation,
        x: start.x,
        z: start.z,
        heading: Math.atan2(seg.dx, seg.dz),
        braking: false,
      };
      this.cars.push(car);
      this.color.setHex(CAR_PAINTS[Math.floor(this.rnd() * CAR_PAINTS.length)]);
      this.bodies.setColorAt(i, this.color);
    }
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  pickNext(segIndex) {
    const seg = this.city.segments[segIndex];
    const options = this.city.outgoing[seg.b];
    const valid = [];
    for (const idx of options) {
      const candidate = this.city.segments[idx];
      if (candidate.b === seg.a) continue; // no U turns
      valid.push(idx);
    }
    if (!valid.length) return options.length ? options[0] : -1;
    // Prefer going straight so traffic reads as purposeful.
    const straight = valid.filter((idx) => this.city.segments[idx].axis === seg.axis);
    if (straight.length && this.rnd() < 0.55) {
      return straight[Math.floor(this.rnd() * straight.length)];
    }
    return valid[Math.floor(this.rnd() * valid.length)];
  }

  laneWorld(seg, s, out) {
    out.x = seg.ax + seg.dx * s + seg.rx * CITY.laneOffset;
    out.z = seg.az + seg.dz * s + seg.rz * CITY.laneOffset;
    return out;
  }

  /** Blended position so cars sweep through junctions instead of snapping. */
  positionAt(car, s, out) {
    const segs = this.city.segments;
    const cur = segs[car.cur];
    const R = TRAFFIC.cornerBlend;
    this.laneWorld(cur, s, tmpB);
    out.x = tmpB.x;
    out.z = tmpB.z;

    if (s > cur.len - R && car.next >= 0) {
      const nxt = segs[car.next];
      this.laneWorld(nxt, s - cur.len, tmpC);
      const w = smoothstep((s - (cur.len - R)) / (2 * R));
      out.x = lerp(out.x, tmpC.x, w);
      out.z = lerp(out.z, tmpC.z, w);
    } else if (s < R && car.prev >= 0) {
      const prv = segs[car.prev];
      this.laneWorld(prv, prv.len + s, tmpC);
      const w = smoothstep((s + R) / (2 * R));
      out.x = lerp(tmpC.x, out.x, w);
      out.z = lerp(tmpC.z, out.z, w);
    }
    return out;
  }

  /** Distance to the closest obstacle in front of this car. */
  gapAhead(car, index, player) {
    const segs = this.city.segments;
    const cur = segs[car.cur];
    let gap = Infinity;

    for (let j = 0; j < this.cars.length; j++) {
      if (j === index) continue;
      const other = this.cars[j];
      if (other.cur === car.cur && other.s > car.s) {
        gap = Math.min(gap, other.s - car.s);
      } else if (other.cur === car.next && car.next >= 0) {
        gap = Math.min(gap, cur.len - car.s + other.s);
      }
    }

    if (player) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const ahead = dx * fx + dz * fz;
      const side = Math.abs(dx * -fz + dz * fx);
      if (ahead > 0 && ahead < 22 && side < 2.9) gap = Math.min(gap, ahead - 1.5);
    }
    return gap;
  }

  update(dt, player) {
    const segs = this.city.segments;
    const stopBuffer = CITY.roadWidth / 2 + 2.2;

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const cur = segs[car.cur];

      let target = car.maxSpeed;

      // Queueing.
      const gap = this.gapAhead(car, i, player);
      if (gap < Infinity) {
        const free = Math.max(0, gap - TRAFFIC.safeGap);
        target = Math.min(target, Math.sqrt(2 * TRAFFIC.decel * free));
      }

      // Traffic signal at the end of the current segment.
      const state = this.lights.stateFor(cur.b, cur.axis);
      const stopS = cur.len - stopBuffer;
      if (state !== GREEN && car.s < stopS) {
        const toStop = stopS - car.s;
        target = Math.min(target, Math.sqrt(2 * TRAFFIC.decel * Math.max(0, toStop)));
      }

      // Slow down for corners.
      if (car.next >= 0) {
        const nxt = segs[car.next];
        const turning = nxt.axis !== cur.axis;
        if (turning && car.s > cur.len - TRAFFIC.cornerBlend * 1.6) {
          target = Math.min(target, 6.5);
        }
      }

      target = clamp(target, 0, car.maxSpeed);
      const rate = target < car.speed ? TRAFFIC.decel : TRAFFIC.accel;
      car.braking = target < car.speed - 0.6;
      car.speed += clamp(target - car.speed, -rate * dt, rate * dt);
      car.speed = Math.max(0, car.speed);

      car.s += car.speed * dt;
      if (car.s >= cur.len) {
        car.s -= cur.len;
        car.prev = car.cur;
        car.cur = car.next >= 0 ? car.next : car.cur;
        car.next = this.pickNext(car.cur);
      }

      this.positionAt(car, car.s, tmpA);
      car.x = tmpA.x;
      car.z = tmpA.z;

      this.positionAt(car, car.s + 0.5, tmpA);
      this.positionAt(car, car.s - 0.5, tmpB);
      car.heading = Math.atan2(tmpA.x - tmpB.x, tmpA.z - tmpB.z);

      this.positions[i * 2] = car.x;
      this.positions[i * 2 + 1] = car.z;
    }

    this.writeInstances();
  }

  writeInstances() {
    const dummy = this.dummy;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      dummy.position.set(car.x, 0, car.z);
      dummy.rotation.set(0, car.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.bodies.setMatrixAt(i, dummy.matrix);
      this.details.setMatrixAt(i, dummy.matrix);
      this.brakes.setMatrixAt(i, dummy.matrix);
      this.heads.setMatrixAt(i, dummy.matrix);
      this.color.setHex(car.braking || car.speed < 0.5 ? 0xff2a14 : 0x4a1210);
      this.brakes.setColorAt(i, this.color);
    }
    this.bodies.instanceMatrix.needsUpdate = true;
    this.details.instanceMatrix.needsUpdate = true;
    this.brakes.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
    if (this.brakes.instanceColor) this.brakes.instanceColor.needsUpdate = true;
  }

  setNight(night) {
    this.headMat.color.setHex(night ? 0xfff0c8 : 0x4a4a44);
  }

  /**
   * Push the player out of any traffic car it is overlapping.
   * Returns the impact speed so the game can play a sound and shake.
   */
  resolvePlayer(physics, radius = 1.45) {
    let impact = 0;
    for (const car of this.cars) {
      const dx = physics.x - car.x;
      const dz = physics.z - car.z;
      const d = Math.hypot(dx, dz);
      const minDist = radius + 1.4;
      if (d > minDist || d < 1e-4) continue;

      const nx = dx / d;
      const nz = dz / d;
      const push = minDist - d;
      physics.x += nx * push;
      physics.z += nz * push;

      const rel = physics.vx * nx + physics.vz * nz;
      if (rel < 0) {
        physics.vx -= rel * nx * 1.35;
        physics.vz -= rel * nz * 1.35;
        impact = Math.max(impact, -rel);
      }
      // The AI car gets shoved and brakes hard.
      car.speed = Math.max(0, car.speed - 4);
      car.s = Math.max(0, car.s - 0.25);
    }
    return impact;
  }

  dispose() {
    for (const mesh of [this.bodies, this.details, this.brakes, this.heads]) {
      this.scene.remove(mesh);
    }
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
