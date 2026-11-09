import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import {
  Baker, makeWater, makeIsland, landClamper, grassClump, reedBed, rock, tree, treeWall, bush, fern, wildflower,
  log, leaningTree,
  flowers, lilyPads, padSpots, signpost, swayMaterial, flatMaterial, WATER_Y,
} from '../world/props.js';
import { makeLakeLand } from '../world/terrain.js';

// The catching pond: a big, wide pond out in the countryside, ringed by meadow and woods.
// Bigger and livelier than home: two little islands, reed beds along the banks, a log in
// the water, an old tree leaning out over the shore, and lots of lily pads for wild frogs.
export function createCatchingPond() {
  const rng = mulberry32(17);
  const group = new THREE.Group();
  const bake = new Baker();

  const land = makeLakeLand(rng, {
    x: 0, z: -18, radius: 16, phase: 4.1, meadow: 13, hills: 8,
    colors: {
      grass: ['#86a64f', '#90ae56', '#9bb65e', '#a6bd66'],
      hill: ['#7f9e55', '#8aa75c', '#96b066'],
      bank: '#bba371',
      bed: '#477a64',
    },
  });
  group.add(land.mesh);

  const top = ['#8fae5c', '#82a352', '#9cb866'].map((c) => new THREE.Color(c));
  const side = new THREE.Color('#a48c5f');
  const islands = [
    makeIsland(rng, { x: -7, z: -20, radius: 2.6, phase: 4, top, side }),
    makeIsland(rng, { x: 6.5, z: -13, radius: 1.8, phase: 0.5, top, side }),
  ];
  for (const isl of islands) group.add(isl.mesh);

  const water = makeWater(
    { deep: '#4a8a7c', light: '#5c9a88', vein: '#82b8a2', shallow: '#78ac94', foam: '#dcebd6' },
    [land.shore, ...islands],
    120
  );
  group.add(water);

  const grass = ['#a9bf5e', '#86a346', '#bccb70'].map((c) => swayMaterial(c, { sway: 0.05 }));
  const reeds = ['#97b257', '#748f42', '#a9bd6a'].map((c) => swayMaterial(c, { sway: 0.035 }));
  const cattail = { stem: swayMaterial('#809b49', { sway: 0.012 }), head: swayMaterial('#6f4a2c', { sway: 0.012 }), leaf: reeds[0] };
  const rockMat = flatMaterial('#979484');
  const crown = ['#6c8f55', '#7b9a5e', '#8aa86a', '#94b070'].map((c) => flatMaterial(c));
  const trunk = flatMaterial('#6f5c45');

  // ---- Islands: shaggy grass rims, a rock or two.
  for (const isl of islands) {
    const rim = Math.round(isl.radius * 7);
    for (let i = 0; i < rim; i++) {
      const a = rng() * Math.PI * 2;
      const p = isl.clamp(new THREE.Vector3(isl.x + Math.cos(a) * 9, 0, isl.z + Math.sin(a) * 9), 0.15 + rng() * 0.5);
      grassClump(bake, rng, p.x, 0, p.z, { mats: grass, height: 0.7 + rng() * 0.6, count: 8 });
    }
    const p = isl.randomSpot(rng, 0.7);
    rock(bake, rng, p.x, 0, p.z, rockMat, 0.8 + rng() * 0.6);
  }

  // ---- Reed beds in patches along the banks.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (rng() - 0.5) * 0.3;
    if (Math.abs(a - Math.PI / 2) < 0.35) continue; // leave the near bank open so you can see in
    const p = land.shorePoint(a, -0.4 - rng() * 0.6);
    reedBed(bake, rng, p.x, WATER_Y, p.z, { cattails: 3 + Math.floor(rng() * 3), grass: 3, spread: 2, mats: { cattail, reeds } });
  }
  for (let i = 0; i < 70; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 0.2 + rng() * 0.8);
    grassClump(bake, rng, p.x, p.y, p.z, { mats: grass, height: 0.8, count: 7 });
  }

  // ---- The meadow around the pond.
  for (let i = 0; i < 110; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 1 + rng() * 12);
    grassClump(bake, rng, p.x, p.y, p.z, { mats: grass, height: 0.5 + rng() * 0.6, count: 5 + Math.floor(rng() * 4) });
  }
  const petal = flatMaterial('#f4f1e4');
  const petal2 = flatMaterial('#c9b6e0');
  const centre = flatMaterial('#d79a3c');
  for (let i = 0; i < 24; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 1.5 + rng() * 10);
    flowers(bake, rng, p.x, p.y, p.z, { petal: i % 3 ? petal : petal2, centre, stem: grass[1], count: 3 + Math.floor(rng() * 4) });
  }
  for (let i = 0; i < 10; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 0.4 + rng() * 9);
    rock(bake, rng, p.x, p.y, p.z, rockMat, 0.7 + rng() * 1.2);
  }

  // ---- A log floating out in the water, and one lying on the bank.
  const logMat = flatMaterial(0xffffff, { vertexColors: true });
  const bark = new THREE.Color('#6f5a42');
  const moss = new THREE.Color('#8aa553');
  const floatFrom = new THREE.Vector3(-2.5, WATER_Y, -10);
  const floatTo = new THREE.Vector3(1.5, WATER_Y, -8.4);
  log(bake, floatFrom, floatTo, { mat: logMat, bark, moss, radius: 0.38 });
  const bankLog = [land.shorePoint(2.3, 2.5).setY(0.2), land.shorePoint(2.55, 2.2).setY(0.2)];
  log(bake, bankLog[0], bankLog[1], { mat: logMat, bark, moss, radius: 0.3 });

  // ---- The big old tree on the far right bank, leaning out over the water.
  const treeAt = land.shorePoint(-0.25, 1.4);
  leaningTree(bake, rng, treeAt.x, treeAt.z, { crown, trunk, lean: -0.45, turn: 0.2, size: 1, y: treeAt.y });

  // ---- Trees: a few out in the meadow, then woods on the hills all round.
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.6) continue;
    const p = land.shorePoint(a, 5 + rng() * 7);
    tree(bake, rng, p.x, p.y, p.z, { crown, trunk, size: 0.9 + rng() * 0.4 });
  }
  const behindCamera = (p) => p.z > 6 && Math.abs(p.x) < 22;
  treeWall(bake, rng, land, { from: 13.5, depth: 6, spacing: 2.4, crown, trunk, skip: behindCamera });
  for (let i = 0; i < 170; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 19 + rng() * 26);
    if (behindCamera(p)) continue;
    tree(bake, rng, p.x, p.y, p.z, { crown, trunk, size: 1 + rng() * 0.6 });
  }

  // ---- Undergrowth: bushes and ferns along the edge of the woods, some berry bushes, and
  // a few bushes and tall wildflowers dotted along the banks between the reed beds.
  const bushMats = ['#58793c', '#668a44', '#73944c'].map((c) => flatMaterial(c));
  const berries = flatMaterial('#3f4f8f');
  const fernMat = swayMaterial('#789b46', { sway: 0.04 });
  for (let i = 0; i < 120; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 11.5 + rng() * 2.5);
    if (behindCamera(p)) continue;
    if (rng() < 0.65) bush(bake, rng, p.x, p.y, p.z, { mats: bushMats, size: 0.9 + rng() * 0.8, berries: rng() < 0.2 ? berries : null });
    else fern(bake, rng, p.x, p.y, p.z, { mat: fernMat, size: 0.9 + rng() * 0.5 });
  }
  for (let i = 0; i < 22; i++) {
    const a = rng() * Math.PI * 2;
    if (Math.abs(a - Math.PI / 2) < 0.3) continue;
    const p = land.shorePoint(a, 1 + rng() * 2.5);
    if (rng() < 0.6) bush(bake, rng, p.x, p.y, p.z, { mats: bushMats, size: 0.7 + rng() * 0.5 });
    else fern(bake, rng, p.x, p.y, p.z, { mat: fernMat });
  }
  const bells = flatMaterial('#e8d36a');
  for (let i = 0; i < 16; i++) {
    const p = land.shorePoint(rng() * Math.PI * 2, 1.5 + rng() * 9);
    wildflower(bake, rng, p.x, p.y, p.z, { petal: bells, stem: grass[1] });
  }

  bake.build(group);

  const pads = lilyPads(group, rng, padSpots(rng, 30, { minR: 1, maxR: 17, islands, lake: land, centre: land.centre }), {
    mat: flatMaterial('#74a344'),
    flower: flatMaterial('#f6efd8', { side: THREE.DoubleSide }),
  });

  const sign = signpost('home pond', { flip: true });
  sign.position.set(-4, 0, 1.5);
  sign.rotation.y = 0.3;
  group.add(sign);

  const frogSpots = [
    ...Array.from({ length: 14 }, () => ({ position: land.clamp(land.shorePoint(rng() * Math.PI * 2, 1 + rng() * 6), 1), kind: 'land' })),
    ...islands.flatMap((isl) => Array.from({ length: 3 }, () => ({ position: isl.randomSpot(rng, 0.8), kind: 'land' }))),
    { position: floatFrom.clone().lerp(floatTo, 0.4).setY(0.25), kind: 'log' },
    { position: bankLog[0].clone().lerp(bankLog[1], 0.5).setY(0.5), kind: 'log' },
    ...pads.pads.map(({ pad }) => ({ position: pad.position.clone().setY(-0.07), kind: 'pad' })),
  ];

  return {
    name: 'catch',
    title: 'Catching pond',
    hint: 'Wild frogs live here · drag to look around · tap the signpost to go home',
    group,
    ground: [land.mesh, ...islands.map((i) => i.mesh)],
    water,
    land,
    islands,
    frogs: [],
    frogSpots,
    clampToLand: landClamper([land, ...islands]),
    camera: { position: new THREE.Vector3(0, 9.5, 12), lookAt: new THREE.Vector3(0, 0, -10), pan: 18 },
    look: {
      haze: '#d6dcb6',
      fog: [12, 60],
      sky: 0xf6f2d6,
      groundLight: 0x4a6b4a,
      sun: 0xffe2b4,
      sunPosition: new THREE.Vector3(-8, 16, 6),
      shadowSize: 22,
    },
    travel: [{ to: 'home', touch: sign.userData.touch }],
    update(dt, t) {
      pads.update(t);
    },
  };
}
