import * as THREE from 'three';
import { makeRandom } from './mathUtils.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(c, { repeat = true, srgb = true } = {}) {
  const tex = new THREE.CanvasTexture(c);
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Coarse asphalt with grain and a few lighter patches. */
export function makeAsphaltTexture() {
  const size = 256;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = makeRandom(11);

  ctx.fillStyle = '#2b2d32';
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 42;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);

  // Repair patches and tar seams for a used road look.
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rnd() > 0.5 ? '#3a3d44' : '#212328';
    const w = 20 + rnd() * 70;
    const h = 14 + rnd() * 40;
    ctx.fillRect(rnd() * size, rnd() * size, w, h);
  }
  ctx.globalAlpha = 1;
  return finish(c);
}

/** Pale concrete paving with joint lines. */
export function makeSidewalkTexture() {
  const size = 256;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = makeRandom(29);

  ctx.fillStyle = '#8e8d88';
  ctx.fillRect(0, 0, size, size);

  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  ctx.strokeStyle = 'rgba(60,60,58,0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i / 4) * size;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  return finish(c);
}

/** Ground beyond the city: dry grass and dirt. */
export function makeGroundTexture() {
  const size = 256;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const rnd = makeRandom(53);

  ctx.fillStyle = '#4d5142';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${60 + rnd() * 40 | 0},${70 + rnd() * 45 | 0},${45 + rnd() * 30 | 0},0.5)`;
    ctx.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 6, 2 + rnd() * 6);
  }
  return finish(c);
}

/**
 * One facade tile. The tile is 1 window bay wide and 1 floor tall in UV space,
 * so buildings scale their UVs to keep windows the same real world size.
 * Returns { day, night } textures that share the same window grid.
 */
export function makeFacadeTextures(variant = 0) {
  const w = 128;
  const h = 128;
  const day = canvas(w, h);
  const night = canvas(w, h);
  const dc = day.getContext('2d');
  const nc = night.getContext('2d');
  const rnd = makeRandom(variant === 0 ? 91 : 137);

  const wall = variant === 0 ? '#8a8b8e' : '#6d7178';
  const trim = variant === 0 ? '#a5a6a8' : '#565b62';
  const glass = variant === 0 ? '#2c3644' : '#1d2a38';

  dc.fillStyle = wall;
  dc.fillRect(0, 0, w, h);
  // subtle concrete grain
  const img = dc.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 18;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  dc.putImageData(img, 0, 0);

  // Floor slab band.
  dc.fillStyle = trim;
  dc.fillRect(0, 0, w, 14);

  // Window opening.
  const wx = 14;
  const wy = 24;
  const ww = w - 28;
  const wh = h - 40;
  dc.fillStyle = glass;
  dc.fillRect(wx, wy, ww, wh);

  // Glass reflection streak.
  const grad = dc.createLinearGradient(wx, wy, wx + ww, wy + wh);
  grad.addColorStop(0, 'rgba(255,255,255,0.20)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.04)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  dc.fillStyle = grad;
  dc.fillRect(wx, wy, ww, wh);

  // Mullion.
  dc.fillStyle = trim;
  dc.fillRect(w / 2 - 2, wy, 4, wh);

  // Night emissive map: black wall, some windows lit warm.
  nc.fillStyle = '#000000';
  nc.fillRect(0, 0, w, h);
  const lit = rnd() > 0.42;
  if (lit) {
    const warm = rnd();
    const col =
      warm > 0.72 ? '#bfe0ff' : warm > 0.4 ? '#ffd79a' : '#ffbb63';
    nc.fillStyle = col;
    nc.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
    nc.fillStyle = 'rgba(0,0,0,0.55)';
    nc.fillRect(w / 2 - 2, wy, 4, wh);
    nc.fillStyle = 'rgba(0,0,0,0.35)';
    nc.fillRect(wx + 2, wy + wh * 0.55, ww - 4, wh * 0.45);
  }

  return { day: finish(day), night: finish(night) };
}

/** Tyre sidewall plus alloy rim, mapped onto the flat cap of a cylinder. */
export function makeWheelTexture() {
  const size = 256;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const r = size / 2;

  ctx.clearRect(0, 0, size, size);
  // rubber
  ctx.fillStyle = '#191a1c';
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2a2c2f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.85, 0, Math.PI * 2);
  ctx.stroke();

  // rim barrel
  const rim = ctx.createRadialGradient(r * 0.78, r * 0.72, r * 0.05, r, r, r * 0.72);
  rim.addColorStop(0, '#e8ecf1');
  rim.addColorStop(0.55, '#9aa2ac');
  rim.addColorStop(1, '#5d646d');
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(r, r, r * 0.71, 0, Math.PI * 2);
  ctx.fill();

  // spokes
  ctx.fillStyle = '#20242a';
  const spokes = 5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2 + 0.3;
    ctx.beginPath();
    ctx.moveTo(r + Math.cos(a - 0.22) * r * 0.2, r + Math.sin(a - 0.22) * r * 0.2);
    ctx.lineTo(r + Math.cos(a - 0.14) * r * 0.66, r + Math.sin(a - 0.14) * r * 0.66);
    ctx.lineTo(r + Math.cos(a + 0.14) * r * 0.66, r + Math.sin(a + 0.14) * r * 0.66);
    ctx.lineTo(r + Math.cos(a + 0.22) * r * 0.2, r + Math.sin(a + 0.22) * r * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // brake disc hint + hub
  ctx.fillStyle = '#3a3e44';
  ctx.beginPath();
  ctx.arc(r, r, r * 0.19, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c9ced6';
  ctx.beginPath();
  ctx.arc(r, r, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  return finish(c, { repeat: false });
}

/** Vertical sky gradient painted onto the inside of a dome. */
export function makeSkyTexture(night) {
  const c = canvas(16, 256);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  if (night) {
    g.addColorStop(0, '#040610');
    g.addColorStop(0.55, '#0b1022');
    g.addColorStop(0.82, '#1b2438');
    g.addColorStop(1, '#33405a');
  } else {
    g.addColorStop(0, '#2f66b8');
    g.addColorStop(0.45, '#6ea3d8');
    g.addColorStop(0.78, '#adc9e2');
    g.addColorStop(1, '#dfe7ec');
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  return finish(c, { repeat: false });
}

/** Soft radial glow used for lamp pools, headlight cones and marker beams. */
export function makeGlowTexture() {
  const size = 128;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.5)');
  g.addColorStop(0.72, 'rgba(255,255,255,0.13)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return finish(c, { repeat: false });
}

/** Round speed limit sign. */
export function makeSpeedSignTexture(text = '50') {
  const size = 128;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f2f2f0';
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c02020';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#16181c';
  ctx.font = 'bold 62px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2 + 3);
  return finish(c, { repeat: false });
}

/** Octagonal stop sign. */
export function makeStopSignTexture() {
  const size = 128;
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const r = size / 2 - 3;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#b81f24';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const x = size / 2 + Math.cos(a) * r;
    const y = size / 2 + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#f4f4f2';
  ctx.lineWidth = 5;
  ctx.stroke();
  ctx.fillStyle = '#f6f6f4';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STOP', size / 2, size / 2 + 2);
  return finish(c, { repeat: false });
}
