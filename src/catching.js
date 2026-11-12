import * as THREE from 'three';
import { Frog } from './frog.js';
import { wildRecipes } from './roster.js';
import { flatMaterial } from './shapes.js';
import { Hand, Net, holdPosition } from './tools.js';
import { Fly, snapTongue, updateTongue } from './flies.js';

// Catching: sneak up on a wild frog and grab it.
//
// You hold a tool: your hand for frogs on land, or a net for frogs out on the water.
// The tool follows your pointer (with a finger, it's wherever you're touching). Wild frogs
// watch it. Move it fast near a frog and the frog gets nervous: it turns to face you, its
// eyes bulge, it trembles. Push it too far and it leaps into the water and is gone for a
// while. Creep in slowly and grab or scoop while it's still calm, and it's yours.
//
// Reaching out with the hand, or swinging the net, startles a frog a little by itself, so
// you need it calm *before* you go for it. The net startles more than the hand.
//
// Fly bait: toss a fly from your jar and the nearest frog goes for it. While it chews, it
// hardly notices you, which makes it the easiest moment to catch it.
//
// Lesson: this is a little "state machine". Each wild frog is always in one state
// (calm → nervous → fleeing → gone, or caught), and the rules say what moves it between them.

const WILD_COUNT = 3; // how many wild frogs are out at once
const NOTICE_RADIUS = 4.2; // a frog only cares about your tool inside this distance
const REACH = { hand: 1.1, net: 1.4 }; // how close to a frog you have to aim
const STARTLE = { hand: 0.15, net: 0.3 }; // how much going for it adds to the frog's alarm
const CALM_GRAB = 0.6; // the catch works only while the frog's alarm is below this
const GONE_FOR = 150; // seconds a scared-off frog stays away
const WATER_Y = -0.15;
const CHEW_TIME = 5; // seconds a frog is distracted after eating bait
const BAIT_NOTICE = 9; // how far away a frog notices a tossed fly

export function setupCatching({ pond, collection, fx, ui, camera, canvas }) {
  const tools = { hand: new Hand(), net: new Net() };
  for (const t of Object.values(tools)) pond.group.add(t.group);
  let toolName = 'hand';
  const marker = createMarker();
  pond.group.add(marker.mesh);

  const aim = new THREE.Vector3(); // where on the ground/water the pointer points
  // Tool speed is measured on screen (in screen-widths per second, using the short side),
  // so "slow" feels the same on a phone and a big monitor, near or far.
  const screen = { x: 0, y: 0, lastX: 0, lastY: 0 };
  const state = { present: false, speed: 0, pressed: false, active: false, respawn: 4 };
  const wild = []; // { frog, recipe, alert, spot, inWater, fleeing, caught }
  const awayUntil = new Map(); // recipe id → time (ms) a scared frog may come back

  // ---- Toolbar
  const bar = document.createElement('div');
  bar.id = 'tools';
  bar.className = 'toolbar';
  bar.innerHTML =
    '<button type="button" data-tool="hand">✋ Hand</button>' +
    '<button type="button" data-tool="net">🥅 Net</button>' +
    '<button type="button" data-tool="bait">🪰 Fly bait <span></span></button>';
  document.body.appendChild(bar);
  const baitCount = bar.querySelector('[data-tool="bait"] span');
  const showBaitCount = () => (baitCount.textContent = `(${collection.flies})`);
  function selectTool(name) {
    toolName = name;
    for (const b of bar.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tool === name);
  }
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) selectTool(b.dataset.tool);
  });
  window.addEventListener('keydown', (e) => {
    if (!state.active || ui.naming) return;
    if (e.key === '1') selectTool('hand');
    if (e.key === '2') selectTool('net');
    if (e.key === '3') selectTool('bait');
  });
  selectTool('hand');

  // ---- Spawning
  // Spots nobody is sitting on, that you can actually see on screen.
  const ndc = new THREE.Vector3();
  function freeSpots() {
    return pond.frogSpots.filter((s) => {
      if (wild.some((w) => w.spot === s || w.frog.root.position.distanceTo(s.position) < 1.8)) return false;
      ndc.copy(s.position).project(camera);
      return Math.abs(ndc.x) < 0.8 && ndc.y > -0.7 && ndc.y < 0.55;
    });
  }
  // Lily pads and floating logs are "in the water" (net); the shore and islands are land (hand).
  const inWater = (spot) => spot.kind === 'pad' || (spot.kind === 'log' && !!pond.land?.inLake?.(spot.position));

  function spawnWild(fromWater = false) {
    const present = new Set(wild.map((w) => w.recipe.id));
    const now = performance.now();
    const candidates = wildRecipes().filter(
      (r) => !collection.has(r.id) && !present.has(r.id) && !(awayUntil.get(r.id) > now)
    );
    let added = 0;
    while (wild.length < WILD_COUNT && candidates.length) {
      const recipe = candidates.splice(Math.floor(Math.random() * candidates.length), 1)[0];
      const spots = freeSpots();
      if (!spots.length) break;
      // About half out on the water, half on land, so you need both tools.
      const wet = spots.filter(inWater);
      const dry = spots.filter((s) => !inWater(s));
      const pool = Math.random() < 0.5 ? wet : dry;
      const list = pool.length ? pool : spots;
      const spot = list[Math.floor(Math.random() * list.length)];
      const frog = new Frog(recipe);
      frog.root.position.copy(spot.position);
      frog.heading = Math.random() * Math.PI * 2;
      const w = { frog, recipe, alert: 0, spot, inWater: inWater(spot), fleeing: null, caught: false, chew: 0, chasing: null };
      // Wild frogs don't wander anywhere at random; they hop between nearby spots.
      frog.wander = () => !w.chasing && hopToSpot(w, 1.5, 4.5, 0.7);
      wild.push(w);
      pond.group.add(frog.root);
      pond.frogs.push(frog);
      if (fromWater) {
        // Climbs back out of the water with a splash.
        fx.ripple(spot.position.clone().setY(WATER_Y + 0.07), 0.9);
        frog.squashSpring.v += 8;
      }
      added++;
    }
    return added;
  }

  function removeWild(w) {
    wild.splice(wild.indexOf(w), 1);
    pond.frogs.splice(pond.frogs.indexOf(w.frog), 1);
    pond.group.remove(w.frog.root);
  }

  // Hop to another free spot between minD and maxD away.
  function hopToSpot(w, minD, maxD, height) {
    if (w.fleeing || w.caught) return false;
    const here = w.frog.root.position;
    const options = freeSpots().filter((s) => {
      const d = s.position.distanceTo(here);
      return d >= minD && d <= maxD;
    });
    if (!options.length) return false;
    const spot = options[Math.floor(Math.random() * options.length)];
    const dist = spot.position.distanceTo(here);
    if (!w.frog.hopTo(spot.position, (height + dist * 0.12) * w.frog.size * 1.4, 0.45 + dist * 0.06)) return false;
    w.spot = spot;
    w.inWater = inWater(spot);
    return true;
  }

  // ---- Reactions
  // Scared off: a panicked leap away from you into the water, a splash, and it's gone.
  function flee(w) {
    if (w.fleeing) return;
    const f = w.frog;
    const away = f.root.position.clone().sub(aim).setY(0);
    if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    away.normalize();
    let target = f.root.position.clone().addScaledVector(away, 3.2);
    // Prefer landing in the lake; if that direction is all land, dive towards the lake instead.
    if (pond.land?.inLake && !pond.land.inLake(target)) {
      const toLake = (pond.land.centre ?? new THREE.Vector3()).clone().sub(f.root.position).setY(0).normalize();
      target = f.root.position.clone().addScaledVector(toLake, 3.5);
    }
    target.y = WATER_Y - 0.1;
    f.hop = null;
    f.surprise = 1;
    f.squashSpring.v += 10; // a startled stretch
    f.hopTo(target, 2 * f.size, 0.6);
    w.fleeing = { t: 0, landed: false };
    w.alert = 1;
    awayUntil.set(w.recipe.id, performance.now() + GONE_FOR * 1000);
    ui.toast(pick(['It panicked and dove into the pond!', 'Too fast! It leapt away.', 'Splash! It did not like that.', 'Gone. It might come back later.']));
  }

  function tryCatch() {
    if (ui.naming) return true;
    if (toolName === 'bait') return tossBait();
    const tool = tools[toolName];
    if (tool.busy) return true;
    const w = closestWild(aim);
    const near = w && flatDist(w.frog.root.position, aim) < REACH[toolName] * 1.6;
    if (near && w.inWater && toolName === 'hand') {
      ui.toast("It's out on the water. You'll need the net.");
      return true;
    }
    if (near && !w.inWater && toolName === 'net') {
      ui.toast('The net is too clumsy on land. Use your hand.');
      return true;
    }
    // Swing or grab, even at nothing: the swing itself can spook frogs nearby.
    tool.use(w && near ? w.frog.root.position : aim, (target) => {
      for (const o of wild) {
        const d = flatDist(o.frog.root.position, target);
        const distracted = o.chew > 0 ? 0.3 : 1;
        if (d < 2.5 && !o.fleeing && !o.caught) o.alert += STARTLE[toolName] * (1 - d / 2.5) * (0.6 + o.recipe.skittish) * 1.5 * distracted;
      }
      if (!w || w.caught || w.fleeing) return null;
      if (flatDist(w.frog.root.position, target) > REACH[toolName] || w.frog.hop) return null; // it moved: a miss
      if (w.alert < CALM_GRAB) return grab(w);
      flee(w);
      return null;
    });
    return near || toolName === 'net';
  }

  // ---- Bait
  const baits = []; // { fly, t, eater }
  function tossBait() {
    if (!collection.useFly()) {
      ui.toast('Your fly jar is empty. Catch flies at home with the swatter or a sugar trap.', 3200);
      return true;
    }
    ui.update();
    showBaitCount();
    const fly = new Fly(aim, { radius: 0.25, height: 0.45 });
    pond.group.add(fly.mesh);
    const bait = { fly, t: 0, eater: null };
    baits.push(bait);
    fx.ripple(aim.clone().setY(Math.max(aim.y, WATER_Y) + 0.07), 0.4);
    let best = null;
    for (const w of wild) {
      if (w.fleeing || w.caught || w.chasing) continue;
      const d = flatDist(w.frog.root.position, aim);
      if (d < BAIT_NOTICE && (!best || d < flatDist(best.frog.root.position, aim))) best = w;
    }
    if (best) {
      bait.eater = best;
      best.chasing = bait;
      ui.toast('A frog noticed the fly...');
    } else ui.toast('No frog is close enough to notice it.');
    return true;
  }

  function removeBait(bait) {
    baits.splice(baits.indexOf(bait), 1);
    pond.group.remove(bait.fly.mesh);
    if (bait.eater?.chasing === bait) bait.eater.chasing = null;
  }

  // Hop to the free spot that gets closest to `point` (if it's actually closer).
  function hopTowards(w, point) {
    const here = w.frog.root.position;
    const now = flatDist(here, point);
    let best = null;
    for (const s of freeSpots()) {
      const d = flatDist(s.position, point);
      if (s.position.distanceTo(here) < 6 && d < now - 0.6 && (!best || d < flatDist(best.position, point))) best = s;
    }
    if (!best) return false;
    const dist = best.position.distanceTo(here);
    if (!w.frog.hopTo(best.position, (0.7 + dist * 0.12) * w.frog.size * 1.4, 0.45 + dist * 0.06)) return false;
    w.spot = best;
    w.inWater = inWater(best);
    return true;
  }

  function updateBaits(dt) {
    for (const bait of [...baits]) {
      bait.fly.update(dt);
      bait.t += dt;
      const w = bait.eater;
      if (w && (w.fleeing || w.caught)) bait.eater = null;
      if (bait.eater && !w.frog.hop && !w.frog.tongue?.busy && !bait.fly.stuck) {
        const d = flatDist(w.frog.root.position, bait.fly.mesh.position);
        if (d > 2.6 && hopTowards(w, bait.fly.mesh.position)) continue;
        if (d < 3.5) {
          bait.fly.stuck = true;
          snapTongue(w.frog, bait.fly, () => {
            removeBait(bait);
            w.chew = CHEW_TIME;
            w.alert = 0;
            ui.toast("It's chewing. Now's your chance!", 2200);
          });
        } else {
          bait.eater = null;
          w.chasing = null;
        }
      }
      if (!bait.eater && !bait.fly.stuck && bait.t > 8) {
        removeBait(bait); // got bored and buzzed off
      }
    }
  }

  function grab(w) {
    w.caught = true;
    w.frog.hop = null;
    return w;
  }

  // The tool has lifted the frog out: poof it off to the home pond, and ask for a name.
  async function deliver(w) {
    const pos = w.frog.root.position.clone();
    fx.dust(pos, 1.4);
    for (let i = 0; i < 3; i++) fx.heart(pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
    removeWild(w);
    const name = await ui.askName();
    collection.add(w.recipe, name);
    ui.update();
    ui.toast(`${name} is off to your home pond.`, 2600);
    if (!wild.length && !wildRecipes().some((r) => !collection.has(r.id))) {
      ui.toast('You caught every frog here, for now. New frogs come from the workshop.', 4000);
    }
  }

  function closestWild(point) {
    let best = null;
    for (const w of wild) {
      if (w.caught || w.fleeing) continue;
      if (!best || flatDist(w.frog.root.position, point) < flatDist(best.frog.root.position, point)) best = w;
    }
    return best;
  }

  // ---- Pointer: the pond's input hook, which runs before the default poke/pet/pan.
  const targets = () => [...pond.ground, pond.water];
  function moveTool(e, ray, appearing) {
    const unit = Math.min(window.innerWidth, window.innerHeight);
    screen.x = e.clientX / unit;
    screen.y = e.clientY / unit;
    const hit = ray.intersectObjects(targets(), false)[0];
    if (!hit) return;
    aim.copy(hit.point);
    if (hit.object === pond.water) aim.y = WATER_Y;
    if (appearing || !state.present) {
      // A hand popping up right next to a frog is a scare in itself.
      screen.lastX = screen.x;
      screen.lastY = screen.y;
      state.speed = 0;
      for (const w of wild) {
        const d = flatDist(w.frog.root.position, aim);
        if (d < 2.2) w.alert += (1 - d / 2.2) * 1.15 * (0.6 + w.recipe.skittish);
      }
    }
    state.present = true;
  }

  // Each returns true when catching used the event. A mouse drag on empty ground still pans
  // the camera; with a finger, dragging moves your hand instead (that's how you sneak).
  pond.input = {
    down(e, ray) {
      if (ui.naming) return true;
      state.pressed = true;
      const touch = e.pointerType !== 'mouse';
      moveTool(e, ray, touch);
      if (touch) return true;
      if (toolName === 'bait') return tryCatch();
      // With a mouse the tool is already there, so a click is the grab or swing.
      const w = closestWild(aim);
      if (w && flatDist(w.frog.root.position, aim) < REACH[toolName] * 1.6) return tryCatch();
      return false;
    },
    move(e, ray) {
      if (e.pointerType === 'mouse' || state.pressed) moveTool(e, ray, false);
      return e.pointerType !== 'mouse' && state.pressed;
    },
    up(e, ray) {
      const wasPressed = state.pressed;
      state.pressed = false;
      if (e.pointerType === 'mouse') return false;
      if (!wasPressed) return false;
      // With a finger, lifting it over a frog is the grab; lifting it elsewhere just takes the hand away.
      moveTool(e, ray, false);
      if (toolName === 'bait') {
        state.present = false;
        return tryCatch();
      }
      const w = closestWild(aim);
      const handled = w && flatDist(w.frog.root.position, aim) < REACH[toolName] * 1.6 ? tryCatch() : false;
      if (!tools[toolName].busy) state.present = false;
      // Let a plain tap fall through, so the signpost still works.
      return handled;
    },
  };

  // Mouse leaving the window takes the tool away too.
  window.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'mouse' && !e.relatedTarget) state.present = false;
  });

  // ---- Every frame
  function update(dt, ray) {
    // How fast is the tool moving? Smoothed so one jittery frame doesn't spook everyone.
    const inst = state.present ? Math.hypot(screen.x - screen.lastX, screen.y - screen.lastY) / Math.max(dt, 1e-3) : 0;
    state.speed += (inst - state.speed) * (1 - Math.exp(-dt * 10));
    screen.lastX = screen.x;
    screen.lastY = screen.y;

    // Only the selected tool shows (unless the other one is still finishing a swing).
    for (const [name, tool] of Object.entries(tools)) {
      const showing = toolName === 'net' ? 'net' : 'hand'; // bait is tossed by hand
      const held = tool.update(dt, { present: state.present && name === showing, target: aim, ray: ray.ray, speed: state.speed, camera });
      if (held) {
        // Carry the caught frog along with the hand or in the net, legs flailing.
        holdPosition(tool, held.frog.root.position);
        held.frog.root.position.y -= 0.6 * held.frog.size;
        held.frog.wobble.v += Math.sin(performance.now() * 0.04) * 3;
        held.frog.surprise = 1;
      }
      if (tool.released) {
        const w = tool.released;
        tool.released = null;
        deliver(w);
      }
    }
    marker.update(dt, state.present && !(tools[toolName]?.busy), aim, state.speed);
    updateBaits(dt);
    canvas.style.cursor = state.present ? 'none' : '';

    // Scared frogs come back after a while, climbing out of the water.
    state.respawn -= dt;
    if (state.respawn <= 0) {
      state.respawn = 4;
      if (wild.length < WILD_COUNT) spawnWild(true);
    }

    for (const w of [...wild]) {
      const f = w.frog;
      updateTongue(f, dt);
      if (w.caught) continue;
      if (w.fleeing) {
        // Leap, splash, sink out of sight.
        const fl = w.fleeing;
        if (!fl.landed && !f.hop) {
          fl.landed = true;
          fx.ripple(f.root.position.clone().setY(WATER_Y + 0.07), 1.2);
          fx.ripple(f.root.position.clone().setY(WATER_Y + 0.07), 0.6);
        }
        if (fl.landed) {
          fl.t += dt;
          f.root.position.y -= dt * 1.6;
          if (fl.t > 0.6) removeWild(w);
        }
        continue;
      }

      const d = state.present ? flatDist(f.root.position, aim) : Infinity;
      if (d < NOTICE_RADIUS && !f.hop) {
        const near = 1 - d / NOTICE_RADIUS;
        const jumpy = 0.6 + w.recipe.skittish;
        const calmSpeed = 0.9 - w.recipe.skittish * 0.45; // faster than this is "sudden"
        const rush = Math.max(0, state.speed - calmSpeed);
        const distracted = w.chew > 0 ? 0.25 : 1; // busy chewing: hardly notices you
        w.alert += rush * near * jumpy * 3 * dt * distracted;
        // Even a slow hand right on top of it is a bit unnerving.
        if (d < 1.4) w.alert += 0.06 * jumpy * dt * distracted;
        // Nervous frogs turn to keep an eye on you.
        if (w.alert > 0.3) {
          const want = Math.atan2(aim.x - f.root.position.x, aim.z - f.root.position.z);
          f.heading = lerpAngle(f.heading, want, Math.min(1, dt * 3));
          f.idleTimer = Math.max(f.idleTimer, 2);
        }
      }
      w.alert = Math.max(0, w.alert - dt * (d < NOTICE_RADIUS && w.chew <= 0 ? 0.12 : 0.35));
      if (w.chew > 0) {
        w.chew -= dt;
        f.squashSpring.v += Math.sin(performance.now() * 0.03) * 0.6; // munch munch
      }

      // Show it: bulging eyes and trembling.
      f.surprise = Math.max(f.surprise, Math.min(1, w.alert * 1.2));
      if (w.alert > 0.45) f.wobble.v += (Math.random() - 0.5) * w.alert * 300 * dt;
      if (state.present && d < NOTICE_RADIUS) f.lookTarget.copy(aim).setY(aim.y + 1);

      if (w.alert >= 1) flee(w);
    }
  }

  return {
    update,
    enter() {
      state.active = true;
      state.present = false;
      bar.classList.add('show');
      showBaitCount();
      const hint = document.getElementById('hint');
      if (hint) hint.textContent = 'Sneak up slowly · hand for frogs on land, net for frogs on the water · signpost goes home';
      spawnWild();
      for (const w of wild) w.alert = 0;
      if (!wild.length) ui.toast('The pond is quiet. Frogs will come back in a bit.', 3000);
    },
    leave() {
      for (const b of [...baits]) removeBait(b);
      state.active = false;
      state.present = false;
      bar.classList.remove('show');
      canvas.style.cursor = '';
    },
    selectTool,
    tools,
    wild,
  };
}

// A soft ring on the ground under the tool. It goes orange when you're moving fast enough
// to scare frogs, so you can learn what "slow" means.
function createMarker() {
  // Drawn on top of everything (depthTest off) so grass never hides it.
  const mat = flatMaterial('#fff6dc', { transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 20).rotateX(-Math.PI / 2), mat);
  mesh.renderOrder = 10;
  const calm = new THREE.Color('#fff6dc');
  const fast = new THREE.Color('#f08a6a');
  let opacity = 0;
  return {
    mesh,
    update(dt, present, pos, speed) {
      opacity += ((present ? 0.6 : 0) - opacity) * Math.min(1, dt * 10);
      mat.opacity = opacity;
      mesh.visible = opacity > 0.01;
      mesh.position.set(pos.x, pos.y + 0.03, pos.z);
      mat.color.lerpColors(calm, fast, THREE.MathUtils.clamp((speed - 0.35) / 0.6, 0, 1));
      mesh.scale.setScalar(1 + Math.min(speed, 2) * 0.2);
    },
  };
}

function flatDist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
