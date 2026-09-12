import { CAR } from './config.js';

/**
 * Axis aligned collision world.
 * Everything solid in the city is a box, and the car is approximated by three
 * overlapping circles along its centre line. That is accurate enough for
 * kerbs, walls and parked cars while staying very cheap.
 */
export class CollisionWorld {
  constructor(cellSize = 26) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.boxes = [];
  }

  key(cx, cz) {
    return cx * 10007 + cz;
  }

  addBoxes(boxes) {
    for (const box of boxes) this.addBox(box);
  }

  addBox(box) {
    const index = this.boxes.length;
    this.boxes.push(box);
    const c = this.cellSize;
    const x0 = Math.floor(box.minX / c);
    const x1 = Math.floor(box.maxX / c);
    const z0 = Math.floor(box.minZ / c);
    const z1 = Math.floor(box.maxZ / c);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const k = this.key(x, z);
        let list = this.cells.get(k);
        if (!list) {
          list = [];
          this.cells.set(k, list);
        }
        list.push(index);
      }
    }
  }

  query(x, z, out) {
    out.length = 0;
    const c = this.cellSize;
    const cx = Math.floor(x / c);
    const cz = Math.floor(z / c);
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        const list = this.cells.get(this.key(cx + i, cz + j));
        if (!list) continue;
        for (const index of list) {
          if (out.indexOf(index) === -1) out.push(index);
        }
      }
    }
    return out;
  }
}

const scratch = [];

/**
 * Resolves the car against the static world.
 * Returns the strongest impact speed found, and whether it was a soft kerb.
 */
export function resolveVehicle(physics, world) {
  const fx = Math.sin(physics.heading);
  const fz = Math.cos(physics.heading);
  const samples = [
    { off: 1.55, r: 0.92 },
    { off: 0.0, r: 1.0 },
    { off: -1.55, r: 0.92 },
  ];

  let impact = 0;
  let soft = true;
  let hit = false;

  for (let pass = 0; pass < 2; pass++) {
    for (const sample of samples) {
      const px = physics.x + fx * sample.off;
      const pz = physics.z + fz * sample.off;
      world.query(px, pz, scratch);

      for (const index of scratch) {
        const box = world.boxes[index];
        const cx = px < box.minX ? box.minX : px > box.maxX ? box.maxX : px;
        const cz = pz < box.minZ ? box.minZ : pz > box.maxZ ? box.maxZ : pz;
        let dx = px - cx;
        let dz = pz - cz;
        let d = Math.hypot(dx, dz);

        if (d >= sample.r) continue;

        if (d < 1e-5) {
          // Deep inside: push out along the shallowest axis.
          const left = px - box.minX;
          const right = box.maxX - px;
          const back = pz - box.minZ;
          const front = box.maxZ - pz;
          const min = Math.min(left, right, back, front);
          dx = min === left ? -1 : min === right ? 1 : 0;
          dz = min === back ? -1 : min === front ? 1 : 0;
          d = 0.0001;
        }

        const nx = dx / d;
        const nz = dz / d;
        const push = sample.r - d;

        physics.x += nx * push;
        physics.z += nz * push;

        const rel = physics.vx * nx + physics.vz * nz;
        if (rel < 0) {
          const restitution = box.soft ? 0.12 : 0.32;
          physics.vx -= rel * nx * (1 + restitution);
          physics.vz -= rel * nz * (1 + restitution);
          // Scrubbing off speed along the wall keeps the car from teleporting.
          physics.vx *= box.soft ? 0.94 : 0.82;
          physics.vz *= box.soft ? 0.94 : 0.82;

          if (-rel > impact) {
            impact = -rel;
            soft = !!box.soft;
          }
          hit = true;

          // A glancing blow off centre twists the car a little.
          const torque = (sample.off * (nx * fz - nz * fx) * -rel) / 60;
          physics.heading += Math.max(-0.05, Math.min(0.05, torque));
        }
      }
    }
  }

  if (!hit) return null;
  return { impact, soft };
}

export const VEHICLE_RADIUS = Math.max(CAR.width, 1.6) * 0.78;
