import {CAMPAIGN_SAMPLE_MANIFEST,LEGACY_CAMPAIGN_V2_BASELINE,createCampaignSamplePrototype} from '../prototype/core/campaign-sample-provider';
import {createArena} from '../prototype/core/world';
import {extendCampaignArena} from '../prototype/core/campaign-world';
import {extendRegionalWorld} from '../prototype/core/regional-world';
import type {DeterministicSampleProvider} from '../prototype/core/sample-provider';

const providerCertificates=new WeakMap<DeterministicSampleProvider,string>();
const archivedCertificates=new Set<string>();
/** Legacy hashes include JSON-encoded transcendental results. Different JS engines
 * can produce a different Float64 fingerprint for these same authored primitives.
 * Never alias a reported hash: independently author this runtime's entire baseline,
 * require the exact source fingerprint, then prove every layer/sample and absence
 * agrees with the destination provider. This temporary work runs only on explicit
 * migration of an unfamiliar legacy fingerprint, never on normal v3 startup.
 * Unknown layouts/future versions still fail closed. Only scalar proofs are retained. */
export function certifyLegacyCampaignBaseline(baseline:unknown,provider:DeterministicSampleProvider):boolean {
 if(provider.manifestId!==CAMPAIGN_SAMPLE_MANIFEST||provider.size!==.25)return false;
 if(baseline===LEGACY_CAMPAIGN_V2_BASELINE)return true;
 if(typeof baseline!=='string'||!/^campaign-v2:[0-9a-f]{8}$/.test(baseline))return false;
 if(providerCertificates.get(provider)===baseline)return true;
 const arena=createArena();extendCampaignArena(arena);extendRegionalWorld(arena);arena.field.captureBaseline('campaign-v2');
 const authored=arena.field.packAuthoredBaseline();if(authored.baseline!==baseline)return false;
 if(authored.layers.length!==provider.layerOrder.length||authored.layers.some((layer,i)=>layer.id!==provider.layerOrder[i]))return false;
 const counts=new Map<string,number>();
 for(const layer of [{id:'',samples:authored.base},...authored.layers]){
  counts.set(layer.id,layer.samples.length/5);
  for(let i=0;i<layer.samples.length;i+=5){
   const [x,y,z,distance,material]=layer.samples.subarray(i,i+5),actual=provider.layersAt(x,y,z).get(layer.id);
   if(!actual||actual.distance!==distance||actual.material!==material||actual.object!==(layer.id||undefined))return false;
  }
 }
 // Matching every existing sample is insufficient: prove the provider has no extra
 // samples in old empty space either. Its authored chunk bounds cover all operations.
 for(const id of provider.authoredChunkKeys()){
  const [cx,cz]=id.split(',').map(Number),bounds=provider.sampleBoundsForChunk(cx,cz);if(!bounds)continue;
  for(let x=bounds.minX;x<=bounds.maxX;x++)for(let y=bounds.minY;y<=bounds.maxY;y++)for(let z=bounds.minZ;z<=bounds.maxZ;z++){
   for(const layer of provider.layersAt(x,y,z).keys()){
    const remaining=counts.get(layer);if(remaining===undefined||remaining===0)return false;counts.set(layer,remaining-1);
   }
  }
 }
 if([...counts.values()].some(count=>count!==0))return false;
 providerCertificates.set(provider,baseline);archivedCertificates.add(baseline);return true;
}

/** Archive validation reuses only a completed proof, never the source's own claim. */
export function certifiedLegacyArchiveBaseline(baseline:unknown):boolean {
 return baseline===LEGACY_CAMPAIGN_V2_BASELINE||typeof baseline==='string'&&archivedCertificates.has(baseline)||certifyLegacyCampaignBaseline(baseline,createCampaignSamplePrototype().provider);
}
