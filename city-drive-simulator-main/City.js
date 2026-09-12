import * as THREE from 'three';
import { CITY, COLORS, CAR_PAINTS } from './config.js';
import { makeRandom, clamp } from './mathUtils.js';
import {
  mergeGeometries,
  paintGeometry,
  scaleUV,
  groundQuad,
  boxAt,
  facadeQuad,
} from './geometryUtils.js';
import {
  makeAsphaltTexture,
  makeSidewalkTexture,
  makeGroundTexture,
  makeFacadeTextures,
  makeGlowTexture,
  makeSpeedSignTexture,
  makeStopSignTexture,
} from './textures.js';
import { buildSimpleCarGeometries } from './carParts.js';

const FLOOR = 3.4; // metres per facade tile
const BAY = 3.4;

/**
 * Builds the whole static city in a handful of merged meshes and instanced
 * meshes, and exposes the road graph that the traffic and mission systems use.
 */
export class City {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.mobile = !!options.mobile;
    this.group = new THREE.Group();
    this.nightMaterials = [];
    this.textures = [];
    this.materials = [];
    scene.add(this.group);

    this.rnd = makeRandom(20240613);
    this.colliders = [];
    this.parkedBoxes = [];

    this.coords = [];
    for (let i = 0; i < CITY.gridCount; i++) {
      this.coords.push((i - (CITY.gridCount - 1) / 2) * CITY.blockSize);
    }
    this.roadEnd = CITY.half + CITY.roadWidth / 2;

    this.buildGraph();
  }

  // ---------------------------------------------------------------- graph
  buildGraph() {
    const N = CITY.gridCount;
    this.nodes = [];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        this.nodes.push({ x: this.coords[i], z: this.coords[j], i, j, index: i * N + j });
      }
    }

    this.segments = [];
    this.outgoing = this.nodes.map(() => []);

    const link = (a, b, axis) => {
      const na = this.nodes[a];
      const nb = this.nodes[b];
      const dx = nb.x - na.x;
      const dz = nb.z - na.z;
      const len = Math.hypot(dx, dz);
      const seg = {
        index: this.segments.length,
        a,
        b,
        ax: na.x,
        az: na.z,
        bx: nb.x,
        bz: nb.z,
        dx: dx / len,
        dz: dz / len,
        rx: -(dz / len),
        rz: dx / len,
        len,
        axis,
      };
      this.segments.push(seg);
      this.outgoing[a].push(seg.index);
    };

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const here = i * N + j;
        if (i < N - 1) {
          link(here, (i + 1) * N + j, 0);
          link((i + 1) * N + j, here, 0);
        }
        if (j < N - 1) {
          link(here, i * N + j + 1, 1);
          link(i * N + j + 1, here, 1);
        }
      }
    }
  }

  /** Point on the driving lane of a segment, s metres from its start. */
  laneAt(seg, s, out = { x: 0, z: 0 }) {
    out.x = seg.ax + seg.dx * s + seg.rx * CITY.laneOffset;
    out.z = seg.az + seg.dz * s + seg.rz * CITY.laneOffset;
    return out;
  }

  randomSegment() {
    return this.segments[Math.floor(this.rnd() * this.segments.length)];
  }

  /** A drivable target somewhere along a road, away from intersections. */
  randomLanePoint(minDistanceFrom = null, minDistance = 60) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const seg = this.randomSegment();
      const s = 14 + this.rnd() * (seg.len - 28);
      const p = this.laneAt(seg, s);
      if (
        minDistanceFrom &&
        Math.hypot(p.x - minDistanceFrom.x, p.z - minDistanceFrom.z) < minDistance
      ) {
        continue;
      }
      return { x: p.x, z: p.z, heading: Math.atan2(seg.dx, seg.dz), seg };
    }
    const seg = this.segments[0];
    const p = this.laneAt(seg, seg.len / 2);
    return { x: p.x, z: p.z, heading: Math.atan2(seg.dx, seg.dz), seg };
  }

  /** A free parallel parking bay in a road side strip. */
  randomParkingBay(awayFrom = null) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const seg = this.randomSegment();
      const s = 16 + this.rnd() * (seg.len - 32);
      const x = seg.ax + seg.dx * s + seg.rx * CITY.parkOffset;
      const z = seg.az + seg.dz * s + seg.rz * CITY.parkOffset;
      let blocked = false;
      for (const box of this.parkedBoxes) {
        if (Math.hypot(box.x - x, box.z - z) < 9) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      if (awayFrom && Math.hypot(x - awayFrom.x, z - awayFrom.z) < 50) continue;
      return { x, z, heading: Math.atan2(seg.dx, seg.dz) };
    }
    const seg = this.segments[2];
    const s = seg.len / 2;
    return {
      x: seg.ax + seg.dx * s + seg.rx * CITY.parkOffset,
      z: seg.az + seg.dz * s + seg.rz * CITY.parkOffset,
      heading: Math.atan2(seg.dx, seg.dz),
    };
  }

  /** Closest legal spot on the road network, used when resetting the car. */
  nearestRoadPoint(x, z) {
    let best = null;
    let bestDist = Infinity;
    for (const seg of this.segments) {
      const relX = x - seg.ax - seg.rx * CITY.laneOffset;
      const relZ = z - seg.az - seg.rz * CITY.laneOffset;
      const s = clamp(relX * seg.dx + relZ * seg.dz, 6, seg.len - 6);
      const px = seg.ax + seg.dx * s + seg.rx * CITY.laneOffset;
      const pz = seg.az + seg.dz * s + seg.rz * CITY.laneOffset;
      const d = Math.hypot(px - x, pz - z);
      if (d < bestDist) {
        bestDist = d;
        best = { x: px, z: pz, heading: Math.atan2(seg.dx, seg.dz) };
      }
    }
    return best || { x: 0, z: 0, heading: 0 };
  }

  // ------------------------------------------------------------- collision
  addCollider(cx, cz, halfX, halfZ, soft = false) {
    this.colliders.push({
      minX: cx - halfX,
      maxX: cx + halfX,
      minZ: cz - halfZ,
      maxZ: cz + halfZ,
      soft,
    });
  }

  // ----------------------------------------------------------------- build
  build() {
    this.buildGround();
    this.buildRoads();
    this.buildMarkings();
    this.buildBlocks();
    this.buildStreetFurniture();
    this.buildParkedCars();
    this.buildBarrier();
    this.buildSkyline();
  }

  registerMaterial(mat) {
    this.materials.push(mat);
    return mat;
  }

  buildGround() {
    const tex = makeGroundTexture();
    tex.repeat.set(90, 90);
    this.textures.push(tex);
    const mat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ map: tex, color: COLORS.groundDay, roughness: 1.0, metalness: 0 })
    );
    this.groundMaterial = mat;
    const geo = new THREE.PlaneGeometry(1400, 1400, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -0.06;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildRoads() {
    const tex = makeAsphaltTexture();
    this.textures.push(tex);
    const mat = this.registerMaterial(
      new THREE.MeshStandardMaterial({
        map: tex,
        color: COLORS.road,
        roughness: 0.78,
        metalness: 0.08,
        envMapIntensity: 0.45,
      })
    );
    this.roadMaterial = mat;

    const parts = [];
    const w = CITY.roadWidth;
    const end = this.roadEnd;

    // Roads running along X cover the intersections.
    for (const z of this.coords) {
      const g = groundQuad(0, z, end * 2, w, 0);
      scaleUV(g, (end * 2) / 6, w / 6);
      parts.push(g);
    }
    // Roads running along Z fill only the gaps between intersections.
    for (const x of this.coords) {
      for (let j = 0; j < this.coords.length - 1; j++) {
        const z0 = this.coords[j] + w / 2;
        const z1 = this.coords[j + 1] - w / 2;
        const len = z1 - z0;
        const g = groundQuad(x, (z0 + z1) / 2, w, len, 0);
        scaleUV(g, w / 6, len / 6);
        parts.push(g);
      }
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildMarkings() {
    const mat = this.registerMaterial(
      new THREE.MeshStandardMaterial({
        color: 0xd9d9cf,
        roughness: 0.65,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      })
    );
    this.markingMaterial = mat;

    const parts = [];
    const y = 0.012;
    const half = CITY.roadWidth / 2;
    const end = this.roadEnd;
    const nearNode = (v) => this.coords.some((c) => Math.abs(v - c) < half + 1.2);

    // Dashed centre lines and solid edge lines.
    const dash = 3.2;
    const gap = 3.2;
    for (const z of this.coords) {
      for (let x = -end; x < end; x += dash + gap) {
        const cx = x + dash / 2;
        if (nearNode(cx)) continue;
        parts.push(groundQuad(cx, z, dash, 0.16, y));
      }
      for (let x = -end; x < end; x += 8) {
        const cx = x + 4;
        if (nearNode(cx)) continue;
        parts.push(groundQuad(cx, z - half + 0.5, 8, 0.12, y));
        parts.push(groundQuad(cx, z + half - 0.5, 8, 0.12, y));
      }
    }
    for (const x of this.coords) {
      for (let z = -end; z < end; z += dash + gap) {
        const cz = z + dash / 2;
        if (nearNode(cz)) continue;
        parts.push(groundQuad(x, cz, 0.16, dash, y));
      }
      for (let z = -end; z < end; z += 8) {
        const cz = z + 4;
        if (nearNode(cz)) continue;
        parts.push(groundQuad(x - half + 0.5, cz, 0.12, 8, y));
        parts.push(groundQuad(x + half - 0.5, cz, 0.12, 8, y));
      }
    }

    // Stop lines and zebra crossings on every approach.
    for (const node of this.nodes) {
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const along = half + 0.9;
        const rx = -dz;
        const rz = dx;
        // stop line covers the incoming lane only
        const sx = node.x - dx * along + rx * -CITY.laneOffset;
        const sz = node.z - dz * along + rz * -CITY.laneOffset;
        parts.push(
          groundQuad(sx, sz, dx !== 0 ? 0.45 : CITY.roadWidth / 2 - 0.6, dx !== 0 ? CITY.roadWidth / 2 - 0.6 : 0.45, y)
        );

        // zebra crossing just outside the junction
        for (let k = 0; k < 6; k++) {
          const offset = (k - 2.5) * 2.2;
          const cx = node.x - dx * (half + 2.6) + rx * offset;
          const cz = node.z - dz * (half + 2.6) + rz * offset;
          parts.push(groundQuad(cx, cz, dx !== 0 ? 2.1 : 0.5, dx !== 0 ? 0.5 : 2.1, y));
        }
      }
    }

    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.receiveShadow = false;
    this.group.add(mesh);
  }

  buildBlocks() {
    const sidewalkTex = makeSidewalkTexture();
    sidewalkTex.repeat.set(1, 1);
    this.textures.push(sidewalkTex);
    const sidewalkMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 0.9, metalness: 0.02, envMapIntensity: 0.4 })
    );
    const grassMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x4c6338, roughness: 1, metalness: 0 })
    );
    const concreteMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x9a9992, roughness: 0.85, metalness: 0.05, envMapIntensity: 0.5 })
    );
    const lotMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x35373c, roughness: 0.85, metalness: 0.05 })
    );

    const facadeA = makeFacadeTextures(0);
    const facadeB = makeFacadeTextures(1);
    this.textures.push(facadeA.day, facadeA.night, facadeB.day, facadeB.night);

    const facadeMats = [
      this.registerMaterial(
        new THREE.MeshStandardMaterial({
          map: facadeA.day,
          emissive: 0xffdca8,
          emissiveMap: facadeA.night,
          emissiveIntensity: 0,
          vertexColors: true,
          roughness: 0.72,
          metalness: 0.08,
          envMapIntensity: 0.55,
        })
      ),
      this.registerMaterial(
        new THREE.MeshStandardMaterial({
          map: facadeB.day,
          emissive: 0xcfe4ff,
          emissiveMap: facadeB.night,
          emissiveIntensity: 0,
          vertexColors: true,
          roughness: 0.28,
          metalness: 0.55,
          envMapIntensity: 1.05,
        })
      ),
    ];
    this.facadeMaterials = facadeMats;

    const platformParts = [];
    const grassParts = [];
    const lotParts = [];
    const concreteParts = [];
    const facadeParts = [[], []];

    this.treeSpots = [];
    this.blocks = [];

    const inner = CITY.blockInner;
    const plot = CITY.plot;
    const tints = [0xbcbdb8, 0xa9a49b, 0xc7c3b6, 0x9aa2a8, 0xb0a79a, 0x8f969c];

    const layouts = [
      'towers', 'midrise', 'park', 'towers',
      'midrise', 'lot', 'towers', 'midrise',
      'towers', 'midrise', 'towers', 'park',
      'midrise', 'towers', 'lot', 'towers',
    ];

    let blockIndex = 0;
    for (let i = 0; i < CITY.gridCount - 1; i++) {
      for (let j = 0; j < CITY.gridCount - 1; j++) {
        const cx = (this.coords[i] + this.coords[i + 1]) / 2;
        const cz = (this.coords[j] + this.coords[j + 1]) / 2;
        const layout = layouts[blockIndex % layouts.length];
        blockIndex++;
        this.blocks.push({ cx, cz, layout });

        // Raised sidewalk platform with a curb.
        const platform = boxAt(cx, CITY.curbHeight / 2, cz, inner, CITY.curbHeight, inner);
        scaleUV(platform, inner / 4, inner / 4);
        platformParts.push(platform);
        this.addCollider(cx, cz, inner / 2, inner / 2, true);

        if (layout === 'park') {
          grassParts.push(groundQuad(cx, cz, plot, plot, CITY.curbHeight + 0.01));
          for (let t = 0; t < 12; t++) {
            const tx = cx + (this.rnd() - 0.5) * (plot - 4);
            const tz = cz + (this.rnd() - 0.5) * (plot - 4);
            this.treeSpots.push({ x: tx, z: tz, scale: 0.9 + this.rnd() * 0.7 });
          }
          // A small pavilion so parks are not empty.
          concreteParts.push(boxAt(cx, CITY.curbHeight + 1.6, cz, 6, 3.2, 6));
          continue;
        }

        if (layout === 'lot') {
          lotParts.push(groundQuad(cx, cz, plot, plot, CITY.curbHeight + 0.01));
          concreteParts.push(boxAt(cx, CITY.curbHeight + 2.2, cz - plot / 2 + 5, 16, 4.4, 8));
          for (let t = 0; t < 4; t++) {
            this.treeSpots.push({
              x: cx - plot / 2 + 2 + t * 4,
              z: cz + plot / 2 - 2,
              scale: 0.8 + this.rnd() * 0.4,
            });
          }
          continue;
        }

        const cells = layout === 'towers' ? 2 : 3;
        const cell = plot / cells;
        for (let a = 0; a < cells; a++) {
          for (let b = 0; b < cells; b++) {
            if (this.rnd() < 0.12) continue; // an occasional gap keeps blocks varied
            const gapSize = cells === 2 ? 3.2 : 2.4;
            const w = cell - gapSize;
            const d = cell - gapSize;
            const bx = cx - plot / 2 + cell * (a + 0.5);
            const bz = cz - plot / 2 + cell * (b + 0.5);
            const h =
              layout === 'towers'
                ? 22 + this.rnd() * 34
                : 9 + this.rnd() * 15;
            const variant = this.rnd() < (layout === 'towers' ? 0.55 : 0.2) ? 1 : 0;
            const tint = tints[Math.floor(this.rnd() * tints.length)];
            this.addBuilding(facadeParts[variant], concreteParts, bx, bz, w, d, h, tint);
          }
        }
      }
    }

    const addMesh = (parts, mat, cast = true) => {
      if (!parts.length) return null;
      const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      return mesh;
    };

    addMesh(platformParts, sidewalkMat, true);
    addMesh(grassParts, grassMat, false);
    addMesh(lotParts, lotMat, false);
    addMesh(concreteParts, concreteMat, true);
    addMesh(facadeParts[0], facadeMats[0], true);
    addMesh(facadeParts[1], facadeMats[1], true);
  }

  addBuilding(facadeTarget, concreteTarget, bx, bz, w, d, h, tint) {
    const base = CITY.curbHeight;
    const cy = base + h / 2;

    const faces = [
      facadeQuad(bx, cy, bz + d / 2, w, h, 0),
      facadeQuad(bx, cy, bz - d / 2, w, h, Math.PI),
      facadeQuad(bx + w / 2, cy, bz, d, h, Math.PI / 2),
      facadeQuad(bx - w / 2, cy, bz, d, h, -Math.PI / 2),
    ];
    const sizes = [w, w, d, d];
    for (let i = 0; i < faces.length; i++) {
      scaleUV(faces[i], Math.max(1, Math.round(sizes[i] / BAY)), Math.max(2, Math.round(h / FLOOR)));
      paintGeometry(faces[i], tint);
      facadeTarget.push(faces[i]);
    }

    // Cornice, roof slab and a rooftop plant room.
    concreteTarget.push(boxAt(bx, base + h + 0.25, bz, w + 0.5, 0.5, d + 0.5));
    concreteTarget.push(boxAt(bx, base + h - 0.1, bz, w, 0.3, d));
    if (this.rnd() > 0.35) {
      const rw = Math.min(w * 0.4, 4);
      concreteTarget.push(
        boxAt(bx + (this.rnd() - 0.5) * (w - rw), base + h + 1.4, bz + (this.rnd() - 0.5) * (d - rw), rw, 2.2, rw)
      );
    }
  }

  buildStreetFurniture() {
    const metalMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.55, metalness: 0.7, envMapIntensity: 0.8 })
    );
    this.metalMaterial = metalMat;

    const poleParts = [];
    const lampPoints = [];
    const spacing = this.mobile ? 44 : 34;
    const half = CITY.roadWidth / 2;
    const end = CITY.half;

    // armX / armZ point from the pole towards the middle of the road.
    const addLamp = (x, z, armX, armZ) => {
      const base = CITY.curbHeight;
      const armLen = 2.0;
      poleParts.push(boxAt(x, base + 3.4, z, 0.16, 6.8, 0.16));
      poleParts.push(
        boxAt(
          x + armX * (armLen / 2),
          base + 6.7,
          z + armZ * (armLen / 2),
          Math.abs(armX) * armLen + 0.12,
          0.12,
          Math.abs(armZ) * armLen + 0.12
        )
      );
      lampPoints.push({ x: x + armX * armLen, z: z + armZ * armLen, y: base + 6.58 });
    };

    for (const z of this.coords) {
      for (let x = -end + 12; x <= end - 12; x += spacing) {
        addLamp(x, z + half + 1.0, 0, -1);
        addLamp(x + spacing / 2, z - half - 1.0, 0, 1);
      }
    }
    for (const x of this.coords) {
      for (let z = -end + 20; z <= end - 20; z += spacing) {
        addLamp(x + half + 1.0, z, -1, 0);
        addLamp(x - half - 1.0, z + spacing / 2, 1, 0);
      }
    }

    // Sign posts.
    const speedSpots = [];
    const stopSpots = [];
    for (let i = 0; i < this.coords.length; i++) {
      const c = this.coords[i];
      for (const side of [-1, 1]) {
        speedSpots.push({ x: side * (CITY.half - 6), z: c + side * (half + 1.6), rot: side > 0 ? 0 : Math.PI });
        stopSpots.push({ x: c + side * (half + 1.6), z: side * (CITY.half - 6), rot: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    }
    for (const s of [...speedSpots, ...stopSpots]) {
      poleParts.push(boxAt(s.x, CITY.curbHeight + 1.3, s.z, 0.1, 2.6, 0.1));
    }

    const poleMesh = new THREE.Mesh(mergeGeometries(poleParts), metalMat);
    poleMesh.castShadow = true;
    poleMesh.receiveShadow = true;
    this.group.add(poleMesh);

    // Lamp heads.
    const headGeo = new THREE.BoxGeometry(0.5, 0.16, 0.9);
    this.lampMaterial = this.registerMaterial(
      new THREE.MeshStandardMaterial({
        color: 0x2b2e33,
        emissive: 0xffc477,
        emissiveIntensity: 0,
        roughness: 0.5,
        metalness: 0.4,
      })
    );
    const lampMesh = new THREE.InstancedMesh(headGeo, this.lampMaterial, lampPoints.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < lampPoints.length; i++) {
      const p = lampPoints[i];
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      lampMesh.setMatrixAt(i, dummy.matrix);
    }
    lampMesh.instanceMatrix.needsUpdate = true;
    this.group.add(lampMesh);

    // Fake light pools on the tarmac, only visible at night.
    const glowTex = makeGlowTexture();
    this.textures.push(glowTex);
    this.poolMaterial = this.registerMaterial(
      new THREE.MeshBasicMaterial({
        map: glowTex,
        color: 0xffb45e,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    const poolGeo = new THREE.PlaneGeometry(11, 11);
    poolGeo.rotateX(-Math.PI / 2);
    const poolMesh = new THREE.InstancedMesh(poolGeo, this.poolMaterial, lampPoints.length);
    poolMesh.renderOrder = 2;
    for (let i = 0; i < lampPoints.length; i++) {
      const p = lampPoints[i];
      dummy.position.set(p.x, 0.05, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      poolMesh.setMatrixAt(i, dummy.matrix);
    }
    poolMesh.instanceMatrix.needsUpdate = true;
    poolMesh.visible = false;
    this.group.add(poolMesh);
    this.lightPools = poolMesh;

    // Sign plates.
    const speedTex = makeSpeedSignTexture('50');
    const stopTex = makeStopSignTexture();
    this.textures.push(speedTex, stopTex);
    const plateGeo = new THREE.PlaneGeometry(0.78, 0.78);
    const makePlates = (spots, tex) => {
      const mat = this.registerMaterial(
        new THREE.MeshStandardMaterial({
          map: tex,
          transparent: true,
          alphaTest: 0.5,
          side: THREE.DoubleSide,
          roughness: 0.6,
          metalness: 0.1,
        })
      );
      const mesh = new THREE.InstancedMesh(plateGeo, mat, spots.length);
      for (let i = 0; i < spots.length; i++) {
        const s = spots[i];
        dummy.position.set(s.x, CITY.curbHeight + 2.3, s.z);
        dummy.rotation.set(0, s.rot, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
    };
    makePlates(speedSpots, speedTex);
    makePlates(stopSpots, stopTex);

    this.buildTrees();
  }

  buildTrees() {
    // Street trees along the block edges plus whatever the parks asked for.
    const inner = CITY.blockInner / 2;
    for (const block of this.blocks) {
      if (block.layout === 'park') continue;
      for (let k = -1; k <= 1; k++) {
        const o = k * 14;
        this.treeSpots.push({ x: block.cx + o, z: block.cz - inner + 1.6, scale: 0.85 + this.rnd() * 0.4 });
        this.treeSpots.push({ x: block.cx + o, z: block.cz + inner - 1.6, scale: 0.85 + this.rnd() * 0.4 });
        this.treeSpots.push({ x: block.cx - inner + 1.6, z: block.cz + o, scale: 0.85 + this.rnd() * 0.4 });
        this.treeSpots.push({ x: block.cx + inner - 1.6, z: block.cz + o, scale: 0.85 + this.rnd() * 0.4 });
      }
    }

    const spots = this.mobile ? this.treeSpots.filter((_, i) => i % 2 === 0) : this.treeSpots;
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 2.8, 6);
    trunkGeo.translate(0, 1.4, 0);
    const leafGeo = new THREE.IcosahedronGeometry(1.7, 0);
    leafGeo.translate(0, 3.6, 0);

    const trunkMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 0.95, metalness: 0 })
    );
    const leafMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, flatShading: true })
    );

    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, spots.length);
    leaves.castShadow = true;
    trunks.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      dummy.position.set(s.x, CITY.curbHeight, s.z);
      dummy.rotation.set(0, this.rnd() * Math.PI * 2, 0);
      dummy.scale.setScalar(s.scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      leaves.setMatrixAt(i, dummy.matrix);
      const g = 0.34 + this.rnd() * 0.2;
      color.setRGB(0.13 + this.rnd() * 0.08, g, 0.11);
      leaves.setColorAt(i, color);
    }
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    this.group.add(trunks);
    this.group.add(leaves);
  }

  buildParkedCars() {
    const { bodyGeo, detailGeo, lightGeo } = buildSimpleCarGeometries();
    const spots = [];

    // Cars sit in the kerbside strip, parked with the flow of traffic.
    const strip = CITY.blockSize / 2 - CITY.parkOffset;
    for (const block of this.blocks) {
      for (let k = -1; k <= 1; k += 2) {
        if (this.rnd() > 0.45) {
          spots.push({ x: block.cx + k * 9, z: block.cz - strip, heading: Math.PI / 2 });
        }
        if (this.rnd() > 0.45) {
          spots.push({ x: block.cx + k * 9, z: block.cz + strip, heading: -Math.PI / 2 });
        }
        if (this.rnd() > 0.45) {
          spots.push({ x: block.cx - strip, z: block.cz + k * 9, heading: Math.PI });
        }
        if (this.rnd() > 0.45) {
          spots.push({ x: block.cx + strip, z: block.cz + k * 9, heading: 0 });
        }
      }
    }

    const count = spots.length;
    const bodyMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.5, envMapIntensity: 1.0 })
    );
    const detailMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.5, metalness: 0.4, envMapIntensity: 0.8 })
    );
    const lightMat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x4a0d0d, emissive: 0xff2a18, emissiveIntensity: 0.35, roughness: 0.4 })
    );

    const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, count);
    const details = new THREE.InstancedMesh(detailGeo, detailMat, count);
    const lights = new THREE.InstancedMesh(lightGeo, lightMat, count);
    bodies.castShadow = true;
    details.castShadow = true;

    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const s = spots[i];
      dummy.position.set(s.x, 0, s.z);
      dummy.rotation.set(0, s.heading, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodies.setMatrixAt(i, dummy.matrix);
      details.setMatrixAt(i, dummy.matrix);
      lights.setMatrixAt(i, dummy.matrix);
      color.setHex(CAR_PAINTS[Math.floor(this.rnd() * CAR_PAINTS.length)]);
      bodies.setColorAt(i, color);

      const alongZ = Math.abs(Math.cos(s.heading)) > 0.5;
      this.addCollider(s.x, s.z, alongZ ? 1.0 : 2.2, alongZ ? 2.2 : 1.0, false);
      this.parkedBoxes.push({ x: s.x, z: s.z });
    }
    bodies.instanceMatrix.needsUpdate = true;
    details.instanceMatrix.needsUpdate = true;
    lights.instanceMatrix.needsUpdate = true;
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = true;

    this.group.add(bodies);
    this.group.add(details);
    this.group.add(lights);
  }

  buildBarrier() {
    const mat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0xb4b2a8, roughness: 0.9, metalness: 0.05 })
    );
    const b = CITY.bound;
    const len = b * 2 + 1;
    const parts = [
      boxAt(0, 0.45, b, len, 0.9, 0.5),
      boxAt(0, 0.45, -b, len, 0.9, 0.5),
      boxAt(b, 0.45, 0, 0.5, 0.9, len),
      boxAt(-b, 0.45, 0, 0.5, 0.9, len),
    ];
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);

    const t = 6;
    this.addCollider(0, b + t / 2, len, t / 2, false);
    this.addCollider(0, -b - t / 2, len, t / 2, false);
    this.addCollider(b + t / 2, 0, t / 2, len, false);
    this.addCollider(-b - t / 2, 0, t / 2, len, false);
  }

  buildSkyline() {
    const mat = this.registerMaterial(
      new THREE.MeshStandardMaterial({ color: 0x6a7482, roughness: 0.9, metalness: 0.1, fog: true })
    );
    const parts = [];
    const count = this.mobile ? 26 : 46;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + this.rnd() * 0.12;
      const radius = 210 + this.rnd() * 230;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const w = 16 + this.rnd() * 26;
      const h = 26 + this.rnd() * 105;
      parts.push(boxAt(x, h / 2, z, w, h, w * (0.7 + this.rnd() * 0.6)));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    this.group.add(mesh);
    this.skylineMaterial = mat;
  }

  // ------------------------------------------------------------ day / night
  setNight(night) {
    if (this.facadeMaterials) {
      this.facadeMaterials[0].emissiveIntensity = night ? 1.35 : 0;
      this.facadeMaterials[1].emissiveIntensity = night ? 1.1 : 0;
    }
    if (this.lampMaterial) this.lampMaterial.emissiveIntensity = night ? 4 : 0;
    if (this.poolMaterial) this.poolMaterial.opacity = night ? 0.5 : 0;
    if (this.lightPools) this.lightPools.visible = night;
    if (this.groundMaterial) this.groundMaterial.color.setHex(night ? COLORS.groundNight : COLORS.groundDay);
    if (this.skylineMaterial) this.skylineMaterial.color.setHex(night ? 0x232a36 : 0x6a7482);
    if (this.roadMaterial) {
      this.roadMaterial.roughness = night ? 0.55 : 0.78;
      this.roadMaterial.envMapIntensity = night ? 0.8 : 0.45;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
  }
}
