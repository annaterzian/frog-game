import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { blob, flatMaterial } from './shapes.js';

// Catching tools: a hand for frogs on land and a net for frogs out on the water.
//
// Each tool hangs in the air along the line from the camera through your pointer, so on
// screen it sits right under your cursor, pointing at the spot you're aiming at.
// Lesson: in 3D the cursor isn't a point, it's a ray going into the screen. Anything placed
// along that ray lines up with the cursor, however near or far it is.
//
// A tool's local space: +Z points away from you (towards the target), +Y is up.

const tmpDir = new THREE.Vector3();
const tmpPos = new THREE.Vector3();

class Tool {
  constructor({ hover, strikeAt, duration }) {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.hover = hover; // how far back along the ray from the target it floats
    this.strikeAt = strikeAt; // 0..1 point in the action when it reaches the target
    this.duration = duration;
    this.action = null; // { t, target, onStrike, struck, holding }
    this.opacity = 0;
    this.yaw = 0;
    this.sway = 0;
    this.materials = [];
  }

  mat(color, extra) {
    const m = flatMaterial(color, { transparent: true, ...extra });
    this.materials.push(m);
    return m;
  }

  get busy() {
    return !!this.action;
  }

  // Start the grab or swing. onStrike(target) runs at the moment the tool reaches the target
  // and returns the frog it caught (or nothing), which then gets carried away.
  use(target, onStrike) {
    if (this.action) return false;
    this.action = { t: 0, target: target.clone(), onStrike, struck: false, holding: null };
    return true;
  }

  update(dt, { present, target, ray, speed, camera }) {
    // Fade in when the pointer is over the pond, out when it leaves.
    const show = present || this.action;
    this.opacity += ((show ? 1 : 0) - this.opacity) * Math.min(1, dt * 12);
    for (const m of this.materials) m.opacity = this.opacity * (m.userData.alpha ?? 1);
    this.group.visible = this.opacity > 0.02;

    // Point away from the camera, flat on the ground plane.
    tmpDir.copy(ray.direction).setY(0).normalize();
    const yaw = Math.atan2(tmpDir.x, tmpDir.z);
    this.yaw = lerpAngle(this.yaw, yaw, Math.min(1, dt * 15));
    // Moving fast makes the tool lag and tilt a bit, which also shows you're being clumsy.
    this.sway += (Math.min(speed, 2) - this.sway) * Math.min(1, dt * 8);

    let p = 0;
    let aim = target;
    if (this.action) {
      const a = this.action;
      a.t += dt / this.duration;
      p = Math.min(1, a.t);
      aim = a.target;
      if (!a.struck && p >= this.strikeAt) {
        a.struck = true;
        a.holding = a.onStrike(a.target) || null;
      }
      if (p >= 1) {
        this.action = null;
        this.released = a.holding;
        p = 0;
      }
    }
    // Hover position: back along the ray from the target. During an action, aim stays fixed.
    tmpPos.copy(ray.direction).multiplyScalar(-this.hover).add(aim);
    this.group.position.copy(tmpPos);
    if (this.facesCamera && camera) faceCamera(this.group, ray.direction, camera);
    else this.group.rotation.set(0, this.yaw, 0);
    this.pose(p, this.action, dt);
    return this.action?.holding ?? null;
  }
}

// ---------------------------------------------------------------------------
// The hand: a chunky low-poly human hand in a rolled-up sleeve. You see the back of it,
// fingers pointing up the screen, like a cursor; grabbing reaches into the screen.
// In hand space: +Z is the fingers (screen up), +Y is the back of the hand (towards you).
export class Hand extends Tool {
  constructor() {
    super({ hover: 1.6, strikeAt: 0.35, duration: 1.1 });
    this.facesCamera = true;
    const rng = mulberry32(5);
    const skin = this.mat('#e2c1a4');
    const nail = this.mat('#eedccb'); // pale fingertips
    this.skin = skin;

    // Everything hangs off `wrist` so the whole hand can tilt.
    this.wrist = new THREE.Group();
    this.group.add(this.wrist);

    // Palm: a flattened, faceted ball. It's tapered towards the wrist, a bit squared off at
    // the sides and domed on the back. Every vertex is nudged slightly so the triangles catch
    // the light unevenly, like a hand-made low-poly model.
    const palmGeo = new THREE.IcosahedronGeometry(1, 1);
    shapeVertices(palmGeo, (v) => {
      const k = (v.z + 1) / 2; // 0 at the wrist, 1 at the knuckles
      const x = Math.sign(v.x) * Math.abs(v.x) ** 0.7;
      const z = Math.sign(v.z) * Math.abs(v.z) ** 0.75;
      const y = v.y * 0.15 + (v.y > 0 ? 0.035 * (1 - x * x) : 0);
      v.set(x * 0.46 * (0.8 + 0.2 * k), y, z * 0.52).add(jitter(v, 0.015));
    });
    this.wrist.add(new THREE.Mesh(palmGeo, skin));

    // The fleshy pad at the base of the thumb.
    const pad = new THREE.Mesh(blob(rng, { detail: 0, rough: 0.08, sx: 0.2, sy: 0.13, sz: 0.3 }), skin);
    pad.position.set(0.33, -0.05, -0.12);
    pad.rotation.y = 0.3;
    this.wrist.add(pad);

    // Fingers: three tapered segments each (so they can curl), a knuckle bump, a pale nail.
    // Index is next to the thumb; the pinky is short and a bit lower down.
    this.fingers = [];
    const fingerSpec = [
      { x: 0.31, z: 0.47, len: 0.74, r: 0.1, splay: 0.16 },
      { x: 0.105, z: 0.51, len: 0.83, r: 0.104, splay: 0.04 },
      { x: -0.105, z: 0.49, len: 0.78, r: 0.1, splay: -0.08 },
      { x: -0.3, z: 0.42, len: 0.6, r: 0.09, splay: -0.22 },
    ];
    for (const f of fingerSpec) {
      const lens = [f.len * 0.45, f.len * 0.3, f.len * 0.25];
      const radii = [f.r, f.r * 0.92, f.r * 0.85, f.r * 0.72];
      const base = new THREE.Group();
      base.position.set(f.x, 0.01, f.z);
      this.wrist.add(base);
      const knuckle = new THREE.Mesh(new THREE.IcosahedronGeometry(f.r * 0.85, 0), skin);
      knuckle.position.set(0, 0.03, -0.02);
      base.add(knuckle);
      let parent = base;
      const joints = [base];
      lens.forEach((len, i) => {
        if (i > 0) {
          const joint = new THREE.Group();
          joint.position.z = lens[i - 1];
          parent.add(joint);
          parent = joint;
          joints.push(joint);
        }
        parent.add(new THREE.Mesh(segmentGeo(len, radii[i], radii[i + 1], rng), skin));
      });
      // Rounded fingertip and nail on the last segment.
      const tip = new THREE.Mesh(new THREE.IcosahedronGeometry(radii[3], 0), nail);
      tip.scale.set(1, 0.85, 1.1);
      tip.position.z = lens[2];
      parent.add(tip);
      this.fingers.push({ base, mid: joints[1], tip: joints[2], spread: f.splay });
    }

    // Thumb: two segments, angled out to the side.
    this.thumb = new THREE.Group();
    this.thumb.position.set(0.4, -0.03, -0.12);
    this.wrist.add(this.thumb);
    this.thumb.add(new THREE.Mesh(segmentGeo(0.34, 0.11, 0.095, rng), skin));
    this.thumbTip = new THREE.Group();
    this.thumbTip.position.z = 0.34;
    this.thumb.add(this.thumbTip);
    this.thumbTip.add(new THREE.Mesh(segmentGeo(0.28, 0.095, 0.075, rng), skin));
    const thumbEnd = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), nail);
    thumbEnd.position.z = 0.28;
    this.thumbTip.add(thumbEnd);

    // Wrist and forearm, running down the screen: narrow at the wrist, widening a little.
    const armGeo = new THREE.CylinderGeometry(0.22, 0.3, 1.7, 8, 2).rotateX(-Math.PI / 2).translate(0, 0, -0.85);
    shapeVertices(armGeo, (v) => v.set(v.x * 1.15, v.y * 0.75, v.z).add(jitter(v, 0.02)));
    const arm = new THREE.Mesh(armGeo, skin);
    arm.position.set(0, -0.02, -0.36);
    arm.rotation.x = -0.35; // the forearm angles away from you, into the scene
    this.wrist.add(arm);
    this.wrist.scale.setScalar(1.15);

    this.holdPoint = new THREE.Vector3(0, -0.45, 0.35); // where a grabbed frog sits, in hand space
    this.group.traverse((o) => {
      o.castShadow = o.isMesh;
      o.renderOrder = 20; // drawn after the ground ring, so the ring never shows through the hand
    });
  }

  pose(p, acting) {
    // 0 → strike: reach into the screen onto the target; strike → 1: pull back up, fist closed.
    const s = this.strikeAt;
    const reach = p < s ? easeIn(p / s) : 1 - easeOut((p - s) / (1 - s));
    const lift = p > s ? easeOut((p - s) / (1 - s)) : 0;
    this.wrist.rotation.x = 0.15 + this.sway * 0.2 + reach * 0.25;
    // Turned a little, so the fingers point up and to the right like a reaching hand.
    this.wrist.rotation.y = -0.3;
    this.wrist.rotation.z = -this.sway * 0.15;
    // -Y is into the screen (towards the target); +Z is up the screen.
    this.wrist.position.set(0, -reach * (this.hover - 0.55), lift * 1.2);
    // Fingers: relaxed, slightly spread and a little bent while hovering; curled shut on the grab.
    const curl = acting ? (p < s ? 0.2 + (p / s) * 0.35 : 1.2) : 0.2;
    for (const f of this.fingers) {
      f.base.rotation.set(curl * 0.7, f.spread * (1.2 - curl), 0);
      f.mid.rotation.x = curl * 1.1;
      f.tip.rotation.x = curl * 0.8;
    }
    this.thumb.rotation.set(curl * 0.5, 1.0 - curl * 0.9, 0);
    this.thumbTip.rotation.set(curl * 0.6, -0.1, 0);
  }
}

// A tapered tube from z=0 to z=len, six-sided, with a little unevenness so it reads as
// low-poly flesh rather than a perfect cylinder.
function segmentGeo(len, r0, r1, rng) {
  const g = new THREE.CylinderGeometry(r1, r0, len, 6, 1).rotateX(Math.PI / 2).translate(0, 0, len / 2);
  g.rotateZ(rng() * 0.5);
  g.scale(1, 0.88, 1);
  return g;
}

// Run `fn` on every vertex position (as a Vector3) and write it back.
function shapeVertices(geo, fn) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn(v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
}

// A small offset that depends only on where a vertex is, so the copies of a shared corner
// (box faces each have their own) move together and the surface stays closed.
function jitter(v, amount) {
  const h = (n) => {
    const x = Math.sin(v.x * 127.1 + v.y * 311.7 + v.z * 74.7 + n) * 43758.5453;
    return (x - Math.floor(x) - 0.5) * 2 * amount;
  };
  return new THREE.Vector3(h(1), h(2), h(3));
}

// ---------------------------------------------------------------------------
// The net: a wooden hoop with a baggy mesh and a long handle. You swing it down over
// a frog and scoop. Later there can be different nets (bigger hoops, longer handles, ...).
export class Net extends Tool {
  constructor({ radius = 0.8 } = {}) {
    super({ hover: 2.4, strikeAt: 0.4, duration: 1.2 });
    this.radius = radius;
    const wood = this.mat('#8a6a46');
    const rim = this.mat('#6f5236');
    const mesh = this.mat('#efe7cf', { wireframe: true });
    const fill = this.mat('#efe7cf', { side: THREE.DoubleSide, depthWrite: false });
    fill.userData.alpha = 0.25;

    this.head = new THREE.Group(); // pivot at the end of the handle
    this.group.add(this.head);

    const hoop = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05, 4, 14).rotateX(Math.PI / 2), rim);
    hoop.position.z = radius;
    this.head.add(hoop);
    const bagGeo = new THREE.ConeGeometry(radius * 0.95, radius * 1.4, 10, 3, true).rotateX(Math.PI);
    bagGeo.translate(0, -radius * 0.7, radius);
    // Make it saggy: pull the bottom back a little.
    const pos = bagGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, pos.getZ(i) + Math.min(0, pos.getY(i)) * 0.35);
    bagGeo.computeVertexNormals();
    this.head.add(new THREE.Mesh(bagGeo, mesh));
    this.head.add(new THREE.Mesh(bagGeo, fill));

    // The handle leaves the back of the hoop and rises towards you, like you're holding it up.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.075, 3.4, 6).rotateX(Math.PI / 2), wood);
    handle.rotation.x = -0.6;
    handle.position.set(0, Math.sin(0.6) * 1.7, -Math.cos(0.6) * 1.7);
    this.head.add(handle);
    this.holdPoint = new THREE.Vector3(0, -radius * 0.7, radius);
    this.group.traverse((o) => {
      o.castShadow = o.isMesh && o.material !== fill && o.material !== mesh;
      o.renderOrder = 20;
    });
  }

  pose(p) {
    // Hovering: hoop held up and tilted towards you. Swing: whip down flat onto the target,
    // drag through, then lift up with the catch hanging in the bag.
    const s = this.strikeAt;
    const swing = p < s ? easeIn(p / s) : 1;
    const back = p > s ? easeOut((p - s) / (1 - s)) : 0;
    this.head.rotation.x = -0.45 + this.sway * 0.2 + swing * 0.9 - back * 1.6;
    this.head.rotation.z = this.sway * 0.15;
    this.head.position.set(0, 1.1 - swing * 1.5 + back * 2.2, -this.radius + swing * 0.9 * (1 - back) + 0.9 * 0);
  }
}

// ---------------------------------------------------------------------------
// The fly swatter: a wire handle and a square mesh paddle, seen face on like the hand.
// A swat flicks the paddle into the screen.
export class Swatter extends Tool {
  constructor() {
    super({ hover: 1.2, strikeAt: 0.3, duration: 0.45 });
    this.facesCamera = true;
    const paddleMat = this.mat('#d9583f');
    const holes = this.mat('#a8402c', { wireframe: true });
    const handleMat = this.mat('#e8d8a8');
    this.pivot = new THREE.Group(); // at the bottom of the handle, like a wrist
    this.pivot.position.z = -1.0;
    this.group.add(this.pivot);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.0, 5).rotateX(Math.PI / 2), handleMat);
    handle.position.z = 0.5;
    this.pivot.add(handle);
    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.03, 0.62), paddleMat);
    paddle.position.z = 1.3;
    this.pivot.add(paddle);
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5, 4, 4).rotateX(-Math.PI / 2), holes);
    grid.position.set(0, 0.02, 1.3);
    this.pivot.add(grid);
    this.group.traverse((o) => (o.renderOrder = 20));
  }

  pose(p) {
    // Wind back slightly towards you, then slap forward into the screen, then recover.
    const s = this.strikeAt;
    const flick = p < s ? Math.sin((p / s) * Math.PI * 0.5) : 1 - easeOut((p - s) / (1 - s));
    this.pivot.rotation.x = -0.2 + this.sway * 0.2 + flick * 1.2;
    this.pivot.rotation.z = -this.sway * 0.15;
  }
}

// Where a carried frog should be this frame, in world space.
export function holdPosition(tool, out = new THREE.Vector3()) {
  const anchor = tool instanceof Hand ? tool.wrist : tool.head;
  return anchor.localToWorld(out.copy(tool.holdPoint));
}

function easeIn(t) {
  return t * t;
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// Turn `obj` so its +Y faces the camera and its +Z points up the screen.
const bx = new THREE.Vector3();
const by = new THREE.Vector3();
const bz = new THREE.Vector3();
const basis = new THREE.Matrix4();
function faceCamera(obj, dir, camera) {
  by.copy(dir).negate();
  bz.setFromMatrixColumn(camera.matrixWorld, 1); // the camera's up
  bz.addScaledVector(by, -bz.dot(by)).normalize();
  bx.crossVectors(by, bz);
  basis.makeBasis(bx, by, bz);
  obj.quaternion.setFromRotationMatrix(basis);
}
