import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { blob, colorFaces, flatMaterial } from '../shapes.js';
import { swayMaterial, waterMaterial } from './materials.js';

// The building blocks both ponds are made from. Each pond file picks colours and places
// these pieces; nothing in here knows which pond it is in.

export const WATER_Y = -0.15;

// ---------------------------------------------------------------------------
// Baking: lesson: every separate mesh costs the GPU a "draw call", and hundreds of grass
// blades would mean hundreds of draw calls. So small pieces are collected here and merged
// into one big mesh per material at the end.
export class Baker {
  constructor() {
    this.buckets = new Map(); // material -> [geometry]
  }

  add(geometry, material, { position, rotation, scale } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.deleteAttribute('uv');
    if (!g.attributes.color) {
      // Merging needs every piece to have the same attributes, so give everyone plain white.
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    }
    const m = new THREE.Matrix4().compose(
      position ?? new THREE.Vector3(),
      new THREE.Quaternion().setFromEuler(rotation ?? new THREE.Euler()),
      scale ?? new THREE.Vector3(1, 1, 1)
    );
    g.applyMatrix4(m);
    if (!this.buckets.has(material)) this.buckets.set(material, []);
    this.buckets.get(material).push(g);
  }

  build(parent, { castShadow = true, receiveShadow = true } = {}) {
    const meshes = [];
    for (const [material, geos] of this.buckets) {
      material.vertexColors = true;
      const mesh = new THREE.Mesh(mergeGeometries(geos), material);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      parent.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Water: one big gently bobbing sheet with the vein pattern.
export function makeWater(colors, shores, size = 90) {
  const geo = new THREE.PlaneGeometry(size, size, 60, 60);
  geo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(geo, waterMaterial({ ...colors, shores }));
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  return water;
}

// ---------------------------------------------------------------------------
// Islands: flat lumpy discs. Their outline is a circle with a couple of wobbles, and the
// same formula lives in the water shader so the foam line follows the shore.
export function islandRadiusAt(radius, phase, a) {
  return radius * (1 + Math.sin(a * 3 + phase) * 0.06 + Math.sin(a * 7 + phase * 2) * 0.03);
}

export function makeIsland(rng, { x = 0, z = 0, radius = 4, phase = rng() * 6, top, side }) {
  const geo = new THREE.CylinderGeometry(radius, radius + 0.6, 0.6, Math.max(12, Math.round(radius * 4.5)), 3).toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getZ(i), p.getX(i));
    const k = islandRadiusAt(1, phase, a);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
    if (p.getY(i) > 0.2) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 1.3 + x) * Math.cos(p.getZ(i) + z) * 0.04);
  }
  geo.computeVertexNormals();
  colorFaces(geo, (c) => (c.y > 0.25 ? top[Math.floor(rng() * top.length)] : side));
  const mesh = new THREE.Mesh(geo, flatMaterial(0xffffff, { vertexColors: true }));
  mesh.position.set(x, -0.3, z);
  mesh.receiveShadow = true;

  const island = {
    mesh,
    x,
    z,
    radius,
    phase,
    // How far a point is inside the shore (negative means it's in the water).
    inset(point) {
      const dx = point.x - x;
      const dz = point.z - z;
      return islandRadiusAt(radius, phase, Math.atan2(dz, dx)) - Math.hypot(dx, dz);
    },
    // Pull a point back onto the island, `margin` units in from the edge.
    clamp(point, margin = 1) {
      const dx = point.x - x;
      const dz = point.z - z;
      const max = Math.max(0, islandRadiusAt(radius, phase, Math.atan2(dz, dx)) - margin);
      const d = Math.hypot(dx, dz);
      if (d <= max) return point.clone().setY(0);
      return v3(x + (dx / d) * max, 0, z + (dz / d) * max);
    },
    // A random spot on the island, at least `margin` from the edge.
    randomSpot(r, margin = 1) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * Math.max(0, islandRadiusAt(radius, phase, a) - margin);
      return v3(x + Math.cos(a) * d, 0, z + Math.sin(a) * d);
    },
  };
  return island;
}

// Given several islands, return a clampToLand(point) that keeps a hop target on whichever
// island it's over, or the nearest one if it landed in the water.
export function landClamper(islands, margin = 1.1) {
  return (point) => {
    let best = islands[0];
    let bestInset = -Infinity;
    for (const isl of islands) {
      const inset = isl.inset(point);
      if (inset > bestInset) {
        bestInset = inset;
        best = isl;
      }
    }
    return best.clamp(point, margin);
  };
}

// ---------------------------------------------------------------------------
// Grass: clumps of thin, flat, angular blades, like paper cut-outs. Two or three shades
// layered together read as depth.
const bladeGeo = (() => {
  const g = new THREE.BufferGeometry();
  // A tall thin triangle with a slight kink, so it catches light on two facets.
  g.setAttribute('position', new THREE.Float32BufferAttribute([-0.06, 0, 0, 0.06, 0, 0, 0.02, 1, 0.04, -0.06, 0, 0, 0.02, 1, 0.04, -0.01, 0.5, 0.05], 3));
  g.computeVertexNormals();
  return g;
})();

export function grassClump(bake, rng, x, y, z, { mats, count = 7, height = 0.7, spread = 0.35, lean = 0.5 }) {
  for (let i = 0; i < count; i++) {
    const h = height * (0.5 + rng() * 0.7);
    bake.add(bladeGeo, mats[Math.floor(rng() * mats.length)], {
      position: v3(x + (rng() - 0.5) * spread, y, z + (rng() - 0.5) * spread),
      rotation: new THREE.Euler((rng() - 0.5) * lean, rng() * Math.PI * 2, (rng() - 0.5) * lean),
      scale: v3(1 + rng(), h, 1),
    });
  }
}

// Cattails: a thin stem, a brown sausage head, a spike on top, and a long leaf or two.
export function cattail(bake, rng, x, y, z, mats, size = 1) {
  const h = (1.6 + rng() * 1.4) * size;
  const lean = (rng() - 0.5) * 0.25;
  const turn = rng() * Math.PI * 2;
  const tilt = new THREE.Euler(0, turn, lean);
  const up = v3(0, 1, 0).applyEuler(tilt);
  const at = (d) => v3(x, y, z).addScaledVector(up, d);
  bake.add(new THREE.CylinderGeometry(0.022, 0.035, h, 4).translate(0, h / 2, 0), mats.stem, { position: v3(x, y, z), rotation: tilt });
  bake.add(new THREE.CylinderGeometry(0.085, 0.085, 0.42 * size, 6), mats.head, { position: at(h * 0.82), rotation: tilt });
  bake.add(new THREE.ConeGeometry(0.015, 0.25 * size, 3), mats.stem, { position: at(h * 0.82 + 0.32 * size), rotation: tilt });
  for (let i = 0; i < 2; i++) {
    const lh = h * (0.6 + rng() * 0.3);
    bake.add(bladeGeo, mats.leaf, {
      position: v3(x + (rng() - 0.5) * 0.15, y, z + (rng() - 0.5) * 0.15),
      rotation: new THREE.Euler((rng() - 0.5) * 0.3, rng() * Math.PI * 2, (rng() - 0.5) * 0.5),
      scale: v3(0.9, lh, 1),
    });
  }
}

// A stand of cattails and reeds around a point.
export function reedBed(bake, rng, x, y, z, { cattails = 5, grass = 3, spread = 1.2, mats }) {
  for (let i = 0; i < cattails; i++) {
    cattail(bake, rng, x + (rng() - 0.5) * spread, y, z + (rng() - 0.5) * spread, mats.cattail, 0.8 + rng() * 0.4);
  }
  for (let i = 0; i < grass; i++) {
    grassClump(bake, rng, x + (rng() - 0.5) * spread, y, z + (rng() - 0.5) * spread, { mats: mats.reeds, height: 1.3, count: 6 });
  }
}

// Small round flowers on short stems.
export function flowers(bake, rng, x, y, z, { petal, centre, stem, count = 4 }) {
  for (let i = 0; i < count; i++) {
    const px = x + (rng() - 0.5) * 0.5;
    const pz = z + (rng() - 0.5) * 0.5;
    const h = 0.25 + rng() * 0.25;
    bake.add(new THREE.CylinderGeometry(0.012, 0.012, h, 3).translate(0, h / 2, 0), stem, { position: v3(px, y, pz) });
    bake.add(new THREE.IcosahedronGeometry(0.07, 0), petal, { position: v3(px, y + h, pz), scale: v3(1, 0.5, 1) });
    bake.add(new THREE.IcosahedronGeometry(0.03, 0), centre, { position: v3(px, y + h + 0.03, pz) });
  }
}

// Rocks: squashed, roughed-up blobs.
export function rock(bake, rng, x, y, z, mat, size = 1) {
  bake.add(blob(rng, { detail: 0, rough: 0.3, sx: 0.4 * size, sy: 0.25 * size, sz: 0.35 * size }), mat, {
    position: v3(x, y, z),
    rotation: new THREE.Euler(0, rng() * 6, 0),
  });
}

// Trees: a tapered trunk and a lumpy crown or two. Far-away ones go into the haze.
export function tree(bake, rng, x, y, z, { crown, trunk, size = 1 }) {
  const h = (4 + rng() * 5) * size;
  bake.add(new THREE.CylinderGeometry(0.15 * size, 0.28 * size, h * 0.55, 5).translate(0, h * 0.275, 0), trunk, {
    position: v3(x, y, z),
    rotation: new THREE.Euler((rng() - 0.5) * 0.15, 0, (rng() - 0.5) * 0.15),
  });
  const lobes = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < lobes; i++) {
    bake.add(blob(rng, { detail: 0, rough: 0.35, sx: h * 0.3, sy: h * 0.3, sz: h * 0.3 }), crown[Math.floor(rng() * crown.length)], {
      position: v3(x + (rng() - 0.5) * h * 0.35, y + h * (0.6 + rng() * 0.2), z + (rng() - 0.5) * h * 0.35),
      scale: v3(1, 0.8 + rng() * 0.4, 1),
    });
  }
}

// A thick ring of trees around a pond's meadow, several rows deep, so the woods read as a
// wall. `skip(point)` can leave gaps (for example where the camera stands).
export function treeWall(bake, rng, land, { from, depth = 8, spacing = 1.8, crown, trunk, skip = () => false }) {
  for (let d = from; d < from + depth; d += spacing * (1.1 + rng() * 0.4)) {
    const around = 2 * Math.PI * (land.radius + d);
    const n = Math.round(around / spacing);
    for (let i = 0; i < n; i++) {
      const a = ((i + rng() * 0.8) / n) * Math.PI * 2;
      const p = land.shorePoint(a, d + (rng() - 0.5) * spacing);
      if (skip(p)) continue;
      // The front row is a bit shorter, so the wall steps up into the woods behind it.
      const size = (d - from < spacing ? 0.75 : 0.95) + rng() * 0.5;
      tree(bake, rng, p.x, p.y, p.z, { crown, trunk, size });
    }
  }
}

// Bushes: a cluster of lumpy, flat-bottomed blobs. Some have little berries.
export function bush(bake, rng, x, y, z, { mats, size = 1, berries = null }) {
  const lobes = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < lobes; i++) {
    const r = (0.45 + rng() * 0.35) * size;
    const g = blob(rng, { detail: 0, rough: 0.3, sx: r * 1.2, sy: r * 0.85, sz: r * 1.1 });
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) if (pos.getY(k) < -r * 0.3) pos.setY(k, -r * 0.3); // sit flat on the ground
    g.computeVertexNormals();
    const px = x + (rng() - 0.5) * size * 1.1;
    const pz = z + (rng() - 0.5) * size * 1.1;
    bake.add(g, mats[Math.floor(rng() * mats.length)], { position: v3(px, y + r * 0.3, pz), rotation: new THREE.Euler(0, rng() * 6, 0) });
    if (berries) {
      for (let b = 0; b < 4; b++) {
        const a = rng() * Math.PI * 2;
        const up = 0.2 + rng() * 0.6;
        bake.add(new THREE.IcosahedronGeometry(0.06 * size, 0), berries, {
          position: v3(px + Math.cos(a) * r * 1.05 * Math.cos(up), y + r * 0.3 + Math.sin(up) * r * 0.8, pz + Math.sin(a) * r * 0.95 * Math.cos(up)),
        });
      }
    }
  }
}

// Ferns: a rosette of long, flat fronds arching outwards.
export function fern(bake, rng, x, y, z, { mat, size = 1 }) {
  const n = 6 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.4;
    bake.add(bladeGeo, mat, {
      position: v3(x, y, z),
      rotation: new THREE.Euler(0.9 + rng() * 0.4, a, 0, 'YXZ'),
      scale: v3(3 * size, (0.7 + rng() * 0.3) * size, 1),
    });
  }
}

// Tall wildflowers: a spike of small bells up a stem, standing above the grass.
export function wildflower(bake, rng, x, y, z, { petal, stem, count = 3 }) {
  for (let i = 0; i < count; i++) {
    const px = x + (rng() - 0.5) * 0.6;
    const pz = z + (rng() - 0.5) * 0.6;
    const h = 0.7 + rng() * 0.5;
    bake.add(new THREE.CylinderGeometry(0.015, 0.02, h, 3).translate(0, h / 2, 0), stem, { position: v3(px, y, pz) });
    for (let k = 0; k < 4; k++) {
      bake.add(new THREE.ConeGeometry(0.06 - k * 0.008, 0.1, 5), petal, { position: v3(px, y + h * (0.6 + k * 0.12), pz), rotation: new THREE.Euler(Math.PI, k, 0) });
    }
  }
}

// A big, old tree leaning out over the water, roots splayed into the shallows.
export function leaningTree(bake, rng, x, z, { crown, trunk, lean = 0.35, turn = 0, size = 1, y = WATER_Y }) {
  const h = 7 * size;
  const tilt = new THREE.Euler(0, turn, -lean, 'YXZ');
  bake.add(new THREE.CylinderGeometry(0.45 * size, 0.9 * size, h, 7, 2).translate(0, h / 2, 0), trunk, {
    position: v3(x, y - 0.1, z),
    rotation: tilt,
  });
  const top = v3(0, h, 0).applyEuler(tilt).add(v3(x, y, z));
  // A fork: two thick branches splitting off near the top.
  for (const side of [-1, 1]) {
    const branch = new THREE.Euler(side * 0.5, turn, -lean + side * 0.45, 'YXZ');
    bake.add(new THREE.CylinderGeometry(0.2 * size, 0.38 * size, h * 0.45, 5).translate(0, h * 0.22, 0), trunk, {
      position: top.clone().addScaledVector(v3(0, -1, 0).applyEuler(tilt), h * 0.12),
      rotation: branch,
    });
  }
  for (let i = 0; i < 5; i++) {
    const a = turn + (i / 5) * Math.PI * 2;
    bake.add(blob(rng, { detail: 0, rough: 0.2, sx: 0.9 * size, sy: 0.35 * size, sz: 0.4 * size }), trunk, {
      position: v3(x + Math.cos(a) * 0.9 * size, y, z + Math.sin(a) * 0.9 * size),
      rotation: new THREE.Euler(0, -a, -0.3),
    });
  }
  for (let i = 0; i < 6; i++) {
    bake.add(blob(rng, { detail: 0, rough: 0.35, sx: 2.2 * size, sy: 1.5 * size, sz: 2.2 * size }), crown[i % crown.length], {
      position: top.clone().add(v3((rng() - 0.5) * 4 * size, 0.6 * size + rng() * 1.2 * size, (rng() - 0.5) * 4 * size)),
    });
  }
}

// A fallen log, mossy on top. Lying across water it makes a bridge or a frog bench.
// `from` and `to` are the two ends; y is the height of the log's middle.
export function log(bake, from, to, { mat, bark, moss, radius = 0.32 }) {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius * 1.1, len, 7, 3).toNonIndexed();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + Math.sin(p.getY(i) * 1.7) * 0.05);
  geo.rotateZ(Math.PI / 2); // lie it down along x
  geo.computeVertexNormals();
  colorFaces(geo, (c) => (c.y > radius * 0.3 ? moss : bark));
  bake.add(geo, mat, {
    position: from.clone().add(to).multiplyScalar(0.5),
    rotation: new THREE.Euler(0, -Math.atan2(dir.z, dir.x), 0),
  });
}

// A low, wide stump with a pale cut top.
export function stump(bake, rng, x, z, { bark, wood }) {
  bake.add(new THREE.CylinderGeometry(0.45, 0.6, 0.55, 7).translate(0, 0.27, 0), bark, { position: v3(x, 0, z), rotation: new THREE.Euler(0, rng() * 6, 0) });
  bake.add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 7), wood, { position: v3(x, 0.56, z) });
}

// ---------------------------------------------------------------------------
// Lily pads float on their own (not baked) because they bob about.
export function lilyPads(parent, rng, spots, { mat, flower }) {
  const pads = [];
  for (const { x, z, r } of spots) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.05, 9, 1, false, 0.3, Math.PI * 2 - 0.5), mat);
    pad.position.set(x, -0.1, z);
    pad.rotation.y = rng() * Math.PI * 2;
    pad.receiveShadow = true;
    if (flower && rng() < 0.25) {
      const bloom = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 6, 1, true), flower);
      bloom.rotation.x = Math.PI;
      bloom.position.set(r * 0.3, 0.1, 0);
      pad.add(bloom);
    }
    parent.add(pad);
    pads.push({ pad, phase: rng() * 10 });
  }
  return {
    pads,
    update(t) {
      for (const { pad, phase } of pads) {
        pad.position.y = -0.1 + Math.sin(t * 1.2 + phase) * 0.03;
        pad.rotation.y += Math.sin(t * 0.3 + phase) * 0.0008;
      }
    },
  };
}

// Scatter lily pad spots around, staying clear of islands and each other.
export function padSpots(rng, count, { minR, maxR, islands, lake, centre = v3(0, 0, 0), avoid = [] }) {
  const spots = [];
  for (let tries = 0; spots.length < count && tries < count * 40; tries++) {
    const a = rng() * Math.PI * 2;
    const d = minR + rng() * (maxR - minR);
    const s = { x: centre.x + Math.cos(a) * d, z: centre.z + Math.sin(a) * d, r: 0.45 + rng() * 0.55 };
    const pt = v3(s.x, 0, s.z);
    if (islands.some((isl) => isl.inset(pt) > -s.r - 0.6)) continue;
    if (lake && !lake.inLake(pt, s.r + 0.8)) continue;
    if (spots.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < o.r + s.r + 0.3)) continue;
    if (avoid.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < o.r + s.r)) continue;
    spots.push(s);
  }
  return spots;
}

// ---------------------------------------------------------------------------
// A little round hut with a thick, droopy moss roof, a round door, a warm window and a
// crooked chimney. Faces +z.
export function mossyHut(rng, { wall = '#a8957a', wall2 = '#978368', moss = ['#7f9e4c', '#8dab55', '#6f8d42'], door = '#5a4632' } = {}) {
  const group = new THREE.Group();
  const add = (geo, mat, pos, rot) => {
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.copy(pos);
    if (rot) m.rotation.copy(rot);
    m.castShadow = m.receiveShadow = true;
    group.add(m);
    return m;
  };

  // Walls: a squat, slightly bulging drum of stones.
  const wallGeo = new THREE.CylinderGeometry(1.55, 1.75, 1.5, 11, 3).toNonIndexed();
  lumpyPositions(wallGeo, rng, 0.05);
  const wc = [new THREE.Color(wall), new THREE.Color(wall2)];
  colorFaces(wallGeo, () => wc[rng() < 0.6 ? 0 : 1]);
  add(wallGeo, flatMaterial(0xffffff, { vertexColors: true }), v3(0, 0.72, 0));

  // Roof: a big lumpy dome that droops over the walls, mossy with darker patches.
  const roofGeo = blob(rng, { detail: 2, rough: 0.1, sx: 2.25, sy: 1.5, sz: 2.25 });
  const rp = roofGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    let y = rp.getY(i);
    if (y < 0) y *= 0.25; // flatten the underside into an overhanging brim
    rp.setY(i, y);
  }
  roofGeo.computeVertexNormals();
  const mc = moss.map((c) => new THREE.Color(c));
  const patches = Array.from({ length: 6 }, () => v3((rng() - 0.5) * 3.5, 0.3 + rng() * 1.2, (rng() - 0.5) * 3.5));
  colorFaces(roofGeo, (c) => (patches.some((q) => q.distanceTo(c) < 0.55) ? mc[2] : mc[rng() < 0.7 ? 0 : 1]));
  add(roofGeo, flatMaterial(0xffffff, { vertexColors: true }), v3(0, 1.55, 0));

  // Chimney, leaning a bit.
  add(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 6), flatMaterial(wall2), v3(0.8, 2.8, -0.5), new THREE.Euler(0, 0, -0.15));
  add(blob(rng, { detail: 0, rough: 0.2, sx: 0.3, sy: 0.12, sz: 0.3 }), flatMaterial(moss[0]), v3(0.88, 3.36, -0.5));

  // Round-topped door.
  const ds = new THREE.Shape();
  ds.moveTo(-0.38, 0);
  ds.lineTo(-0.38, 0.6);
  ds.absarc(0, 0.6, 0.38, Math.PI, 0, true);
  ds.lineTo(0.38, 0);
  const doorMesh = add(new THREE.ExtrudeGeometry(ds, { depth: 0.08, bevelEnabled: false, curveSegments: 5 }), flatMaterial(door), v3(0, 0.02, 1.62));
  doorMesh.rotation.x = -0.06;
  add(new THREE.IcosahedronGeometry(0.05, 0), flatMaterial('#d8c08e'), v3(0.22, 0.5, 1.72));

  // A small round window glowing warm, as if someone left a lamp on.
  const win = add(new THREE.CircleGeometry(0.26, 8), flatMaterial('#ffe2a0', { emissive: '#d9a24a', emissiveIntensity: 0.6 }), v3(-0.95, 0.95, 1.33));
  win.rotation.y = -0.6;
  const frame = add(new THREE.TorusGeometry(0.28, 0.05, 3, 8), flatMaterial(door), v3(-0.95, 0.95, 1.34));
  frame.rotation.y = -0.6;

  // A mossy stepping stone in front of the door.
  add(blob(rng, { detail: 0, rough: 0.25, sx: 0.55, sy: 0.12, sz: 0.4 }), flatMaterial('#9c9884'), v3(0, 0.02, 2.25));
  group.userData.step = v3(0, 0.12, 2.25);
  return group;
}

function lumpyPositions(geo, rng, amount) {
  const p = geo.attributes.position;
  const offs = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!offs.has(key)) offs.set(key, 1 + (rng() - 0.5) * amount * 2);
    const k = offs.get(key);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
}

// Mushrooms: a stubby stem and a flat-ish cap.
export function mushrooms(bake, rng, x, y, z, { cap, stem, count = 3 }) {
  for (let i = 0; i < count; i++) {
    const px = x + (rng() - 0.5) * 0.5;
    const pz = z + (rng() - 0.5) * 0.5;
    const h = 0.12 + rng() * 0.15;
    bake.add(new THREE.CylinderGeometry(0.035, 0.045, h, 5).translate(0, h / 2, 0), stem, { position: v3(px, y, pz) });
    bake.add(new THREE.IcosahedronGeometry(0.11 + rng() * 0.06, 0), cap, { position: v3(px, y + h, pz), scale: v3(1, 0.45, 1) });
  }
}

// ---------------------------------------------------------------------------
// A wooden signpost with a painted arrow. Tapping it is how you travel between ponds.
export function signpost(text, { wood = '#8a6a48', paint = '#ece2c4', ink = '#4a3a28', flip = false } = {}) {
  const group = new THREE.Group();
  const woodMat = flatMaterial(wood);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.7, 5), woodMat);
  post.position.y = 0.85;
  post.castShadow = true;
  group.add(post);

  // Paint the words onto a little canvas and use it as the plank's texture.
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = paint;
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = ink;
  ctx.font = '600 54px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 82);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  // An arrow-shaped plank.
  const s = new THREE.Shape();
  const dir = flip ? -1 : 1;
  s.moveTo(-0.8 * dir, -0.2);
  s.lineTo(0.62 * dir, -0.2);
  s.lineTo(0.85 * dir, 0);
  s.lineTo(0.62 * dir, 0.2);
  s.lineTo(-0.8 * dir, 0.2);
  const plankGeo = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: false });
  // Map the canvas onto the front face.
  const uv = plankGeo.attributes.uv;
  const pos = plankGeo.attributes.position;
  const minX = Math.min(-0.8 * dir, 0.85 * dir);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (pos.getX(i) - minX) / 1.65, (pos.getY(i) + 0.2) / 0.4);
  const plank = new THREE.Mesh(plankGeo, [
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }),
    flatMaterial(wood),
  ]);
  plank.position.set(0, 1.45, 0.06);
  plank.rotation.z = (flip ? -1 : 1) * 0.04;
  plank.castShadow = true;
  group.add(plank);

  group.userData.touch = [post, plank];
  return group;
}

export { swayMaterial, flatMaterial };
