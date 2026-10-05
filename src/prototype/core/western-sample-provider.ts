import {createCampaignSamplePrototype} from './campaign-sample-provider';
import {SampleManifestRecorder} from './sample-provider';
import {authorWesternExpedition,WEST_EXPEDITION_MANIFEST} from './expedition-west';

/** Explicit additive content factory; the ordinary campaign factory stays unchanged. */
export function createWesternSamplePrototype(maxCacheBlocks=64){
 const source=createCampaignSamplePrototype(maxCacheBlocks),recorder=new SampleManifestRecorder();
 const arena=authorWesternExpedition({field:recorder,objects:new Map([...source.objects].map(([id,o])=>[id,{...o}]))});
 return {provider:source.provider.append(recorder.operations,WEST_EXPEDITION_MANIFEST),objects:arena.objects,operationCount:source.operationCount+recorder.operations.length};
}
