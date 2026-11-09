import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import {
  Baker, makeWater, landClamper, grassClump, reedBed, flowers, rock, tree, treeWall, bush, fern, wildflower,
  stump, mushrooms, mossyHut,
  lilyPads, padSpots, signpost, swayMaterial, flatMaterial,
} from '../world/props.js';
import { makeLakeLand } from '../world/terrain.js';

// The home pond: a calm round pond in a wide open meadow, with a little mossy hut on the
// shore. Lots of open grass for frogs to hop about on, walled in by thick woods all round.
export function createHomePond() {
  const rng = mulberry32(3);
  const group = new THREE.Group();
  const bake = new Baker();

  const land = makeLakeLand(rng, {
    x: 2, z: -11, radius: 9.5, phase: 1.2, meadow: 16, hills: 7,
    colors: {
      grass: ['#8fab55', '#98b45c', '#a3bc64', '#adc36c'],
      hill: ['#88a55a', '#93ad62', '#9fb66b'],
      bank: '#c2ab76',
      bed: '#4f7e66',
    },
  });
  group.add(land.mesh);

  const water = makeWater(
    { deep: '#5a9686', light: '#6aa592', vein: '#8fc2ad', shallow: '#86b79e', foam: '#e3eedb' },
    [land.shore]
  );
  group.add(water);

  const grass = ['#b3c662', '#93ae4c', '#c7cf7a'].map((c) => swayMaterial(c, { sway: 0.05 }));
  const reeds = ['#9fb75a', '#7f9c48'].map((c) => swayMaterial(c, { sway: 0.035 }));
  const cattail = { stem: swayMaterial('#86a04c', { sway: 0.012 }), head: swayMaterial('#7a5232', { sway: 0.012 }), leaf: reeds[0] };
  const rockMat = flatMaterial('#a39d86');
  const crown = ['#7b9a5a', '#8ba766', '#9cb372', '#6f8f52'].map((c) => flatMaterial(c));
  const trunk = flatMaterial('#7a6449');
  const groundAt = (x, z) => land.heightAt(x, z);

  // ---- The hut, on the left of the shore, door facing you.
  const hut = mossyHut(rng);
  const hutPos = new THREE.Vector3(-9, 0, -2.5);
  hut.position.copy(hutPos);
  hut.rotation.y = 0.6;
  group.add(hut);
  const step = hut.localToWorld(hut.userData.step.clone());
  stump(bake, rng, -5.2, 0.8, { bark: trunk, wood: flatMaterial('#d8c08e') });
  const stumpTop = new THREE.Vector3(-5.2, 0.58, 0.8);
  mushrooms(bake, rng, -11.2, 0, -0.6, { cap: flatMaterial('#c96f4a'), stem: flatMaterial('#efe6cf'), count: 4 });
  mushrooms(bake, rng, -6.6, 0, -4.4, { cap: flatMaterial('#d9b26a'), stem: flatMaterial('#efe6cf'), count: 2 });

  // ---- Reeds in a few clumps along the shore (not all the way round, so it stays open).
  for (const a of [-2.2, -1.9, -0.9, -0.6, 2.0, 0.3, 0.55, -1.25]) {
    const p = land.shorePoint(a, -0.3);
    reedBed(bake, rng, p.x, -0.15, p.z, { cattails: 3, grass: 2, spread: 1.4, mats: { cattail, reeds } });
  }

  // ---- The meadow: sparse grass clumps and flowers, so there's room to roam.
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2;
    const p = land.shorePoint(a, 0.4 + rng() * 15);
    if (p.distanceTo(hutPos) < 2.6) continue;
    grassClump(bake, rng, p.x, p.y, p.z, { mats: grass, height: 0.5 + rng() * 0.5, count: 5 + Math.floor(rng() * 4) });
  }
  // A ring of grass hugging the waterline.
  for (let i = 0; i < 40; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 0.2 + rng() * 0.6);
    grassClump(bake, rng, p.x, p.y, p.z, { mats: grass, height: 0.7, count: 6 });
  }
  const petal = flatMaterial('#f2e7a6');
  const petal2 = flatMaterial('#f4f1e4');
  const centre = flatMaterial('#d79a3c');
  for (let i = 0; i < 26; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 1.5 + rng() * 12);
    flowers(bake, rng, p.x, p.y, p.z, { petal: i % 2 ? petal : petal2, centre, stem: grass[1], count: 3 + Math.floor(rng() * 4) });
  }
  for (let i = 0; i < 6; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 0.3 + rng() * 10);
    rock(bake, rng, p.x, p.y, p.z, rockMat, 0.8 + rng() * 0.8);
  }

  // ---- The woods: a thick wall of trees all round the meadow, with open grass between it
  // and the pond. The bit behind the camera is left out so it never blocks the view.
  const behindCamera = (p) => p.z > 4 && Math.abs(p.x) < 18;
  treeWall(bake, rng, land, { from: 15.5, depth: 9, spacing: 1.7, crown, trunk, skip: behindCamera });
  for (let i = 0; i < 160; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 25 + rng() * 22);
    if (behindCamera(p)) continue;
    tree(bake, rng, p.x, p.y, p.z, { crown, trunk, size: 1 + rng() * 0.6 });
  }

  // ---- Undergrowth along the foot of the woods: bushes, berry bushes and ferns.
  const bushMats = ['#5f8240', '#6d8f48', '#7a9a4f'].map((c) => flatMaterial(c));
  const berries = flatMaterial('#b8434a');
  const fernMat = swayMaterial('#7fa04a', { sway: 0.04 });
  for (let i = 0; i < 110; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 13.8 + rng() * 2.4);
    if (behindCamera(p)) continue;
    if (rng() < 0.7) bush(bake, rng, p.x, p.y, p.z, { mats: bushMats, size: 0.9 + rng() * 0.7, berries: rng() < 0.15 ? berries : null });
    else fern(bake, rng, p.x, p.y, p.z, { mat: fernMat, size: 0.9 + rng() * 0.4 });
  }
  // A few bushes and ferns around the hut, and a couple by the water.
  for (const [x, z, kind] of [[-11.6, -3.4, 'bush'], [-10.8, -5.2, 'bush'], [-6.6, -4.4, 'fern'], [-11.8, -0.8, 'fern'], [-7.2, -5.6, 'berry']]) {
    if (kind === 'fern') fern(bake, rng, x, groundAt(x, z), z, { mat: fernMat });
    else bush(bake, rng, x, groundAt(x, z), z, { mats: bushMats, size: 0.9, berries: kind === 'berry' ? berries : null });
  }
  for (const a of [2.6, 0.9]) {
    const p = land.shorePoint(a, 1.2);
    bush(bake, rng, p.x, p.y, p.z, { mats: bushMats, size: 0.8 });
  }
  // Tall purple wildflowers here and there in the meadow.
  const bells = flatMaterial('#a98bc9');
  for (let i = 0; i < 12; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 2 + rng() * 10);
    wildflower(bake, rng, p.x, p.y, p.z, { petal: bells, stem: grass[1] });
  }

  bake.build(group);

  // ---- Lily pads, and the signpost to the catching pond (on the right).
  const pads = lilyPads(group, rng, padSpots(rng, 12, { minR: 1, maxR: 10, islands: [], lake: land, centre: land.centre }), {
    mat: flatMaterial('#7aa846'),
    flower: flatMaterial('#f3d6d8', { side: THREE.DoubleSide }),
  });

  const sign = signpost('catching pond');
  sign.position.set(6.5, 0, 1.5);
  sign.rotation.y = -0.35;
  group.add(sign);

  const meadowSpot = () => land.clamp(land.shorePoint(rng() * Math.PI * 2, 1.5 + rng() * 8), 1.2);
  const frogSpots = [
    ...Array.from({ length: 10 }, () => ({ position: meadowSpot(), kind: 'land' })),
    { position: stumpTop, kind: 'log' },
    { position: step, kind: 'land' },
    ...pads.pads.map(({ pad }) => ({ position: pad.position.clone().setY(-0.07), kind: 'pad' })),
  ];

  return {
    name: 'home',
    title: 'Home pond',
    hint: 'Tap the frog to poke it · rub it to pet it · tap the ground to hop · drag to look around',
    group,
    ground: [land.mesh],
    water,
    land,
    islands: [],
    frogs: [],
    frogSpots,
    clampToLand: landClamper([land]),
    camera: { position: new THREE.Vector3(0, 8.5, 13.5), lookAt: new THREE.Vector3(0, 0.5, -1.5), pan: 14 },
    look: {
      haze: '#ddd8b0',
      fog: [6, 45], // fog starts this far past the camera's distance, and is thick by the second
      sky: 0xfff1d0,
      groundLight: 0x4c6b46,
      sun: 0xffdca6,
      sunPosition: new THREE.Vector3(8, 14, 6),
      shadowSize: 16,
    },
    travel: [{ to: 'catch', touch: sign.userData.touch }],
    update(dt, t) {
      pads.update(t);
    },
  };
}
