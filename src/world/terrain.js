import * as THREE from 'three';
import { colorFaces, flatMaterial } from '../shapes.js';
import { WATER_Y } from './props.js';

// The land around a pond: a big rolling meadow with a lake sunk into the middle and low hills
// closing it in at the edges. Built as rings around the lake, so one ring sits exactly on the
// shoreline and the water's foam line (which uses the same outline formula) hugs it.

// The lake's outline: a circle with a few big lazy wobbles. Must match the water shader.
export function lakeRadiusAt(radius, phase, a) {
  return radius * (1 + Math.sin(a * 3 + phase) * 0.1 + Math.sin(a * 5 + phase * 2) * 0.05);
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function makeLakeLand(rng, { x = 0, z = 0, radius, phase = 0, meadow = 12, hills = 6, colors }) {
  const at = (px, pz) => {
    const dx = px - x;
    const dz = pz - z;
    const a = Math.atan2(dz, dx);
    const r = lakeRadiusAt(radius, phase, a);
    return { a, r, d: Math.hypot(dx, dz) - r }; // d: distance past the shore (negative = in the lake)
  };

  // Ground height anywhere: under water inside the lake, a short bank, a flat meadow where
  // frogs hop about (y = 0), then hills rising towards the edge of the world.
  function heightAt(px, pz) {
    const { d } = at(px, pz);
    if (d < 0) return WATER_Y - 0.1 - Math.min(1, -d / 2.5) * 0.9;
    const bank = WATER_Y + smooth(0, 1.4, d) * -WATER_Y;
    const lumps = (Math.sin(px * 0.45) * Math.cos(pz * 0.38) + Math.sin(px * 0.13 + pz * 0.17)) * 0.04 * smooth(1.5, 4, d);
    const rise = smooth(meadow, meadow + 30, d);
    const roll = 0.6 + 0.4 * Math.sin(px * 0.09 + 1.3) * Math.cos(pz * 0.11 - 0.4);
    return bank + lumps + rise * hills * roll;
  }

  // Rings: a few inside the lake, one right on the shore, then wider and wider steps outwards.
  const inner = [0.001, 0.35, 0.6, 0.8, 0.92];
  const outer = [0, 0.5, 1.2, 2, 3, 4.3, 6, 8, 10.5, 13.5, 17, 21, 26, 32, 39, 47, 56, 66];
  const segs = 110;
  const verts = [];
  const rings = inner.length + outer.length;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j <= segs; j++) {
      // Wiggle the angle of outer rings a little, so the grid doesn't look like a dartboard.
      const a = (j / segs) * Math.PI * 2 + (i > inner.length + 2 && j % segs ? (rng() - 0.5) * 0.02 : 0);
      const r = lakeRadiusAt(radius, phase, a);
      const dist = i < inner.length ? inner[i] * r : r + outer[i - inner.length];
      const px = x + Math.cos(a) * dist;
      const pz = z + Math.sin(a) * dist;
      verts.push(px, heightAt(px, pz), pz);
    }
  }
  const index = [];
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const p = i * (segs + 1) + j;
      const q = p + segs + 1;
      index.push(p, p + 1, q, p + 1, q + 1, q);
    }
  }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(index);
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();

  const grass = colors.grass.map((c) => new THREE.Color(c));
  const hill = colors.hill.map((c) => new THREE.Color(c));
  const bankCol = new THREE.Color(colors.bank);
  const bed = new THREE.Color(colors.bed);
  colorFaces(geo, (c) => {
    // Colour by distance from the shore (not height), so the bank is one clean strip.
    const { d } = at(c.x, c.z);
    if (d < 0) return bed;
    if (d < 0.6) return bankCol;
    // Big soft patches of lighter and darker grass, with a little per-triangle noise.
    const patch = Math.sin(c.x * 0.21 + Math.sin(c.z * 0.17) * 2) + Math.cos(c.z * 0.19 + 0.7);
    const set = d > meadow + 6 ? hill : grass;
    const k = Math.min(set.length - 1, Math.max(0, Math.floor((patch + 2) / 4 * set.length + (rng() - 0.5) * 0.9)));
    return set[k];
  });
  const mesh = new THREE.Mesh(geo, flatMaterial(0xffffff, { vertexColors: true }));
  mesh.receiveShadow = true;

  const land = {
    mesh,
    heightAt,
    // For the water shader: a negative radius means "the water is inside this outline".
    shore: { x, z, radius: -radius, phase },
    centre: new THREE.Vector3(x, 0, z),
    // How far a point is inside the frogs' meadow (negative: in the lake, or out in the hills).
    inset(p) {
      const { d } = at(p.x, p.z);
      return Math.min(d, meadow - d);
    },
    // Pull a point back into the meadow, at least `margin` from the water.
    clamp(p, margin = 1) {
      const { a, r, d } = at(p.x, p.z);
      const dd = Math.min(Math.max(d, margin), meadow - 1);
      return new THREE.Vector3(x + Math.cos(a) * (r + dd), 0, z + Math.sin(a) * (r + dd));
    },
    // A point `d` past the shore at angle `a` (radians around the lake centre).
    shorePoint(a, d = 0) {
      const r = lakeRadiusAt(radius, phase, a) + d;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      return new THREE.Vector3(px, heightAt(px, pz), pz);
    },
    // Is this point out on the water, at least `margin` from the shore?
    inLake(p, margin = 0) {
      return at(p.x, p.z).d < -margin;
    },
  };
  return land;
}
