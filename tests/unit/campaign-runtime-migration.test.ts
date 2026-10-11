import {describe,it,expect} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {captureCampaign,createCampaignStore,defaultSettings,hydrateCampaign,LEGACY_CAMPAIGN_STORE_KEY,STREAMED_CAMPAIGN_STORE_KEY} from '../../src/prototype/campaign-session';
import {createCampaignSamplePrototype,LEGACY_CAMPAIGN_V2_BASELINE} from '../../src/prototype/core/campaign-sample-provider';
import {certifyLegacyCampaignBaseline} from '../../src/save/campaign-migration-certification';
import {prepareLegacyCampaignMigration,migrationBackupKey} from '../../src/save/campaign-migration';
import {selectCampaignStore,CAMPAIGN_FORMAT_SELECTOR} from '../../src/save/campaign-store-selection';
import type {SaveStorage} from '../../src/save/checkpoint';

class Storage implements SaveStorage {values=new Map<string,string>();getItem(k:string){return this.values.get(k)??null;}setItem(k:string,v:string){this.values.set(k,v);}removeItem(k:string){this.values.delete(k);}}

describe('legacy migration across JavaScript numerical runtimes',()=>{
 it('independently certifies the exact runtime baseline and archives a played save without losing newer optional state',()=>{
  // Reproduce an engine-dependent final-bit difference, rather than declaring an
  // arbitrary hash compatible. Both real authoring paths still calculate all samples.
  const originalHypot=Math.hypot;
  Math.hypot=(...values:number[])=>{const n=originalHypot(...values);return n+n*Number.EPSILON;};
  try{
   const sim=new CoreSimulation(true);sim.survival.inventory[4]=9;sim.survival.inventory[3]=5;sim.environment.wet=.6;
   const saved=captureCampaign(sim,defaultSettings());saved.fishing!.clock=12;saved.fishing!.readyAt['trial-basin']=35;
   expect(saved.field.baseline).not.toBe(LEGACY_CAMPAIGN_V2_BASELINE);
   const original=JSON.stringify(saved),storage=new Storage();expect(createCampaignStore(false,storage).write(saved).ok).toBe(true);const originalBytes=storage.getItem(LEGACY_CAMPAIGN_STORE_KEY);
   const selected=selectCampaignStore(storage,true);expect(selected.blocked,selected.error).toBe(false);expect(selected.migrated).toBe(true);expect(selected.loaded.status).toBe('loaded');
   if(selected.loaded.status!=='loaded')throw new Error('Migration was not committed');
   const migrated=selected.loaded.data;expect(migrated.survival).toEqual(saved.survival);expect(migrated.environment).toEqual(saved.environment);expect(migrated.fishing).toEqual(saved.fishing);
   expect(hydrateCampaign(migrated)?.sim.environment).toEqual(saved.environment);expect(hydrateCampaign(migrated)?.sim.fishing.snapshot()).toEqual(saved.fishing);
   expect(storage.getItem(LEGACY_CAMPAIGN_STORE_KEY)).toBe(originalBytes);expect(storage.getItem(migrationBackupKey(LEGACY_CAMPAIGN_STORE_KEY))).toBe(originalBytes);expect(storage.getItem(STREAMED_CAMPAIGN_STORE_KEY)).not.toBeNull();expect(storage.getItem(CAMPAIGN_FORMAT_SELECTOR)).toBe('campaign-v3');expect(JSON.stringify(saved)).toBe(original);
   const before=[...storage.values];expect(selectCampaignStore(storage).blocked).toBe(false);expect([...storage.values]).toEqual(before);
  }finally{Math.hypot=originalHypot;}
 },120000);

 it('requires exact runtime fingerprint and provider parity; caches only a completed provider proof',()=>{
  const originalHypot=Math.hypot;Math.hypot=(...values:number[])=>{const n=originalHypot(...values);return n+n*Number.EPSILON;};
  try{
   const sim=new CoreSimulation(true),saved=captureCampaign(sim,defaultSettings()),prototype=createCampaignSamplePrototype(),layersAt=prototype.provider.layersAt.bind(prototype.provider);let calls=0;prototype.provider.layersAt=(x,y,z)=>{calls++;return layersAt(x,y,z);};
   expect(certifyLegacyCampaignBaseline('campaign-v2:deadbeef',prototype.provider)).toBe(false);expect(calls).toBe(0);
   expect(certifyLegacyCampaignBaseline('campaign-v9:6e774767',prototype.provider)).toBe(false);expect(calls).toBe(0);
   expect(certifyLegacyCampaignBaseline(saved.field.baseline,prototype.provider)).toBe(true);const certifiedCalls=calls;expect(certifiedCalls).toBeGreaterThan(600000);
   expect(certifyLegacyCampaignBaseline(saved.field.baseline,prototype.provider)).toBe(true);expect(calls).toBe(certifiedCalls);
   const incompatible=createCampaignSamplePrototype(),originalLayers=incompatible.provider.layersAt.bind(incompatible.provider);
   incompatible.provider.layersAt=(x,y,z)=>{const values=originalLayers(x,y,z);for(const cell of values.values())cell.material=10;return values;};
   expect(prepareLegacyCampaignMigration(saved,incompatible)).toBeNull();expect(saved.field.baseline).not.toBe(LEGACY_CAMPAIGN_V2_BASELINE);
  }finally{Math.hypot=originalHypot;}
 },120000);
});
