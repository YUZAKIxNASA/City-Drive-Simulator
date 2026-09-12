import * as THREE from 'three';
import { CITY, SIGNALS } from './config.js';
import { mergeGeometries, boxAt } from './geometryUtils.js';

export const RED = 0;
export const YELLOW = 1;
export const GREEN = 2;

const PHASE_EW_GREEN = 0;
const PHASE_EW_YELLOW = 1;
const PHASE_NS_GREEN = 2;
const PHASE_NS_YELLOW = 3;

const OFF_RED = new THREE.Color(0x2a0806);
const OFF_YELLOW = new THREE.Color(0x2a2006);
const OFF_GREEN = new THREE.Color(0x062a12);
const ON_RED = new THREE.Color(0xff2a18);
const ON_YELLOW = new THREE.Color(0xffb417);
const ON_GREEN = new THREE.Color(0x2bff62);

/**
 * One two phase signal per intersection. Every junction is offset in time so
 * the city does not blink in unison.
 */
export class TrafficLights {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.count = city.nodes.length;

    this.phase = new Uint8Array(this.count);
    this.timer = new Float32Array(this.count);
    this.materials = [];

    for (let i = 0; i < this.count; i++) {
      const offset = ((i * 7919) % 1000) / 1000;
      this.phase[i] = i % 2 === 0 ? PHASE_EW_GREEN : PHASE_NS_GREEN;
      this.timer[i] = offset * SIGNALS.green;
    }

    this.build();
  }

  build() {
    const group = new THREE.Group();
    this.group = group;
    this.scene.add(group);

    const housingParts = [];
    const bulbs = []; // { x, y, z, axis, slot }
    const offset = CITY.roadWidth / 2 + 1.5;
    const poleHeight = 3.6;

    for (const node of this.city.nodes) {
      // Two heads per junction: one for each axis.
      const heads = [
        { x: node.x + offset, z: node.z - offset, axis: 0, rot: -Math.PI / 2 },
        { x: node.x - offset, z: node.z + offset, axis: 1, rot: Math.PI },
      ];
      for (const head of heads) {
        housingParts.push(boxAt(head.x, poleHeight / 2 + CITY.curbHeight, head.z, 0.12, poleHeight, 0.12));
        const hy = CITY.curbHeight + poleHeight + 0.45;
        housingParts.push(boxAt(head.x, hy, head.z, 0.42, 1.1, 0.3));
        const dirX = Math.sin(head.rot) * 0.17;
        const dirZ = Math.cos(head.rot) * 0.17;
        for (let slot = 0; slot < 3; slot++) {
          bulbs.push({
            x: head.x + dirX,
            y: hy + 0.34 - slot * 0.34,
            z: head.z + dirZ,
            axis: head.axis,
            slot,
            node: node.index,
          });
        }
      }
    }

    const housingMat = new THREE.MeshStandardMaterial({
      color: 0x24262a,
      roughness: 0.65,
      metalness: 0.5,
      envMapIntensity: 0.7,
    });
    this.materials.push(housingMat);
    const housing = new THREE.Mesh(mergeGeometries(housingParts), housingMat);
    housing.castShadow = true;
    group.add(housing);

    const bulbGeo = new THREE.SphereGeometry(0.115, 10, 8);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.materials.push(bulbMat);
    const mesh = new THREE.InstancedMesh(bulbGeo, bulbMat, bulbs.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < bulbs.length; i++) {
      const b = bulbs[i];
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, OFF_RED);
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);

    this.bulbs = bulbs;
    this.bulbMesh = mesh;
    this.refreshBulbs();
  }

  /** Signal state for one travel axis at one junction. */
  stateFor(nodeIndex, axis) {
    const phase = this.phase[nodeIndex];
    if (axis === 0) {
      if (phase === PHASE_EW_GREEN) return GREEN;
      if (phase === PHASE_EW_YELLOW) return YELLOW;
      return RED;
    }
    if (phase === PHASE_NS_GREEN) return GREEN;
    if (phase === PHASE_NS_YELLOW) return YELLOW;
    return RED;
  }

  update(dt) {
    let changed = false;
    for (let i = 0; i < this.count; i++) {
      this.timer[i] += dt;
      const phase = this.phase[i];
      const limit = phase === PHASE_EW_YELLOW || phase === PHASE_NS_YELLOW ? SIGNALS.yellow : SIGNALS.green;
      if (this.timer[i] >= limit) {
        this.timer[i] -= limit;
        this.phase[i] = (phase + 1) % 4;
        changed = true;
      }
    }
    if (changed) this.refreshBulbs();
  }

  refreshBulbs() {
    const mesh = this.bulbMesh;
    for (let i = 0; i < this.bulbs.length; i++) {
      const b = this.bulbs[i];
      const state = this.stateFor(b.node, b.axis);
      let color;
      if (b.slot === 0) color = state === RED ? ON_RED : OFF_RED;
      else if (b.slot === 1) color = state === YELLOW ? ON_YELLOW : OFF_YELLOW;
      else color = state === GREEN ? ON_GREEN : OFF_GREEN;
      mesh.setColorAt(i, color);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
