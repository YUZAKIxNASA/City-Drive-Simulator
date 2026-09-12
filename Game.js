import * as THREE from 'three';
import { CITY, REWARDS } from './config.js';
import { clamp } from './mathUtils.js';
import { store, telemetry, pushToast } from '../state/store.js';
import { City } from './City.js';
import { TrafficLights, RED } from './TrafficLights.js';
import { Traffic } from './Traffic.js';
import { Vehicle } from './Vehicle.js';
import { CameraRig } from './CameraRig.js';
import { Environment } from './Environment.js';
import { CollisionWorld, resolveVehicle } from './Collision.js';
import { SkidMarks, ObjectiveMarker } from './Effects.js';
import { MissionSystem } from './Missions.js';
import { Controls } from './Controls.js';
import { AudioEngine } from './AudioEngine.js';

const FIXED_STEP = 1 / 120;
const wheelPoint = new THREE.Vector3();

function detectMobile() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const coarse = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(pointer: coarse)').matches
    : false;
  return /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (coarse && window.innerWidth < 1024);
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.mobile = detectMobile();
    this.running = false;
    this.disposed = false;
    this.accumulator = 0;
    this.lastTime = 0;
    this.orbit = 0;
    this.impactCooldown = 0;
    this.fineCooldown = 0;
    this.crashes = 0;

    this.handleResize = this.handleResize.bind(this);
    this.handleVisibility = this.handleVisibility.bind(this);
    this.loop = this.loop.bind(this);
    this.handleCommand = this.handleCommand.bind(this);
  }

  // ------------------------------------------------------------------ setup
  init() {
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.mobile,
      powerPreference: 'high-performance',
      stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.6 : 2));
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.35, 1400);

    this.environment = new Environment(this.scene, renderer, { mobile: this.mobile });

    this.city = new City(this.scene, { mobile: this.mobile });
    this.city.build();

    this.world = new CollisionWorld(26);
    this.world.addBoxes(this.city.colliders);

    this.lights = new TrafficLights(this.scene, this.city);
    this.traffic = new Traffic(this.scene, this.city, this.lights, { mobile: this.mobile });

    this.vehicle = new Vehicle(this.scene, { paint: 0x1c3f7d });
    this.rig = new CameraRig(this.camera);
    this.skids = new SkidMarks(this.scene);
    this.marker = new ObjectiveMarker(this.scene);
    this.missions = new MissionSystem(this.city);

    this.audio = new AudioEngine();
    this.controls = new Controls(this.handleCommand);
    this.controls.attach();
    this.controls.enabled = false;

    this.spawn = this.city.nearestRoadPoint(0, -52);
    this.vehicle.reset(this.spawn.x, this.spawn.z, this.spawn.heading);
    this.rig.reset(this.vehicle.physics);

    this.lastRear = [new THREE.Vector3(), new THREE.Vector3()];
    this.updateWheelHistory();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibility);

    store.setState({ isTouch: this.mobile, ready: true });
    this.handleResize();

    this.running = true;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.loop);
  }

  // --------------------------------------------------------------- commands
  handleCommand(command) {
    const screen = store.getState().screen;
    switch (command) {
      case 'camera':
        if (screen === 'playing') this.toggleCamera();
        break;
      case 'reset':
        if (screen === 'playing') this.resetCar();
        break;
      case 'night':
        this.toggleNight();
        break;
      case 'mute':
        this.toggleMute();
        break;
      case 'pause':
        if (screen === 'playing') this.pause();
        else if (screen === 'paused') this.resume();
        break;
      default:
        break;
    }
  }

  startGame() {
    this.audio.init();
    this.audio.resume();
    this.audio.blip('click');
    this.audio.setRunning(true);
    this.controls.enabled = true;
    this.missions.reset();
    this.crashes = 0;
    this.vehicle.reset(this.spawn.x, this.spawn.z, this.spawn.heading);
    this.rig.setMode('chase');
    this.rig.reset(this.vehicle.physics);
    this.skids.clear();
    store.setState({ screen: 'playing', money: 0, score: 0, level: 1, missionsDone: 0, result: null });
    this.nextMission();
  }

  nextMission() {
    const physics = this.vehicle.physics;
    const mission = this.missions.create({ x: physics.x, z: physics.z });
    this.showTarget();
    store.setState({
      screen: 'playing',
      result: null,
      mission: {
        title: mission.title,
        type: mission.type,
        objective: this.missions.objectiveText(),
        reward: mission.reward,
        timeLimit: mission.timeLimit,
        step: 1,
        steps: mission.targets.length,
      },
    });
    this.controls.enabled = true;
    this.audio.setRunning(true);
  }

  showTarget() {
    const target = this.missions.target;
    if (!target) {
      this.marker.hide();
      return;
    }
    this.marker.show(target.x, target.z, {
      parking: !!target.parking,
      heading: target.heading || 0,
      color: target.parking ? 0x62e3ff : 0xffa23c,
    });
  }

  pause() {
    if (store.getState().screen !== 'playing') return;
    this.controls.enabled = false;
    this.controls.releaseAll();
    this.audio.setRunning(false);
    this.audio.blip('click');
    store.setState({ screen: 'paused' });
  }

  resume() {
    if (store.getState().screen !== 'paused') return;
    this.controls.enabled = true;
    this.audio.resume();
    this.audio.setRunning(true);
    this.audio.blip('click');
    this.accumulator = 0;
    this.lastTime = performance.now();
    store.setState({ screen: 'playing' });
  }

  restart() {
    this.audio.blip('click');
    this.missions.reset();
    this.crashes = 0;
    this.vehicle.reset(this.spawn.x, this.spawn.z, this.spawn.heading);
    this.rig.setMode('chase');
    this.rig.reset(this.vehicle.physics);
    this.skids.clear();
    store.setState({ money: 0, score: 0, level: 1, missionsDone: 0, result: null });
    this.nextMission();
  }

  retryMission() {
    this.audio.blip('click');
    const mission = this.missions.current;
    if (!mission) {
      this.nextMission();
      return;
    }

    const physics = this.vehicle.physics;
    mission.index = 0;
    mission.timeLeft = mission.timeLimit;
    this.missions.parkTimer = 0;

    const spot = this.city.nearestRoadPoint(physics.x, physics.z);
    this.vehicle.reset(spot.x, spot.z, spot.heading);
    this.rig.reset(physics);
    this.showTarget();

    store.setState({
      screen: 'playing',
      result: null,
      mission: {
        title: mission.title,
        type: mission.type,
        objective: this.missions.objectiveText(),
        reward: mission.reward,
        timeLimit: mission.timeLimit,
        step: 1,
        steps: mission.targets.length,
      },
    });
    this.controls.enabled = true;
    this.audio.setRunning(true);
  }

  resetCar() {
    const physics = this.vehicle.physics;
    const spot = this.city.nearestRoadPoint(physics.x, physics.z);
    this.vehicle.reset(spot.x, spot.z, spot.heading);
    this.rig.reset(physics);
    this.audio.blip('click');
    pushToast('Vehicle reset', 'info');
  }

  toggleCamera() {
    const mode = this.rig.toggle();
    this.audio.blip('click');
    store.setState({ cameraMode: mode });
  }

  toggleNight() {
    const night = !store.getState().night;
    this.environment.setNight(night);
    this.city.setNight(night);
    this.traffic.setNight(night);
    this.vehicle.setNight(night);
    this.audio.blip('click');
    store.setState({ night });
  }

  toggleMute() {
    const muted = !store.getState().muted;
    this.audio.setMuted(muted);
    store.setState({ muted });
    if (!muted) this.audio.blip('click');
  }

  // ------------------------------------------------------------------- loop
  loop(time) {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.loop);

    const dt = clamp((time - this.lastTime) / 1000, 0, 0.05);
    this.lastTime = time;
    const screen = store.getState().screen;

    if (screen === 'playing') {
      this.step(dt);
    } else if (screen === 'start') {
      this.idleCamera(dt);
      this.lights.update(dt);
      this.traffic.update(dt, null);
      this.marker.update(dt);
    } else {
      this.marker.update(dt);
    }

    this.renderer.render(this.scene, this.camera);
  }

  idleCamera(dt) {
    this.orbit += dt * 0.16;
    const physics = this.vehicle.physics;
    const radius = 11.5;
    this.camera.position.set(
      physics.x + Math.sin(this.orbit) * radius,
      3.4 + Math.sin(this.orbit * 0.6) * 0.5,
      physics.z + Math.cos(this.orbit) * radius
    );
    this.camera.lookAt(physics.x, 0.9, physics.z);
    this.environment.follow(physics.x, physics.z);
  }

  step(dt) {
    const input = this.controls.sample();
    const physics = this.vehicle.physics;

    // Fixed step physics keeps the handling identical on every refresh rate.
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_STEP && steps < 8) {
      physics.update(FIXED_STEP, input);
      const hit = resolveVehicle(physics, this.world);
      if (hit) this.handleImpact(hit.impact, hit.soft);
      this.accumulator -= FIXED_STEP;
      steps++;
    }
    if (steps >= 8) this.accumulator = 0;

    this.impactCooldown = Math.max(0, this.impactCooldown - dt);
    this.fineCooldown = Math.max(0, this.fineCooldown - dt);

    this.lights.update(dt);
    this.traffic.update(dt, { x: physics.x, z: physics.z });
    const trafficImpact = this.traffic.resolvePlayer(physics);
    if (trafficImpact > 2.5) this.handleImpact(trafficImpact, false, true);

    this.vehicle.update(dt, input);
    this.updateSkids(dt, input);
    this.checkRedLight(physics);

    this.rig.update(dt, physics);
    this.environment.follow(physics.x, physics.z);
    this.marker.update(dt);

    const event = this.missions.update(dt, {
      x: physics.x,
      z: physics.z,
      heading: physics.heading,
      speed: physics.speed,
    });
    if (event) this.handleMissionEvent(event);

    this.audio.update(physics.rpm, input.throttle, Math.abs(physics.speed), physics.slip);
    this.writeTelemetry(physics);
  }

  handleMissionEvent(event) {
    if (event.type === 'checkpoint') {
      this.audio.blip('checkpoint');
      this.showTarget();
      pushToast('Checkpoint', 'good');
      const mission = this.missions.current;
      store.setState({
        mission: {
          ...store.getState().mission,
          objective: this.missions.objectiveText(),
          step: mission.index + 1,
        },
      });
    } else if (event.type === 'complete') {
      this.audio.blip('success');
      this.audio.setRunning(false);
      this.controls.enabled = false;
      this.controls.releaseAll();
      this.marker.hide();
      const state = store.getState();
      store.setState({
        screen: 'complete',
        money: state.money + event.payout,
        score: state.score + event.payout,
        level: event.level,
        missionsDone: event.completed,
        result: {
          title: event.title,
          reward: event.reward,
          timeBonus: event.timeBonus,
          payout: event.payout,
          level: event.level,
        },
      });
    } else if (event.type === 'failed') {
      this.failMission(event.reason);
    }
  }

  failMission(reason) {
    this.audio.blip('fail');
    this.audio.setRunning(false);
    this.controls.enabled = false;
    this.controls.releaseAll();
    this.marker.hide();
    store.setState({ screen: 'failed', result: { reason } });
  }

  handleImpact(impact, soft, fromTraffic = false) {
    if (impact < 1.6) return;
    this.rig.addShake(clamp(impact / 14, 0.05, 0.9));
    if (this.impactCooldown > 0) return;
    this.impactCooldown = soft ? 0.5 : 0.8;
    this.audio.impact(clamp(impact / 13, 0.15, 1));

    if (soft || impact < 4.5) return;

    this.crashes++;
    const state = store.getState();
    const penalty = Math.min(state.money, REWARDS.crashPenalty);
    store.setState({ money: state.money - penalty });
    pushToast(
      `${fromTraffic ? 'Hit a car' : 'Collision'}${penalty > 0 ? ` -$${penalty}` : ''}`,
      'bad'
    );

    if (impact > 15) this.failMission('Heavy collision');
  }

  checkRedLight(physics) {
    if (this.fineCooldown > 0) return;
    const speed = Math.abs(physics.speed);
    if (speed < 4) return;

    const axis = Math.abs(Math.sin(physics.heading)) > Math.abs(Math.cos(physics.heading)) ? 0 : 1;
    const half = CITY.roadWidth / 2;
    for (const node of this.city.nodes) {
      if (Math.abs(node.x - physics.x) > half || Math.abs(node.z - physics.z) > half) continue;
      if (this.lights.stateFor(node.index, axis) !== RED) return;
      this.fineCooldown = 6;
      const state = store.getState();
      const penalty = Math.min(state.money, REWARDS.redLightPenalty);
      store.setState({ money: state.money - penalty });
      pushToast(`Ran a red light -$${penalty}`, 'bad');
      return;
    }
  }

  updateWheelHistory() {
    for (let i = 0; i < 2; i++) {
      this.vehicle.getWheelPoint(2 + i, wheelPoint);
      this.lastRear[i].copy(wheelPoint);
    }
  }

  updateSkids(dt, input) {
    const physics = this.vehicle.physics;
    const speed = Math.abs(physics.speed);
    const hardBrake = input.brake > 0.5 && physics.speed > 16;
    const slipping = physics.slip > 0.28 || (input.handbrake && speed > 3.5) || hardBrake;
    const strength = clamp(Math.max(physics.slip, input.handbrake && speed > 3.5 ? 0.7 : 0, hardBrake ? 0.55 : 0), 0, 1);

    for (let i = 0; i < 2; i++) {
      this.vehicle.getWheelPoint(2 + i, wheelPoint);
      const last = this.lastRear[i];
      const moved = Math.hypot(wheelPoint.x - last.x, wheelPoint.z - last.z);
      if (slipping && moved > 0.25) {
        this.skids.stamp(last.x, last.z, wheelPoint.x, wheelPoint.z, 0.27, strength);
        last.copy(wheelPoint);
      } else if (!slipping || moved > 1.2) {
        last.copy(wheelPoint);
      }
    }
    this.skids.update(dt);
  }

  writeTelemetry(physics) {
    const target = this.missions.target;
    telemetry.speed = physics.speed;
    telemetry.kmh = Math.abs(physics.speed) * 3.6;
    telemetry.rpm = physics.rpm;
    telemetry.gear = physics.gear === -1 ? 'R' : physics.speed < 0.4 && physics.gear === 1 ? 'N' : String(physics.gear);
    telemetry.x = physics.x;
    telemetry.z = physics.z;
    telemetry.heading = physics.heading;
    telemetry.slip = physics.slip;

    const mission = this.missions.current;
    telemetry.hasTimer = !!(mission && mission.timeLimit > 0);
    telemetry.timeLeft = mission ? mission.timeLeft : 0;

    if (target) {
      telemetry.hasTarget = true;
      telemetry.targetX = target.x;
      telemetry.targetZ = target.z;
      telemetry.distance = Math.hypot(target.x - physics.x, target.z - physics.z);
    } else {
      telemetry.hasTarget = false;
      telemetry.distance = 0;
    }
    telemetry.traffic = this.traffic.positions;
  }

  getMapData() {
    return {
      coords: this.city.coords,
      half: CITY.half,
      bound: CITY.bound,
      roadWidth: CITY.roadWidth,
      roadEnd: this.city.roadEnd,
    };
  }

  // ------------------------------------------------------------------ misc
  handleResize() {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.mobile ? 1.6 : 2));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  handleVisibility() {
    if (document.hidden && store.getState().screen === 'playing') this.pause();
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibility);

    // init() can fail part way through on machines without WebGL, so every
    // system is released defensively.
    const systems = [
      this.controls && (() => this.controls.detach()),
      this.audio && (() => this.audio.dispose()),
      this.skids && (() => this.skids.dispose()),
      this.marker && (() => this.marker.dispose()),
      this.traffic && (() => this.traffic.dispose()),
      this.lights && (() => this.lights.dispose()),
      this.city && (() => this.city.dispose()),
      this.environment && (() => this.environment.dispose()),
      this.renderer && (() => this.renderer.dispose()),
    ];
    for (const release of systems) {
      if (!release) continue;
      try {
        release();
      } catch (err) {
        console.warn('Cleanup failed', err);
      }
    }
  }
}
