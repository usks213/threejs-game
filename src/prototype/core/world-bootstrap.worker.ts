import {createArena} from './world';
import {extendCampaignArena} from './campaign-world';
import {extendRegionalWorld} from './regional-world';
// Do not import the worker-launching module here: it would recursively bundle itself.
const scope=self as unknown as {onmessage:((event:MessageEvent)=>void)|null;postMessage:(data:unknown,transfer?:Transferable[])=>void};
scope.onmessage=()=>{try{const arena=createArena();extendCampaignArena(arena);extendRegionalWorld(arena);arena.field.captureBaseline('campaign-v2');const packet={field:arena.field.packAuthoredBaseline(),objects:[...arena.objects.values()]},transfer:Transferable[]=[packet.field.base.buffer,...packet.field.layers.map(layer=>layer.samples.buffer)];scope.postMessage(packet,transfer);}catch(error){scope.postMessage({error:error instanceof Error?error.message:'World authoring failed'});}};
