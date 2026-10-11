import {createCampaignSamplePrototype,CAMPAIGN_SAMPLE_MANIFEST} from '../prototype/core/campaign-sample-provider';
import {SampleManifestRecorder} from '../prototype/core/sample-provider';
import {SparseOverlayField,type SparseOverlayState} from '../prototype/core/sample-overlay';
import {StreamedCampaignField,type StreamedVoxelState} from '../prototype/core/streamed-campaign-field';
import {authorWesternExpedition,WEST_EXPEDITION_MANIFEST} from '../prototype/core/expedition-west';
import {WEST_RUNTIME_ENEMIES,createWestExpeditionState,validWestExpeditionState,type WestExpeditionState} from '../prototype/core/expedition-west-integration';
import {EntityElements} from '../prototype/core/entity-elements';
import type {SaveStorage} from './checkpoint';
import {record,integer,checksum} from './validation';
import {key,type Cell} from '../prototype/core/voxel';
import {isCampaignSave,isStreamedCampaignSave,hydrateCampaign,type CampaignSave} from '../prototype/campaign-session';

/** Isolated authoring context. Calling it activates neither Core content nor a save store. */
export function createWesternMigrationContext(cacheBlocks=16){
 const source=createCampaignSamplePrototype(cacheBlocks),recorder=new SampleManifestRecorder();
 const arena=authorWesternExpedition({field:recorder,objects:new Map([...source.objects].map(([id,object])=>[id,{...object}]))});
 return {source,target:{provider:source.provider.append(recorder.operations,WEST_EXPEDITION_MANIFEST),objects:arena.objects}};
}
export type WesternMigrationContext=ReturnType<typeof createWesternMigrationContext>;
export interface WesternEditConflict {sample:string;before:{distance:number;material:number;object?:string}|null;after:{distance:number;material:number;object?:string}|null}
export type WesternFieldMigration=
 |{ok:true;field:StreamedVoxelState;addedLayerIds:string[];checkedEditedSamples:number}
 |{ok:false;reason:'unsupported-manifest'|'invalid-source'|'layer-id-collision'|'invalid-target'|'content-overlap';conflicts?:WesternEditConflict[]};
const same=(a:Cell|undefined,b:Cell|undefined)=>a===b||!!a&&!!b&&a.distance===b.distance&&a.material===b.material&&a.object===b.object;
const describe=(cell:Cell|undefined)=>cell?{distance:cell.distance,material:cell.material,object:cell.object}:null;

/** Absolute edits and tombstones win in their existing layers. Newly authored geometry
 * can nevertheless occlude a player layer during SDF composition. Detect that explicitly;
 * never silently bury a build or carve away a new quest gate to make migration pass. */
export function prepareWesternFieldMigration(value:unknown,context:WesternMigrationContext):WesternFieldMigration {
 const {source,target}=context,oldProvider=source.provider,newProvider=target.provider;
 if(oldProvider.manifestId!==CAMPAIGN_SAMPLE_MANIFEST||newProvider.manifestId!==WEST_EXPEDITION_MANIFEST||newProvider.size!==oldProvider.size||oldProvider.layerOrder.some((id,index)=>newProvider.layerOrder[index]!==id))return {ok:false,reason:'unsupported-manifest'};
 const before=new StreamedCampaignField(oldProvider);if(!before.restoreState(value))return {ok:false,reason:'invalid-source'};
 const saved=before.exportState(),overlay=before.exportOverlay(),added=newProvider.layerOrder.filter(id=>!oldProvider.layerOrder.includes(id));
 if(added.some(id=>saved.order.includes(id)))return {ok:false,reason:'layer-id-collision'};
 const migrated:SparseOverlayState={...overlay,manifest:newProvider.manifestId,order:[...overlay.order,...added]};
 const after=new SparseOverlayField(newProvider);if(!after.restoreOverlay(migrated))return {ok:false,reason:'invalid-target'};
 const edited=new Set<string>();for(const layer of overlay.layers){for(const cell of layer.cells)edited.add(key(cell[0],cell[1],cell[2]));for(const id of layer.removed)edited.add(id);}
 const conflicts:WesternEditConflict[]=[];let checked=0;
 for(const id of edited){const [x,y,z]=id.split(',').map(Number),a=before.sampleCell(x,y,z),b=after.sampleCell(x,y,z);checked++;if(!same(a,b)){conflicts.push({sample:id,before:describe(a),after:describe(b)});if(conflicts.length>=16)break;}}
 if(conflicts.length)return {ok:false,reason:'content-overlap',conflicts};
 return {ok:true,field:{...saved,baseline:newProvider.manifestId,order:[...saved.order,...added],layers:[...saved.layers,...added.map(id=>({id,cells:[],removed:[]}))]},addedLayerIds:added,checkedEditedSamples:checked};
}
export interface WesternMigrationPlan {
 /** Still a validated v3 source, deliberately NOT a loadable future-version envelope. */
 source:CampaignSave;
 fromManifest:typeof CAMPAIGN_SAMPLE_MANIFEST;
 toManifest:typeof WEST_EXPEDITION_MANIFEST;
 field:StreamedVoxelState;
 addedObjects:CampaignSave['objects'];
 addedEnemies:{key:string;slot:number;definitionId:number;state:CampaignSave['enemies'][number];elements:CampaignSave['entities'][number]}[];
 western:WestExpeditionState;
 checkedEditedSamples:number;
}
export type WesternCampaignCandidate=Omit<CampaignSave,'world'|'field'>&{world:'campaign-v4';field:StreamedVoxelState;western:WestExpeditionState};
export type WesternMigrationFailure=Extract<WesternFieldMigration,{ok:false}>['reason']|'unsupported-source'|'existing-western-state'|'object-id-collision'|'enemy-registry';
export type WesternMigrationResult={ok:true;plan:WesternMigrationPlan;candidate:WesternCampaignCandidate}|{ok:false;reason:WesternMigrationFailure;conflicts?:WesternEditConflict[]};
/** Preparation only. Existing campaign/item/quest/claim arrays and actors0–17 are copied
 * unchanged. Future runtime wiring chooses its explicit envelope/key/selector, archives
 * the original v3 bytes, validates the new registry, and only then commits the plan. */
export function prepareWesternMigrationPlan(value:unknown,context=createWesternMigrationContext()):WesternMigrationResult {
 if(record(value)&&value.world==='campaign-v3'&&value.western!==undefined)return {ok:false,reason:'existing-western-state'};
 if(!isCampaignSave(value)||value.world!=='campaign-v3'||value.field.baseline!==CAMPAIGN_SAMPLE_MANIFEST)return {ok:false,reason:'unsupported-source'};
 let source:CampaignSave;try{source=JSON.parse(JSON.stringify(value)) as CampaignSave;}catch{return {ok:false,reason:'invalid-source'};}
 const geometry=prepareWesternFieldMigration(source.field,context);if(!geometry.ok)return geometry;
 // The established v3 transaction supplies full component validation on a fresh sparse
 // Core, with no whole-world rasterization and no mutation of the caller's live world.
 if(!hydrateCampaign(source))return {ok:false,reason:'invalid-source'};
 const addedObjects=[...context.target.objects.values()].filter(object=>!context.source.objects.has(object.id)).map(object=>({id:object.id,open:object.open,hp:object.hp}));
 if(addedObjects.some(object=>source.objects.some(old=>old.id===object.id)))return {ok:false,reason:'object-id-collision'};
 const expected=['west-axeguard','west-lookout','west-pitguard','west-orewatch'];
 if(source.enemies.length!==18||source.entities.length!==18||WEST_RUNTIME_ENEMIES.length!==4||expected.some((id,index)=>!WEST_RUNTIME_ENEMIES.some(enemy=>enemy.key===id&&enemy.slot===18+index&&enemy.definition.id===201+index)))return {ok:false,reason:'enemy-registry'};
 const addedEnemies=WEST_RUNTIME_ENEMIES.map(enemy=>({key:enemy.key,slot:enemy.slot,definitionId:enemy.definition.id,state:{id:enemy.slot,position:{...enemy.definition.position},yaw:0,hp:enemy.definition.hp,summonOwner:undefined},elements:new EntityElements().exportState()}));
 const western=createWestExpeditionState();if(!validWestExpeditionState(western))return {ok:false,reason:'enemy-registry'};
 const candidate=JSON.parse(JSON.stringify({...source,world:'campaign-v4',field:geometry.field,objects:[...source.objects,...addedObjects],enemies:[...source.enemies,...addedEnemies.map(enemy=>enemy.state)],entities:[...source.entities,...addedEnemies.map(enemy=>enemy.elements)],western})) as WesternCampaignCandidate;
 return {ok:true,plan:{source,fromManifest:CAMPAIGN_SAMPLE_MANIFEST,toManifest:WEST_EXPEDITION_MANIFEST,field:geometry.field,addedObjects,addedEnemies,western,checkedEditedSamples:geometry.checkedEditedSamples},candidate};
}

export const WESTERN_MIGRATION_ARCHIVE='ash-campaign-v3:migration:campaign-west-expedition-v1';
export type WesternArchiveResult={ok:true;alreadyPresent:boolean}|{ok:false;reason:'missing'|'source-changed'|'invalid-source'|'conflict'|'verification'|'storage'};
/** Dedicated immutable v3 archive; never the rotating backup and never a v2 overwrite. */
export function preserveWesternMigrationBackup(storage:SaveStorage,sourceKey:string,expectedSource:string):WesternArchiveResult {
 try{const raw=storage.getItem(sourceKey);if(raw===null)return {ok:false,reason:'missing'};if(raw!==expectedSource)return {ok:false,reason:'source-changed'};if(raw.length>12000000)return {ok:false,reason:'invalid-source'};
  let envelope:unknown,source:unknown;try{envelope=JSON.parse(raw);if(!record(envelope)||envelope.format!=='voxel-campaign'||envelope.version!==1||!integer(envelope.savedAt)||typeof envelope.payload!=='string'||checksum(envelope.payload)!==envelope.checksum)return {ok:false,reason:'invalid-source'};source=JSON.parse(envelope.payload);}catch{return {ok:false,reason:'invalid-source'};}
  if(!isStreamedCampaignSave(source)||source.field.baseline!==CAMPAIGN_SAMPLE_MANIFEST)return {ok:false,reason:'invalid-source'};
  const previous=storage.getItem(WESTERN_MIGRATION_ARCHIVE);if(previous!==null&&previous!==raw)return {ok:false,reason:'conflict'};
  if(previous===null)storage.setItem(WESTERN_MIGRATION_ARCHIVE,raw);if(storage.getItem(WESTERN_MIGRATION_ARCHIVE)!==raw)return {ok:false,reason:'verification'};if(storage.getItem(sourceKey)!==raw)return {ok:false,reason:'source-changed'};
  return {ok:true,alreadyPresent:previous!==null};
 }catch{return {ok:false,reason:'storage'};}
}
