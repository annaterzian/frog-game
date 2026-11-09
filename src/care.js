import * as THREE from 'three';
import { Frog } from './frog.js';
import { recipeById } from './roster.js';
import { bondLevelName } from './collection.js';

// Care in the home pond: every frog you've caught lives here, and petting them grows a bond.
//
// The home pond's frogs are rebuilt from the saved collection each time you arrive, so the
// collection (not the 3D scene) is the source of truth. That's what lets it survive a reload.

const HOME_SCALE = 0.7;
const BOND_PER_PIXEL = 0.001; // a sitting's worth of bond takes ~10-15 seconds of happy rubbing

export function setupHome({ pond, collection, ui }) {
  function sync() {
    // Add a Frog for every collection entry that isn't in the pond yet.
    const here = new Set(pond.frogs.map((f) => f.entryId));
    const spots = pond.frogSpots.filter((s) => s.kind === 'land');
    collection.frogs.forEach((entry) => {
      if (here.has(entry.id)) return;
      const recipe = recipeById(entry.recipeId);
      if (!recipe) return;
      const frog = new Frog(recipe);
      frog.entryId = entry.id;
      frog.root.scale.setScalar(HOME_SCALE);
      // Sit it on the land spot farthest from the other frogs, so they don't pile up.
      const gap = (s) => Math.min(...pond.frogs.map((o) => o.root.position.distanceTo(s.position)), 99);
      const spot = spots.reduce((a, b) => (gap(b) > gap(a) ? b : a)).position;
      frog.root.position.copy(spot);
      frog.heading = (Math.random() - 0.5) * 1.2; // roughly facing you
      pond.group.add(frog.root);
      pond.frogs.push(frog);
    });
  }

  return {
    sync,
    // Called while the player rubs a frog. Better-bonded frogs enjoy it sooner.
    pet(frog, pixels) {
      const entry = collection.get(frog.entryId);
      if (!entry) return 1;
      const fondness = 0.6 + (entry.bond / 100) * 0.9;
      if (collection.isPettedOut(entry.id)) {
        ui.frogCard(entry, `${entry.name} has had enough petting for now.`);
        return fondness * 0.3; // still nice, just not bonding any more
      }
      if (frog.isHappy) collection.pet(entry.id, pixels * BOND_PER_PIXEL);
      if (entry.levelledUp) {
        entry.levelledUp = false;
        ui.toast(`${entry.name} is now: ${bondLevelName(entry.bond)}`, 3000);
      }
      ui.frogCard(entry);
      return fondness;
    },
    tapped(frog) {
      const entry = collection.get(frog.entryId);
      if (entry) ui.frogCard(entry);
    },
    // Where to put the heart effect, a little above the frog's head.
    headOf(frog) {
      return frog.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.9 * frog.root.scale.y, 0));
    },
  };
}
