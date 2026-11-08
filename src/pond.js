import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { blob, colorFaces, flatMaterial } from './shapes.js';

export const ISLAND_RADIUS = 4.2;

// A small corner of swamp: a mossy island in patterned water, cattails, grass, lily pads,
// and hazy trees in the distance. Returns the meshes the frog can hop onto and an update().
export function buildPond(scene) {
  const rng = mulberry32(3);
  const group = new THREE.Group();
  scene.add(group);

  // ---- Water: per-triangle colours make the organic two-tone pattern; vertices bob gently.
  const waterGeo = new THREE.PlaneGeometry(70, 70, 48, 48).toNonIndexed();
  waterGeo.rotateX(-Math.PI / 2);
  const deep = new THREE.Color('#4f8f86');
  const light = new THREE.Color('#77b2a0');
  colorFaces(waterGeo, (c) => {
    const n = Math.sin(c.x * 0.55 + Math.sin(c.z * 0.4) * 2) + Math.cos(c.z * 0.5 + Math.sin(c.x * 0.3) * 2);
    return n > 0.7 ? light : deep;
  });
  const water = new THREE.Mesh(waterGeo, flatMaterial(0xffffff, { vertexColors: true, roughness: 0.4 }));
  water.position.y = -0.15;
  water.receiveShadow = true;
  group.add(water);
  const waterBase = waterGeo.attributes.position.array.slice();

  // ---- Island: a flat lumpy disc, mossy on top, muddy at the edges.
  const islandGeo = new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS + 0.6, 0.6, 18, 3).toNonIndexed();
  const ip = islandGeo.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const a = Math.atan2(ip.getZ(i), ip.getX(i));
    const wob = 1 + Math.sin(a * 3 + 1) * 0.06 + Math.sin(a * 7) * 0.03;
    ip.setX(i, ip.getX(i) * wob);
    ip.setZ(i, ip.getZ(i) * wob);
    if (ip.getY(i) > 0.2) ip.setY(i, ip.getY(i) + Math.sin(ip.getX(i) * 1.3) * Math.cos(ip.getZ(i)) * 0.04);
  }
  islandGeo.computeVertexNormals();
  const moss = [new THREE.Color('#8fae5a'), new THREE.Color('#9dba63'), new THREE.Color('#86a553')];
  const mud = new THREE.Color('#7a6a48');
  colorFaces(islandGeo, (c) => (c.y > 0.25 ? moss[Math.floor(rng() * 3)] : mud));
  const island = new THREE.Mesh(islandGeo, flatMaterial(0xffffff, { vertexColors: true }));
  island.position.y = -0.3;
  island.receiveShadow = true;
  group.add(island);

  // ---- Grass tufts: clusters of thin angular blades.
  const grassMat = flatMaterial('#a9bf5e');
  const grassDark = flatMaterial('#6f8f3e');
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const d = ISLAND_RADIUS * (0.55 + rng() * 0.45);
    tuft(group, rng, Math.cos(a) * d, Math.sin(a) * d, rng() < 0.5 ? grassMat : grassDark);
  }

  // ---- Cattails along the back edge of the island and in the water.
  for (let i = 0; i < 14; i++) {
    const a = Math.PI + 0.2 + rng() * (Math.PI - 0.4);
    const d = ISLAND_RADIUS * (0.85 + rng() * 0.45);
    cattail(group, rng, Math.cos(a) * d, Math.sin(a) * d);
  }

  // ---- Lily pads floating in the water.
  const pads = [];
  const padMat = flatMaterial('#79a843');
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2;
    const d = ISLAND_RADIUS + 1.4 + rng() * 5;
    const r = 0.5 + rng() * 0.6;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 9, 1, false, 0.3, Math.PI * 2 - 0.5), padMat);
    pad.position.set(Math.cos(a) * d, -0.1, Math.sin(a) * d);
    pad.rotation.y = rng() * Math.PI * 2;
    pad.receiveShadow = true;
    group.add(pad);
    pads.push({ pad, phase: rng() * 10 });
  }

  // ---- Rocks
  const rockMat = flatMaterial('#9a9580');
  for (let i = 0; i < 5; i++) {
    const a = rng() * Math.PI * 2;
    const d = ISLAND_RADIUS * (0.6 + rng() * 0.5);
    const rock = new THREE.Mesh(blob(rng, { detail: 0, rough: 0.3, sx: 0.4, sy: 0.25, sz: 0.35 }), rockMat);
    rock.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    rock.castShadow = rock.receiveShadow = true;
    group.add(rock);
  }

  // ---- Distant trees, layered into the haze.
  const treeMats = ['#6e8f55', '#7f9c5f', '#8ea86a'].map((c) => flatMaterial(c));
  const trunkMat = flatMaterial('#6b5a42');
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * (1.05 + rng() * 0.9);
    const d = 14 + rng() * 14;
    tree(group, rng, Math.cos(a) * d, Math.sin(a) * d, treeMats[Math.floor(rng() * 3)], trunkMat);
  }

  let time = 0;
  function update(dt) {
    time += dt;
    const pos = waterGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = waterBase[i * 3];
      const z = waterBase[i * 3 + 2];
      pos.array[i * 3 + 1] = Math.sin(x * 0.6 + time) * 0.05 + Math.cos(z * 0.5 + time * 0.8) * 0.05;
    }
    pos.needsUpdate = true;
    waterGeo.computeVertexNormals();
    for (const { pad, phase } of pads) {
      pad.position.y = -0.1 + Math.sin(time * 1.2 + phase) * 0.03;
      pad.rotation.y += Math.sin(time * 0.3 + phase) * 0.0008;
    }
  }

  return { ground: [island], water, update };
}

function tuft(parent, rng, x, z, mat) {
  const n = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const h = 0.35 + rng() * 0.45;
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.06, h, 3), mat);
    blade.position.set(x + (rng() - 0.5) * 0.3, h / 2, z + (rng() - 0.5) * 0.3);
    blade.rotation.set((rng() - 0.5) * 0.6, rng() * 3, (rng() - 0.5) * 0.6);
    blade.castShadow = true;
    parent.add(blade);
  }
}

function cattail(parent, rng, x, z) {
  const h = 1.6 + rng() * 1.4;
  const lean = (rng() - 0.5) * 0.2;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, h, 4), flatMaterial('#7d9a4a'));
  stem.position.set(x, h / 2 - 0.1, z);
  stem.rotation.z = lean;
  stem.castShadow = true;
  parent.add(stem);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.45, 6), flatMaterial('#6a4a2e'));
  head.position.set(x - Math.sin(lean) * h * 0.85, h * 0.85 - 0.1, z);
  head.rotation.z = lean;
  head.castShadow = true;
  parent.add(head);
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.07, h * 0.8, 3), flatMaterial('#94b05a'));
  leaf.position.set(x + 0.1, h * 0.4 - 0.1, z + 0.05);
  leaf.rotation.set(0.1, rng() * 3, -0.25);
  parent.add(leaf);
}

function tree(parent, rng, x, z, mat, trunkMat) {
  const h = 4 + rng() * 5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.25, h * 0.5, 5), trunkMat);
  trunk.position.set(x, h * 0.25, z);
  parent.add(trunk);
  const crown = new THREE.Mesh(blob(rng, { detail: 0, rough: 0.35, sx: h * 0.32, sy: h * 0.4, sz: h * 0.32 }), mat);
  crown.position.set(x, h * 0.65, z);
  parent.add(crown);
}
