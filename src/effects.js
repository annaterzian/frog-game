import * as THREE from 'three';
import { flatMaterial } from './shapes.js';

// Little short-lived things: hearts when petted, ripples on the water, dust puffs on landing.
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];

    const s = new THREE.Shape();
    s.moveTo(0, -0.5);
    s.bezierCurveTo(-0.15, -0.3, -0.55, -0.15, -0.5, 0.15);
    s.bezierCurveTo(-0.45, 0.45, -0.1, 0.45, 0, 0.2);
    s.bezierCurveTo(0.1, 0.45, 0.45, 0.45, 0.5, 0.15);
    s.bezierCurveTo(0.55, -0.15, 0.15, -0.3, 0, -0.5);
    this.heartGeo = new THREE.ExtrudeGeometry(s, { depth: 0.15, bevelEnabled: false, curveSegments: 3 });
    this.heartGeo.center();
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 14).rotateX(-Math.PI / 2);
    this.puffGeo = new THREE.IcosahedronGeometry(1, 0);
  }

  spawn(mesh, life, tick) {
    this.scene.add(mesh);
    this.items.push({ mesh, life, age: 0, tick });
  }

  heart(at, size = 1) {
    const mesh = new THREE.Mesh(this.heartGeo, flatMaterial('#f07f8a', { transparent: true }));
    mesh.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.8 * size, 0, (Math.random() - 0.5) * 0.4 * size));
    const drift = (Math.random() - 0.5) * 0.6;
    this.spawn(mesh, 1.3, (m, p, dt) => {
      m.position.y += dt * 1.1;
      m.position.x += drift * dt;
      m.rotation.y = Math.sin(p * 6) * 0.5;
      m.scale.setScalar(0.35 * size * Math.min(1, p * 6));
      m.material.opacity = 1 - p * p;
    });
  }

  ripple(at, size = 1) {
    const mesh = new THREE.Mesh(this.ringGeo, flatMaterial('#d8efe4', { transparent: true, side: THREE.DoubleSide }));
    mesh.position.copy(at);
    this.spawn(mesh, 1.1, (m, p) => {
      m.scale.setScalar(size * (0.2 + p * 1.4));
      m.material.opacity = 0.8 * (1 - p);
    });
  }

  dust(at, size = 1) {
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(this.puffGeo, flatMaterial('#e3dcc0', { transparent: true }));
      const a = (i / 6) * Math.PI * 2 + Math.random();
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      mesh.position.copy(at).addScaledVector(dir, 0.7 * size).setY(0.1 * size);
      this.spawn(mesh, 0.5, (m, p, dt) => {
        m.position.addScaledVector(dir, dt * 1.5 * size);
        m.position.y += dt * 0.4;
        m.scale.setScalar((0.12 * (1 - p) + 0.02) * size);
        m.material.opacity = 0.9 * (1 - p);
      });
    }
  }

  update(dt) {
    this.items = this.items.filter((it) => {
      it.age += dt;
      const p = it.age / it.life;
      if (p >= 1) {
        this.scene.remove(it.mesh);
        it.mesh.material.dispose();
        return false;
      }
      it.tick(it.mesh, p, dt);
      return true;
    });
  }
}
