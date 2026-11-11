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

## Art style

Low-poly and faceted, but organic. When adding or changing anything that's seen in the game:

- **Few, visible faces.** Build round things from low-detail icosahedrons (`blob()` in `src/shapes.js`, `detail: 0` or `1`) or cylinders with 5 to 9 sides. If you can't see the individual faces from the normal camera, it has too many.
- **Flat shading.** Use `flatMaterial()` (or `flatShading: true`), so each face gets one tone and the polygon edges stay visible.
- **Organic, not blocky.** Rough shapes up with `lumpy()` / `blob({ rough })` and squash them, so silhouettes feel natural.
- **Simple anatomy, no texture detail.** Shape, silhouette and per-face colour (`colorFaces()`) do the work. No painted textures (the signpost lettering is the one exception).
- **Lighting shows the facets.** The sun is strong compared to the sky light, so neighbouring faces land on clearly different shades.
- Keep the current colour palette and the water shader as they are.
- Frogs stay not-too-cute: awkward, dumb faces, no blush, chunky simple legs.

## How the code is laid out

- `src/main.js`: renderer, lights, camera, pointer input, main loop
- `src/frog.js`: the Frog class (look, hops, pokes, petting)
- `src/effects.js`: hearts, ripples, dust puffs
- `src/world/materials.js`: the patterned water shader and swaying grass material
- `src/world/props.js`: building blocks shared by every pond (islands, water, grass, cattails, trees, logs, lily pads, the mossy hut, signposts)
- `src/world/terrain.js`: the meadow and hills around each pond, with the lake sunk into it
- `src/ponds/home.js`, `src/ponds/catching.js`: the two ponds, each built from those blocks
- `src/ponds/travel.js`: switching between ponds

### What a pond object has

Each pond builder returns an object with:

| field | what it is |
| --- | --- |
| `name` | `'home'` or `'catch'` |
| `group` | `THREE.Group` holding the whole pond (added to the scene while you're there) |
| `ground`, `water` | meshes the pointer can hit |
| `land` | the meadow around the lake: `heightAt(x, z)`, `inset(p)`, `clamp(p, margin)`, `shorePoint(angle, distance)`, `inLake(p)` |
| `islands` | islands in the lake, with `inset(p)`, `clamp(p, margin)`, `randomSpot(rng, margin)` |
| `frogs` | Frog instances living there; input and updates run on these |
| `frogSpots` | `{ position, kind: 'land' \| 'pad' \| 'log' }` places a frog can sit |
| `clampToLand(p)` | returns the nearest point on land (meadow or island) that's safe to hop to |
| `camera` | `{ position, lookAt, pan }` framing for a landscape screen; `pan` is how far you can drag the view |
| `look` | haze colour, fog, light colours, sun position, shadow area |
| `travel` | `[{ to, touch }]`: tapping a `touch` mesh travels to pond `to` |
| `input` (optional) | `{ down, move, up }(event, raycaster)`; return `true` to skip the default poke/pet/hop |
| `update(dt, time)` | called every frame while you're in the pond |

`travel.goTo(name)`, `travel.current()`, `travel.onEnter(fn(name, pond))` and `travel.onLeave(fn(name, pond))` handle moving between ponds.
