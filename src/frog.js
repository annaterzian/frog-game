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
  cheeks: '#f29a8f',
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

    // ---- Legs: chunky thighs at the back, little arms at the front.
    for (const side of [-1, 1]) {
      const thigh = add(new THREE.Mesh(blob(rng, { sx: 0.42, sy: 0.32, sz: 0.62 }), skin));
      thigh.position.set(side * 1.0 * plump, 0.28, -0.3);
      thigh.rotation.y = side * -0.35;
      const foot = add(new THREE.Mesh(blob(rng, { sx: 0.3, sy: 0.08, sz: 0.42 }), skin));
      foot.position.set(side * 1.12 * plump, 0.05, 0.12);
      foot.rotation.y = side * 0.4;
      const arm = add(new THREE.Mesh(blob(rng, { sx: 0.14, sy: 0.3, sz: 0.14 }), skin));
      arm.position.set(side * 0.62 * plump, 0.22, 0.72);
      arm.rotation.z = side * 0.25;
      const hand = add(new THREE.Mesh(blob(rng, { sx: 0.2, sy: 0.06, sz: 0.2 }), skin));
      hand.position.set(side * 0.7 * plump, 0.04, 0.86);
    }

    // ---- Eyes: big bulging sockets, white eyeballs, huge pupils with a shine.
    const r = 0.36 * recipe.eyeSize;
    this.eyes = [];
    for (const side of [-1, 1]) {
      const eye = new THREE.Group(); // scaled flat to blink
      eye.position.set(side * 0.5 * plump, 1.22, 0.42);
      this.squash.add(eye);
      const socket = add(new THREE.Mesh(blob(rng, { rough: 0.06 }), skin), eye);
      socket.scale.setScalar(r * 1.12);
      socket.position.y = -0.06;
      const ball = add(new THREE.Mesh(blob(rng, { detail: 2, rough: 0 }), flatMaterial(0xfbf8ee, { emissive: 0x4a4740 })), eye);
      ball.scale.setScalar(r);
      ball.position.set(side * 0.03, 0.04, 0.06);
      // The pupil sits on a pivot inside the eyeball, so turning the pivot moves the gaze.
      const pivot = new THREE.Group();
      pivot.position.copy(ball.position);
      eye.add(pivot);
      const pupil = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), flatMaterial(0x1d1a17));
      pupil.scale.set(r * 0.62, r * 0.62, r * 0.28);
      pupil.position.z = r * 0.76;
      pivot.add(pupil);
      const shine = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), flatMaterial(0xffffff, { emissive: 0xffffff, emissiveIntensity: 0.6 }));
      shine.scale.setScalar(r * 0.16);
      shine.position.set(r * 0.18, r * 0.2, r * 1.0);
      pivot.add(shine);
      // Happy eyes: a little upside-down U, shown instead of the eyeball while petted.
      const happy = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.035, 3, 10, Math.PI), flatMaterial(0x2b2a1f));
      happy.position.set(eye.position.x, eye.position.y - 0.02, eye.position.z + r * 1.05);
      happy.rotation.x = -0.3;
      happy.visible = false;
      this.squash.add(happy);
      this.eyes.push({ group: eye, pivot, pupil, happy, side });
    }

    // ---- Mouth: a wide, slightly dopey smile.
    const arc = Math.PI * 0.62;
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.028, 3, 14, arc), flatMaterial(0x2b2a1f));
    mouth.rotation.z = -Math.PI / 2 - arc / 2;
    mouth.position.set(0, 1.26, 0.98);
    mouth.rotation.x = -0.25;
    this.squash.add(mouth);

    // ---- Blush: only shows when the frog is happy.
    this.cheekMat = flatMaterial(recipe.cheeks, { transparent: true, opacity: 0 });
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(blob(rng, { rough: 0 }), this.cheekMat);
      cheek.scale.set(0.16, 0.09, 0.05);
      cheek.position.set(side * 0.7 * plump, 0.72, 0.88);
      cheek.rotation.y = side * 0.6;
      this.squash.add(cheek);
    }

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

  hopTo(point) {
    if (this.hop) return;
    this.startHop(point.clone(), 0.9, 0.55);
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
        this.root.position.y = Math.sin(p * Math.PI) * h.height;
        airborne = Math.sin(p * Math.PI);
      }
      if (p >= 1) {
        this.root.position.y = 0;
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

    // Eyes: blink now and then, close happily when petted, pupils follow the pointer.
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blink = 0.16;
      this.blinkTimer = 2 + this.rng() * 4;
    }
    this.blink = Math.max(0, this.blink - dt);
    const lid = this.blink > 0 ? 0.15 : this.isHappy ? 0.35 : 1;
    this.surprise = Math.max(0, this.surprise - dt * 1.5);
    this.happiness = Math.max(0, this.happiness - dt * 0.12);
    this.cheekMat.opacity = THREE.MathUtils.clamp((this.happiness - 0.2) * 2, 0, 0.9);

    const local = this.root.worldToLocal(tmp.copy(this.lookTarget));
    for (const eye of this.eyes) {
      eye.group.scale.y += (lid - eye.group.scale.y) * Math.min(1, dt * 25);
      eye.happy.visible = this.isHappy;
      eye.pivot.visible = !this.isHappy;
      const dx = local.x - eye.group.position.x;
      const dy = local.y - eye.group.position.y;
      const dz = Math.max(0.5, local.z - eye.group.position.z);
      // A little cross-eyed and dopey by default, that's the charm.
      const yaw = THREE.MathUtils.clamp(Math.atan2(dx, dz), -0.7, 0.7) + eye.side * 0.12;
      const pitch = THREE.MathUtils.clamp(Math.atan2(dy, dz), -0.5, 0.5);
      eye.pivot.rotation.y += (yaw - eye.pivot.rotation.y) * Math.min(1, dt * 10);
      eye.pivot.rotation.x += (-pitch - eye.pivot.rotation.x) * Math.min(1, dt * 10);
      const pupilSize = 1 - this.surprise * 0.45;
      eye.pupil.scale.x = eye.pupil.scale.y = 0.36 * this.recipe.eyeSize * 0.62 * pupilSize;
    }
  }
}

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
