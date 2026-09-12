import { clamp } from './mathUtils.js';

/**
 * All sound is synthesised with the Web Audio API, so the game ships with no
 * audio files and still has an engine, tyre squeal, impacts and UI clicks.
 * If a browser blocks audio the rest of the game keeps working.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.running = false;
  }

  /** Must be called from a user gesture (the start button does this). */
  init() {
    if (this.ctx) return true;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    try {
      this.ctx = new Ctx();
    } catch (err) {
      return false;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    // ---- engine ---------------------------------------------------------
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 700;
    this.engineFilter.Q.value = 3.5;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);

    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'sawtooth';

    this.gain1 = ctx.createGain();
    this.gain1.gain.value = 0.55;
    this.gain2 = ctx.createGain();
    this.gain2.gain.value = 0.18;
    this.gain3 = ctx.createGain();
    this.gain3.gain.value = 0.22;

    this.osc1.connect(this.gain1).connect(this.engineFilter);
    this.osc2.connect(this.gain2).connect(this.engineFilter);
    this.osc3.connect(this.gain3).connect(this.engineFilter);

    this.osc1.frequency.value = 40;
    this.osc2.frequency.value = 80;
    this.osc3.frequency.value = 20;

    // ---- noise source shared by road rumble and tyre squeal --------------
    const seconds = 2;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;

    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;

    this.roadFilter = ctx.createBiquadFilter();
    this.roadFilter.type = 'bandpass';
    this.roadFilter.frequency.value = 420;
    this.roadFilter.Q.value = 0.7;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    this.noise.connect(this.roadFilter).connect(this.roadGain).connect(this.master);

    this.skidFilter = ctx.createBiquadFilter();
    this.skidFilter.type = 'bandpass';
    this.skidFilter.frequency.value = 1750;
    this.skidFilter.Q.value = 5.5;
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.noise.connect(this.skidFilter).connect(this.skidGain).connect(this.master);

    try {
      this.osc1.start();
      this.osc2.start();
      this.osc3.start();
      this.noise.start();
    } catch (err) {
      return false;
    }

    this.ready = true;
    this.running = true;
    return true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  setRunning(running) {
    this.running = running;
    if (!this.ready) return;
    if (!running) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.roadGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
      this.skidGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  /** Called every frame with the current car state. */
  update(rpm, throttle, speed, slip) {
    if (!this.ready || !this.running || this.muted) return;
    const t = this.ctx.currentTime;

    // Firing frequency of a four cylinder engine, roughly rpm/30.
    const base = clamp(rpm / 30, 24, 240);
    this.osc1.frequency.setTargetAtTime(base, t, 0.05);
    this.osc2.frequency.setTargetAtTime(base * 2.01, t, 0.05);
    this.osc3.frequency.setTargetAtTime(base * 0.5, t, 0.05);

    const load = 0.16 + throttle * 0.3;
    this.engineGain.gain.setTargetAtTime(load, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(420 + rpm * 0.32 + throttle * 900, t, 0.08);

    const speedT = clamp(speed / 40, 0, 1);
    this.roadGain.gain.setTargetAtTime(speedT * 0.1, t, 0.12);
    this.roadFilter.frequency.setTargetAtTime(300 + speedT * 700, t, 0.15);

    this.skidGain.gain.setTargetAtTime(slip > 0.18 ? clamp(slip, 0, 1) * 0.22 : 0, t, 0.05);
    this.skidFilter.frequency.setTargetAtTime(1500 + slip * 900, t, 0.08);
  }

  /** Short noise burst plus a low thump. */
  impact(strength = 1) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const amount = clamp(strength, 0.15, 1);

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900 + amount * 1400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(amount * 0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + 0.3);

    const thump = ctx.createOscillator();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(120, t);
    thump.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(amount * 0.5, t);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    thump.connect(thumpGain).connect(this.master);
    thump.start(t);
    thump.stop(t + 0.32);
  }

  /** UI feedback: click, positive chime, negative buzz. */
  blip(kind = 'click') {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (kind === 'success') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(880, t + 0.09);
      osc.frequency.setValueAtTime(1320, t + 0.18);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.45);
      return;
    }
    if (kind === 'fail') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.35);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      osc.connect(gain).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.42);
      return;
    }

    osc.type = 'square';
    osc.frequency.setValueAtTime(kind === 'checkpoint' ? 1040 : 720, t);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  dispose() {
    if (!this.ctx) return;
    try {
      this.osc1.stop();
      this.osc2.stop();
      this.osc3.stop();
      this.noise.stop();
    } catch (err) {
      /* already stopped */
    }
    this.ctx.close().catch(() => {});
    this.ctx = null;
    this.ready = false;
  }
}
