import {describe,it,expect,vi} from 'vitest';
import {planCampaignStartup,readHostResumeIdentity,selectCampaignStartupStore,soloCampaignURL} from '../../src/save/campaign-startup';
import {roomResumeStorageKey} from '../../src/prototype/network/room-invitation';
import {captureCampaign,createCampaignStore,defaultSettings,LEGACY_CAMPAIGN_STORE_KEY,STREAMED_CAMPAIGN_STORE_KEY,WESTERN_CAMPAIGN_STORE_KEY} from '../../src/prototype/campaign-session';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {CAMPAIGN_FORMAT_SELECTOR} from '../../src/save/campaign-store-selection';
import type {SaveStorage} from '../../src/save/checkpoint';

const room='1'.repeat(64),otherRoom='2'.repeat(64),resumeKey='3'.repeat(64),fragment='#campaign-room='+room;
function storage(values:Record<string,string>={}){const data=new Map(Object.entries(values));return {data,getItem:vi.fn((key:string)=>data.get(key)??null),setItem:vi.fn((key:string,value:string)=>{data.set(key,value);}),removeItem:vi.fn((key:string)=>{data.delete(key);})};}

describe('pure invitation startup plan',()=>{
 it.each([
  ['',false,false],['?streaming=1',true,false],['?expedition=west',true,true],['?streaming=1&expedition=west',true,true],['?streaming=0&expedition=unknown',false,false],
 ] as const)('uses invitation backend hints only for a temporary guest world (%s)',(search,streamed,western)=>{
  expect(planCampaignStartup(search,fragment)).toEqual({trial:false,room,guestPreview:true,resumingHost:false,streamed,western});
 });
 it.each(['','#campaign-room=short','#campaign-room='+room+'&extra=1','#campaign-room='+'A'.repeat(64),'#other='+room])('does not turn malformed fragments into guest previews (%s)',hash=>{
  const plan=planCampaignStartup('?streaming=1&expedition=west',hash);expect(plan.guestPreview).toBe(false);expect(plan.room).toBeNull();expect(plan.resumingHost).toBe(false);expect(plan.western).toBe(true);
 });
 it.each(['','not-a-resume-key','f'.repeat(63),'F'.repeat(64)])('does not treat invalid nonempty host identities as authority',invalid=>{
  expect(planCampaignStartup('?expedition=west',fragment,{room,resumeKey:invalid}).guestPreview).toBe(true);
 });
 it('requires identity from the exact invited room',()=>{
  expect(planCampaignStartup('?expedition=west',fragment,{room:otherRoom,resumeKey}).guestPreview).toBe(true);
 });
 it('resumes a validated host through the persistent selector rather than invitation hints',()=>{
  expect(planCampaignStartup('?streaming=1&expedition=west',fragment,{room,resumeKey})).toEqual({trial:false,room,guestPreview:false,resumingHost:true,streamed:false,western:false});
 });
 it('keeps explicit trial mode ephemeral without cooperation or campaign opt-ins',()=>{
  expect(planCampaignStartup('?trial&streaming=1&expedition=west',fragment,{room,resumeKey})).toEqual({trial:true,room:null,guestPreview:false,resumingHost:false,streamed:false,western:false});
 });
});

describe('room-scoped startup identity lookup',()=>{
 it('reads only the exact application host key; unrelated and guest identities grant nothing',()=>{
  const own=roomResumeStorageKey(room,'host'),session=storage({[roomResumeStorageKey(otherRoom,'host')]:resumeKey,[roomResumeStorageKey(room,'guest')]:resumeKey,'unrelated-token':resumeKey});
  expect(readHostResumeIdentity(fragment,()=>session)).toBeNull();expect(session.getItem).toHaveBeenCalledExactlyOnceWith(own);expect(session.setItem).not.toHaveBeenCalled();expect(session.removeItem).not.toHaveBeenCalled();
  session.data.set(own,resumeKey);expect(readHostResumeIdentity(fragment,()=>session)).toEqual({room,resumeKey});
 });
 it('rejects invalid saved keys without changing or removing them',()=>{
  const session=storage({[roomResumeStorageKey(room,'host')]:'nonempty-invalid'}),before=[...session.data];expect(readHostResumeIdentity(fragment,()=>session)).toBeNull();expect([...session.data]).toEqual(before);expect(session.setItem).not.toHaveBeenCalled();expect(session.removeItem).not.toHaveBeenCalled();
 });
 it('does not open any storage for malformed invitations',()=>{
  const get=vi.fn(()=>storage());expect(readHostResumeIdentity('#campaign-room=invalid',get)).toBeNull();expect(get).not.toHaveBeenCalled();
 });
 it('falls back to an isolated guest when getting storage or its exact key throws',()=>{
  expect(readHostResumeIdentity(fragment,()=>{throw new Error('blocked');})).toBeNull();expect(readHostResumeIdentity(fragment,()=>({getItem:()=>{throw new Error('blocked');}}))).toBeNull();
 });
});

describe('invitation store isolation',()=>{
 it.each([
  ['',LEGACY_CAMPAIGN_STORE_KEY],['?streaming=1',STREAMED_CAMPAIGN_STORE_KEY],['?expedition=west',WESTERN_CAMPAIGN_STORE_KEY],
 ] as const)('never reads, selects, migrates, restores or resets the guest solo backend (%s)',(search,expectedKey)=>{
  const persistent=storage({[CAMPAIGN_FORMAT_SELECTOR]:'campaign-v3',[LEGACY_CAMPAIGN_STORE_KEY]:'legacy bytes',[STREAMED_CAMPAIGN_STORE_KEY]:'streamed bytes',[WESTERN_CAMPAIGN_STORE_KEY]:'western bytes'}),before=[...persistent.data];
  const selection=selectCampaignStartupStore(planCampaignStartup(search,fragment),persistent);
  expect(selection.store.key).toBe(expectedKey);expect(selection.loaded).toEqual({status:'empty'});expect(selection.blocked).toBe(false);expect(selection.migrated).toBe(false);
  expect(selection.store.read()).toEqual({status:'empty'});expect(selection.store.recoverBackup().ok).toBe(false);expect(selection.store.reset().ok).toBe(true);
  expect(persistent.getItem).not.toHaveBeenCalled();expect(persistent.setItem).not.toHaveBeenCalled();expect(persistent.removeItem).not.toHaveBeenCalled();expect([...persistent.data]).toEqual(before);
 });
 it('does not require guest localStorage to be available at all',()=>{
  const fail=vi.fn(()=>{throw new Error('must not access persistent storage');}),persistent:SaveStorage={getItem:fail,setItem:fail,removeItem:fail};
  expect(selectCampaignStartupStore(planCampaignStartup('?expedition=west',fragment),persistent).loaded.status).toBe('empty');expect(fail).not.toHaveBeenCalled();
 });
 it('keeps the saved backend on exact-room host reload, even with unrelated invitation hints',()=>{
  const persistent=storage({[CAMPAIGN_FORMAT_SELECTOR]:'campaign-v3'}),plan=planCampaignStartup('?expedition=west',fragment,{room,resumeKey}),selection=selectCampaignStartupStore(plan,persistent);
  expect(selection.streamed).toBe(true);expect(selection.western).toBe(false);expect(selection.store.key).toBe(STREAMED_CAMPAIGN_STORE_KEY);expect(selection.loaded.status).toBe('empty');expect(selection.migrated).toBe(false);expect(persistent.setItem).not.toHaveBeenCalled();expect(persistent.getItem).toHaveBeenCalled();
 });
 it('protects a host save that cannot be read instead of replacing it with the preview world',()=>{
  const persistent=storage({[CAMPAIGN_FORMAT_SELECTOR]:'campaign-v3',[STREAMED_CAMPAIGN_STORE_KEY]:'unreadable saved world'}),before=[...persistent.data],plan=planCampaignStartup('?expedition=west',fragment,{room,resumeKey}),selection=selectCampaignStartupStore(plan,persistent);
  expect(selection.loaded.status).toBe('invalid');expect(selection.blocked).toBe(true);expect(selection.western).toBe(false);expect([...persistent.data]).toEqual(before);expect(persistent.setItem).not.toHaveBeenCalled();
 });
 it('loads the host own checkpoint unchanged on exact-room reload',()=>{
  const sim=new CoreSimulation(true),persistent=storage();sim.survival.inventory[4]=29;const saved=captureCampaign(sim,defaultSettings());expect(createCampaignStore(false,persistent).write(saved).ok).toBe(true);
  const before=[...persistent.data];persistent.setItem.mockClear();const selection=selectCampaignStartupStore(planCampaignStartup('?streaming=1&expedition=west',fragment,{room,resumeKey}),persistent);
  expect(selection.loaded.status).toBe('loaded');if(selection.loaded.status==='loaded'){expect(selection.loaded.data.world).toBe('campaign-v2');expect(selection.loaded.data.survival.inventory[4]).toBe(29);}
  expect(selection.streamed).toBe(false);expect(selection.western).toBe(false);expect(selection.migrated).toBe(false);expect(persistent.setItem).not.toHaveBeenCalled();expect([...persistent.data]).toEqual(before);
 },20000);
 it('preserves normal explicit solo opt-in when there is no valid invitation',()=>{
  const persistent=storage(),selection=selectCampaignStartupStore(planCampaignStartup('?streaming=1','#campaign-room=invalid'),persistent);expect(selection.streamed).toBe(true);expect(selection.loaded.status).toBe('empty');expect(persistent.data.get(CAMPAIGN_FORMAT_SELECTOR)).toBe('campaign-v3');
 });
 it('does not let trial startup read campaign saves',()=>{
  const persistent=storage({[LEGACY_CAMPAIGN_STORE_KEY]:'solo'});expect(selectCampaignStartupStore(planCampaignStartup('?trial',''),persistent).loaded.status).toBe('empty');expect(persistent.getItem).not.toHaveBeenCalled();
 });
});

describe('returning to solo',()=>{
 it('removes every invitation/backend hint while preserving the path and unrelated flags',()=>{
  expect(soloCampaignURL('https://example.test/play/?test=1&streaming=1&expedition=west&streaming=0'+fragment)).toBe('https://example.test/play/?test=1');
 });
});
