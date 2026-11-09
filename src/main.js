import * as THREE from 'three';
import { Frog, FIRST_FROG } from './frog.js';
import { Effects } from './effects.js';
import { worldTime } from './world/materials.js';
import { createHomePond } from './ponds/home.js';
import { createCatchingPond } from './ponds/catching.js';
import { createTravel } from './ponds/travel.js';

// ---- Renderer, scene, light
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color();
scene.fog = new THREE.Fog(0xffffff, 12, 34);

const hemi = new THREE.HemisphereLight(0xfff1d0, 0x4c6b46, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffdca6, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.radius = 4;
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);

// ---- Ponds
const ponds = { home: createHomePond(), catch: createCatchingPond() };
const titleEl = document.getElementById('place');
const hintEl = document.getElementById('hint');
const travelBtn = document.getElementById('travel');

// Each pond describes its own light, haze and camera; this puts them into effect.
function applyLook(pond) {
  const L = pond.look;
  scene.background.set(L.haze);
  scene.fog.color.set(L.haze);
  hemi.color.set(L.sky);
  hemi.groundColor.set(L.groundLight);
  sun.color.set(L.sun);
  sun.position.copy(L.sunPosition);
  Object.assign(sun.shadow.camera, { left: -L.shadowSize, right: L.shadowSize, top: L.shadowSize, bottom: -L.shadowSize, near: 1, far: 40 });
  sun.shadow.camera.updateProjectionMatrix();
  document.body.style.background = L.haze;
  titleEl.textContent = pond.title;
  hintEl.textContent = pond.hint;
  const other = pond.travel[0].to;
  travelBtn.textContent = other === 'home' ? '← Home pond' : 'Catching pond →';
  view.pan.set(0, 0, 0);
  view.zoom = 1;
  fitCamera();
  for (const f of pond.frogs) f.lookTarget.copy(camera.position);
}

// Camera: each pond gives a home framing; dragging the ground pans around and the
// mouse wheel zooms, within limits the pond sets.
const view = { pan: new THREE.Vector3(), zoom: 1 };

function fitCamera() {
  const pond = travel.current();
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // Pull back on tall phone screens so the scene still fits.
  const pull = (aspect < 1 ? 1 / Math.max(aspect, 0.62) : 1) * view.zoom;
  const { position, lookAt } = pond.camera;
  const target = lookAt.clone().add(view.pan);
  const offset = position.clone().sub(lookAt).multiplyScalar(pull);
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  // Keep the haze starting just behind the action, however far back the camera is.
  const dist = offset.length();
  scene.fog.near = dist + pond.look.fog[0];
  scene.fog.far = dist + pond.look.fog[1];
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function panBy(dx, dy) {
  const pond = travel.current();
  // Screen pixels to ground units: further away means each pixel covers more ground.
  const k = camera.position.distanceTo(pond.camera.lookAt.clone().add(view.pan)) * 0.0016;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const forward = new THREE.Vector3(-right.z, 0, right.x); // towards the screen's top
  view.pan.addScaledVector(right, -dx * k).addScaledVector(forward, -dy * k);
  view.pan.clampLength(0, pond.camera.pan ?? 0);
  fitCamera();
}

const travel = createTravel({ scene, ponds, applyLook, fadeEl: document.getElementById('fade') });
window.addEventListener('resize', fitCamera);
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    view.zoom = THREE.MathUtils.clamp(view.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.6);
    fitCamera();
  },
  { passive: false }
);
travelBtn.addEventListener('click', () => travel.goTo(travel.current().travel[0].to));

// ---- Pip lives in the home pond.
const pip = new Frog(FIRST_FROG);
ponds.home.group.add(pip.root);
ponds.home.frogs.push(pip);

travel.start('home');
const fx = new Effects(scene);

// ---- Pointer: poke, pet, look, hop, travel
// Lesson: a Raycaster shoots an invisible line from the camera through the pointer
// and tells us which 3D objects it passes through.
//
// A pond can take over the pointer by giving itself an `input` object with
// down/move/up(event, raycaster) functions; returning true means "handled, skip the rest".
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const press = { active: false, frog: null, moved: 0, x: 0, y: 0, lastHeart: 0 };

function castAt(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function frogUnderPointer(pond) {
  let best = { frog: null, hit: null };
  for (const f of pond.frogs) {
    const hit = raycaster.intersectObjects(f.parts, false)[0];
    if (hit && (!best.hit || hit.distance < best.hit.distance)) best = { frog: f, hit };
  }
  return best;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (travel.busy) return;
  const pond = travel.current();
  castAt(e);
  renderer.domElement.setPointerCapture(e.pointerId);
  if (pond.input?.down?.(e, raycaster)) return;
  const { frog, hit } = frogUnderPointer(pond);
  if (frog) frog.press(hit); // dents the spot you touch
  Object.assign(press, { active: true, frog, moved: 0, x: e.clientX, y: e.clientY });
});

renderer.domElement.addEventListener('pointermove', (e) => {
  const pond = travel.current();
  castAt(e);
  // Frogs' eyes follow the pointer.
  for (const f of pond.frogs) {
    const dist = camera.position.distanceTo(f.root.getWorldPosition(new THREE.Vector3())) * 0.8;
    raycaster.ray.at(dist, f.lookTarget);
  }
  if (pond.input?.move?.(e, raycaster)) return;

  if (!press.active) return;
  const step = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  press.moved += step;
  if (press.frog && press.moved > 12) press.frog.release(); // it's a rub now, not a press
  const dx = e.clientX - press.x;
  const dy = e.clientY - press.y;
  press.x = e.clientX;
  press.y = e.clientY;
  // Dragging on anything but a frog moves the camera around the pond.
  if (!press.frog) {
    if (press.moved > 12) panBy(dx, dy);
    return;
  }
  // Rubbing back and forth over a frog counts as petting.
  const f = press.frog;
  if (f && raycaster.intersectObjects(f.parts, false).length > 0) {
    f.pet(step * 0.0025);
    if (f.isHappy && performance.now() - press.lastHeart > 280) {
      press.lastHeart = performance.now();
      fx.heart(f.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, f.headHeight ?? 1.9, 0)));
    }
  }
});

renderer.domElement.addEventListener('pointerup', (e) => {
  const pond = travel.current();
  castAt(e);
  if (pond.input?.up?.(e, raycaster)) {
    press.active = false;
    return;
  }
  if (!press.active) return;
  press.active = false;
  press.frog?.release();
  // Touch screens have no hover, so after a tap the frogs go back to looking at you.
  if (e.pointerType !== 'mouse') setTimeout(() => pond.frogs.forEach((f) => f.lookTarget.copy(camera.position)), 900);
  if (press.moved > 12) return; // that was a drag, not a tap
  if (press.frog) {
    press.frog.poke();
    return;
  }
  // Tapped a signpost: off we go.
  for (const route of pond.travel) {
    if (raycaster.intersectObjects(route.touch, false).length) {
      travel.goTo(route.to);
      return;
    }
  }
  // Tapped somewhere else: the nearest frog hops towards it, staying on land.
  const hit = raycaster.intersectObjects([...pond.ground, pond.water], false)[0];
  if (!hit) return;
  if (hit.object === pond.water) fx.ripple(hit.point.clone().setY(-0.08), 0.6);
  const frog = nearestFrog(pond, hit.point);
  if (!frog) return;
  const from = frog.root.position.clone().setY(0);
  // Long trips become a single big hop.
  const offset = hit.point.clone().setY(0).sub(from).clampLength(0, frog.hopReach ?? 3.2);
  frog.hopTo(pond.clampToLand(from.add(offset)));
});

function nearestFrog(pond, point) {
  let best = null;
  for (const f of pond.frogs) {
    if (!best || f.root.position.distanceTo(point) < best.root.position.distanceTo(point)) best = f;
  }
  return best;
}

// ---- Frog events
const events = {
  landed(pos, height) {
    fx.dust(pos.clone(), height);
  },
  wander(f) {
    const a = Math.random() * Math.PI * 2;
    const target = f.root.position.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(1.4));
    f.hopTo(travel.current().clampToLand(target));
  },
};

// ---- Main loop
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  worldTime.value += dt;
  const pond = travel.current();
  pond.update(dt, worldTime.value);
  for (const f of pond.frogs) f.update(dt, events);
  fx.update(dt);
  renderer.render(scene, camera);
});

// Handy for poking at things from the browser console.
window.frogSeason = { frog: pip, ponds, travel, scene, camera };
