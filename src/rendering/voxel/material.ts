import * as THREE from 'three';
import { surfaceMaps } from '../materials/pbr';
/** World-space triplanar PBR: continuous across edited bricks, with slope-selected soil/rock. */
export function createTerrainMaterial() {
 const stone=surfaceMaps('stone'), soil=surfaceMaps('wood');
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.95,metalness:0});
 material.onBeforeCompile=s=>{
  Object.assign(s.uniforms,{rockColor:{value:stone.map},soilColor:{value:soil.map},rockNormal:{value:stone.normalMap},rockRoughness:{value:stone.roughnessMap}});
  s.vertexShader='varying vec3 terrainPoint; varying vec3 terrainNormal;\n'+s.vertexShader;
  s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nterrainPoint=(modelMatrix*vec4(position,1.)).xyz;terrainNormal=normalize(mat3(modelMatrix)*normal);');
  s.fragmentShader=`varying vec3 terrainPoint;varying vec3 terrainNormal;
   uniform sampler2D rockColor,soilColor,rockNormal,rockRoughness;
   vec4 triplanar(sampler2D tex,vec3 p,vec3 w){return texture2D(tex,p.yz)*w.x+texture2D(tex,p.xz)*w.y+texture2D(tex,p.xy)*w.z;}
   `+s.fragmentShader;
  s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
   vec3 terrainWeights=pow(abs(terrainNormal),vec3(4.));terrainWeights/=max(dot(terrainWeights,vec3(1.)),.0001);
   diffuseColor.rgb*=mix(triplanar(rockColor,terrainPoint*.8,terrainWeights).rgb,triplanar(soilColor,terrainPoint*.8,terrainWeights).rgb,smoothstep(.4,.85,terrainNormal.y));`);
  s.fragmentShader=s.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
   roughnessFactor*=triplanar(rockRoughness,terrainPoint*.8,terrainWeights).g;`);
  // Blend tangent perturbations in world space, then transform into view space.
  s.fragmentShader=s.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
   vec2 nx=texture2D(rockNormal,terrainPoint.yz*.8).xy*2.-1.;vec2 ny=texture2D(rockNormal,terrainPoint.xz*.8).xy*2.-1.;vec2 nz=texture2D(rockNormal,terrainPoint.xy*.8).xy*2.-1.;
   vec3 perturb=vec3(0.,nx.x,nx.y)*terrainWeights.x+vec3(ny.x,0.,ny.y)*terrainWeights.y+vec3(nz.x,nz.y,0.)*terrainWeights.z;
   normal=normalize(normal+mat3(viewMatrix)*perturb*.65);`);
 };
 return {material,dispose(){material.dispose();}};
}
