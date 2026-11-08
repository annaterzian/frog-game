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
