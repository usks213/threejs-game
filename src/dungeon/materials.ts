import type {MeshStandardMaterial} from 'three';
/** Dungeon-only, world-aligned masonry. Reuses the SDF surface and lighting;
 * no collision props, image downloads, extra draw calls or campaign shader changes. */
export function configureDungeonMasonry(material:MeshStandardMaterial){
 const previous=material.onBeforeCompile;
 material.customProgramCacheKey=()=> 'ashen-vault-masonry-v1';
 material.onBeforeCompile=(shader,renderer)=>{
  previous.call(material,shader,renderer);
  shader.vertexShader=shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vVaultPosition;\nvarying vec3 vVaultNormal;')
   .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVaultPosition = position;\nvVaultNormal = normal;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vVaultPosition;\nvarying vec3 vVaultNormal;')
   .replace('#include <color_fragment>', `#include <color_fragment>
// Only stone. Wood doors retain their distinct warmer material colour.
if (vVoxelSurface.y < 0.05 && vVoxelSurface.x > 0.85) {
 float vaultFloor = step(0.65, abs(vVaultNormal.y));
 vec2 vaultWall = vec2(abs(vVaultNormal.x) > abs(vVaultNormal.z) ? vVaultPosition.z : vVaultPosition.x, vVaultPosition.y);
 vec2 vaultGrid = mix(vaultWall / vec2(1.15, 0.52), vVaultPosition.xz / 1.6, vaultFloor);
 vaultGrid.x += mod(floor(vaultGrid.y), 2.0) * 0.5 * (1.0 - vaultFloor);
 vec2 vaultCell = floor(vaultGrid);
 vec2 vaultEdge = min(fract(vaultGrid), 1.0 - fract(vaultGrid));
 vec2 vaultAA = max(fwidth(vaultGrid), vec2(0.002));
 float vaultMortar = min(smoothstep(0.008, 0.014 + vaultAA.x, vaultEdge.x), smoothstep(0.008, 0.014 + vaultAA.y, vaultEdge.y));
 float vaultVariation = 0.92 + 0.13 * fract(sin(dot(vaultCell, vec2(17.13, 41.71))) * 437.31);
 float vaultDamp = 0.83 + 0.17 * smoothstep(0.0, 1.2, vVaultPosition.y);
 diffuseColor.rgb *= mix(vec3(0.27, 0.30, 0.29), vec3(0.76, 0.82, 0.83) * vaultVariation * vaultDamp, vaultMortar);
}
`);
 };
 return material;
}
