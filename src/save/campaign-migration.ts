import {VAULT_OBJECT_IDS,validEchoVaultSave} from '../prototype/core/echo-vault';
import {isCampaignSave,type CampaignSave} from '../prototype/campaign-session';
import {CAMPAIGN_SAMPLE_MANIFEST,createCampaignSamplePrototype} from '../prototype/core/campaign-sample-provider';
import {StreamedCampaignField,type StreamedVoxelState} from '../prototype/core/streamed-campaign-field';
import type {DeterministicSampleProvider} from '../prototype/core/sample-provider';
import {VoxelField,key,type SampleState} from '../prototype/core/voxel';
import {SurvivalSystem} from '../prototype/core/survival';
import {ElementSystem} from '../prototype/core/elements';
import {EntityElements} from '../prototype/core/entity-elements';
import {VoxelWater} from '../prototype/core/water';
import {CampaignSystem} from '../prototype/core/campaign';
import {HomesteadSystem} from '../prototype/core/homestead';
import {FishingSystem,createFishingState} from '../prototype/core/fishing';
import type {SaveStorage} from './checkpoint';
import {record,integer,number,text,checksum} from './validation';
import {certifyLegacyCampaignBaseline,certifiedLegacyArchiveBaseline} from './campaign-migration-certification';

export type StreamedCampaignSave=Omit<CampaignSave,'world'|'field'>&{world:'campaign-v3';field:StreamedVoxelState};
/** Conversion is deliberately separate from restoreState. A matching human-readable
 * manifest name alone is insufficient: the legacy baseline must be certified first. */
export function migrateLegacyCampaignField(value:unknown,provider:DeterministicSampleProvider):StreamedVoxelState|null {
 if(provider.manifestId!==CAMPAIGN_SAMPLE_MANIFEST||provider.size!==.25||!record(value)||value.version!==1||value.size!==provider.size||value.suppressed!==undefined||!Array.isArray(value.base)||!Array.isArray(value.removedBase)||!Array.isArray(value.layers)||!Array.isArray(value.order)||value.layers.length!==value.order.length||value.layers.length>1024||!certifyLegacyCampaignBaseline(value.baseline,provider))return null;
 const order:string[]=[];for(const id of value.order){if(!text(id)||order.includes(id))return null;order.push(id);}
 let count=0;
 const decode=(cells:unknown[],removed:unknown[],layer:string):{cells:SampleState[];removed:string[]}|null=>{
  if((count+=cells.length+removed.length)>1000000)return null;const seen=new Set<string>(),out:SampleState[]=[],deleted:string[]=[];
  for(const tuple of cells){if(!Array.isArray(tuple)||tuple.length!==5)return null;const [x,y,z,distance,material]=tuple;if(!integer(x,-8192,8192)||!integer(y,-8192,8192)||!integer(z,-8192,8192)||!number(distance,-provider.size*2,provider.size*2)||!integer(material,0,10))return null;const id=key(x,y,z);if(seen.has(id))return null;seen.add(id);out.push([x,y,z,distance,material]);}
  for(const id of removed){if(typeof id!=='string'||!/^[-]?\d+,[-]?\d+,[-]?\d+$/.test(id)||seen.has(id))return null;const [x,y,z]=id.split(',').map(Number);if(!integer(x,-8192,8192)||!integer(y,-8192,8192)||!integer(z,-8192,8192)||key(x,y,z)!==id||!provider.layersAt(x,y,z).has(layer))return null;seen.add(id);deleted.push(id);}
  return {cells:out,removed:deleted};
 };
 const base=decode(value.base,value.removedBase,'');if(!base)return null;
 const layers:StreamedVoxelState['layers']=[];
 for(let i=0;i<value.layers.length;i++){const layer=value.layers[i];if(!record(layer)||layer.id!==order[i]||!Array.isArray(layer.cells)||!Array.isArray(layer.removed))return null;const decoded=decode(layer.cells,layer.removed,order[i]);if(!decoded)return null;layers.push({id:order[i],...decoded});}
 // Legacy absent authored objects become durable whole-layer tombstones. A legacy
 // re-created ID already encodes each absent original sample in its removed array;
 // retaining that array and its exact order preserves its complete final geometry.
 const candidate:StreamedVoxelState={version:1,size:provider.size,baseline:provider.manifestId,base:base.cells,removedBase:base.removed,order,layers,suppressed:provider.layerOrder.filter(id=>!order.includes(id))};
 return new StreamedCampaignField(provider).restoreState(candidate,true)?candidate:null;
}
/** A detached, fully staged candidate. No source/world/storage mutation occurs here.
 * The caller must verify preserveLegacyMigrationBackup before committing this candidate
 * to a NEW v3 key; normal v3 autosaves must never overwrite the original v2 key. */
export function prepareLegacyCampaignMigration(value:unknown,prototype:Pick<ReturnType<typeof createCampaignSamplePrototype>,'provider'|'objects'>):StreamedCampaignSave|null {
 if(!isCampaignSave(value)||value.world!=='campaign-v2')return null;let source:CampaignSave;try{source=JSON.parse(JSON.stringify(value)) as CampaignSave;}catch{return null;}if(!isCampaignSave(source))return null;
 const baseObjects=source.objects.filter(object=>!VAULT_OBJECT_IDS.includes(object.id));
 if(baseObjects.length!==prototype.objects.size||baseObjects.some(object=>!prototype.objects.has(object.id)))return null;
 const field=migrateLegacyCampaignField(source.field,prototype.provider);if(!field)return null;
 const empty=new VoxelField(),survival=new SurvivalSystem(empty),elements=new ElementSystem(empty,new VoxelWater(empty)),campaign=new CampaignSystem(survival.inventory),home=new HomesteadSystem(survival.inventory,campaign.state.items);
 if(!survival.restoreState(source.survival)||!elements.restoreState(source.elements)||!campaign.restore(source.campaign)||!home.restore(source.home))return null;
 if(!validEchoVaultSave(source.dungeon,source.field,source.objects,campaign.state.items,home.state.storage.items))return null;
 if(!new FishingSystem(campaign,empty,()=>null).restore(source.fishing??createFishingState()))return null;
 for(const state of source.entities)if(!new EntityElements().restoreState(state))return null;
 return {...source,world:'campaign-v3',field};
}
export const migrationBackupKey=(sourceKey:string)=>`${sourceKey}:migration:campaign-samples-v1:c1602605`;
export type MigrationBackupResult={ok:true;key:string;alreadyPresent:boolean}|{ok:false;reason:'missing'|'invalid-source'|'conflict'|'storage'|'verification'|'source-changed'};
/** Write-once migration archive, independent of the rotating :backup slot. This never
 * erases/changes the source and never overwrites a different earlier archive. On quota or
 * verification failure callers must leave the v2 game/store selected and show a blocker. */
export function preserveLegacyMigrationBackup(storage:SaveStorage,sourceKey:string,archiveKey=migrationBackupKey(sourceKey),expectedSource?:string):MigrationBackupResult {
 try{const raw=storage.getItem(sourceKey);if(raw===null)return {ok:false,reason:'missing'};if(expectedSource!==undefined&&raw!==expectedSource)return {ok:false,reason:'source-changed'};if(raw.length>12000000)return {ok:false,reason:'invalid-source'};
  let envelope:unknown,source:unknown;try{envelope=JSON.parse(raw);if(!record(envelope)||envelope.format!=='voxel-campaign'||envelope.version!==1||!integer(envelope.savedAt)||typeof envelope.payload!=='string'||typeof envelope.checksum!=='string'||checksum(envelope.payload)!==envelope.checksum)return {ok:false,reason:'invalid-source'};source=JSON.parse(envelope.payload);}catch{return {ok:false,reason:'invalid-source'};}
  if(!isCampaignSave(source)||source.world!=='campaign-v2'||!certifiedLegacyArchiveBaseline(source.field.baseline))return {ok:false,reason:'invalid-source'};
  const key=archiveKey,previous=storage.getItem(key);if(previous!==null){if(previous!==raw)return {ok:false,reason:'conflict'};return storage.getItem(sourceKey)===raw?{ok:true,key,alreadyPresent:true}:{ok:false,reason:'source-changed'};}
  storage.setItem(key,raw);if(storage.getItem(key)!==raw)return {ok:false,reason:'verification'};if(storage.getItem(sourceKey)!==raw)return {ok:false,reason:'source-changed'};return {ok:true,key,alreadyPresent:false};
 }catch{return {ok:false,reason:'storage'};}
}
