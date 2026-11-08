import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { blob, colorFaces, flatMaterial } from './shapes.js';

// Everything that makes one frog look like itself. Later, the frog workshop will
// create and approve these recipes; for now there is one hand-picked frog.
export const FIRST_FROG = {
  name: 'Pip',
  seed: 11,
  body: '#86b04e',
  belly: '#efe3a8',
  spots: '#5d8a38',
  eyeMismatch: 0.15, // the right eye is this much smaller than the left
  plumpness: 1,
  eyeSize: 1,
};

const tmp = new THREE.Vector3();

export class Frog {
  constructor(recipe = FIRST_FROG) {
    this.recipe = recipe;
    const rng = mulberry32(recipe.seed);
    const bodyCol = new THREE.Color(recipe.body);
    const bellyCol = new THREE.Color(recipe.belly);
    const spotCol = new THREE.Color(recipe.spots);
    const skin = flatMaterial(bodyCol);
    const plump = recipe.plumpness;

    // root: where the frog stands and which way it faces.
    // squash: squash-and-stretch happens here, pivoting at the feet.
    this.root = new THREE.Group();
    this.squash = new THREE.Group();
    this.root.add(this.squash);
    this.parts = []; // meshes the pointer can touch

    const add = (mesh, parent = this.squash) => {
      mesh.castShadow = true;
      parent.add(mesh);
      this.parts.push(mesh);
      return mesh;
    };

    // ---- Body: a squat, lumpy blob with a pale belly and a few darker spots.
    const bodyGeo = blob(rng, { detail: 2, rough: 0.06, sx: 1.25 * plump, sy: 0.8, sz: 1.1 });
    const pos = bodyGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      // Flatten the bottom so it sits on the ground, and lift the front a little (the "face").
      let y = pos.getY(i);
      if (y < -0.35) y = -0.35 + (y + 0.35) * 0.35;
      y += Math.max(0, pos.getZ(i)) * 0.12;
      pos.setY(i, y);
    }
    bodyGeo.computeVertexNormals();
    const spotCentres = Array.from({ length: 5 }, () =>
      new THREE.Vector3((rng() - 0.5) * 1.8, 0.4 + rng() * 0.4, (rng() - 0.6) * 1.4)
    );
    colorFaces(bodyGeo, (c) => {
      if (c.y < -0.12 && c.z > -0.4) return bellyCol;
      if (spotCentres.some((s) => s.distanceTo(c) < 0.32)) return spotCol;
      return bodyCol;
    });
    this.body = add(new THREE.Mesh(bodyGeo, flatMaterial(0xffffff, { vertexColors: true })));
    this.body.position.y = 0.5;

    // ---- Throat pouch: hidden until the frog croaks.
    this.pouch = add(new THREE.Mesh(blob(rng, { detail: 1, rough: 0.05 }), flatMaterial(bellyCol)));
    this.pouch.position.set(0, 0.32, 0.72);
    this.pouch.scale.setScalar(0.01);

    // ---- Legs: big lumpy haunches at the back, stubby nubs at the front. No toes, no fuss.
    for (const side of [-1, 1]) {
      const haunch = add(new THREE.Mesh(blob(rng, { rough: 0.18, sx: 0.55, sy: 0.42, sz: 0.78 }), skin));
      haunch.position.set(side * 0.95 * plump, 0.3, -0.15);
      haunch.rotation.y = side * -0.25;
      const nub = add(new THREE.Mesh(blob(rng, { rough: 0.18, sx: 0.26, sy: 0.32, sz: 0.28 }), skin));
      nub.position.set(side * 0.66 * plump, 0.18, 0.7);
    }

    // ---- Eyes: mismatched, droopy-lidded, with tiny pupils that don't quite agree
    // on where to look. Each eye is a little different, which is what makes it look dumb.
    this.eyes = [];
    for (const side of [-1, 1]) {
      const sizeK = side < 0 ? 1 : 1 - recipe.eyeMismatch;
      const r = 0.36 * recipe.eyeSize * sizeK;
      const eye = new THREE.Group();
      eye.position.set(side * 0.5 * plump, 1.18 + (side < 0 ? 0.03 : -0.02), 0.42);
      this.squash.add(eye);
      const socket = add(new THREE.Mesh(blob(rng, { rough: 0.06 }), skin), eye);
      socket.scale.setScalar(r * 1.12);
      socket.position.y = -0.06;
      const ball = add(new THREE.Mesh(blob(rng, { detail: 2, rough: 0 }), flatMaterial(0xf1edd8, { emissive: 0x3a3830 })), eye);
      ball.scale.setScalar(r);
      ball.position.set(side * 0.03, 0.04, 0.06);
      // The pupil sits on a pivot inside the eyeball, so turning the pivot moves the gaze.
      const pivot = new THREE.Group();
      pivot.position.copy(ball.position);
      eye.add(pivot);
      const pupil = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), flatMaterial(0x1d1a17));
      pupil.position.z = r * 0.9;
      pivot.add(pupil);
      // Eyelid: a skin-coloured half dome over the eyeball. Rotating it forward closes the eye.
      const lidPivot = new THREE.Group();
      lidPivot.position.copy(ball.position);
      eye.add(lidPivot);
      const lid = add(
        new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), skin),
        lidPivot
      );
      lid.castShadow = false;
      const droop = side < 0 ? 0.15 : 0.35; // how heavy-lidded this eye is at rest
      this.eyes.push({ group: eye, pivot, pupil, lidPivot, r, droop, side, follow: side < 0 ? 1 : 0.35 });
    }

    // ---- Mouth: a long, flat, slightly crooked line. Not a smile, just... a mouth.
    const arc = 0.5;
    const mouthGeo = new THREE.TorusGeometry(2, 0.03, 3, 8, arc);
    mouthGeo.rotateZ(-Math.PI / 2 - arc / 2);
    mouthGeo.translate(0, 2, 0);
    const mouth = new THREE.Mesh(mouthGeo, flatMaterial(0x2b2a1f));
    mouth.position.set(0.06, 0.74, 1.05);
    mouth.rotation.set(-0.2, 0, 0.07);
    this.squash.add(mouth);

    // ---- Behaviour state
    this.time = 0;
    this.squashSpring = { x: 0, v: 0 }; // + is stretched tall, - is squashed flat
    this.wobble = { x: 0, v: 0 };
    this.lookTarget = new THREE.Vector3(0, 1, 10);
    this.happiness = 0; // rises while petted, fades slowly
    this.surprise = 0;
    this.blinkTimer = 2 + rng() * 3;
    this.blink = 0;
    this.croak = 0;
    this.idleTimer = 6;
    this.hop = null;
    this.heading = 0;
    this.rng = rng;
  }

  // ---- Things the player can do to the frog
  poke() {
    this.squashSpring.v -= 9;
    this.wobble.v += (this.rng() - 0.5) * 10;
    this.surprise = 1;
    this.idleTimer = 4;
    if (!this.hop) this.startHop(this.root.position.clone(), 0.45, 0.35);
  }

  pet(amount) {
    this.happiness = Math.min(1, this.happiness + amount);
    this.wobble.v += amount * 6 * (this.rng() < 0.5 ? -1 : 1);
    this.idleTimer = 5;
  }

  hopTo(point, height = 0.9, duration = 0.55) {
    if (this.hop) return false;
    this.startHop(point.clone(), height, duration);
    return true;
  }

  startHop(to, height, duration) {
    const from = this.root.position.clone();
    const dir = tmp.copy(to).sub(from);
    const turnTo = dir.lengthSq() > 0.01 ? Math.atan2(dir.x, dir.z) : this.heading;
    this.hop = { from, to, height, duration, t: -0.12, turnFrom: this.heading, turnTo };
    this.squashSpring.v -= 4; // crouch before jumping
  }

  get isHappy() {
    return this.happiness > 0.35;
  }

  update(dt, events) {
    this.time += dt;
    const t = this.time;

    // Springs: a value that wants to return to 0, overshoots, and settles. Great for jiggle.
    for (const [s, k, damp] of [[this.squashSpring, 180, 9], [this.wobble, 120, 7]]) {
      s.v += (-k * s.x - damp * s.v) * dt;
      s.x += s.v * dt;
    }

    // Hopping: turn, crouch, arc through the air, then splat on landing.
    let airborne = 0;
    if (this.hop) {
      const h = this.hop;
      h.t += dt;
      const p = THREE.MathUtils.clamp(h.t / h.duration, 0, 1);
      this.heading = lerpAngle(h.turnFrom, h.turnTo, THREE.MathUtils.clamp((h.t + 0.12) / 0.15, 0, 1));
      if (h.t > 0) {
        this.root.position.lerpVectors(h.from, h.to, p);
        // Take off from one height and land at another (lily pads sit a bit lower, logs higher).
        this.root.position.y += Math.sin(p * Math.PI) * h.height;
        airborne = Math.sin(p * Math.PI);
      }
      if (p >= 1) {
        this.root.position.y = h.to.y;
        this.squashSpring.v -= 7;
        this.hop = null;
        events.landed?.(this.root.position, h.height);
      }
    }

    // Left alone for a while, the frog does frog things.
    this.idleTimer -= dt;
    if (this.idleTimer <= 0 && !this.hop) {
      this.idleTimer = 4 + this.rng() * 6;
      if (this.rng() < 0.5) this.croak = 1.4;
      else events.wander?.(this);
    }

    // Croak: puff the throat pouch twice.
    if (this.croak > 0) {
      this.croak -= dt;
      const puff = Math.max(0, Math.sin(this.croak * Math.PI * 1.43 * 2));
      this.pouch.scale.set(0.42, 0.34, 0.36).multiplyScalar(0.02 + puff);
      if (this.croak <= 0) this.pouch.scale.setScalar(0.01);
    }

    // Squash and stretch, plus breathing.
    const breathe = Math.sin(t * 2.4) * 0.025;
    const s = this.squashSpring.x + airborne * 0.18 + breathe;
    this.squash.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    this.squash.rotation.z = this.wobble.x * 0.12 + (this.isHappy ? Math.sin(t * 7) * 0.06 * this.happiness : 0);
    this.squash.rotation.x = -airborne * 0.25;
    this.root.rotation.y = this.heading;

    // Eyes: blink now and then, get heavy-lidded and vacant when petted, pupils
    // (sort of) follow the pointer.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.18;
      this.blinkTimer = 2 + this.rng() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    this.surprise = Math.max(0, this.surprise - dt * 1.5);
    this.happiness = Math.max(0, this.happiness - dt * 0.12);

    const local = this.root.worldToLocal(tmp.copy(this.lookTarget));
    for (const eye of this.eyes) {
      // Lid angle: 0 covers the top half, positive closes further, negative opens.
      let lid = -0.75 + eye.droop - this.surprise * 0.9 + this.happiness * 0.8;
      if (this.blink > 0) lid = 1.5;
      eye.lidPivot.rotation.x += (lid - eye.lidPivot.rotation.x) * Math.min(1, dt * 20);
      eye.pupil.visible = eye.lidPivot.rotation.x < 0.1; // hidden once the lid is down over it

      const dx = local.x - eye.group.position.x;
      const dy = local.y - eye.group.position.y;
      const dz = Math.max(0.5, local.z - eye.group.position.z);
      // Slightly wall-eyed, and the smaller eye only half pays attention.
      const drift = Math.sin(this.time * 0.7 + eye.side) * 0.15 * (1 - eye.follow);
      const yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.7, 0.7) * eye.follow + eye.side * 0.3 + drift;
      // Pitch is capped low so the pupil never disappears up under the droopy lid.
      const pitch = THREE.MathUtils.clamp(Math.atan2(dy, dz), -0.5, 0.1) * eye.follow + (eye.side > 0 ? 0.12 : 0);
      eye.pivot.rotation.y += (yaw - eye.pivot.rotation.y) * Math.min(1, dt * 8);
      eye.pivot.rotation.x += (-pitch - eye.pivot.rotation.x) * Math.min(1, dt * 8);
      // Tiny pupils, even tinier when startled.
      const p = eye.r * (0.3 - this.surprise * 0.1);
      eye.pupil.scale.set(p, p, p * 0.5);
    }
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
