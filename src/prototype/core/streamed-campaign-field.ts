import {record,number,text} from '../../save/validation';
import {SparseOverlayField,type SparseOverlayState} from './sample-overlay';
import type {DeterministicSampleProvider} from './sample-provider';
import {CAMPAIGN_SAMPLE_MANIFEST} from './campaign-sample-provider';
import type {VoxelState,AuthoredVoxelState,VoxelWorkOptions,Vec3,Sdf} from './voxel';

/** A distinct manifest identifies the save backend. Absolute Float64 sample tuples stay
 * unchanged; suppression is required because absent/re-created layers are not the baseline. */
export interface StreamedVoxelState extends VoxelState {suppressed:string[]}
function overlayFromEnvelope(value:unknown,provider:DeterministicSampleProvider):SparseOverlayState|null {
 if(!record(value)||value.version!==1||value.baseline!==provider.manifestId||!number(value.size)||value.size!==provider.size||!Array.isArray(value.base)||!Array.isArray(value.removedBase)||!Array.isArray(value.layers)||!Array.isArray(value.order)||!Array.isArray(value.suppressed)||value.layers.length!==value.order.length||value.layers.length>1024)return null;
 for(const id of [...value.order,...value.suppressed])if(!text(id,200))return null;
 const layers:SparseOverlayState['layers']=[];
 if(value.base.length||value.removedBase.length)layers.push({id:'',cells:value.base,removed:value.removedBase});
 for(let i=0;i<value.layers.length;i++){const layer=value.layers[i];if(!record(layer)||!text(layer.id,200)||layer.id!==value.order[i]||!Array.isArray(layer.cells)||!Array.isArray(layer.removed))return null;if(layer.cells.length||layer.removed.length)layers.push({id:layer.id,cells:layer.cells,removed:layer.removed});}
 return {version:1,manifest:provider.manifestId,size:provider.size,order:[...value.order],suppressed:[...value.suppressed],layers};
}
/** Explicit opt-in adapter; importing it does not replace the legacy world or save store. */
export class StreamedCampaignField extends SparseOverlayField {
 constructor(provider:DeterministicSampleProvider){if(provider.manifestId!==CAMPAIGN_SAMPLE_MANIFEST||provider.size!==.25)throw new Error('Unsupported campaign sample manifest');super(provider);}
 override exportState():StreamedVoxelState {
  const state=this.exportOverlay(),layers=new Map(state.layers.map(layer=>[layer.id,layer])),base=layers.get('');
  return {version:1,size:this.size,baseline:this.provider.manifestId,base:base?.cells??[],removedBase:base?.removed??[],order:state.order,layers:state.order.map(id=>layers.get(id)??{id,cells:[],removed:[]}),suppressed:state.suppressed};
 }
 override restoreState(value:unknown,validateOnly=false):boolean {
  const overlay=overlayFromEnvelope(value,this.provider);if(!overlay)return false;
  return validateOnly?new SparseOverlayField(this.provider).restoreOverlay(overlay):this.restoreOverlay(overlay);
 }
 override *shapeSteps(_a:Vec3,_b:Vec3,_sdf:Sdf,_material:number,_object?:string,_subtract=false):Generator<void,void>{throw new Error('Legacy authoring generators cannot modify a streamed field');}
 override *removeObjectSteps(_object:string):Generator<void,void>{throw new Error('Legacy authoring generators cannot modify a streamed field');}
 override captureBaseline(_worldId:string):never {throw new Error('A streamed campaign uses its certified immutable manifest');}
 override *captureBaselineSteps(_worldId:string):Generator<void,void>{throw new Error('A streamed campaign uses its certified immutable manifest');}
 override packAuthoredBaseline():never {throw new Error('Streamed samples must not be expanded into a legacy full-world packet');}
 override *packAuthoredBaselineSteps():Generator<void,AuthoredVoxelState>{throw new Error('Streamed samples must not be expanded into a legacy full-world packet');}
 override async mergeAuthoredBaseline(_packet:AuthoredVoxelState,_options:VoxelWorkOptions={}):Promise<void>{throw new Error('Legacy world bootstrap cannot replace a streamed manifest');}
}
