import {describe,it,expect} from 'vitest';
import type {ObjectState} from '../../src/prototype/core/world';
import {SampleManifestRecorder} from '../../src/prototype/core/sample-provider';
import {SparseOverlayField} from '../../src/prototype/core/sample-overlay';
import {createCampaignSamplePrototype} from '../../src/prototype/core/campaign-sample-provider';
import {ProviderResidency} from '../../src/prototype/rendering/provider-residency';
import {WEST_EXPEDITION_MANIFEST,WEST_POIS,WEST_POINTS,WEST_RESOURCES,WEST_ENCOUNTERS,WEST_QUESTS,WEST_ROUTES,WEST_MINE_CLEARANCE,WEST_SHORTCUT_CLEARANCE,authorWesternExpedition,operateWestSwitch} from '../../src/prototype/core/expedition-west';
const setup=()=>{const recorder=new SampleManifestRecorder(),authored=authorWesternExpedition({field:recorder,objects:new Map<string,ObjectState>()}),field=new SparseOverlayField(recorder.createProvider(WEST_EXPEDITION_MANIFEST,8));return{recorder,field,arena:{field,objects:authored.objects}};};
const length=(nodes:readonly {x:number;y:number;z:number}[])=>nodes.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-nodes[i].x,p.y-nodes[i].y,p.z-nodes[i].z),0);

describe('additive western exploration loop',()=>{
 it('has stable linked content with two meaningful POIs and an optional progression chain',()=>{
  expect(WEST_POIS).toHaveLength(2);expect(WEST_RESOURCES).toHaveLength(6);expect(WEST_ENCOUNTERS).toHaveLength(4);expect(WEST_POINTS.filter(p=>p.kind==='hearth')).toHaveLength(1);
  const ids=[...WEST_POINTS,...WEST_RESOURCES,...WEST_ENCOUNTERS].map(p=>p.id);expect(new Set(ids).size).toBe(ids.length);
  for(const q of WEST_QUESTS)for(const id of q.objectives)expect(WEST_POINTS.some(p=>p.id===id)).toBe(true);
  expect(WEST_QUESTS[0].requires).toEqual(['region-resinwood']);expect(WEST_QUESTS.at(-1)?.next).toBe('free-exploration');
  expect(length(WEST_ROUTES[0].nodes)+length(WEST_ROUTES[2].nodes)).toBeGreaterThan(75);
  expect(WEST_ROUTES[0].nodes).not.toEqual(WEST_ROUTES[1].nodes);
 });
 it('records deterministic operations without rasterizing the whole expansion',()=>{
  const {recorder,field}=setup();expect(recorder.cells.size).toBe(0);expect(recorder.operations.length).toBeGreaterThan(60);expect(field.provider.stats.blocks).toBe(0);
  for(const op of recorder.operations)if(op.type==='shape')expect((op.bounds.maxY-op.bounds.minY)*recorder.size).toBeLessThan(8);
  const helper=new ProviderResidency(field);expect(helper.chunkKeys().size).toBeGreaterThan(50);expect(field.provider.stats.evaluations).toBe(0);
 });
 it('places every resource, camp, cache and switch as real occupied object geometry',()=>{
  const {field,arena}=setup();for(const point of [...WEST_POINTS,...WEST_RESOURCES]){expect(arena.objects.get(point.id)?.kind).toBe(point.kind);expect([...field.objectSamples(point.id)].some(c=>c.distance<0),point.id).toBe(true);}
 });
 it('has supporting ground along both roads and the return path',()=>{
  const {field}=setup();
  for(const route of WEST_ROUTES)for(let i=1;i<route.nodes.length;i++){const a=route.nodes[i-1],b=route.nodes[i];for(let n=0;n<=20;n++){const t=n/20,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t-.22,z:a.z+(b.z-a.z)*t};expect(field.distance(p),`${route.id}/${i}/${n}`).toBeLessThan(0);}}
 });
 it('supports both mine entrances and branching walkable interior clearance',()=>{
  const {field}=setup();for(const p of WEST_MINE_CLEARANCE){expect(field.overlaps(p),JSON.stringify(p)).toBe(false);expect(field.distance({...p,y:p.y-.3})).toBeLessThan(0);}
  expect(field.distance({x:-61,y:5.5,z:-42})).toBeLessThan(0); // central branch-defining pillar
  expect(field.distance({x:-60,y:7.2,z:-42})).toBeLessThan(0); // roof above the chamber
 });
 it('joins the actual old forest and mesa without routing through their cave walls',()=>{
  const {recorder}=setup(),provider=createCampaignSamplePrototype().provider.append(recorder.operations,WEST_EXPEDITION_MANIFEST),field=new SparseOverlayField(provider);
  for(const route of WEST_ROUTES)for(let i=1;i<route.nodes.length;i++){const a=route.nodes[i-1],b=route.nodes[i];for(let n=0;n<=12;n++){const t=n/12,p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};if(Math.hypot(p.x+42,p.z+29)<2)continue;const floor=field.ray({...p,y:p.y+1},{x:0,y:-1,z:0},2);expect(floor,`${route.id}/${i}/${n}`).not.toBeNull();expect(field.overlaps({...p,y:floor!.point.y+.12}),`${route.id}/${i}/${n}`).toBe(false);}}
 });
 it('physically opens the shortcut once and preserves it through cache eviction and overlay restore',()=>{
  const {field,arena}=setup();expect(field.overlaps(WEST_SHORTCUT_CLEARANCE)).toBe(true);expect(operateWestSwitch(arena,'not-a-switch')).toBe(false);expect(operateWestSwitch(arena,'west-mine-switch')).toBe(true);expect(field.overlaps(WEST_SHORTCUT_CLEARANCE)).toBe(false);expect(arena.objects.get('west-shortcut-gate')?.open).toBe(true);expect(operateWestSwitch(arena,'west-mine-switch')).toBe(false);
  const saved=field.exportOverlay();field.provider.clearCache();const restored=new SparseOverlayField(field.provider);expect(restored.restoreOverlay(saved)).toBe(true);expect(restored.overlaps(WEST_SHORTCUT_CLEARANCE)).toBe(false);
 });
});
