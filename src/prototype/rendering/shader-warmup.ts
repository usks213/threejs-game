import * as THREE from 'three';
type RenderObject=THREE.Mesh|THREE.Points|THREE.Line|THREE.Sprite;
const drawable=(object:THREE.Object3D):object is RenderObject=>object instanceof THREE.Mesh||object instanceof THREE.Points||object instanceof THREE.Line||object instanceof THREE.Sprite;
/** Compile visible shader variants asynchronously before their first draw. Shallow
 * clones keep live parents, geometry and materials unchanged. In particular a
 * disabled high-quality sky is never accidentally warmed through scene.traverse.
 * This avoids synchronous link-status waits; it does not promise to eliminate
 * driver submission/upload stalls, which are timed separately by the pipeline. */
export function createShaderWarmup(renderer:Pick<THREE.WebGLRenderer,'compileAsync'>,scene:THREE.Scene,camera:THREE.Camera){
 const prepared=new Map<string,{material:THREE.Material;version:number}>();let lighting='';let pending=false,disposed=false,error:unknown,failed=false,batches=0,lastMs=0,maxMs=0;
 function key(object:RenderObject,material:THREE.Material){const geometry='geometry' in object?object.geometry:null;return [material.uuid,object.type,geometry?.getAttribute('color')?.itemSize??0,geometry?.morphAttributes.position?.length??0].join(':');}
 return {
  get stats(){return {shaderWarmup:failed?'failed':pending?'compiling':'ready',shaderWarmupBatches:batches,shaderWarmupMs:lastMs,shaderWarmupMaxMs:maxMs};},
  ready(){
   if(disposed)return false;if(failed)throw error;if(pending)return false;
   const lights:string[]=[];scene.traverseVisible(object=>{if(object instanceof THREE.Light&&object.layers.test(camera.layers))lights.push(object.type+':'+Number(object.castShadow));});const signature=lights.sort().join(',')+'|'+scene.fog?.constructor.name+'|'+scene.environment?.uuid;if(signature!==lighting){lighting=signature;prepared.clear();}
   const batch=new THREE.Group(),variants=new Map<string,{material:THREE.Material;version:number}>();
   scene.traverseVisible(object=>{if(!drawable(object)||object instanceof THREE.InstancedMesh&&object.count===0)return;const materials=Array.isArray(object.material)?object.material:[object.material];let missing=false;for(const material of materials){const id=key(object,material);if(prepared.get(id)?.version!==material.version&&!variants.has(id)){missing=true;variants.set(id,{material,version:material.version});}}if(missing)batch.add(object.clone(false));});
   if(!variants.size)return true;
   pending=true;batches++;const start=performance.now();
   // targetScene supplies the exact lights, fog and static environment used by draw.
   try{const compilation=renderer.compileAsync(batch,camera,scene);
    // Three prepares front/back transparent passes by incrementing version. Store
    // the resulting version now, not a future external edit made while waiting.
    for(const variant of variants.values())variant.version=variant.material.version;
    void compilation.then(()=>{if(disposed)return;for(const [id,variant] of variants)if(variant.material.version===variant.version)prepared.set(id,variant);pending=false;lastMs=performance.now()-start;maxMs=Math.max(maxMs,lastMs);},reason=>{if(disposed)return;error=reason;failed=true;pending=false;});}catch(reason){error=reason;failed=true;pending=false;throw reason;}
   return false;
  },
  rendered(){
   // Three also increments transparent double-sided versions during each draw.
   // The live draw just prepared those variants; do not compile them forever.
   for(const variant of prepared.values())if(variant.material.transparent&&variant.material.side===THREE.DoubleSide&&!variant.material.forceSinglePass)variant.version=variant.material.version;
  },
  dispose(){disposed=true;prepared.clear();},
 };
}
