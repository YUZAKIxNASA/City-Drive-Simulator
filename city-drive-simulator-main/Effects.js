import * as THREE from 'three';
import { makeGlowTexture } from './textures.js';

const MAX_MARKS = 280;
const VERTS_PER_MARK = 6;

/**
 * Tyre marks written into one preallocated buffer geometry.
 * Each mark is a quad with per vertex alpha, so marks fade out smoothly and
 * the whole system stays a single draw call.
 */
export class SkidMarks {
  constructor(scene) {
    this.scene = scene;
    this.head = 0;
    this.life = new Float32Array(MAX_MARKS);
    this.maxLife = 7.5;

    const count = MAX_MARKS * VERTS_PER_MARK;
    this.positions = new Float32Array(count * 3);
    this.colors = new Float32Array(count * 4);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1000);

    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    this.material = material;
    this.geometry = geometry;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  clear() {
    this.life.fill(0);
    this.colors.fill(0);
    this.geometry.attributes.color.needsUpdate = true;
  }

  /** Stamp a quad between two consecutive wheel positions. */
  stamp(fromX, fromZ, toX, toZ, width, strength) {
    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) return;

    const nx = (-dz / len) * (width / 2);
    const nz = (dx / len) * (width / 2);
    const i = this.head;
    this.head = (this.head + 1) % MAX_MARKS;
    this.life[i] = this.maxLife;

    const base = i * VERTS_PER_MARK * 3;
    const p = this.positions;
    const y = 0.022;

    // triangle 1
    p[base + 0] = fromX + nx; p[base + 1] = y; p[base + 2] = fromZ + nz;
    p[base + 3] = fromX - nx; p[base + 4] = y; p[base + 5] = fromZ - nz;
    p[base + 6] = toX - nx;   p[base + 7] = y; p[base + 8] = toZ - nz;
    // triangle 2
    p[base + 9] = fromX + nx;  p[base + 10] = y; p[base + 11] = fromZ + nz;
    p[base + 12] = toX - nx;   p[base + 13] = y; p[base + 14] = toZ - nz;
    p[base + 15] = toX + nx;   p[base + 16] = y; p[base + 17] = toZ + nz;

    const c = this.colors;
    const cbase = i * VERTS_PER_MARK * 4;
    const alpha = 0.35 + strength * 0.4;
    for (let v = 0; v < VERTS_PER_MARK; v++) {
      c[cbase + v * 4 + 0] = 0.02;
      c[cbase + v * 4 + 1] = 0.02;
      c[cbase + v * 4 + 2] = 0.025;
      c[cbase + v * 4 + 3] = alpha;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }

  update(dt) {
    let dirty = false;
    const c = this.colors;
    for (let i = 0; i < MAX_MARKS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife);
      const alpha = t * t * 0.72;
      const cbase = i * VERTS_PER_MARK * 4;
      for (let v = 0; v < VERTS_PER_MARK; v++) c[cbase + v * 4 + 3] = alpha;
      dirty = true;
    }
    if (dirty) this.geometry.attributes.color.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

/**
 * The objective marker: a ring, a light column and a floating diamond.
 * A second variant draws a parking bay outline on the road.
 */
export class ObjectiveMarker {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);

    this.color = new THREE.Color(0xffa23c);
    this.materials = [];

    const ringGeo = new THREE.TorusGeometry(2.6, 0.16, 8, 36);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.95,
      toneMapped: false,
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.y = 0.08;
    this.group.add(this.ring);

    const colGeo = new THREE.CylinderGeometry(2.45, 2.45, 16, 24, 1, true);
    this.colMat = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.column = new THREE.Mesh(colGeo, this.colMat);
    this.column.position.y = 8;
    this.group.add(this.column);

    const gemGeo = new THREE.OctahedronGeometry(0.7, 0);
    this.gemMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, toneMapped: false });
    this.gem = new THREE.Mesh(gemGeo, this.gemMat);
    this.gem.position.y = 2.2;
    this.group.add(this.gem);

    const glowTex = makeGlowTexture();
    this.glowTex = glowTex;
    this.poolMat = new THREE.MeshBasicMaterial({
      map: glowTex,
      color: this.color,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const poolGeo = new THREE.PlaneGeometry(11, 11);
    poolGeo.rotateX(-Math.PI / 2);
    this.pool = new THREE.Mesh(poolGeo, this.poolMat);
    this.pool.position.y = 0.03;
    this.group.add(this.pool);

    this.materials.push(this.ringMat, this.colMat, this.gemMat, this.poolMat);

    // Parking bay outline.
    this.bay = new THREE.Group();
    this.bay.visible = false;
    this.bayMat = new THREE.MeshBasicMaterial({
      color: 0xffe6a8,
      transparent: true,
      opacity: 0.85,
      toneMapped: false,
    });
    this.materials.push(this.bayMat);
    const bayLength = 6.2;
    const bayWidth = 2.9;
    const lines = [
      [0, bayLength / 2, bayWidth, 0.16],
      [0, -bayLength / 2, bayWidth, 0.16],
      [bayWidth / 2, 0, 0.16, bayLength],
      [-bayWidth / 2, 0, 0.16, bayLength],
    ];
    for (const [x, z, w, d] of lines) {
      const g = new THREE.PlaneGeometry(w, d);
      g.rotateX(-Math.PI / 2);
      g.translate(x, 0.03, z);
      const mesh = new THREE.Mesh(g, this.bayMat);
      this.bay.add(mesh);
    }
    scene.add(this.bay);

    this.time = 0;
  }

  show(x, z, options = {}) {
    this.group.visible = !options.parking;
    this.bay.visible = !!options.parking;
    this.group.position.set(x, 0, z);
    this.bay.position.set(x, 0, z);
    if (options.heading !== undefined) this.bay.rotation.y = options.heading;
    if (options.color) {
      this.color.setHex(options.color);
      this.ringMat.color.copy(this.color);
      this.colMat.color.copy(this.color);
      this.poolMat.color.copy(this.color);
    }
  }

  hide() {
    this.group.visible = false;
    this.bay.visible = false;
  }

  update(dt) {
    this.time += dt;
    if (this.group.visible) {
      this.gem.rotation.y += dt * 1.6;
      this.gem.position.y = 2.3 + Math.sin(this.time * 2.2) * 0.28;
      const pulse = 0.8 + Math.sin(this.time * 3.1) * 0.2;
      this.ring.scale.setScalar(pulse * 0.25 + 0.85);
      this.ringMat.opacity = 0.65 + Math.sin(this.time * 3.1) * 0.3;
    }
    if (this.bay.visible) {
      this.bayMat.opacity = 0.6 + Math.sin(this.time * 3.4) * 0.3;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.scene.remove(this.bay);
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    this.bay.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of this.materials) m.dispose();
    this.glowTex.dispose();
  }
}
