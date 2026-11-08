import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import {
  Baker, makeWater, makeIsland, landClamper, grassClump, reedBed, flowers, rock, tree, stump,
  distantBank, lilyPads, padSpots, signpost, swayMaterial, flatMaterial, WATER_Y,
} from '../world/props.js';

// The home pond: one cosy, sunny island where your frogs live. Warmer and tidier than the
// catching pond, with a stump to sit on, flowers, and a signpost pointing to the wild.
export function createHomePond() {
  const rng = mulberry32(3);
  const group = new THREE.Group();
  const bake = new Baker();

  const island = makeIsland(rng, {
    radius: 4.2,
    phase: 1,
    top: ['#93b05a', '#9fbb62', '#8aa853'].map((c) => new THREE.Color(c)),
    side: new THREE.Color('#b59a68'),
  });
  group.add(island.mesh);

  const water = makeWater(
    { deep: '#5a9686', light: '#6aa592', vein: '#8fc2ad', shallow: '#86b79e', foam: '#e3eedb' },
    [island]
  );
  group.add(water);

  // ---- Materials, shared by everything baked below.
  const grass = ['#b3c662', '#93ae4c', '#c7cf7a'].map((c) => swayMaterial(c, { sway: 0.05 }));
  const reeds = ['#9fb75a', '#7f9c48'].map((c) => swayMaterial(c, { sway: 0.035 }));
  const cattail = { stem: swayMaterial('#86a04c', { sway: 0.012 }), head: swayMaterial('#7a5232', { sway: 0.012 }), leaf: reeds[0] };
  const rockMat = flatMaterial('#a39d86');
  const crown = ['#7b9a5a', '#8ba766', '#9cb372'].map((c) => flatMaterial(c));
  const trunk = flatMaterial('#7a6449');

  // ---- On the island: grass around the rim, a few clumps inside, flowers, rocks, a stump.
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2;
    const p = island.clamp(new THREE.Vector3(Math.cos(a) * 9, 0, Math.sin(a) * 9), 0.2 + rng() * 0.6);
    grassClump(bake, rng, p.x, 0, p.z, { mats: grass, height: 0.6 + rng() * 0.4 });
  }
  for (let i = 0; i < 8; i++) {
    const p = island.randomSpot(rng, 1.4);
    grassClump(bake, rng, p.x, 0, p.z, { mats: grass, height: 0.4, count: 4 });
  }
  const petal = flatMaterial('#f2e7a6');
  const petal2 = flatMaterial('#f4f1e4');
  const centre = flatMaterial('#d79a3c');
  for (let i = 0; i < 6; i++) {
    const p = island.randomSpot(rng, 0.8);
    flowers(bake, rng, p.x, 0, p.z, { petal: i % 2 ? petal : petal2, centre, stem: grass[1], count: 3 + Math.floor(rng() * 3) });
  }
  for (let i = 0; i < 4; i++) {
    const p = island.randomSpot(rng, 0.7);
    rock(bake, rng, p.x, 0, p.z, rockMat, 0.8 + rng() * 0.5);
  }
  const stumpSpot = new THREE.Vector3(-2.4, 0, -1.6);
  stump(bake, rng, stumpSpot.x, stumpSpot.z, { bark: trunk, wood: flatMaterial('#d8c08e') });

  // ---- Reeds and cattails along the back of the island and out in the water.
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + 0.3 + rng() * (Math.PI - 0.6);
    const d = 4.4 + rng() * 2.2;
    reedBed(bake, rng, Math.cos(a) * d, WATER_Y, Math.sin(a) * d, { cattails: 3, grass: 2, mats: { cattail, reeds } });
  }

  // ---- Background, in layers: a near bank, middle trees, far trees fading into the haze.
  distantBank(bake, rng, { from: Math.PI * 1.02, to: Math.PI * 1.98, dist: 14, mat: flatMaterial('#8fa960') });
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (1.05 + rng() * 0.9);
    const d = 13.5 + rng() * 2.5;
    grassClump(bake, rng, Math.cos(a) * d, 0, Math.sin(a) * d, { mats: reeds, height: 1.4, count: 8, spread: 1 });
  }
  for (let i = 0; i < 44; i++) {
    const a = Math.PI * (1.02 + rng() * 0.96);
    const d = 15 + rng() * 16;
    tree(bake, rng, Math.cos(a) * d, WATER_Y, Math.sin(a) * d, { crown, trunk, size: 0.9 + rng() * 0.5 });
  }
  distantBank(bake, rng, { from: 0.15, to: Math.PI - 0.15, dist: 22, height: 0.3, mat: flatMaterial('#9fb06c') });

  bake.build(group);

  // ---- Lily pads, and the signpost to the catching pond.
  const pads = lilyPads(group, rng, padSpots(rng, 10, { minR: 5.4, maxR: 11, islands: [island] }), {
    mat: flatMaterial('#7aa846'),
    flower: flatMaterial('#f3d6d8', { side: THREE.DoubleSide }),
  });

  const sign = signpost('catching pond');
  sign.position.set(3.0, 0, -1.9);
  sign.rotation.y = -0.35;
  group.add(sign);

  const frogSpots = [
    ...Array.from({ length: 6 }, () => ({ position: island.randomSpot(rng, 1.3), kind: 'land' })),
    { position: stumpSpot.clone().setY(0.58), kind: 'log' },
    ...pads.pads.map(({ pad }) => ({ position: pad.position.clone().setY(-0.07), kind: 'pad' })),
  ];

  return {
    name: 'home',
    title: 'Home pond',
    hint: 'Tap the frog to poke it · rub it to pet it · tap the ground to make it hop',
    group,
    ground: [island.mesh],
    water,
    islands: [island],
    frogs: [],
    frogSpots,
    clampToLand: landClamper([island]),
    camera: { position: new THREE.Vector3(0, 6.05, 11), lookAt: new THREE.Vector3(0, 0.7, 0) },
    look: {
      haze: '#ddd8b0',
      fog: [1, 23], // fog starts this far past the camera's distance, and is thick by the second
      sky: 0xfff1d0,
      groundLight: 0x4c6b46,
      sun: 0xffdca6,
      sunPosition: new THREE.Vector3(5, 9, 4),
      shadowSize: 6,
    },
    travel: [{ to: 'catch', touch: sign.userData.touch }],
    update(dt, t) {
      pads.update(t);
    },
  };
}
