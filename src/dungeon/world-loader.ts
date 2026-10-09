import * as THREE from 'three';
import {VoxelField,chunkKey,roundedBox,type Cell,type Sdf,type Vec3} from '../prototype/core/voxel';
import {configureVoxelMaterial,voxelGeometry} from '../prototype/rendering/meshes';
import {configureDungeonMasonry} from './materials';
import {dungeonField} from './world';
import type {Door,Snapshot} from './types';

type Description=Pick<Snapshot,'you'|'raid'|'seed'|'doors'>;
export type DungeonWorldStage='idle'|'authoring'|'meshing'|'awaiting-frame'|'ready'|'failed';
export interface DungeonWorldCoverage {requiredChunks:number;evaluatedChunks:number;meshChunks:number;preparationMs:number|null;doorRefreshPending:boolean;firstFrame:{requiredChunks:number;evaluatedChunks:number;meshChunks:number;latestDoors:boolean;afterMs:number}|null}
interface Options {changed?():void;now?:()=>number;yieldTask?:(signal:AbortSignal)=>Promise<void>}
const cancelled=()=>new Error('Dungeon world build cancelled');
const copyDoors=(doors:Door[])=>doors.map(door=>({...door,position:{...door.position}}));
const signature=(doors:Door[])=>JSON.stringify(doors);
const sameDoor=(a:Door,b:Door)=>a.open===b.open&&a.position.x===b.position.x&&a.position.y===b.position.y&&a.position.z===b.position.z;

class QueuedField extends VoxelField {
 private operations:(()=>Generator<void,void>)[]=[];
 override shape(a:Vec3,b:Vec3,sdf:Sdf,material:number,object?:string,subtract=false){this.operations.push(()=>super.shapeSteps(a,b,sdf,material,object,subtract));}
 *replay(){for(const operation of this.operations)yield*operation();this.operations.length=0;}
}
/** Same primitive order and exact sample operations as the synchronous reference. */
export function* dungeonAuthoringSteps(seed:number,doors:Door[]):Generator<void,VoxelField>{
 const field=new QueuedField(.25);dungeonField(seed,doors,field);yield*field.replay();return field;
}
/** Identical owner halo to WorldMeshes, with yields during the otherwise global scan. */
export function* dungeonBucketSteps(field:VoxelField):Generator<void,Map<string,Cell[]>>{
 const buckets=new Map<string,Cell[]>();let work=0;
 for(const cell of field.cells.values()){
  if(cell.distance<0)for(const id of new Set([chunkKey(cell.x,cell.z),chunkKey(cell.x-1,cell.z),chunkKey(cell.x,cell.z-1),chunkKey(cell.x-1,cell.z-1)])){
   let list=buckets.get(id);if(!list)buckets.set(id,list=[]);list.push(cell);
  }
  if(++work%256===0)yield;
 }
 return buckets;
}
function* updateDoors(field:VoxelField,before:Door[],after:Door[]){
 for(const old of before){const next=after.find(door=>door.id===old.id);if(!old.open&&(!next||!sameDoor(old,next)))yield*field.removeObjectSteps(old.id);}
 for(const door of after){const old=before.find(value=>value.id===door.id);if(door.open||old&&sameDoor(old,door))continue;
  const min={x:door.position.x-3,y:0,z:door.position.z-.15},max={x:door.position.x+3,y:2.8,z:door.position.z+.15};
  yield*field.shapeSteps(min,max,roundedBox(min,max,.04),4,door.id);
 }
}
function yieldBrowserTask(signal:AbortSignal):Promise<void>{
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(cancelled());return;}
  const abort=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);reject(cancelled());};
  const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},0);
  signal.addEventListener('abort',abort,{once:true});
 });
}
interface Build {
 key:string;abort:AbortController;root:THREE.Group;material:THREE.MeshStandardMaterial;meshes:Map<string,THREE.Mesh>;
 desired:Door[];applied:Door[];geometrySignature:string|null;field:VoxelField|null;complete:boolean;ready:boolean;disposed:boolean;running:boolean;
 required:Set<string>;evaluated:Set<string>;startedAt:number;preparationMs:number|null;firstFrame:DungeonWorldCoverage['firstFrame'];
}
/** Small dungeon only: retain every owner chunk, never stream away a required wall.
 * Authoring/buckets yield cooperatively. Individual mesh extraction is still synchronous.
 * Live door work swaps a complete revision without resetting input or held guard. */
export class DungeonWorldLoader {
 private current:Build|null=null;private stopped=false;private stage:DungeonWorldStage='idle';private work:Promise<void>=Promise.resolve();
 constructor(private readonly scene:THREE.Object3D,private readonly options:Options={}){}
 get state(){return this.stage;}
 get ready(){return !!this.current?.ready;}
 get presentable(){const b=this.current;return !!b&&!b.disposed&&(b.ready||b.complete&&b.geometrySignature===signature(b.desired));}
 get field(){return this.current?.field??null;}
 get meshes():ReadonlyMap<string,THREE.Mesh>{return this.current?.meshes??new Map();}
 get completion(){return this.work;}
 get coverage():DungeonWorldCoverage{const b=this.current;return {requiredChunks:b?.required.size??0,evaluatedChunks:b?.evaluated.size??0,meshChunks:b?.meshes.size??0,preparationMs:b?.preparationMs??null,doorRefreshPending:!!b?.ready&&b.geometrySignature!==signature(b.desired),firstFrame:b?.firstFrame?{...b.firstFrame}:null};}
 private change(stage:DungeonWorldStage){if(this.stage===stage)return;this.stage=stage;this.options.changed?.();}
 request(description:Description){
  if(this.stopped)return;
  const key=JSON.stringify([description.you,description.raid,description.seed]);
  if(this.current?.key===key){
   const doors=copyDoors(description.doors);if(signature(doors)===signature(this.current.desired))return;
   this.current.desired=doors;
   if(!this.current.ready)this.change('meshing');
   this.start(this.current,description.seed);return;
  }
  this.clear();
  const root=new THREE.Group(),material=configureDungeonMasonry(configureVoxelMaterial(new THREE.MeshStandardMaterial({vertexColors:true,roughness:.87,metalness:.04})));
  root.visible=false;this.scene.add(root);
  const desired=copyDoors(description.doors);
  const build:Build={key,abort:new AbortController(),root,material,meshes:new Map(),desired,applied:copyDoors(desired),geometrySignature:null,field:null,complete:false,ready:false,disposed:false,running:false,required:new Set(),evaluated:new Set(),startedAt:performance.now(),preparationMs:null,firstFrame:null};
  this.current=build;this.change('authoring');this.start(build,description.seed);
 }
 private check(build:Build){if(this.stopped||this.current!==build||build.abort.signal.aborted)throw cancelled();}
 private async pause(build:Build){this.check(build);await (this.options.yieldTask??yieldBrowserTask)(build.abort.signal);this.check(build);}
 private async run<T>(build:Build,steps:Generator<void,T>):Promise<T>{
  const now=this.options.now??(()=>performance.now());let start=now();
  for(;;){this.check(build);const step=steps.next();if(step.done)return step.value;if(now()-start>=3){await this.pause(build);start=now();}}
 }
 private start(build:Build,seed:number){if(build.running||build.disposed)return;build.running=true;
  this.work=this.populate(build,seed).catch(()=>{
   if(this.current===build&&!build.abort.signal.aborted){this.release(build);this.change('failed');}
  }).finally(()=>{build.running=false;if(this.current===build&&!build.disposed&&build.geometrySignature!==signature(build.desired))this.start(build,seed);});
 }
 private async populate(build:Build,seed:number){
  // Always leave the snapshot callback before sampling any voxels.
  await this.pause(build);
  if(!build.field)build.field=await this.run(build,dungeonAuthoringSteps(seed,build.applied));
  const field=build.field;
  for(;;){
   const desired=copyDoors(build.desired),revision=signature(desired);
   if(signature(build.applied)!==revision){await this.run(build,updateDoors(field,build.applied,desired));build.applied=desired;}
   if(!build.ready)this.change('meshing');
   const buckets=await this.run(build,dungeonBucketSteps(field));
   const ids=build.complete?[...field.dirty]:[...buckets.keys()];
   const replacement=new Map<string,THREE.BufferGeometry|null>();
   try{
    for(const id of ids){this.check(build);const cells=buckets.get(id),geometry=cells?voxelGeometry(field,cells,id):null;
     if(geometry&&!geometry.getAttribute('position').count){geometry.dispose();replacement.set(id,null);}else replacement.set(id,geometry);
     // A count limit is not a time limit: yield after every complete chunk too.
     await this.pause(build);
    }
    this.check(build);
    // Hidden initial work can be retained as a base for newer door revisions.
    // Live geometry must never install an already-superseded door revision.
    if(build.ready&&revision!==signature(build.desired))continue;
    for(const [id,geometry]of replacement){const old=build.meshes.get(id);if(old){old.removeFromParent();old.geometry.dispose();build.meshes.delete(id);}
     if(geometry){const mesh=new THREE.Mesh(geometry,build.material);mesh.castShadow=true;mesh.receiveShadow=true;build.meshes.set(id,mesh);build.root.add(mesh);}
    }
    replacement.clear();field.dirty.clear();build.complete=true;build.geometrySignature=revision;build.required=new Set(buckets.keys());for(const id of ids)build.evaluated.add(id);
   }finally{for(const geometry of replacement.values())geometry?.dispose();}
   if(revision===signature(build.desired)){if(!build.ready){build.preparationMs=performance.now()-build.startedAt;this.change('awaiting-frame');}return;}
  }
 }
 /** Reveal only a complete world. The app stays gated until a successful draw returns. */
 show(){if(this.presentable&&this.current)this.current.root.visible=true;}
 rendered(){const build=this.current;if(!build||build.ready||!this.presentable)return;build.firstFrame={requiredChunks:build.required.size,evaluatedChunks:[...build.required].filter(id=>build.evaluated.has(id)).length,meshChunks:build.meshes.size,latestDoors:build.geometrySignature===signature(build.desired),afterMs:performance.now()-build.startedAt};build.ready=true;this.change('ready');}
 private release(build:Build){if(build.disposed)return;build.disposed=true;build.ready=false;build.abort.abort();build.root.removeFromParent();for(const mesh of build.meshes.values())mesh.geometry.dispose();build.meshes.clear();build.material.dispose();build.field=null;}
 clear(){if(this.current)this.release(this.current);this.current=null;this.change('idle');}
 dispose(){if(this.stopped)return;this.stopped=true;this.clear();}
}
