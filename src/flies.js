import * as THREE from 'three';
import { flatMaterial } from './shapes.js';
import { Swatter } from './tools.js';

// Flies: pests at home, bait at the catching pond.
//
// In the home pond, flies drift in and buzz around. Swat them or lure them into a sugar trap
// and they go in your fly jar. Any fly you leave alone will sooner or later buzz too close
// to one of your frogs, and get eaten. In the catching pond you can toss a fly from the jar
// as bait: a frog goes for it, and while it's chewing it barely notices you.

// ---------------------------------------------------------------------------
// One fly: a fat little body, two flapping wings, and a jittery flight around a drifting anchor.
const bodyGeo = new THREE.IcosahedronGeometry(0.11, 0);
const wingGeo = new THREE.PlaneGeometry(0.2, 0.11).translate(0.1, 0, 0);
const bodyMat = flatMaterial('#2c2a26');
const wingMat = flatMaterial('#e8eef0', { transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });

export class Fly {
  constructor(at, { radius = 0.6, height = 1.2 } = {}) {
    this.mesh = new THREE.Group();
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(1, 0.85, 1.35);
    this.mesh.add(body);
    this.wings = [-1, 1].map((side) => {
      const w = new THREE.Mesh(wingGeo, wingMat);
      w.position.y = 0.06;
      w.scale.x = side;
      this.mesh.add(w);
      return w;
    });
    this.anchor = at.clone();
    this.home = at.clone();
    this.height = height; // above the anchor
    this.radius = radius; // how widely it loops
    this.t = Math.random() * 100;
    this.seed = Math.random() * 10;
    this.drift = new THREE.Vector3();
    this.stuck = false;
    this.mesh.position.copy(this.where(new THREE.Vector3()));
  }

  where(out) {
    const t = this.t + this.seed;
    return out.set(
      this.anchor.x + Math.sin(t * 2.3) * this.radius + Math.sin(t * 7.1) * 0.08,
      this.anchor.y + this.height + Math.sin(t * 3.7) * 0.25 + Math.sin(t * 11) * 0.05,
      this.anchor.z + Math.cos(t * 1.9) * this.radius + Math.cos(t * 6.3) * 0.08
    );
  }

  update(dt) {
    if (!this.stuck) {
      this.t += dt;
      const prev = this.mesh.position.clone();
      this.where(this.mesh.position);
      const v = this.mesh.position.clone().sub(prev);
      if (v.lengthSq() > 1e-6) this.mesh.rotation.y = Math.atan2(v.x, v.z);
    }
    // Wings buzz fast (or twitch, when stuck in sugar).
    const flap = this.stuck ? Math.sin(this.t * 5) * 0.3 : Math.sin(performance.now() * 0.09) * 0.9;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
    if (this.stuck) this.t += dt;
  }
}

// ---------------------------------------------------------------------------
// The frog's tongue: a pink stretchy thing that shoots out of the mouth to a point and back.
const tongueMat = flatMaterial('#d9767a');
const tongueGeo = new THREE.CylinderGeometry(0.06, 0.09, 1, 5).rotateX(Math.PI / 2).translate(0, 0, 0.5);
const tipGeo = new THREE.IcosahedronGeometry(0.12, 0);
const mouthLocal = new THREE.Vector3(0, 0.62, 1.0);

// Shoot the tongue at `fly`; the fly rides the tip back in. Calls done() when swallowed.
export function snapTongue(frog, fly, done) {
  if (frog.tongue?.busy) return false;
  if (!frog.tongue) {
    const pivot = new THREE.Group();
    pivot.position.copy(mouthLocal);
    const stalk = new THREE.Mesh(tongueGeo, tongueMat);
    const tip = new THREE.Mesh(tipGeo, tongueMat);
    pivot.add(stalk, tip);
    pivot.visible = false;
    frog.squash.add(pivot);
    frog.tongue = { pivot, stalk, tip, busy: false };
  }
  const tg = frog.tongue;
  // Face the fly first, so the tongue comes out of the front.
  const p = frog.root.position;
  frog.heading = Math.atan2(fly.mesh.position.x - p.x, fly.mesh.position.z - p.z);
  tg.busy = { t: 0, fly, done };
  return true;
}

export function updateTongue(frog, dt) {
  const tg = frog.tongue;
  if (!tg?.busy) return;
  const b = tg.busy;
  b.t += dt;
  const out = 0.12; // seconds to reach
  const back = 0.18;
  const p = b.t < out ? b.t / out : Math.max(0, 1 - (b.t - out) / back);
  const target = b.fly.mesh.position;
  tg.pivot.visible = p > 0;
  tg.pivot.lookAt(target);
  const mouth = tg.pivot.getWorldPosition(new THREE.Vector3());
  const scale = frog.root.scale.x || 1;
  const len = (mouth.distanceTo(target) / scale) * p;
  tg.stalk.scale.set(1, 1, Math.max(0.01, len));
  tg.tip.position.z = len;
  if (b.t >= out) {
    // The fly is stuck to the tip on the way back.
    tg.tip.getWorldPosition(b.fly.mesh.position);
    b.fly.stuck = true;
  }
  if (b.t >= out + back) {
    tg.busy = false;
    tg.pivot.visible = false;
    frog.squashSpring.v -= 4; // gulp
    b.done();
  }
}

// ---------------------------------------------------------------------------
// The sugar trap: a little jar of syrup. Nearby flies drift into it and get stuck.
function makeTrap() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.5, 7), flatMaterial('#dfe9e0', { transparent: true, opacity: 0.55 }));
  glass.position.y = 0.25;
  const syrup = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.26, 0.28, 7), flatMaterial('#d89a33'));
  syrup.position.y = 0.15;
  const lid = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 3, 7).rotateX(Math.PI / 2), flatMaterial('#8a6a46'));
  lid.position.y = 0.5;
  g.add(glass, syrup, lid);
  g.traverse((o) => (o.castShadow = o.isMesh));
  return g;
}

// ---------------------------------------------------------------------------
// Home pond: flies come and go; you swat them, trap them, or your frogs eat them.
const MAX_FLIES = 5;
const TRAP_PULL = 7; // flies closer than this start drifting to the trap
const TRAP_HOLDS = 5;

export function setupHomeFlies({ pond, collection, fx, ui, camera, canvas }) {
  const flies = [];
  const swatter = new Swatter();
  pond.group.add(swatter.group);
  let mode = 'pet';
  let trap = null; // { mesh, stuck: Fly[] }
  let spawnIn = 3;
  let ateToastAt = 0;
  const aim = new THREE.Vector3();
  const state = { present: false, speed: 0, lastX: 0, lastY: 0, x: 0, y: 0 };

  // ---- Toolbar
  const bar = document.createElement('div');
  bar.id = 'homeTools';
  bar.className = 'toolbar';
  bar.innerHTML =
    '<button type="button" data-mode="pet">🖐 Pet</button>' +
    '<button type="button" data-mode="swat">🪰 Swatter</button>' +
    '<button type="button" data-mode="trap">🍯 Sugar trap</button>';
  document.body.appendChild(bar);
  function setMode(m) {
    mode = m;
    for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === m);
    if (m === 'trap') ui.toast(trap ? 'Tap somewhere to move your sugar trap.' : 'Tap the grass to set down a sugar trap.');
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setMode(b.dataset.mode);
  });
  setMode('pet');

  // ---- Flies
  function spawnFly() {
    // Drift in near one of your frogs, or anywhere on the grass you can see.
    const frogs = pond.frogs;
    const spots = pond.frogSpots.filter((s) => s.kind === 'land' && onScreen(s.position));
    const around =
      frogs.length && Math.random() < 0.5
        ? frogs[Math.floor(Math.random() * frogs.length)].root.position
        : (spots[Math.floor(Math.random() * spots.length)]?.position ?? pond.camera.lookAt);
    const a = Math.random() * Math.PI * 2;
    const at = around.clone().add(new THREE.Vector3(Math.cos(a) * 3, 0, Math.sin(a) * 3));
    at.y = pond.land?.heightAt?.(at.x, at.z) ?? 0;
    const fly = new Fly(at, { radius: 0.5 + Math.random() * 0.5, height: 0.9 + Math.random() * 0.8 });
    fly.mesh.scale.setScalar(1.4);
    fly.wanderIn = 0;
    flies.push(fly);
    pond.group.add(fly.mesh);
  }

  function removeFly(fly) {
    const i = flies.indexOf(fly);
    if (i >= 0) flies.splice(i, 1);
    pond.group.remove(fly.mesh);
  }

  function catchFlies(n, at) {
    collection.addFlies(n);
    ui.update();
    fx.dust(at.clone(), 0.5);
    ui.toast(`+${n} ${n === 1 ? 'fly' : 'flies'} · ${collection.flies} in your jar`);
  }

  const ndc = new THREE.Vector3();
  function onScreen(p) {
    ndc.copy(p).project(camera);
    return Math.abs(ndc.x) < 0.85 && Math.abs(ndc.y) < 0.8;
  }

  // Screen-space distance from the pointer to a fly, in pixels.
  const tmp = new THREE.Vector3();
  function screenDist(fly, e) {
    tmp.copy(fly.mesh.position).project(camera);
    const x = ((tmp.x + 1) / 2) * window.innerWidth;
    const y = ((1 - tmp.y) / 2) * window.innerHeight;
    return Math.hypot(x - e.clientX, y - e.clientY);
  }

  function swatAt(e) {
    const reach = Math.max(36, Math.min(window.innerWidth, window.innerHeight) * 0.06);
    const target = flies.filter((f) => !f.stuck).sort((a, b) => screenDist(a, e) - screenDist(b, e))[0];
    const ev = { clientX: e.clientX, clientY: e.clientY };
    swatter.use(aim, () => {
      // Flies dodge a slow, telegraphed swat less than you'd think; a fast-moving fly sometimes escapes.
      if (target && flies.includes(target) && screenDist(target, ev) < reach && Math.random() > 0.2) {
        removeFly(target);
        catchFlies(1, target.mesh.position);
      } else if (target && screenDist(target, ev) < reach * 2) {
        target.anchor.x += (Math.random() - 0.5) * 3; // whoosh, missed: it zips off
        target.anchor.z += (Math.random() - 0.5) * 3;
        ui.toast('Missed!', 900);
      }
      return null;
    });
  }

  function placeTrap(point) {
    if (!trap) {
      trap = { mesh: makeTrap(), stuck: [] };
      pond.group.add(trap.mesh);
    }
    trap.mesh.position.copy(point);
    fx.dust(point.clone(), 0.6);
    setMode('pet');
    ui.toast('Sugar trap set. Flies nearby will get stuck in it. Tap it to empty it.', 2600);
  }

  function emptyTrap() {
    if (!trap?.stuck.length) {
      ui.toast('Nothing stuck in the trap yet.');
      return;
    }
    const n = trap.stuck.length;
    for (const f of trap.stuck) pond.group.remove(f.mesh);
    trap.stuck = [];
    catchFlies(n, trap.mesh.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
  }

  // ---- Pointer
  const groundHit = (ray) => ray.intersectObjects(pond.ground ?? [], false)[0];
  pond.input = {
    down(e, ray) {
      // Tapping the trap always empties it, whatever you're holding.
      if (trap && ray.intersectObject(trap.mesh, true).length) {
        emptyTrap();
        return true;
      }
      if (mode === 'swat') {
        track(e, ray, true);
        swatAt(e);
        return true;
      }
      if (mode === 'trap') {
        const hit = groundHit(ray);
        if (hit) placeTrap(hit.point);
        return true;
      }
      return false;
    },
    move(e, ray) {
      track(e, ray, false);
      return false;
    },
    up() {
      return mode !== 'pet';
    },
  };

  function track(e, ray, appearing) {
    const hit = groundHit(ray);
    if (hit) aim.copy(hit.point).add(new THREE.Vector3(0, 1.2, 0)); // flies are up in the air
    const unit = Math.min(window.innerWidth, window.innerHeight);
    state.x = e.clientX / unit;
    state.y = e.clientY / unit;
    if (appearing || !state.present) {
      state.lastX = state.x;
      state.lastY = state.y;
    }
    state.present = true;
  }
  window.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && !e.relatedTarget) state.present = false;
  });

  // ---- Every frame
  function update(dt, ray) {
    const inst = state.present ? Math.hypot(state.x - state.lastX, state.y - state.lastY) / Math.max(dt, 1e-3) : 0;
    state.speed += (inst - state.speed) * (1 - Math.exp(-dt * 10));
    state.lastX = state.x;
    state.lastY = state.y;
    const showSwatter = mode === 'swat' && state.present;
    swatter.update(dt, { present: showSwatter, target: aim, ray: ray.ray, speed: state.speed, camera });
    canvas.style.cursor = showSwatter ? 'none' : '';

    spawnIn -= dt;
    if (spawnIn <= 0) {
      spawnIn = 10 + Math.random() * 10;
      if (flies.length < MAX_FLIES) spawnFly();
    }

    for (const fly of [...flies]) {
      fly.update(dt);
      if (fly.stuck) continue;
      // Wander: every few seconds the fly picks a new spot. Often that's near a frog...
      fly.wanderIn -= dt;
      if (fly.wanderIn <= 0) {
        fly.wanderIn = 3 + Math.random() * 4;
        const frog = pond.frogs[Math.floor(Math.random() * pond.frogs.length)];
        const towards = frog && Math.random() < 0.4 ? frog.root.position : fly.anchor;
        fly.drift.set(towards.x + (Math.random() - 0.5) * 3, 0, towards.z + (Math.random() - 0.5) * 3);
      }
      // ...unless there's sugar nearby, which wins.
      if (trap && trap.stuck.length < TRAP_HOLDS && fly.anchor.distanceTo(trap.mesh.position) < TRAP_PULL) {
        fly.drift.copy(trap.mesh.position);
        fly.height += (0.35 - fly.height) * dt * 1.5;
        fly.radius += (0.1 - fly.radius) * dt * 1.5;
      }
      fly.anchor.x += (fly.drift.x - fly.anchor.x) * dt * 0.4;
      fly.anchor.z += (fly.drift.z - fly.anchor.z) * dt * 0.4;
      if (pond.land?.heightAt) fly.anchor.y = pond.land.heightAt(fly.anchor.x, fly.anchor.z);
      fly.anchor.y = Math.max(fly.anchor.y, -0.15);

      // Stuck in the syrup.
      const trapTop = trap && trap.mesh.position.clone().setY(trap.mesh.position.y + 0.45);
      if (trap && trap.stuck.length < TRAP_HOLDS && fly.mesh.position.distanceTo(trapTop) < 0.8) {
        removeFly(fly);
        fly.stuck = true;
        const a = trap.stuck.length * 1.3;
        fly.mesh.position.copy(trap.mesh.position).add(new THREE.Vector3(Math.cos(a) * 0.18, 0.32, Math.sin(a) * 0.18));
        trap.mesh.add(fly.mesh);
        fly.mesh.position.sub(trap.mesh.position);
        trap.stuck.push(fly);
        continue;
      }

      // Too close to a frog: snap!
      for (const frog of pond.frogs) {
        if (frog.hop || frog.tongue?.busy) continue;
        const d = Math.hypot(fly.mesh.position.x - frog.root.position.x, fly.mesh.position.z - frog.root.position.z);
        if (d < 1.9 && fly.mesh.position.y - frog.root.position.y < 2.2) {
          snapTongue(frog, fly, () => {
            removeFly(fly);
            frog.happiness = Math.min(1, frog.happiness + 0.6);
            frog.croak = 1.4;
            const entry = collection.get(frog.entryId);
            if (entry && performance.now() - ateToastAt > 8000) {
              ateToastAt = performance.now();
              ui.toast(`${entry.name} ate a fly.`, 1500);
            }
          });
          fly.stuck = true; // stops it flying while the tongue is out
          break;
        }
      }
    }
    for (const frog of pond.frogs) updateTongue(frog, dt);
    if (trap) for (const f of trap.stuck) f.update(dt);
  }

  return {
    update,
    enter() {
      bar.classList.add('show');
    },
    leave() {
      bar.classList.remove('show');
      state.present = false;
      canvas.style.cursor = '';
    },
    flies,
    setMode,
    spawnFly,
  };
}
