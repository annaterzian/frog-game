import * as THREE from 'three';

// Placeholder scene: proves the Three.js + Vite + Pages pipeline works.
// The first real frog arrives in step 2.

const HAZE = 0xcfd9b8;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, 8, 30);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 4, 9);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xfff2d6, 0x3e5a3a, 1.6));
const sun = new THREE.DirectionalLight(0xffe2b0, 1.4);
sun.position.set(4, 8, 3);
scene.add(sun);

// Water: a low-poly plane with gently bobbing vertices.
const waterGeo = new THREE.PlaneGeometry(40, 40, 30, 30);
waterGeo.rotateX(-Math.PI / 2);
const water = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({ color: 0x5f9e8f, flatShading: true, roughness: 0.6 })
);
scene.add(water);
const basePos = waterGeo.attributes.position.array.slice();

// A lily pad: a low-poly disc with a notch cut out.
const pad = new THREE.Mesh(
  new THREE.CylinderGeometry(1.2, 1.2, 0.08, 9, 1, false, 0.4, Math.PI * 2 - 0.6),
  new THREE.MeshStandardMaterial({ color: 0x7fae4b, flatShading: true })
);
pad.position.y = 0.05;
scene.add(pad);

const clock = new THREE.Clock();
function animate() {
  const t = clock.getElapsedTime();
  const pos = waterGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = basePos[i * 3];
    const z = basePos[i * 3 + 2];
    pos.array[i * 3 + 1] = Math.sin(x * 0.6 + t) * 0.06 + Math.cos(z * 0.5 + t * 0.8) * 0.06;
  }
  pos.needsUpdate = true;
  waterGeo.computeVertexNormals();

  pad.rotation.y = Math.sin(t * 0.3) * 0.15;
  pad.position.y = 0.06 + Math.sin(t * 1.2) * 0.03;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
