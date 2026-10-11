import {describe,it,expect} from 'vitest';
import {VoxelField,key,type Cell} from '../../src/prototype/core/voxel';
import {createArena} from '../../src/prototype/core/world';
import {extendCampaignArena} from '../../src/prototype/core/campaign-world';
import {extendRegionalWorld} from '../../src/prototype/core/regional-world';
import {SampleManifestRecorder,ProviderQueryField} from '../../src/prototype/core/sample-provider';
import {LEGACY_CAMPAIGN_V2_BASELINE,createCampaignSamplePrototype} from '../../src/prototype/core/campaign-sample-provider';
import {SparseOverlayField} from '../../src/prototype/core/sample-overlay';
const compareCell=(a:Cell|undefined,b:Cell|undefined)=>{expect(a?.distance).toBe(b?.distance);expect(a?.material).toBe(b?.material);expect(a?.object).toBe(b?.object);};
function author(field:VoxelField){field.box({x:-2,y:-1,z:-2},{x:5,y:.25,z:5},2);field.box({x:-1,y:0,z:-1},{x:2,y:2,z:2},4,'old');field.box({x:0,y:.5,z:0},{x:3,y:3,z:3},6,'overlap');field.box({x:.5,y:.5,z:-.5},{x:1.5,y:2,z:1.5},0);field.removeObject('old');field.box({x:-1,y:0,z:-1},{x:1,y:1,z:1},5,'old');}
function pair(){const original=new VoxelField(),recorder=new SampleManifestRecorder();author(original);author(recorder);const provider=recorder.createProvider('fixture',2),overlay=new SparseOverlayField(provider);return{original,recorder,provider,overlay};}
function compareArea(original:VoxelField,query:ProviderQueryField){for(let x=-10;x<=22;x++)for(let y=-6;y<=14;y++)for(let z=-10;z<=22;z++){const a=original.cells.get(key(x,y,z)),b=query.sampleCell(x,y,z);if(a?.distance!==b?.distance||a?.material!==b?.material||a?.object!==b?.object)throw new Error(`Sample mismatch at ${key(x,y,z)}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);}}

describe('immutable deterministic sample provider',()=>{
 it('records without populating a global sample map, and reproduces CSG/material/ownership exactly',()=>{const {original,recorder,provider}=pair();expect(recorder.cells.size).toBe(0);compareArea(original,new ProviderQueryField(provider));expect(provider.stats.numericBytes).toBeLessThanOrEqual(2*4096*12);expect(provider.stats.evictions).toBeGreaterThan(0);});
 it('preserves global object priority when earlier creation occurred outside a query chunk',()=>{
  const original=new VoxelField(),recorder=new SampleManifestRecorder();for(const field of [original,recorder]){field.box({x:30,y:0,z:0},{x:31,y:1,z:1},4,'first');field.box({x:0,y:0,z:0},{x:1,y:1,z:1},6,'second');field.box({x:0,y:0,z:0},{x:1,y:1,z:1},4,'first');}
  const query=new ProviderQueryField(recorder.createProvider('order'));compareCell(original.get(1,1,1),query.get(1,1,1));expect(query.get(1,1,1)?.object).toBe('first');
 });
 it('has no collision or ray gap after all cached samples are evicted',()=>{
  const {original,provider}=pair(),query=new ProviderQueryField(provider),p={x:4,y:.2,z:4};const before=query.distance(p),hit=query.ray({x:4,y:4,z:4},{x:0,y:-1,z:0},6);
  for(let x=100;x<300;x+=16)query.sample(x,100,100);provider.clearCache();expect(query.distance(p)).toBe(before);expect(query.distance(p)).toBe(original.distance(p));expect(query.ray({x:4,y:4,z:4},{x:0,y:-1,z:0},6)).toEqual(hit);expect(query.overlaps({x:4,y:0,z:4})).toBe(original.overlaps({x:4,y:0,z:4}));
 });
 it('append-only outer operations preserve original samples and require a distinct manifest identity',()=>{
  const {provider}=pair(),extension=new SampleManifestRecorder();extension.box({x:50,y:-1,z:50},{x:55,y:2,z:55},3);
  expect(()=>provider.append(extension.operations,'fixture')).toThrow();const expanded=provider.append(extension.operations,'fixture-expanded');
  for(let x=-5;x<10;x++)for(let y=-3;y<10;y++)for(let z=-5;z<10;z++)compareCell(provider.cell(x,y,z),expanded.cell(x,y,z));expect(expanded.sample(204,2,204)).toBeLessThan(0);expect(provider.sample(204,2,204)).toBe(.5);
 });
 it('matches every currently stored campaign-v2 sample exactly, plus absent-space probes',()=>{
  const arena=createArena();extendCampaignArena(arena);extendRegionalWorld(arena);
  const recorder=new SampleManifestRecorder(),recorded=createArena(recorder);extendCampaignArena(recorded);extendRegionalWorld(recorded);const provider=recorder.createProvider('campaign-v2-authored-prototype',64);
  let checked=0;for(const [id,original] of arena.field.cells){const actual=provider.cell(original.x,original.y,original.z);if(actual?.distance!==original.distance||actual?.material!==original.material||actual?.object!==original.object)throw new Error(`Campaign mismatch ${id}: ${JSON.stringify(original)} / ${JSON.stringify(actual)}`);checked++;}
  arena.field.captureBaseline('campaign-v2');expect(arena.field.exportState().baseline).toBe(LEGACY_CAMPAIGN_V2_BASELINE);expect(createCampaignSamplePrototype().provider.operationCount).toBe(provider.operationCount);
  expect(checked).toBeGreaterThan(600000);for(let x=-160;x<=160;x+=7)for(let z=-240;z<=70;z+=11)for(const y of [-20,0,12,50])compareCell(arena.field.cells.get(key(x,y,z)),provider.cell(x,y,z));
  expect(provider.stats.numericBytes).toBeLessThanOrEqual(64*4096*12);expect(recorded.objects).toEqual(arena.objects);
  const edited=new SparseOverlayField(provider);
  for(const id of ['door','tree0','mist-plateau','rg-field-cache']){arena.field.removeObject(id);edited.removeObject(id);const b=provider.layerBounds.get(id)!;
   for(let x=b.minX;x<=b.maxX;x++)for(let y=b.minY;y<=b.maxY;y++)for(let z=b.minZ;z<=b.maxZ;z++){const a=arena.field.cells.get(key(x,y,z)),c=edited.sampleCell(x,y,z);if(a?.distance!==c?.distance||a?.material!==c?.material||a?.object!==c?.object)throw new Error(`Campaign underlay mismatch ${id} ${key(x,y,z)}`);}
  }

 },30000);
});
describe('persistent sparse edits over evictable authored samples',()=>{
 it('matches carving, depletion, layer removal, underlay reveal and replacement',()=>{
  const {original,overlay,provider}=pair();for(const f of [original,overlay]){f.carve({x:2,y:1,z:2},.7);f.box({x:3,y:.25,z:3},{x:4,y:2,z:4},4,'build:wall');f.removeObject('overlap');f.removeObject('old');f.box({x:0,y:.25,z:0},{x:1,y:1,z:1},6,'old');const c=f.get(13,3,13);if(c)f.depleteSample(c);}
  compareArea(original,overlay);provider.clearCache();compareArea(original,overlay);expect(overlay.editSampleCount).toBeGreaterThan(0);expect(overlay.deletedObjectCount).toBe(2);
 });
 it('blocks accidental legacy saves and marks removed player geometry dirty',()=>{const {overlay}=pair();expect(()=>overlay.exportState()).toThrow();expect(overlay.restoreState({})).toBe(false);overlay.box({x:40,y:0,z:0},{x:41,y:1,z:1},4,'build:temporary');overlay.dirty.clear();overlay.removeObject('build:temporary');expect(overlay.dirty.size).toBeGreaterThan(0);});
 it('round-trips all sparse state, including edits far outside cached chunks',()=>{
  const {overlay,provider}=pair();overlay.removeObject('old');overlay.box({x:44,y:0,z:4},{x:46,y:2,z:6},5,'build:far');overlay.carve({x:2,y:.25,z:4},.5);const saved=overlay.exportOverlay(),loaded=new SparseOverlayField(provider);expect(loaded.restoreOverlay(JSON.parse(JSON.stringify(saved)))).toBe(true);provider.clearCache();expect(loaded.exportOverlay()).toEqual(saved);for(const [x,y,z] of [[180,2,20],[4,2,4],[8,0,16]])compareCell(overlay.sampleCell(x,y,z),loaded.sampleCell(x,y,z));
 });
 it('rejects mismatched manifests and malformed/tampered overlays atomically',()=>{
  const {overlay}=pair(),before=overlay.exportOverlay();for(const bad of [{...before,manifest:'unknown'}, {...before,order:[]},{...before,suppressed:['unknown']},{...before,layers:[{id:'',cells:[[0,0,0,NaN,3]],removed:[]}]},{...before,layers:[{id:'',cells:[],removed:['0,0,99999999']}]}]){expect(overlay.restoreOverlay(bad)).toBe(false);expect(overlay.exportOverlay()).toEqual(before);}
 });
});
