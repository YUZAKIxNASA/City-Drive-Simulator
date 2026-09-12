import * as THREE from 'three';

/**
 * Merge a list of BufferGeometries into a single geometry so the whole city
 * can be drawn in a handful of draw calls. Written by hand so the project does
 * not depend on the three.js example modules.
 * Every geometry must have position + normal, and optionally uv + color.
 */
export function mergeGeometries(geometries) {
  const list = [];
  for (const g of geometries) {
    if (!g) continue;
    const geo = g.index ? g.toNonIndexed() : g;
    if (!geo.attributes.normal) geo.computeVertexNormals();
    list.push(geo);
  }
  if (list.length === 0) return new THREE.BufferGeometry();

  let total = 0;
  for (const g of list) total += g.attributes.position.count;

  const hasUV = list.every((g) => !!g.attributes.uv);
  const hasColor = list.every((g) => !!g.attributes.color);

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = hasUV ? new Float32Array(total * 2) : null;
  const color = hasColor ? new Float32Array(total * 3) : null;

  let offset = 0;
  for (const g of list) {
    const count = g.attributes.position.count;
    position.set(g.attributes.position.array, offset * 3);
    normal.set(g.attributes.normal.array, offset * 3);
    if (uv) uv.set(g.attributes.uv.array, offset * 2);
    if (color) color.set(g.attributes.color.array, offset * 3);
    offset += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (color) out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.computeBoundingSphere();

  for (const g of list) g.dispose();
  return out;
}

/** Paint every vertex of a geometry with one colour (for merged meshes). */
export function paintGeometry(geometry, hex) {
  const c = new THREE.Color(hex);
  const count = geometry.attributes.position.count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

/** Scale the UV set of a geometry so a tiling texture keeps a real world size. */
export function scaleUV(geometry, su, sv, ou = 0, ov = 0) {
  const uv = geometry.attributes.uv;
  if (!uv) return geometry;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  }
  uv.needsUpdate = true;
  return geometry;
}

/** A flat rectangle lying on the ground plane, centred on x/z. */
export function groundQuad(cx, cz, width, depth, y = 0) {
  const g = new THREE.PlaneGeometry(width, depth, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  return g;
}

/** A box positioned in world space. */
export function boxAt(cx, cy, cz, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  return g;
}

/** A vertical wall facing +Z, used for building facades. */
export function facadeQuad(cx, cy, cz, width, height, rotationY) {
  const g = new THREE.PlaneGeometry(width, height, 1, 1);
  g.rotateY(rotationY);
  g.translate(cx, cy, cz);
  return g;
}

/**
 * Extrude a 2D side profile into a solid, then orient it so that the profile
 * runs along +Z (the forward axis used by every vehicle in the game).
 */
export function extrudeProfile(points, totalWidth, options = {}) {
  const bevel = options.bevel ?? 0.05;
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();

  const depth = Math.max(0.02, totalWidth - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: options.bevelSegments ?? 2,
    curveSegments: 3,
    steps: 1,
  });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(-Math.PI / 2); // profile X axis becomes world Z (forward)
  return geo;
}

/** Points along a half circle bulging upwards, used for wheel arches. */
export function archPoints(cx, cy, radius, segments = 8) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI - (i / segments) * Math.PI;
    pts.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return pts;
}

export function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mat = obj.material;
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const m of mats) {
      for (const key of Object.keys(m)) {
        const value = m[key];
        if (value && value.isTexture) value.dispose();
      }
      m.dispose();
    }
  });
}
