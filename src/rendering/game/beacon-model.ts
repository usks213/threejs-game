import * as THREE from 'three';
import { pbrMaterial } from '../materials/pbr';

/** Five shared-geometry pieces per beacon, matching the former five cubes.
 * The whole permanent model stays within the existing 2 x 2 x 2 m target box.
 * No extra lights, transparent beams, collision or saved state are introduced. */
export function createBeaconAssets(box:THREE.BufferGeometry) {
 const stone=pbrMaterial('#b8aa8a','stone');
 const waiting=pbrMaterial('#d4a951','crystal'),lit=pbrMaterial('#8ee8d2','crystal');
 waiting.emissiveIntensity=.2;lit.emissiveIntensity=1.35;
 function create(id:number) {
  const group=new THREE.Group();group.name='beacon:'+id;
  const add=(name:string,material:THREE.MeshStandardMaterial,x:number,y:number,z:number,sx:number,sy:number,sz:number)=>{
   const mesh=new THREE.Mesh(box,material);mesh.name=name;mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);
   mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  add('beacon-base',stone,0,.125,0,1.7,.25,1.2);
  add('beacon-left',stone,-.65,.975,0,.25,1.5,.42);
  add('beacon-right',stone,.65,.975,0,.25,1.5,.42);
  add('beacon-crown',stone,0,1.85,0,1.7,.25,.5);
  const light=add('beacon-light',waiting,0,1.12,0,.55,.7,.55);light.rotation.z=Math.PI/4;
  return {group,light};
 }
 return {create,update(model:ReturnType<typeof create>,active:boolean,seconds:number,reducedMotion:boolean){
  model.light.material=active?lit:waiting;
  model.light.rotation.y=reducedMotion?0:seconds*.35;
  model.light.position.y=1.12+(reducedMotion?0:Math.sin(seconds*1.6)*.035);
 },dispose(){stone.dispose();waiting.dispose();lit.dispose();}};
}
