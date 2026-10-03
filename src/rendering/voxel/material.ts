import * as THREE from 'three';

/** Four 64px tiles in one small atlas; world-space mapping remains continuous across bricks. */
export function createTerrainMaterial() {
  const size = 64, tiles = 4, data = new Uint8Array(size * size * tiles * 4);
  for (let tile = 0; tile < tiles; tile++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.sin(x * 12.98 + y * 78.23 + tile * 19.1) * 43758.54;
    const noise = grain - Math.floor(grain);
    const bands = Math.sin(x * 0.42 + Math.sin(y * 0.18) * 2);
    const value = Math.round(218 + noise * 22 + bands * (tile === 1 ? 10 : 4));
    const offset = ((tile * size + y) * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = value; data[offset + 3] = 255;
  }
  const atlas = new THREE.DataTexture(data, size, size * tiles, THREE.RGBAFormat);
  atlas.magFilter = THREE.NearestFilter; atlas.minFilter = THREE.LinearFilter; atlas.generateMipmaps = false; atlas.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainAtlas = { value: atlas };
    shader.vertexShader = 'varying vec3 terrainPoint; varying vec3 terrainNormal;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      terrainPoint = (modelMatrix * vec4(position, 1.0)).xyz;
      terrainNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = `uniform sampler2D terrainAtlas;
      varying vec3 terrainPoint; varying vec3 terrainNormal;
      vec3 terrainTile(vec2 uv, float tile) {
        vec2 inset = (fract(uv) * 62.0 + 1.0) / 64.0;
        return texture2D(terrainAtlas, vec2(inset.x, (inset.y + tile) / 4.0)).rgb;
      }
      ` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 weights = pow(abs(terrainNormal), vec3(4.0));
      weights /= max(dot(weights, vec3(1.0)), 0.0001);
      float tile = terrainNormal.y > 0.65 ? 0.0 : (terrainNormal.y > 0.15 ? 2.0 : 1.0);
      vec3 grain = terrainTile(terrainPoint.yz * 0.7, tile) * weights.x
        + terrainTile(terrainPoint.xz * 0.7, tile) * weights.y
        + terrainTile(terrainPoint.xy * 0.7, tile) * weights.z;
      diffuseColor.rgb *= grain * 1.06;`);
    // Analytic low-lying haze; no extra screen-space pass or render target.
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', `#include <fog_fragment>
      #ifdef USE_FOG
        float groundMist = 1.0 - exp(-max(vFogDepth, 0.0) * 0.006 * exp(-max(terrainPoint.y, 0.0) * 0.12));
        gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, min(0.24, groundMist));
      #endif`);
  };
  return { material, dispose(): void { atlas.dispose(); material.dispose(); } };
}
