import * as THREE from 'three';
import { Frog } from './frog.js';
import { wildRecipes } from './roster.js';
import { flatMaterial } from './shapes.js';

// Catching: sneak up on a wild frog and grab it.
//
// Your hand is the pointer (with a finger, it's wherever you're touching). Wild frogs watch it.
// Move it fast near a frog and the frog gets nervous: it turns to face you, its eyes bulge,
// it trembles. Push it too far and it leaps away to another lily pad. Creep in slowly and
// grab (click, or lift your finger on it) while it's still calm, and it's yours.
//
// Lesson: this is a little "state machine". Each wild frog is always in one state
// (calm → nervous → fleeing, or caught), and the rules say what moves it between them.

const WILD_COUNT = 3; // how many wild frogs are out at once
const WILD_SCALE = 0.7;
const NOTICE_RADIUS = 4.2; // a frog only cares about your hand inside this distance
const GRAB_RADIUS = 1.0;
const CALM_GRAB = 0.6; // a grab works only while the frog's alert level is below this

export function setupCatching({ pond, collection, fx, ui, camera }) {
  const hand = createHandMarker();
  pond.group.add(hand.mesh);
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const handPos = new THREE.Vector3();
  // Hand speed is measured on screen (in screen-widths per second, using the short side),
  // so "slow" feels the same on a phone and a big monitor, near or far.
  const screen = { x: 0, y: 0, lastX: 0, lastY: 0 };
  const state = { present: false, speed: 0, pressed: false, appearedAt: 0 };
  const wild = []; // { frog, recipe, alert, wary, spot, caught }

  // ---- Spawning
  // Spots nobody is sitting on, that you can actually see on screen.
  const ndc = new THREE.Vector3();
  function freeSpots() {
    const taken = wild.map((w) => w.spot);
    return pond.frogSpots.filter((s) => {
      if (taken.includes(s)) return false;
      if (wild.some((w) => w.frog.root.position.distanceTo(s.position) < 1.8)) return false; // no frog piles
      ndc.copy(s.position).project(camera);
      return Math.abs(ndc.x) < 0.8 && ndc.y > -0.75 && ndc.y < 0.6;
    });
  }

  function spawnWild() {
    const present = new Set(wild.map((w) => w.recipe.id));
    const candidates = wildRecipes().filter((r) => !collection.has(r.id) && !present.has(r.id));
    while (wild.length < WILD_COUNT && candidates.length) {
      const recipe = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      // Mostly out in the open on lily pads and logs, sometimes tucked in the grass.
      const spots = freeSpots();
      const open = spots.filter((s) => s.kind !== 'land');
      const pool = open.length && Math.random() < 0.75 ? open : spots;
      const spot = pool[Math.floor(Math.random() * pool.length)];
      const frog = new Frog(recipe);
      frog.root.scale.setScalar(WILD_SCALE);
      frog.root.position.copy(spot.position);
      frog.heading = Math.random() * Math.PI * 2;
      // Wild frogs don't wander onto the land at random; they hop between nearby spots.
      frog.wander = () => hopToSpot(w, 1.5, 4.5, 0.7);
      const w = { frog, recipe, alert: 0, wary: 0, spot, caught: false };
      wild.push(w);
      pond.group.add(frog.root);
      pond.frogs.push(frog);
    }
    return wild.length;
  }

  function removeWild(w) {
    wild.splice(wild.indexOf(w), 1);
    pond.frogs.splice(pond.frogs.indexOf(w.frog), 1);
    pond.group.remove(w.frog.root);
  }

  // Hop to another free spot between minD and maxD away (falls back to the farthest free one).
  function hopToSpot(w, minD, maxD, height) {
    const here = w.frog.root.position;
    const spots = freeSpots();
    if (!spots.length) return false;
    let options = spots.filter((s) => {
      const d = s.position.distanceTo(here);
      return d >= minD && d <= maxD;
    });
    if (!options.length) options = [spots.reduce((a, b) => (a.position.distanceTo(here) > b.position.distanceTo(here) ? a : b))];
    const spot = options[Math.floor(Math.random() * options.length)];
    const dist = spot.position.distanceTo(here);
    if (!w.frog.hopTo(spot.position, height + dist * 0.12, 0.45 + dist * 0.06)) return false;
    w.spot = spot;
    return true;
  }

  // ---- Reactions
  function flee(w) {
    w.alert = 0.4;
    w.wary = 6; // jumpier for a while after a scare
    w.frog.surprise = 1;
    w.frog.squashSpring.v += 10; // a startled stretch
    fx.ripple(w.frog.root.position.clone().setY(-0.08), 0.8);
    hopToSpot(w, 4, 9, 1.6);
    ui.toast(pick([`${w.recipe.name} panicked and leapt away!`, `Too fast! ${w.recipe.name} fled.`, `${w.recipe.name} did not like that.`]));
  }

  function catchFrog(w) {
    w.caught = true;
    w.t = 0;
    w.from = w.frog.root.position.clone();
    const entry = collection.add(w.recipe);
    ui.toast(`You caught ${w.recipe.name}! Off to your home pond.`, 2600);
    ui.update();
    return entry;
  }

  function tryGrab(point) {
    const w = closestWild(point);
    if (!w || w.frog.root.position.distanceTo(point) > GRAB_RADIUS) return false;
    if (w.frog.hop) {
      ui.toast('Too slippery mid-hop!');
      return true;
    }
    if (w.alert < CALM_GRAB) catchFrog(w);
    else flee(w);
    return true;
  }

  function closestWild(point) {
    let best = null;
    for (const w of wild) {
      if (w.caught) continue;
      if (!best || w.frog.root.position.distanceTo(point) < best.frog.root.position.distanceTo(point)) best = w;
    }
    return best;
  }

  // ---- Pointer: the pond's input hook, which runs before the default poke/pet/hop.
  function moveHand(e, ray, appearing) {
    const unit = Math.min(window.innerWidth, window.innerHeight);
    screen.x = e.clientX / unit;
    screen.y = e.clientY / unit;
    const p = ray.ray.intersectPlane(groundPlane, new THREE.Vector3());
    if (!p) return;
    handPos.copy(p);
    if (appearing || !state.present) {
      // A hand popping up right next to a frog is a scare in itself.
      screen.lastX = screen.x;
      screen.lastY = screen.y;
      state.speed = 0;
      for (const w of wild) {
        const d = w.frog.root.position.distanceTo(handPos);
        if (d < 2.2) w.alert += (1 - d / 2.2) * 1.15 * (0.6 + w.recipe.skittish);
      }
    }
    state.present = true;
  }

  // Each returns true only when it did something, so taps elsewhere (like the signpost) still work.
  pond.input = {
    down(e, ray) {
      state.pressed = true;
      moveHand(e, ray, e.pointerType !== 'mouse');
      // With a mouse the hand is already there, so a click is the grab.
      return e.pointerType === 'mouse' ? tryGrab(handPos) : false;
    },
    move(e, ray) {
      if (e.pointerType === 'mouse' || state.pressed) moveHand(e, ray, false);
      return false;
    },
    up(e, ray) {
      state.pressed = false;
      if (e.pointerType === 'mouse') return false;
      // With a finger, lifting it over a frog is the grab; lifting it elsewhere just takes the hand away.
      moveHand(e, ray, false);
      state.present = false;
      return tryGrab(handPos);
    },
  };

  // Mouse leaving the window takes the hand away too.
  window.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && !e.relatedTarget) state.present = false;
  });

  // ---- Every frame
  function update(dt) {
    // How fast is the hand moving? Smoothed so one jittery frame doesn't spook everyone.
    const inst = state.present ? Math.hypot(screen.x - screen.lastX, screen.y - screen.lastY) / Math.max(dt, 1e-3) : 0;
    state.speed += (inst - state.speed) * (1 - Math.exp(-dt * 10));
    screen.lastX = screen.x;
    screen.lastY = screen.y;
    hand.update(dt, state.present, handPos, state.speed);

    for (const w of [...wild]) {
      const f = w.frog;
      if (w.caught) {
        // Lifted out of the pond, legs flailing, then gone with a puff.
        w.t += dt;
        f.root.position.copy(w.from).add(new THREE.Vector3(0, Math.min(1, w.t * 2.5) * 1.6, 0));
        f.wobble.v += Math.sin(w.t * 40) * 3;
        f.surprise = 1;
        if (w.t > 0.9) {
          fx.dust(f.root.position.clone().setY(f.root.position.y), 1.4);
          for (let i = 0; i < 3; i++) fx.heart(f.root.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
          removeWild(w);
          if (!spawnWild()) ui.toast('You caught every frog here, for now. New frogs come from the workshop.', 4000);
        }
        continue;
      }

      w.wary = Math.max(0, w.wary - dt);
      const d = state.present ? f.root.position.distanceTo(handPos) : Infinity;
      if (d < NOTICE_RADIUS && !f.hop) {
        const near = 1 - d / NOTICE_RADIUS;
        const jumpy = 0.6 + w.recipe.skittish + (w.wary > 0 ? 0.6 : 0);
        const calmSpeed = 0.9 - w.recipe.skittish * 0.45; // faster than this is "sudden"
        const rush = Math.max(0, state.speed - calmSpeed);
        w.alert += rush * near * jumpy * 3 * dt;
        // Even a slow hand right on top of it is a bit unnerving.
        if (d < 1.4) w.alert += 0.06 * jumpy * dt;
        // Nervous frogs turn to keep an eye on you.
        if (w.alert > 0.3) {
          const want = Math.atan2(handPos.x - f.root.position.x, handPos.z - f.root.position.z);
          f.heading = lerpAngle(f.heading, want, Math.min(1, dt * 3));
          f.idleTimer = Math.max(f.idleTimer, 2);
        }
      }
      w.alert = Math.max(0, w.alert - dt * (d < NOTICE_RADIUS ? 0.12 : 0.35));

      // Show it: bulging eyes, a tense crouch, trembling.
      f.surprise = Math.max(f.surprise, Math.min(1, w.alert * 1.2));
      if (w.alert > 0.45) f.wobble.v += (Math.random() - 0.5) * w.alert * 30 * dt * 10;
      w.frog.lookTarget.copy(state.present && d < NOTICE_RADIUS ? handPos : f.lookTarget);

      if (w.alert >= 1) flee(w);
    }
  }

  return {
    update,
    enter() {
      spawnWild();
      state.present = false;
      for (const w of wild) w.alert = 0;
      if (!wild.length) ui.toast('No wild frogs left to catch, for now.', 3000);
    },
    leave() {
      state.present = false;
    },
    wild,
  };
}

// The hand: a soft ring on the water under the pointer. It goes red-ish when you're
// moving fast enough to scare frogs, so you can learn what "slow" means.
function createHandMarker() {
  // It's drawn on top of everything (depthTest off) so grass and islands never hide it.
  const mat = flatMaterial('#fff6dc', { transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 20).rotateX(-Math.PI / 2), mat);
  mesh.renderOrder = 10;
  const calm = new THREE.Color('#fff6dc');
  const fast = new THREE.Color('#f08a6a');
  let opacity = 0;
  return {
    mesh,
    update(dt, present, pos, speed) {
      opacity += ((present ? 0.75 : 0) - opacity) * Math.min(1, dt * 10);
      mat.opacity = opacity;
      mesh.visible = opacity > 0.01;
      mesh.position.set(pos.x, 0.02, pos.z);
      mat.color.lerpColors(calm, fast, THREE.MathUtils.clamp((speed - 0.35) / 0.6, 0, 1));
      mesh.scale.setScalar(1 + Math.min(speed, 2) * 0.2);
    },
  };
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
