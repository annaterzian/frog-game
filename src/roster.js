import { FIRST_FROG } from './frog.js';

// Every frog that can turn up in the game. Each one is a "recipe": a handful of numbers
// and colours the Frog class turns into a 3D frog. The frog workshop will add to this
// list once Anna approves new frogs; only `approved` frogs appear in the catching pond.
//
// skittish (0..1): how easily the frog gets spooked when you approach it.
export const ROSTER = [
  { ...FIRST_FROG, id: 'pip', skittish: 0.3, approved: true },
  {
    id: 'dunk',
    name: 'Dunk',
    seed: 27,
    body: '#6f8f3e',
    belly: '#d9cf96',
    spots: '#4b6a2b',
    eyeMismatch: 0.28,
    plumpness: 1.22,
    eyeSize: 0.85,
    skittish: 0.15,
    approved: true,
  },
  {
    id: 'mudge',
    name: 'Mudge',
    seed: 52,
    body: '#8a7a4c',
    belly: '#e2d4a4',
    spots: '#5f5232',
    eyeMismatch: 0.08,
    plumpness: 1.05,
    eyeSize: 1.2,
    skittish: 0.5,
    approved: true,
  },
  {
    id: 'flim',
    name: 'Flim',
    seed: 90,
    body: '#9db85c',
    belly: '#f2ebc0',
    spots: '#6e8a3a',
    eyeMismatch: 0.22,
    plumpness: 0.88,
    eyeSize: 1.1,
    skittish: 0.75,
    approved: true,
  },
];

export function recipeById(id) {
  return ROSTER.find((r) => r.id === id);
}

export function wildRecipes() {
  return ROSTER.filter((r) => r.approved);
}
