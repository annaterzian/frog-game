import * as THREE from 'three';
import { Frog, FIRST_FROG } from './frog.js';
import { buildPond, ISLAND_RADIUS } from './pond.js';
import { Effects } from './effects.js';

const HAZE = 0xd6dcb6;

// ---- Renderer, scene, light
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(HAZE);
scene.fog = new THREE.Fog(HAZE, 12, 34);

scene.add(new THREE.HemisphereLight(0xfff1d0, 0x4c6b46, 1.5));
const sun = new THREE.DirectionalLight(0xffdca6, 2.0);
sun.position.set(5, 9, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 });
sun.shadow.radius = 4;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const lookAt = new THREE.Vector3(0, 0.7, 0);
function fitCamera() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // Pull back on tall phone screens so the frog and island still fit.
  const dist = aspect < 1 ? 11 / Math.max(aspect, 0.62) : 11;
  // Keep the haze starting just behind the island, however far back the camera is.
  scene.fog.near = dist + 1;
  scene.fog.far = dist + 23;
  camera.position.set(0, dist * 0.55, dist);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
fitCamera();
window.addEventListener('resize', fitCamera);

// ---- World
const pond = buildPond(scene);
const frog = new Frog(FIRST_FROG);
scene.add(frog.root);
frog.lookTarget.copy(camera.position);
const fx = new Effects(scene);

// ---- Pointer: poke, pet, look, hop
// Lesson: a Raycaster shoots an invisible line from the camera through the pointer
// and tells us which 3D objects it passes through.
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const press = { active: false, onFrog: false, moved: 0, x: 0, y: 0, lastHeart: 0 };

function castAt(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  castAt(e);
  const onFrog = raycaster.intersectObjects(frog.parts, false).length > 0;
  Object.assign(press, { active: true, onFrog, moved: 0, x: e.clientX, y: e.clientY });
  renderer.domElement.setPointerCapture(e.pointerId);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  castAt(e);
  // The frog's eyes follow the pointer.
  const dist = camera.position.distanceTo(frog.root.position) * 0.8;
  raycaster.ray.at(dist, frog.lookTarget);

  if (!press.active) return;
  const step = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  press.moved += step;
  press.x = e.clientX;
  press.y = e.clientY;
  // Rubbing back and forth over the frog counts as petting.
  if (press.onFrog && raycaster.intersectObjects(frog.parts, false).length > 0) {
    frog.pet(step * 0.0025);
    if (frog.isHappy && performance.now() - press.lastHeart > 280) {
      press.lastHeart = performance.now();
      fx.heart(frog.root.position.clone().add(new THREE.Vector3(0, 1.9, 0)));
    }
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  if (!press.active) return;
  press.active = false;
  // Touch screens have no hover, so after a tap the frog goes back to looking at you.
  if (e.pointerType !== 'mouse') setTimeout(() => frog.lookTarget.copy(camera.position), 900);
  if (press.moved > 12) return; // that was a drag, not a tap
  castAt(e);
  if (press.onFrog) {
    frog.poke();
    return;
  }
  // Tapped somewhere else: hop towards it, but stay on the island.
  const hit = raycaster.intersectObjects([...pond.ground, pond.water], false)[0];
  if (!hit) return;
  if (hit.object === pond.water) fx.ripple(hit.point.setY(-0.08), 0.6);
  const target = hit.point.clone().setY(0);
  target.clampLength(0, ISLAND_RADIUS - 1.1);
  const from = frog.root.position.clone().setY(0);
  // Long trips become a single big hop of at most 3.2 units.
  const offset = target.sub(from);
  offset.clampLength(0, 3.2);
  frog.hopTo(from.add(offset));
});

// ---- Frog events
const events = {
  landed(pos, height) {
    fx.dust(pos.clone(), height);
  },
  wander(f) {
    const a = Math.random() * Math.PI * 2;
    const target = f.root.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(1.4));
    target.setY(0).clampLength(0, ISLAND_RADIUS - 1.1);
    f.hopTo(target);
  },
};

// ---- Main loop
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  pond.update(dt);
  frog.update(dt, events);
  fx.update(dt);
  renderer.render(scene, camera);
});

// Handy for poking at things from the browser console.
window.frogSeason = { frog, scene, camera };
