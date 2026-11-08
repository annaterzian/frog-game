import * as THREE from 'three';
import { Effects } from './effects.js';
import { worldTime } from './world/materials.js';
import { createHomePond } from './ponds/home.js';
import { createCatchingPond } from './ponds/catching.js';
import { createTravel } from './ponds/travel.js';
import { Collection } from './collection.js';
import { recipeById } from './roster.js';
import { createUI } from './ui.js';
import { setupHome } from './care.js';
import { setupCatching } from './catching.js';

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
  fitCamera();
  for (const f of pond.frogs) f.lookTarget.copy(camera.position);
}

function fitCamera() {
  const pond = travel.current();
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // Pull back on tall phone screens so the island still fits.
  const pull = aspect < 1 ? 1 / Math.max(aspect, 0.62) : 1;
  const { position, lookAt } = pond.camera;
  const offset = position.clone().sub(lookAt).multiplyScalar(pull);
  camera.position.copy(lookAt).add(offset);
  camera.lookAt(lookAt);
  // Keep the haze starting just behind the action, however far back the camera is.
  const dist = offset.length();
  scene.fog.near = dist + pond.look.fog[0];
  scene.fog.far = dist + pond.look.fog[1];
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const travel = createTravel({ scene, ponds, applyLook, fadeEl: document.getElementById('fade') });
window.addEventListener('resize', fitCamera);
travelBtn.addEventListener('click', () => travel.goTo(travel.current().travel[0].to));

// ---- Your frogs, saved in this browser. Everyone starts with Pip.
const collection = new Collection();
if (!collection.frogs.length) collection.add(recipeById('pip'));
const fx = new Effects(scene);
const ui = createUI(collection);
const home = setupHome({ pond: ponds.home, collection, ui });
const catching = setupCatching({ pond: ponds.catch, collection, fx, ui, camera });
travel.onEnter((name) => {
  if (name === 'home') home.sync();
  if (name === 'catch') catching.enter();
  ui.hideCard();
});
travel.onLeave((name) => {
  if (name === 'catch') catching.leave();
});

travel.start('home');

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
  let best = null;
  let bestDist = Infinity;
  for (const f of pond.frogs) {
    const hit = raycaster.intersectObjects(f.parts, false)[0];
    if (hit && hit.distance < bestDist) {
      best = f;
      bestDist = hit.distance;
    }
  }
  return best;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (travel.busy) return;
  const pond = travel.current();
  castAt(e);
  renderer.domElement.setPointerCapture(e.pointerId);
  if (pond.input?.down?.(e, raycaster)) return;
  // Ponds with their own input (the catching pond) don't get the default poke and pet.
  Object.assign(press, { active: true, frog: pond.input ? null : frogUnderPointer(pond), moved: 0, x: e.clientX, y: e.clientY });
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
  press.x = e.clientX;
  press.y = e.clientY;
  // Rubbing back and forth over a frog counts as petting.
  const f = press.frog;
  if (f && raycaster.intersectObjects(f.parts, false).length > 0) {
    const fondness = home.pet(f, step);
    f.pet(step * 0.0025 * fondness);
    if (f.isHappy && performance.now() - press.lastHeart > 280) {
      press.lastHeart = performance.now();
      fx.heart(home.headOf(f));
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
  // Touch screens have no hover, so after a tap the frogs go back to looking at you.
  if (e.pointerType !== 'mouse') setTimeout(() => pond.frogs.forEach((f) => f.lookTarget.copy(camera.position)), 900);
  if (press.moved > 12) return; // that was a drag, not a tap
  if (press.frog) {
    press.frog.poke();
    home.tapped(press.frog);
    return;
  }
  // Tapped a signpost: off we go.
  for (const route of pond.travel) {
    if (raycaster.intersectObjects(route.touch, false).length) {
      travel.goTo(route.to);
      return;
    }
  }
  if (pond.input) return;
  // Tapped somewhere else: the nearest frog hops towards it, staying on land.
  const hit = raycaster.intersectObjects([...pond.ground, pond.water], false)[0];
  if (!hit) return;
  if (hit.object === pond.water) fx.ripple(hit.point.clone().setY(-0.08), 0.6);
  const frog = nearestFrog(pond, hit.point);
  if (!frog) return;
  const from = frog.root.position.clone().setY(0);
  // Long trips become a single big hop of at most 3.2 units.
  const offset = hit.point.clone().setY(0).sub(from).clampLength(0, 3.2);
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
    if (f.wander) return f.wander(); // some frogs (wild ones) have their own idea of wandering
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
  if (pond === ponds.catch) catching.update(dt);
  for (const f of pond.frogs) f.update(dt, events);
  fx.update(dt);
  renderer.render(scene, camera);
});

// Handy for poking at things from the browser console.
window.frogSeason = { ponds, travel, scene, camera, collection, catching };
