import * as THREE from 'three';
import { CAR } from './config.js';
import { extrudeProfile, archPoints, mergeGeometries, boxAt } from './geometryUtils.js';
import { makeWheelTexture } from './textures.js';

/**
 * Every vehicle in this game points along +Z.
 * The body is an extruded side profile, which gives a far better silhouette
 * than stacked boxes while still being cheap to render.
 */

function sedanProfile() {
  return [
    [-2.32, 0.3],
    ...archPoints(-1.45, 0.3, 0.52, 7),
    ...archPoints(1.45, 0.3, 0.52, 7),
    [1.97, 0.3],
    [2.3, 0.32],
    [2.5, 0.6],
    [2.44, 0.86],
    [1.95, 0.96],
    [0.98, 1.03],
    [0.7, 1.06],
    [-1.62, 1.06],
    [-2.16, 1.0],
    [-2.44, 0.88],
    [-2.48, 0.56],
  ];
}

function cabinProfile() {
  return [
    [-1.58, 1.0],
    [1.02, 1.0],
    [0.28, 1.47],
    [-1.05, 1.44],
  ];
}

function compactProfile() {
  return [
    [-2.06, 0.3],
    ...archPoints(-1.3, 0.3, 0.5, 6),
    ...archPoints(1.3, 0.3, 0.5, 6),
    [1.8, 0.3],
    [2.08, 0.34],
    [2.2, 0.62],
    [2.05, 0.86],
    [1.5, 0.94],
    [0.72, 1.0],
    [-1.28, 1.02],
    [-1.95, 0.96],
    [-2.12, 0.7],
  ];
}

function compactCabinProfile() {
  return [
    [-1.34, 0.96],
    [0.76, 0.96],
    [0.16, 1.42],
    [-0.9, 1.4],
  ];
}

export function makeWheelGeometry(radius = CAR.wheelRadius, width = CAR.wheelWidth, segments = 20) {
  const geo = new THREE.CylinderGeometry(radius, radius, width, segments, 1, false);
  geo.rotateZ(Math.PI / 2); // axle now runs along X
  return geo;
}

/** Shared materials for the player's car. */
export function createCarMaterials(paint = 0x1d3f7a) {
  const wheelTex = makeWheelTexture();

  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: paint,
      metalness: 0.55,
      roughness: 0.32,
      clearcoat: 0.9,
      clearcoatRoughness: 0.12,
      envMapIntensity: 1.15,
    }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x0b1017,
      metalness: 0.92,
      roughness: 0.08,
      envMapIntensity: 1.6,
      transparent: true,
      opacity: 0.88,
    }),
    trim: new THREE.MeshStandardMaterial({
      color: 0x15171a,
      metalness: 0.35,
      roughness: 0.62,
      envMapIntensity: 0.7,
    }),
    chrome: new THREE.MeshStandardMaterial({
      color: 0xbfc6cf,
      metalness: 1.0,
      roughness: 0.18,
      envMapIntensity: 1.4,
    }),
    head: new THREE.MeshStandardMaterial({
      color: 0xf2f6ff,
      emissive: 0xfff2d0,
      emissiveIntensity: 0.25,
      roughness: 0.2,
      metalness: 0.1,
    }),
    tail: new THREE.MeshStandardMaterial({
      color: 0x36080a,
      emissive: 0xff1a12,
      emissiveIntensity: 0.5,
      roughness: 0.3,
      metalness: 0.1,
    }),
    reverse: new THREE.MeshStandardMaterial({
      color: 0xdfe4ea,
      emissive: 0xffffff,
      emissiveIntensity: 0.05,
      roughness: 0.3,
      metalness: 0.1,
    }),
    tyre: new THREE.MeshStandardMaterial({
      color: 0x17181a,
      roughness: 0.92,
      metalness: 0.0,
      envMapIntensity: 0.3,
    }),
    rim: new THREE.MeshStandardMaterial({
      map: wheelTex,
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.75,
      envMapIntensity: 1.1,
    }),
  };
}

/**
 * Builds the detailed player car.
 * Returns the root group plus references needed for animation.
 */
export function buildPlayerCar(materials) {
  const root = new THREE.Group();
  const chassis = new THREE.Group(); // everything that leans with the suspension
  root.add(chassis);

  const bodyGeo = extrudeProfile(sedanProfile(), CAR.width, { bevel: 0.05, bevelSegments: 2 });
  const body = new THREE.Mesh(bodyGeo, materials.paint);
  body.castShadow = true;
  chassis.add(body);

  const cabinGeo = extrudeProfile(cabinProfile(), 1.62, { bevel: 0.03, bevelSegments: 1 });
  const cabin = new THREE.Mesh(cabinGeo, materials.glass);
  cabin.castShadow = true;
  chassis.add(cabin);

  // Body coloured roof skin over the glass house.
  const roof = new THREE.Mesh(boxAt(0, 1.472, -0.38, 1.66, 0.06, 1.42), materials.paint);
  roof.rotation.x = -0.023;
  roof.castShadow = true;
  chassis.add(roof);

  // Dark details: skirts, splitter, diffuser, grille, mirrors, exhausts.
  const darkParts = [
    boxAt(0.9, 0.36, -0.1, 0.1, 0.14, 2.4), // right skirt
    boxAt(-0.9, 0.36, -0.1, 0.1, 0.14, 2.4), // left skirt
    boxAt(0, 0.38, 2.34, 1.6, 0.16, 0.16), // front splitter
    boxAt(0, 0.4, -2.3, 1.55, 0.18, 0.18), // rear diffuser
    boxAt(0, 0.66, 2.36, 1.24, 0.3, 0.08), // grille
    boxAt(0.52, 0.44, 2.3, 0.5, 0.16, 0.1), // intake right
    boxAt(-0.52, 0.44, 2.3, 0.5, 0.16, 0.1), // intake left
    boxAt(0.99, 1.0, 0.62, 0.26, 0.1, 0.14), // mirror right
    boxAt(-0.99, 1.0, 0.62, 0.26, 0.1, 0.14), // mirror left
    boxAt(0.88, 0.99, 0.72, 0.14, 0.05, 0.1), // mirror stalk right
    boxAt(-0.88, 0.99, 0.72, 0.14, 0.05, 0.1), // mirror stalk left
    boxAt(0.42, 0.4, -2.42, 0.24, 0.1, 0.12), // exhaust right
    boxAt(-0.42, 0.4, -2.42, 0.24, 0.1, 0.12), // exhaust left
  ];
  const dark = new THREE.Mesh(mergeGeometries(darkParts), materials.trim);
  dark.castShadow = true;
  chassis.add(dark);

  // Chrome window surround and badge.
  const chromeParts = [
    boxAt(0.83, 1.04, -0.3, 0.03, 0.05, 2.3),
    boxAt(-0.83, 1.04, -0.3, 0.03, 0.05, 2.3),
    boxAt(0, 0.86, 2.42, 0.24, 0.08, 0.04),
  ];
  const chrome = new THREE.Mesh(mergeGeometries(chromeParts), materials.chrome);
  chassis.add(chrome);

  // Headlights: two clusters plus a thin daytime running strip.
  const headGeo = mergeGeometries([
    boxAt(0.62, 0.8, 2.33, 0.58, 0.15, 0.14),
    boxAt(-0.62, 0.8, 2.33, 0.58, 0.15, 0.14),
    boxAt(0.62, 0.68, 2.34, 0.5, 0.04, 0.1),
    boxAt(-0.62, 0.68, 2.34, 0.5, 0.04, 0.1),
  ]);
  const headlights = new THREE.Mesh(headGeo, materials.head);
  chassis.add(headlights);

  // Tail lights: cluster pair plus a full width LED bar.
  const tailGeo = mergeGeometries([
    boxAt(0.6, 0.88, -2.4, 0.56, 0.14, 0.1),
    boxAt(-0.6, 0.88, -2.4, 0.56, 0.14, 0.1),
    boxAt(0, 0.88, -2.41, 1.34, 0.05, 0.08),
  ]);
  const taillights = new THREE.Mesh(tailGeo, materials.tail);
  chassis.add(taillights);

  const reverseGeo = mergeGeometries([
    boxAt(0.28, 0.74, -2.4, 0.22, 0.08, 0.08),
    boxAt(-0.28, 0.74, -2.4, 0.22, 0.08, 0.08),
  ]);
  const reverseLights = new THREE.Mesh(reverseGeo, materials.reverse);
  chassis.add(reverseLights);

  // Wheels.
  const wheelGeo = makeWheelGeometry();
  const wheelMats = [materials.tyre, materials.rim, materials.rim];
  const wheels = [];
  const half = CAR.track / 2;
  const positions = [
    [half, CAR.wheelRadius, CAR.wheelBase / 2],
    [-half, CAR.wheelRadius, CAR.wheelBase / 2],
    [half, CAR.wheelRadius, -CAR.wheelBase / 2],
    [-half, CAR.wheelRadius, -CAR.wheelBase / 2],
  ];
  for (let i = 0; i < 4; i++) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMats);
    wheel.position.set(positions[i][0], positions[i][1], positions[i][2]);
    wheel.rotation.order = 'YXZ';
    wheel.castShadow = true;
    root.add(wheel); // wheels stay level, only the chassis leans
    wheels.push(wheel);
  }

  return {
    root,
    chassis,
    wheels,
    frontWheels: [wheels[0], wheels[1]],
    rearWheels: [wheels[2], wheels[3]],
    headlights,
    taillights,
    reverseLights,
  };
}

/**
 * Cheap car used for AI traffic and parked cars.
 * Split in three geometries so one InstancedMesh can be tinted per car,
 * one holds the dark parts and one holds the brake lights.
 */
export function buildSimpleCarGeometries() {
  const bodyGeo = extrudeProfile(compactProfile(), 1.78, { bevel: 0.04, bevelSegments: 1 });

  const cabin = extrudeProfile(compactCabinProfile(), 1.6, { bevel: 0.02, bevelSegments: 1 });
  const wheelGeo = makeWheelGeometry(0.32, 0.22, 10);
  const wheelParts = [];
  for (const [x, z] of [
    [0.76, 1.3],
    [-0.76, 1.3],
    [0.76, -1.3],
    [-0.76, -1.3],
  ]) {
    const g = wheelGeo.clone();
    g.translate(x, 0.32, z);
    wheelParts.push(g);
  }
  wheelGeo.dispose();

  const detailGeo = mergeGeometries([
    cabin,
    ...wheelParts,
    boxAt(0, 0.42, 2.06, 1.5, 0.18, 0.14), // front bumper
    boxAt(0, 0.44, -2.02, 1.5, 0.18, 0.14), // rear bumper
  ]);

  const lightGeo = mergeGeometries([
    boxAt(0.55, 0.78, -2.08, 0.42, 0.14, 0.06),
    boxAt(-0.55, 0.78, -2.08, 0.42, 0.14, 0.06),
  ]);

  const headGeo = mergeGeometries([
    boxAt(0.56, 0.74, 2.12, 0.4, 0.13, 0.06),
    boxAt(-0.56, 0.74, 2.12, 0.4, 0.13, 0.06),
  ]);

  return { bodyGeo, detailGeo, lightGeo, headGeo };
}
