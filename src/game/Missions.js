import { REWARDS } from './config.js';
import { dist2D, clamp } from './mathUtils.js';

const TYPES = ['checkpoint', 'delivery', 'route', 'parking'];

const TITLES = {
  checkpoint: ['Checkpoint run', 'Signal test', 'City loop'],
  delivery: ['Parcel run', 'Airport transfer', 'Courier job'],
  route: ['Beat the clock', 'Rush hour dash', 'Express route'],
  parking: ['Valet duty', 'Kerbside parking', 'Tight squeeze'],
};

const REACH_RADIUS = 5.0;
const PARK_HOLD = 1.2;

/**
 * Generates and tracks driving jobs. One job is active at a time and every
 * completed job pays out and pushes the player up a level.
 */
export class MissionSystem {
  constructor(city, handlers = {}) {
    this.city = city;
    this.handlers = handlers;
    this.mission = null;
    this.completed = 0;
    this.level = 1;
    this.sequence = 0;
    this.parkTimer = 0;
  }

  get current() {
    return this.mission;
  }

  /** Builds the next job, biased away from where the player currently is. */
  create(from) {
    const type = TYPES[this.sequence % TYPES.length];
    this.sequence++;
    const difficulty = 1 + (this.level - 1) * 0.12;
    const titles = TITLES[type];
    const title = titles[Math.floor(Math.random() * titles.length)];

    const targets = [];
    let reward = REWARDS.checkpoint;
    let timeLimit = 0;

    if (type === 'checkpoint') {
      targets.push(this.city.randomLanePoint(from, 90));
      reward = REWARDS.checkpoint;
    } else if (type === 'delivery') {
      const a = this.city.randomLanePoint(from, 70);
      const b = this.city.randomLanePoint(a, 90);
      targets.push(a, b);
      reward = REWARDS.delivery;
    } else if (type === 'route') {
      let last = from;
      for (let i = 0; i < 3; i++) {
        const p = this.city.randomLanePoint(last, 70);
        targets.push(p);
        last = p;
      }
      reward = REWARDS.route;
      let total = dist2D(from.x, from.z, targets[0].x, targets[0].z);
      for (let i = 1; i < targets.length; i++) {
        total += dist2D(targets[i - 1].x, targets[i - 1].z, targets[i].x, targets[i].z);
      }
      // Allow for junctions and signals, then tighten it as the level rises.
      timeLimit = Math.round((total / 12.5 + 14) / difficulty);
    } else {
      const bay = this.city.randomParkingBay(from);
      bay.parking = true;
      targets.push(bay);
      reward = REWARDS.parking;
    }

    reward = Math.round(reward * (1 + (this.level - 1) * 0.18));

    this.mission = {
      type,
      title,
      targets,
      index: 0,
      reward,
      timeLimit,
      timeLeft: timeLimit,
      level: this.level,
    };
    this.parkTimer = 0;
    return this.mission;
  }

  objectiveText() {
    const m = this.mission;
    if (!m) return '';
    const remaining = m.targets.length - m.index;
    switch (m.type) {
      case 'checkpoint':
        return 'Reach the checkpoint';
      case 'delivery':
        return m.index === 0 ? 'Collect the parcel' : 'Deliver to the drop off';
      case 'route':
        return `Hit all checkpoints (${remaining} left)`;
      case 'parking':
        return 'Park inside the bay and stop';
      default:
        return 'Drive';
    }
  }

  get target() {
    const m = this.mission;
    if (!m || m.index >= m.targets.length) return null;
    return m.targets[m.index];
  }

  /** carState: { x, z, heading, speed } */
  update(dt, carState) {
    const m = this.mission;
    if (!m) return null;

    if (m.timeLimit > 0) {
      m.timeLeft -= dt;
      if (m.timeLeft <= 0) {
        m.timeLeft = 0;
        return { type: 'failed', reason: 'Out of time' };
      }
    }

    const target = this.target;
    if (!target) return null;
    const distance = dist2D(carState.x, carState.z, target.x, target.z);

    if (m.type === 'parking' && target.parking) {
      // Project into the bay's own frame so alignment matters.
      const fx = Math.sin(target.heading);
      const fz = Math.cos(target.heading);
      const dx = carState.x - target.x;
      const dz = carState.z - target.z;
      const along = Math.abs(dx * fx + dz * fz);
      const across = Math.abs(dx * -fz + dz * fx);
      const inside = along < 1.9 && across < 1.15;
      const stopped = Math.abs(carState.speed) < 1.0;

      if (inside && stopped) {
        this.parkTimer += dt;
        if (this.parkTimer >= PARK_HOLD) return this.finish();
      } else {
        this.parkTimer = Math.max(0, this.parkTimer - dt * 2);
      }
      return { type: 'progress', distance, hold: clamp(this.parkTimer / PARK_HOLD, 0, 1) };
    }

    if (distance < REACH_RADIUS) {
      m.index++;
      if (m.index >= m.targets.length) return this.finish();
      return { type: 'checkpoint', remaining: m.targets.length - m.index };
    }

    return { type: 'progress', distance };
  }

  finish() {
    const m = this.mission;
    const timeBonus = m.timeLimit > 0 ? Math.round(m.timeLeft * REWARDS.timeBonusPerSecond) : 0;
    const payout = m.reward + timeBonus;
    this.completed++;
    if (this.completed % 3 === 0) this.level++;
    return {
      type: 'complete',
      reward: m.reward,
      timeBonus,
      payout,
      title: m.title,
      completed: this.completed,
      level: this.level,
    };
  }

  clear() {
    this.mission = null;
    this.parkTimer = 0;
  }

  reset() {
    this.mission = null;
    this.completed = 0;
    this.level = 1;
    this.sequence = 0;
    this.parkTimer = 0;
  }
}
