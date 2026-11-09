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
    const skin = this.mat('#e3b08a');
    const knuckle = this.mat('#d49d78');
    const sleeve = this.mat('#7c8a5a');
    this.skin = skin;

    // Everything hangs off `wrist` so the whole hand can tilt.
    this.wrist = new THREE.Group();
    this.group.add(this.wrist);

    const palm = new THREE.Mesh(blob(rng, { detail: 1, rough: 0.05, sx: 0.5, sy: 0.17, sz: 0.5 }), skin);
    this.wrist.add(palm);

    // Fingers: each is two stubby segments so it can curl.
    this.fingers = [];
    const fingerX = [-0.33, -0.11, 0.11, 0.32];
    const fingerLen = [0.42, 0.52, 0.5, 0.44];
    fingerX.forEach((x, i) => {
      const base = new THREE.Group();
      base.position.set(x, 0, 0.42);
      this.wrist.add(base);
      const seg1 = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, fingerLen[i] * 0.55, 2, 6).rotateX(Math.PI / 2), skin);
      seg1.position.z = fingerLen[i] * 0.3;
      base.add(seg1);
      const mid = new THREE.Group();
      mid.position.z = fingerLen[i] * 0.6;
      base.add(mid);
      const seg2 = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, fingerLen[i] * 0.4, 2, 6).rotateX(Math.PI / 2), knuckle);
      seg2.position.z = fingerLen[i] * 0.25;
      mid.add(seg2);
      this.fingers.push({ base, mid, spread: (x / 0.33) * 0.08 });
    });

    // Thumb, off to the side.
    this.thumb = new THREE.Group();
    this.thumb.position.set(0.46, -0.04, 0.05);
    this.wrist.add(this.thumb);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.32, 2, 6).rotateX(Math.PI / 2), skin);
    thumb.position.z = 0.22;
    this.thumb.add(thumb);

    // A short wrist and a rolled-up sleeve cuff, angled up and back towards you.
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.7, 7).rotateX(Math.PI / 2), skin);
    arm.position.set(0, -0.04, -0.62);
    this.wrist.add(arm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.45, 7).rotateX(Math.PI / 2), sleeve);
    cuff.position.set(0, -0.06, -1.1);
    this.wrist.add(cuff);
    this.wrist.scale.setScalar(1.35);

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
    this.wrist.rotation.z = -this.sway * 0.15;
    // -Y is into the screen (towards the target); +Z is up the screen.
    this.wrist.position.set(0, -reach * (this.hover - 0.55), lift * 1.2);
    // Fingers: relaxed and a bit splayed while hovering, curled shut on the grab.
    const curl = acting ? (p < s ? 0.2 + (p / s) * 0.4 : 1.3) : 0.2;
    for (const f of this.fingers) {
      f.base.rotation.set(curl * 0.8, f.spread * (1 - curl), 0);
      f.mid.rotation.x = curl;
    }
    this.thumb.rotation.set(curl * 0.4, 0.5 - curl * 0.6, 0);
  }
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
