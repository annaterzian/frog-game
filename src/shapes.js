import * as THREE from 'three';

// Nudge every vertex in or out a little so shapes look hand-made instead of perfectly
// round. Vertices that share a position move together, so the mesh never cracks.
export function lumpy(geometry, rng, amount) {
  const pos = geometry.attributes.position;
  const offsets = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    let k = offsets.get(key);
    if (k === undefined) {
      k = 1 + (rng() - 0.5) * amount;
      offsets.set(key, k);
    }
    pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k);
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Give every triangle one solid colour, picked from its centre point.
// Expects non-indexed geometry (three vertices per triangle), like IcosahedronGeometry.
export function colorFaces(geometry, pickColor) {
  const pos = geometry.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const centre = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    centre.set(
      (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
      (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
      (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3
    );
    const col = pickColor(centre);
    for (let j = 0; j < 3; j++) col.toArray(colors, (i + j) * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A chunky low-poly blob: an icosahedron, squashed into shape and roughed up.
// Lesson: `detail` is how many times each of the 20 triangles is split. detail 0 has 20
// faces, 1 has 80, 2 has 180. With flat shading every face is one tone, so fewer faces
// means bigger, more visible facets: that's what makes the art read as low-poly.
export function blob(rng, { detail = 1, rough = 0.12, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  lumpy(g, rng, rough);
  g.scale(sx, sy, sz);
  g.computeVertexNormals();
  return g;
}

export function flatMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.85, ...extra });
}
