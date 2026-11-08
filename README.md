# Frog Season

A browser game about finding, catching, and raising strange, lovable low-poly frogs.

## Tech stack

- [Three.js](https://threejs.org/): 3D rendering on top of WebGL
- [Vite](https://vitejs.dev/): dev server and build tool
- Plain JavaScript (ES modules)
- GitHub Pages: hosting, deployed by `.github/workflows/deploy.yml` on every push to `main`

## Run it locally

```sh
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

## Build

```sh
npm run build   # outputs to dist/
npm run preview # serves the built version
```

## How the code is laid out

- `src/main.js`: renderer, lights, camera, pointer input, main loop
- `src/frog.js`: the Frog class (look, hops, pokes, petting)
- `src/effects.js`: hearts, ripples, dust puffs
- `src/world/materials.js`: the patterned water shader and swaying grass material
- `src/world/props.js`: building blocks shared by every pond (islands, water, grass, cattails, trees, logs, lily pads, signposts)
- `src/ponds/home.js`, `src/ponds/catching.js`: the two ponds, each built from those blocks
- `src/ponds/travel.js`: switching between ponds

### What a pond object has

Each pond builder returns an object with:

| field | what it is |
| --- | --- |
| `name` | `'home'` or `'catch'` |
| `group` | `THREE.Group` holding the whole pond (added to the scene while you're there) |
| `ground`, `water` | meshes the pointer can hit |
| `islands` | islands with `inset(p)`, `clamp(p, margin)`, `randomSpot(rng, margin)` |
| `frogs` | Frog instances living there; input and updates run on these |
| `frogSpots` | `{ position, kind: 'land' \| 'pad' \| 'log' }` places a frog can sit |
| `clampToLand(p)` | returns a point on the nearest island, safe to hop to |
| `camera` | `{ position, lookAt }` framing for a landscape screen |
| `look` | haze colour, fog, light colours, sun position, shadow area |
| `travel` | `[{ to, touch }]`: tapping a `touch` mesh travels to pond `to` |
| `input` (optional) | `{ down, move, up }(event, raycaster)`; return `true` to skip the default poke/pet/hop |
| `update(dt, time)` | called every frame while you're in the pond |

`travel.goTo(name)`, `travel.current()`, `travel.onEnter(fn(name, pond))` and `travel.onLeave(fn(name, pond))` handle moving between ponds.
