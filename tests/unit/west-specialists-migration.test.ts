import {describe,it,expect} from 'vitest';
import {createWesternMigrationContext,prepareWesternFieldMigration,prepareWesternMigrationPlan} from '../../src/save/western-campaign-migration';
import {StreamedCampaignField} from '../../src/prototype/core/streamed-campaign-field';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,defaultSettings,hydrateCampaign} from '../../src/prototype/campaign-session';
import {WEST_SPECIALISTS} from '../../src/prototype/core/expedition-west';

describe('western specialist migration safety',()=>{
 it('adds unrescued specialists to a detached opt-in v4 without inventing items or rescue claims',()=>{
  const sourceSim=new CoreSimulation(true,false,true),source=captureCampaign(sourceSim,defaultSettings()),raw=JSON.stringify(source),result=prepareWesternMigrationPlan(source);
  expect(result.ok).toBe(true);if(!result.ok)throw Error(result.reason);
  expect(JSON.stringify(source)).toBe(raw);expect(result.candidate.campaign).toEqual(source.campaign);expect(result.candidate.survival).toEqual(source.survival);
  expect(result.candidate.western.claimed).toEqual([]);expect(result.candidate.western.completed).toEqual([]);expect(result.candidate.enemies).toHaveLength(22);
  for(const npc of WEST_SPECIALISTS)expect(result.candidate.objects.find(o=>o.id===npc.id)).toEqual({id:npc.id,open:false,hp:100});
  const restored=hydrateCampaign(result.candidate);expect(restored).not.toBeNull();expect(restored!.sim.western!.geometryConsistent()).toBe(true);
  for(const npc of WEST_SPECIALISTS){expect(restored!.sim.campaign.professionUnlocked(npc.role)).toBe(false);expect(restored!.sim.western!.pointPosition(npc.id)).toEqual(npc.position);expect(sourceSim.arena.objects.has(npc.id)).toBe(false);}
 },15000);
 it.each(WEST_SPECIALISTS)('rejects rather than overwrites existing edits at $name rescue geometry',npc=>{
  const context=createWesternMigrationContext(4),source=new StreamedCampaignField(context.source.provider),q=npc.position;
  source.box({x:q.x-.2,y:q.y+.8,z:q.z-.2},{x:q.x+.2,y:q.y+1.2,z:q.z+.2},4,'build:western-specialist-overlap');
  const before=source.exportState(),raw=JSON.stringify(before),result=prepareWesternFieldMigration(before,context);expect(result.ok).toBe(false);if(result.ok)throw Error('Overlapping source was accepted');expect(result.reason).toBe('content-overlap');expect(result.conflicts?.length).toBeGreaterThan(0);expect(source.exportState()).toEqual(before);expect(JSON.stringify(before)).toBe(raw);
 });
 it.each(WEST_SPECIALISTS)('rejects a saved custom layer colliding with $id instead of stealing its identity',npc=>{
  const context=createWesternMigrationContext(4),source=new StreamedCampaignField(context.source.provider);source.box({x:0,y:2,z:6},{x:1,y:3,z:7},4,npc.id);const before=source.exportState();expect(prepareWesternFieldMigration(before,context)).toEqual({ok:false,reason:'layer-id-collision'});expect(source.exportState()).toEqual(before);
 });
});
