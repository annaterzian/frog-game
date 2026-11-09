import * as THREE from 'three';

// One clock shared by every animated material, ticked from the main loop.
export const worldTime = { value: 0 };

// Lesson: Three.js materials are GLSL shader programs under the hood. onBeforeCompile lets us
// splice a few lines into a built-in material, so we keep its lighting, shadows and fog for free.

// Grass, reeds and cattails that sway in the breeze. The higher a vertex is above the
// ground, the further it sways, so roots stay put and tips wave.
export function swayMaterial(color, { sway = 0.06, ...extra } = {}) {
  const mat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, side: THREE.DoubleSide, ...extra });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldTime;
    shader.uniforms.uSway = { value: sway };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uSway;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 swayW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float swayH = max(0.0, swayW.y);
        float gust = sin(uTime * 1.3 + swayW.x * 0.6 + swayW.z * 0.4) + 0.5 * sin(uTime * 2.7 + swayW.z);
        transformed.x += gust * swayH * swayH * uSway;
        transformed.z += cos(uTime * 1.1 + swayW.x * 0.5) * swayH * swayH * uSway * 0.5;`
      );
  };
  mat.customProgramCacheKey = () => 'sway';
  return mat;
}

// Patterned swamp water: two-tone patches, a branching web of pale veins (like light
// caught on the surface), and a pale shallow band with a foam line around every island.
// `shores` is a list of islands ({ x, z, radius, phase }) so the foam follows their wobbly edges.
// A lake shore is passed with a negative radius: there the water is inside the outline.
export function waterMaterial({ deep, light, vein, shallow, foam, shores = [] }) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.4 });
  const MAX = 8;
  const shoreData = Array.from({ length: MAX }, (_, i) => {
    const s = shores[i];
    return s ? new THREE.Vector4(s.x, s.z, s.radius, s.phase) : new THREE.Vector4(1e4, 1e4, 0, 0);
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uTime: worldTime,
      uDeep: { value: new THREE.Color(deep) },
      uLight: { value: new THREE.Color(light) },
      uVein: { value: new THREE.Color(vein) },
      uShallow: { value: new THREE.Color(shallow) },
      uFoam: { value: new THREE.Color(foam) },
      uShores: { value: shoreData },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWorld;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        transformed.y += sin(wp.x * 0.6 + uTime) * 0.05 + cos(wp.z * 0.5 + uTime * 0.8) * 0.05;
        vWorld = wp;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform vec3 uDeep, uLight, uVein, uShallow, uFoam;
        uniform vec4 uShores[${MAX}];
        varying vec3 vWorld;

        vec2 hash2(vec2 p) {
          p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
          return fract(sin(p) * 43758.5453);
        }
        // Distance to the nearest edge between Voronoi cells: thin lines that branch and join.
        float cellEdge(vec2 p, float t) {
          vec2 n = floor(p), f = fract(p);
          float d1 = 8.0, d2 = 8.0;
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 g = vec2(float(i), float(j));
            vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash2(n + g));
            float d = length(g + o - f);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
          return d2 - d1;
        }
        float line(float edge, float width) {
          float aa = fwidth(edge) * 1.2;
          return 1.0 - smoothstep(width - aa, width + aa, edge);
        }
        // Must match islandRadiusAt() in props.js so the foam hugs the shore.
        float shoreDist(vec2 p, vec4 s) {
          vec2 d = p - s.xy;
          float a = atan(d.y, d.x);
          if (s.z < 0.0) {
            // A lake: water is inside the outline. Must match lakeRadiusAt() in terrain.js.
            float lw = 1.0 + sin(a * 3.0 + s.w) * 0.1 + sin(a * 5.0 + s.w * 2.0) * 0.05;
            return -s.z * lw - length(d);
          }
          float wob = 1.0 + sin(a * 3.0 + s.w) * 0.06 + sin(a * 7.0 + s.w * 2.0) * 0.03;
          return length(d) - (s.z + 0.15) * wob; // the island's sloped side meets the water a bit past its top edge
        }`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 p = vWorld.xz;
        // Bend space with a couple of slow waves so the cells come out stretched and organic,
        // not like tiles.
        vec2 warp = p * vec2(1.0, 1.6);
        warp += vec2(sin(warp.y * 0.31 + uTime * 0.15), cos(warp.x * 0.27 - uTime * 0.12)) * 1.6;
        warp += vec2(sin(warp.y * 0.9 + 1.7), cos(warp.x * 0.8 + 0.4)) * 0.35;
        float blotch = sin(p.x * 0.18 + sin(p.y * 0.15) * 2.0) + cos(p.y * 0.2 + sin(p.x * 0.12) * 2.0);
        vec3 col = mix(uDeep, uLight, step(0.9, blotch) * 0.6);
        // Vein thickness drifts across the pond: thick rivers in places, hairlines in others.
        float thick = 0.03 + 0.07 * smoothstep(-0.6, 1.0, sin(p.x * 0.21 + 1.3) * cos(p.y * 0.17 - 0.6));
        float big = line(cellEdge(warp * 0.3, uTime * 0.2), thick);
        float small = line(cellEdge(warp * 0.75 + 3.7, uTime * 0.3), 0.025) * step(0.0, sin(p.x * 0.4 + p.y * 0.3));
        col = mix(col, uVein, max(big, small * 0.55));

        float near = 1e4;
        for (int i = 0; i < ${MAX}; i++) near = min(near, shoreDist(p, uShores[i]));
        col = mix(col, uShallow, (1.0 - smoothstep(0.3, 1.6, near)) * 0.75);
        float lap = 0.25 + 0.08 * sin(uTime * 1.6 + p.x * 2.0 + p.y * 1.3);
        col = mix(col, uFoam, line(abs(near - lap), 0.07) * 0.9);
        col = mix(col, uFoam, (1.0 - smoothstep(0.0, 0.12, near)) * 0.8);
        diffuseColor.rgb = col;`
      );
  };
  mat.customProgramCacheKey = () => 'swamp-water';
  return mat;
}
