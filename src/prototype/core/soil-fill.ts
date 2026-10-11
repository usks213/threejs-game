import {integer,record,vector} from '../../save/validation';
import {VoxelField,roundedBox,key,type Vec3,type VoxelState,type SampleState} from './voxel';

/** A bounded paid earthwork, kept as a removable layer over the authored terrain.
 * Mining it deliberately yields no drops. Only a completely intact layer returns
 * its original nine soil units; concealed terrain is never part of that refund. */
export const SOIL_FILL_COST=9;
export const SOIL_FILL_PREFIX='build:soil:';
export interface SoilPatch {id:string;position:Vec3;cost:9}
export interface SoilFillState {version:1;sequence:number;patches:SoilPatch[]}
export interface SoilPreview {ok:boolean;message:string;bounds:{min:Vec3;max:Vec3};target:Vec3;cost:number}
export interface SoilContext {player:Vec3;bodies:readonly Vec3[];protectedObjects:ReadonlySet<string>;bounds:{minX:number;maxX:number;minZ:number;maxZ:number};permission?:string}
const finite=(p:Vec3)=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z);
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
export function soilShape(position:Vec3){const min={x:position.x-.375,y:position.y-.5,z:position.z-.375},max={x:position.x+.375,y:position.y,z:position.z+.375};return {min,max,sdf:roundedBox(min,max)};}
export function soilTarget(contact:Vec3):Vec3 {return {x:(Math.floor(contact.x*4)+.5)/4,y:Math.round(contact.y*4)/4+.25,z:(Math.floor(contact.z*4)+.5)/4};}
function validPosition(p:unknown):p is Vec3{return vector(p)&&Object.keys(p).length===3&&p.x>=-128&&p.x<=128&&p.z>=-160&&p.z<=100&&p.y>=0&&p.y<=8&&Number.isInteger(p.x*4-.5)&&Number.isInteger(p.z*4-.5)&&Number.isInteger(p.y*4);}
function canonical(p:Vec3):Map<string,SampleState>{const shape=soilShape(p),f=new VoxelField();f.shape(shape.min,shape.max,shape.sdf,2,'soil');return new Map(f.exportState().layers[0].cells.map(c=>[key(c[0],c[1],c[2]),c]));}
export function decodeSoilFill(value:unknown):SoilFillState|null {
 if(value===undefined)return {version:1,sequence:0,patches:[]};
 if(!record(value)||Object.keys(value).length!==3||value.version!==1||!integer(value.sequence,0,1e9)||!Array.isArray(value.patches)||value.patches.length>64)return null;
 const ids=new Set<string>(),patches:SoilPatch[]=[];
 for(const p of value.patches){if(!record(p)||Object.keys(p).length!==3||typeof p.id!=='string'||p.cost!==SOIL_FILL_COST||!validPosition(p.position))return null;const serial=Number(p.id.slice(SOIL_FILL_PREFIX.length));if(!integer(serial,1,value.sequence)||p.id!==SOIL_FILL_PREFIX+serial||ids.has(p.id))return null;ids.add(p.id);patches.push({id:p.id,position:{...p.position},cost:SOIL_FILL_COST});}
 return {version:1,sequence:value.sequence,patches};
}
/** Cross-check state and owned geometry before any live campaign module commits.
 * Carving may only raise distances/remove samples from the canonical paid shape. */
export function validSoilGeometry(state:SoilFillState,field:VoxelState):boolean {
 const patches=new Map(state.patches.map(p=>[p.id,p])),seen=new Set<string>();
 if(!Array.isArray(field.layers))return false;
 for(const layer of field.layers){if(!record(layer)||typeof layer.id!=='string'||!Array.isArray(layer.cells)||!Array.isArray(layer.removed))return false;if(!layer.id.startsWith(SOIL_FILL_PREFIX))continue;const p=patches.get(layer.id);if(!p||seen.has(layer.id))return false;seen.add(layer.id);const expected=canonical(p.position),samples=new Set<string>();
  for(const c of layer.cells){if(!Array.isArray(c)||c.length!==5||![c[0],c[1],c[2]].every(Number.isSafeInteger))return false;const id=key(c[0],c[1],c[2]),before=expected.get(id);if(!before||samples.has(id)||c[4]!==2||!Number.isFinite(c[3])||c[3]<before[3]||c[3]>.5)return false;samples.add(id);}
  for(const id of layer.removed){if(!expected.has(id)||samples.has(id))return false;samples.add(id);}
 }
 return seen.size===patches.size;
}
export class SoilFillSystem {
 private state:SoilFillState={version:1,sequence:0,patches:[]};private undoRecord:{id:string;revision:number}|null=null;
 constructor(readonly field:VoxelField,readonly inventory:Record<number,number>,readonly damagedObjects?:ReadonlySet<string>){}
 snapshot():SoilFillState{return {version:1,sequence:this.state.sequence,patches:this.state.patches.map(p=>({...p,position:{...p.position}}))};}
 restore(value:unknown){const next=decodeSoilFill(value);if(!next)return false;this.state=next;this.undoRecord=null;return true;}
 private clearLine(a:Vec3,b:Vec3,tolerance=.03){const d=distance(a,b);return d<.001||!this.field.ray(a,{x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},Math.max(0,d-tolerance));}
 preview(contact:Vec3,context:SoilContext):SoilPreview {
  const target=soilTarget(contact),shape=soilShape(target),result=(ok:boolean,message:string):SoilPreview=>({ok,message,bounds:{min:shape.min,max:shape.max},target,cost:SOIL_FILL_COST});
  const {player,bodies,protectedObjects,bounds,permission}=context;
  if(!finite(contact)||!finite(player)||bodies.some(p=>!finite(p))||!validPosition(target))return result(false,'盛土の位置が無効です');
  if(permission)return result(false,permission);
  if(shape.min.x<bounds.minX||shape.max.x>bounds.maxX||shape.min.z<bounds.minZ||shape.max.z>bounds.maxZ)return result(false,'拠点の建築範囲内で盛土する');
  const eye={...player,y:player.y+1.52};if(distance(eye,contact)>3.1||!this.clearLine(eye,{...contact,y:contact.y+.06},.08))return result(false,'3m以内の見える地面を狙う');
  if(this.state.patches.length>=64)return result(false,'盛土は64区画まで。古い盛土を撤去する');
  for(const body of [player,...bodies])if(body.x+.46>shape.min.x&&body.x-.46<shape.max.x&&body.z+.46>shape.min.z&&body.z-.46<shape.max.z&&body.y+1.9>shape.min.y&&body.y-.015<shape.max.y)return result(false,'人・仲間・動物の体に重なるため盛土できません');
  // Every quarter-meter column must have solid support directly beneath the tile.
  for(let x=shape.min.x+.125;x<shape.max.x;x+=.25)for(let z=shape.min.z+.125;z<shape.max.z;z+=.25)if(this.field.distance({x,y:shape.min.y-.06,z})>.025)return result(false,'盛土の全体に地面の支えが必要です');
  for(let x=Math.floor(shape.min.x*4);x<=Math.floor(shape.max.x*4);x++)for(let y=Math.floor(shape.min.y*4);y<=Math.floor(shape.max.y*4);y++)for(let z=Math.floor(shape.min.z*4);z<=Math.floor(shape.max.z*4);z++)if(this.field.layerSamplesAt(x,y,z).some(c=>c.distance<.04&&(protectedObjects.has(c.object??'')||c.object?.startsWith('build:')&&!c.object.startsWith(SOIL_FILL_PREFIX))))return result(false,'建築・保護対象には重ねられません');
  let added=false;
  for(let x=shape.min.x+.0625;x<shape.max.x;x+=.125)for(let y=shape.min.y+.0625;y<shape.max.y;y+=.125)for(let z=shape.min.z+.0625;z<shape.max.z;z+=.125){const p={x,y,z},d=this.field.distance(p);if(d<.035){const cell=this.field.materialAt(p);if(cell&&(protectedObjects.has(cell.object??'')||cell.object?.startsWith('build:')&&!cell.object.startsWith(SOIL_FILL_PREFIX)||![1,2,7].includes(cell.material)))return result(false,'建築・保護対象・土以外の固体には重ねられません');}if(shape.sdf(p)<-.04&&d>.02)added=true;}
  if(!added)return result(false,'この高さはすでに埋まっています');
  if(!Number.isSafeInteger(this.inventory[2])||this.inventory[2]<SOIL_FILL_COST)return result(false,'土が不足（9必要）');
  return result(true,`平らな盛土 0.75m角・高さ${target.y.toFixed(2)}m（消費 土9）`);
 }
 place(contact:Vec3,context:SoilContext){const preview=this.preview(contact,context);if(!preview.ok)return preview;const shape=soilShape(preview.target),id=SOIL_FILL_PREFIX+(this.state.sequence+1);
  if(this.state.sequence>=1e9)return {...preview,ok:false,message:'盛土の保存上限です'};
  try{this.field.shape(shape.min,shape.max,shape.sdf,2,id);}catch{this.field.removeObject(id);return {...preview,ok:false,message:'盛土に失敗しました。土は消費していません'};}this.inventory[2]-=SOIL_FILL_COST;this.state.sequence++;this.state.patches.push({id,position:{...preview.target},cost:SOIL_FILL_COST});this.undoRecord={id,revision:this.field.revision};return {...preview,message:'盛土を平らに追加（土 −9）。採掘では返却なし。無傷の撤去は土9返却'};
 }
 private intact(p:SoilPatch){if(this.damagedObjects?.has(p.id))return false;const expected=canonical(p.position),actual=[...this.field.ownedLayerSamples(p.id)];return actual.length===expected.size&&actual.every(c=>{const e=expected.get(key(c.x,c.y,c.z));return !!e&&c.distance===e[3]&&c.material===e[4];});}
 remove(id:string,context:SoilContext){const fail=(message:string)=>({ok:false,message}),patch=this.state.patches.find(p=>p.id===id);if(!patch)return fail('自分の盛土を狙う');if(context.permission)return fail(context.permission);const shape=soilShape(patch.position),eye={...context.player,y:context.player.y+1.52};
  if(!finite(context.player)||distance(eye,patch.position)>3.5||!this.clearLine(eye,{...patch.position,y:patch.position.y+.04},.1))return fail('3m以内の見える盛土を狙う');
  if([context.player,...context.bodies].some(p=>p.x+.46>shape.min.x&&p.x-.46<shape.max.x&&p.z+.46>shape.min.z&&p.z-.46<shape.max.z&&p.y+1.9>shape.min.y&&p.y<shape.max.y+.35))return fail('上や近くに体があるため盛土を撤去できません');
  // Preserve objects/tiles resting on this support. Mining remains an explicit destructive action.
  for(let x=shape.min.x+.125;x<shape.max.x;x+=.25)for(let z=shape.min.z+.125;z<shape.max.z;z+=.25){const p={x,y:shape.max.y+.12,z};if(this.field.distance(p)<0)return fail('上にある建築・盛土を先に撤去してください');}
  const refund=this.intact(patch)?SOIL_FILL_COST:0;if(this.inventory[2]+refund>1e9)return fail('土の所持上限です');
  this.field.removeObject(id);this.state.patches=this.state.patches.filter(p=>p.id!==id);this.inventory[2]+=refund;this.undoRecord=null;return {ok:true,message:refund?'無傷の盛土を撤去（土 +9）':'削った盛土を撤去（返却なし）'};
 }
 get undoTarget(){const patch=this.state.patches.find(p=>p.id===this.undoRecord?.id);return patch?{...patch.position}:null;}
 undo(context:SoilContext){if(!this.undoRecord||this.undoRecord.revision!==this.field.revision)return {ok:false,message:'直前の未変更の盛土だけ戻せます'};return this.remove(this.undoRecord.id,context);}
}
