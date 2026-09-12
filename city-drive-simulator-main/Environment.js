import * as THREE from 'three';
import { COLORS } from './config.js';
import { makeSkyTexture, makeGlowTexture } from './textures.js';

/**
 * Sky dome, sun, fog, stars and the reflection probe.
 * The environment map is generated from a miniature copy of the sky, so
 * reflections always match the current time of day without any HDR assets.
 */
export class Environment {
  constructor(scene, renderer, options = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.mobile = !!options.mobile;
    this.night = false;
    this.envTarget = null;

    this.skyTextures = {
      day: makeSkyTexture(false),
      night: makeSkyTexture(true),
    };

    const skyGeo = new THREE.SphereGeometry(900, 24, 16);
    this.skyMaterial = new THREE.MeshBasicMaterial({
      map: this.skyTextures.day,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    // Sun and moon discs.
    const glow = makeGlowTexture();
    this.glowTexture = glow;
    this.sunSpriteMat = new THREE.SpriteMaterial({
      map: glow,
      color: 0xfff4d6,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.9,
    });
    this.sunSprite = new THREE.Sprite(this.sunSpriteMat);
    this.sunSprite.scale.set(180, 180, 1);
    scene.add(this.sunSprite);

    // Stars, only shown at night.
    const starCount = this.mobile ? 300 : 700;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 0.85 + 0.1);
      const r = 820;
      starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
      starPos[i * 3 + 1] = Math.cos(phi) * r;
      starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xdce6ff,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMaterial);
    this.stars.visible = false;
    scene.add(this.stars);

    // Lights.
    this.hemi = new THREE.HemisphereLight(COLORS.ambientDay, 0x4a4636, 1.1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(COLORS.sunDay, 2.6);
    this.sunOffset = new THREE.Vector3(78, 116, 54);
    this.sun.position.copy(this.sunOffset);
    this.sun.castShadow = true;
    const size = this.mobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 340;
    const extent = this.mobile ? 56 : 76;
    this.sun.shadow.camera.left = -extent;
    this.sun.shadow.camera.right = extent;
    this.sun.shadow.camera.top = extent;
    this.sun.shadow.camera.bottom = -extent;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.035;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(COLORS.fogDay, 110, 620);

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.refreshEnvironment();
    this.applyMode();
  }

  /** Renders a tiny sky into a reflection probe. */
  refreshEnvironment() {
    const probe = new THREE.Scene();
    const geo = new THREE.SphereGeometry(30, 16, 12);
    const mat = new THREE.MeshBasicMaterial({
      map: this.night ? this.skyTextures.night : this.skyTextures.day,
      side: THREE.BackSide,
      toneMapped: false,
    });
    const dome = new THREE.Mesh(geo, mat);
    probe.add(dome);

    const floorGeo = new THREE.PlaneGeometry(60, 60);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshBasicMaterial({
      color: this.night ? 0x0c0f16 : 0x585c5a,
      toneMapped: false,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -8;
    probe.add(floor);

    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(probe, 0.03, 1, 100);
    this.scene.environment = this.envTarget.texture;

    geo.dispose();
    mat.dispose();
    floorGeo.dispose();
    floorMat.dispose();
  }

  applyMode() {
    const night = this.night;
    this.skyMaterial.map = night ? this.skyTextures.night : this.skyTextures.day;
    this.skyMaterial.needsUpdate = true;
    this.stars.visible = night;

    this.hemi.color.setHex(night ? COLORS.ambientNight : COLORS.ambientDay);
    this.hemi.groundColor.setHex(night ? 0x0a0c12 : 0x4a4636);
    this.hemi.intensity = night ? 0.42 : 1.1;

    this.sun.color.setHex(night ? COLORS.sunNight : COLORS.sunDay);
    this.sun.intensity = night ? 0.35 : 2.6;

    this.sunSpriteMat.color.setHex(night ? 0xbcc9e8 : 0xfff4d6);
    this.sunSprite.scale.setScalar(night ? 90 : 180);
    this.sunSpriteMat.opacity = night ? 0.7 : 0.9;

    this.scene.fog.color.setHex(night ? COLORS.fogNight : COLORS.fogDay);
    this.scene.fog.near = night ? 60 : 110;
    this.scene.fog.far = night ? 380 : 620;
  }

  setNight(night) {
    if (this.night === night) return;
    this.night = night;
    this.applyMode();
    this.refreshEnvironment();
  }

  /** Keeps the sky and the shadow frustum centred on the car. */
  follow(x, z) {
    this.sky.position.set(x, 0, z);
    this.stars.position.set(x, 0, z);
    this.sun.position.set(x + this.sunOffset.x, this.sunOffset.y, z + this.sunOffset.z);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
    this.sunSprite.position.set(
      x + this.sunOffset.x * 4.2,
      this.sunOffset.y * 4.2,
      z + this.sunOffset.z * 4.2
    );
  }

  dispose() {
    this.scene.remove(this.sky);
    this.scene.remove(this.stars);
    this.scene.remove(this.sunSprite);
    this.scene.remove(this.sun);
    this.scene.remove(this.sun.target);
    this.scene.remove(this.hemi);
    this.sky.geometry.dispose();
    this.stars.geometry.dispose();
    this.skyMaterial.dispose();
    this.starMaterial.dispose();
    this.sunSpriteMat.dispose();
    this.skyTextures.day.dispose();
    this.skyTextures.night.dispose();
    this.glowTexture.dispose();
    if (this.envTarget) this.envTarget.dispose();
    this.pmrem.dispose();
  }
}
