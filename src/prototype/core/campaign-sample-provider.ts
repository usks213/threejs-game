import {createArena} from './world';
import {extendCampaignArena} from './campaign-world';
import {extendRegionalWorld} from './regional-world';
import {SampleManifestRecorder} from './sample-provider';

/** This identity is certified by the dedicated test against legacy Float64 authoring.
 * Changing any legacy primitive requires an explicit migration/new identity, not reseeding.
 * It is a compatibility fingerprint, not authentication or a substitute for DTO validation. */
export const LEGACY_CAMPAIGN_V2_BASELINE='campaign-v2:c1602605';
export const CAMPAIGN_SAMPLE_MANIFEST='campaign-samples-v1/c1602605';
/** Prototype only: no world/save/runtime replacement occurs by importing this factory. */
export function createCampaignSamplePrototype(maxCacheBlocks=64){
 const recorder=new SampleManifestRecorder(),arena=createArena(recorder);extendCampaignArena(arena);extendRegionalWorld(arena);
 return{provider:recorder.createProvider(CAMPAIGN_SAMPLE_MANIFEST,maxCacheBlocks),objects:arena.objects,operationCount:recorder.operations.length};
}
