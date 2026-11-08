import * as THREE from 'three';
import { mulberry32 } from '../rng.js';
import {
  Baker, makeWater, makeIsland, landClamper, grassClump, reedBed, rock, tree, log, leaningTree,
  distantBank, lilyPads, padSpots, signpost, swayMaterial, flatMaterial, WATER_Y,
} from '../world/props.js';

// The catching pond: wilder and bigger than home. A scatter of little islands, a log bridge,
// a huge old tree leaning over the water, thick reeds and lots of lily pads for wild frogs
// to sit on. A bit greener and mistier, so it feels like somewhere you go out to.
export function createCatchingPond() {
  const rng = mulberry32(17);
  const group = new THREE.Group();
  const bake = new Baker();

  const top = ['#8fae5c', '#82a352', '#9cb866'].map((c) => new THREE.Color(c));
  const side = new THREE.Color('#a48c5f');
  const islands = [
    makeIsland(rng, { x: 0, z: 0.5, radius: 3, phase: 2, top, side }), // where you arrive
    makeIsland(rng, { x: -6.6, z: -3.2, radius: 2.4, phase: 4, top, side }),
    makeIsland(rng, { x: 5.4, z: -4.2, radius: 2.1, phase: 0.5, top, side }),
    makeIsland(rng, { x: -1.5, z: -9.5, radius: 2.7, phase: 5.5, top, side }),
  ];
  for (const isl of islands) group.add(isl.mesh);

  const water = makeWater(
    { deep: '#4a8a7c', light: '#5c9a88', vein: '#82b8a2', shallow: '#78ac94', foam: '#dcebd6' },
    islands
  );
  group.add(water);

  const grass = ['#a9bf5e', '#86a346', '#bccb70'].map((c) => swayMaterial(c, { sway: 0.05 }));
  const reeds = ['#97b257', '#748f42', '#a9bd6a'].map((c) => swayMaterial(c, { sway: 0.035 }));
  const cattail = { stem: swayMaterial('#809b49', { sway: 0.012 }), head: swayMaterial('#6f4a2c', { sway: 0.012 }), leaf: reeds[0] };
  const rockMat = flatMaterial('#979484');
  const crown = ['#6c8f55', '#7b9a5e', '#8aa86a'].map((c) => flatMaterial(c));
  const trunk = flatMaterial('#6f5c45');

  // ---- Islands: shaggy grass rims, a few rocks.
  for (const isl of islands) {
    const rim = Math.round(isl.radius * 7);
    for (let i = 0; i < rim; i++) {
      const a = rng() * Math.PI * 2;
      const p = isl.clamp(new THREE.Vector3(isl.x + Math.cos(a) * 9, 0, isl.z + Math.sin(a) * 9), 0.15 + rng() * 0.5);
      grassClump(bake, rng, p.x, 0, p.z, { mats: grass, height: 0.7 + rng() * 0.6, count: 8 });
    }
    for (let i = 0; i < 2; i++) {
      const p = isl.randomSpot(rng, 0.7);
      rock(bake, rng, p.x, 0, p.z, rockMat, 0.7 + rng() * 0.8);
    }
  }

  // ---- A log bridge from the arrival island to the west island, and a log lying in the water.
  const logMat = flatMaterial(0xffffff, { vertexColors: true });
  const bark = new THREE.Color('#6f5a42');
  const moss = new THREE.Color('#8aa553');
  const bridgeFrom = new THREE.Vector3(-2.2, 0.05, -0.6);
  const bridgeTo = new THREE.Vector3(-4.9, 0.05, -2.3);
  log(bake, bridgeFrom, bridgeTo, { mat: logMat, bark, moss });
  const floatFrom = new THREE.Vector3(2.4, WATER_Y, -8.6);
  const floatTo = new THREE.Vector3(5.6, WATER_Y, -7.2);
  log(bake, floatFrom, floatTo, { mat: logMat, bark, moss, radius: 0.38 });

  // ---- The big leaning tree, roots in the shallows on the right.
  leaningTree(bake, rng, 9.5, -10, { crown, trunk, lean: -0.6, turn: 0.3, size: 0.75 });

  // ---- Reed beds all over the edges of the water.
  const reedSpots = [
    [-3.6, 2.6], [3.5, 1.9], [-9.4, -1], [-8.8, -5.6], [7.6, -2.6], [7.4, -5.8], [-4.2, -10.4],
    [1.4, -11.4], [-11, -8], [10.5, -6], [-1.8, -6], [3.5, -11.5],
  ];
  for (const [x, z] of reedSpots) {
    reedBed(bake, rng, x, WATER_Y, z, { cattails: 4 + Math.floor(rng() * 3), grass: 3, spread: 1.5, mats: { cattail, reeds } });
  }

  // ---- Background layers: grassy far banks, then lots of trees going back into the mist.
  distantBank(bake, rng, { from: Math.PI * 1.02, to: Math.PI * 1.98, dist: 17.5, mat: flatMaterial('#87a35a') });
  for (let i = 0; i < 40; i++) {
    const a = Math.PI * (1.04 + rng() * 0.92);
    const d = 16.5 + rng() * 3;
    grassClump(bake, rng, Math.cos(a) * d, 0, Math.sin(a) * d, { mats: reeds, height: 1.6, count: 9, spread: 1.2 });
  }
  for (let i = 0; i < 60; i++) {
    const a = Math.PI * (1.0 + rng() * 1.0);
    const d = 18 + rng() * 18;
    tree(bake, rng, Math.cos(a) * d, WATER_Y, Math.sin(a) * d, { crown, trunk, size: 1 + rng() * 0.6 });
  }
  // Side banks, so the edges of a wide screen aren't open water.
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 10; i++) {
      tree(bake, rng, sx * (16 + rng() * 6), WATER_Y, -2 + rng() * 10, { crown, trunk, size: 0.9 + rng() * 0.5 });
    }
  }

  bake.build(group);

  const pads = lilyPads(group, rng, padSpots(rng, 22, { minR: 2.5, maxR: 13, islands, centre: new THREE.Vector3(0, 0, -4) }), {
    mat: flatMaterial('#74a344'),
    flower: flatMaterial('#f6efd8', { side: THREE.DoubleSide }),
  });

  const sign = signpost('home pond', { flip: true });
  sign.position.set(-1.2, 0, 1.9);
  sign.rotation.y = 0.3;
  group.add(sign);

  const frogSpots = [
    ...islands.flatMap((isl, i) =>
      Array.from({ length: i === 0 ? 2 : 3 }, () => ({ position: isl.randomSpot(rng, 0.8), kind: 'land' }))
    ),
    { position: bridgeFrom.clone().lerp(bridgeTo, 0.5).setY(0.4), kind: 'log' },
    { position: floatFrom.clone().lerp(floatTo, 0.4).setY(0.25), kind: 'log' },
    ...pads.pads.map(({ pad }) => ({ position: pad.position.clone().setY(-0.07), kind: 'pad' })),
  ];

  return {
    name: 'catch',
    title: 'Catching pond',
    hint: 'Wild frogs live here · tap the signpost to go home',
    group,
    ground: islands.map((i) => i.mesh),
    water,
    islands,
    frogs: [],
    frogSpots,
    clampToLand: landClamper(islands),
    camera: { position: new THREE.Vector3(0, 8.6, 13.5), lookAt: new THREE.Vector3(0, 0, -3.5) },
    look: {
      haze: '#cdd8b2',
      fog: [3, 26],
      sky: 0xf4f0d2,
      groundLight: 0x46684a,
      sun: 0xffe2b4,
      sunPosition: new THREE.Vector3(-4, 10, 3),
      shadowSize: 13,
    },
    travel: [{ to: 'home', touch: sign.userData.touch }],
    update(dt, t) {
      pads.update(t);
    },
  };
}
