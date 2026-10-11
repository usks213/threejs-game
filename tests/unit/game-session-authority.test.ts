import {describe,it,expect,vi} from 'vitest';
import {CoreSimulation} from '../../src/prototype/core/simulation';
import {CampaignRoomSession} from '../../src/prototype/network/game-session';
import {captureCampaign,defaultSettings} from '../../src/prototype/campaign-session';
import type {GuestCommand} from '../../src/prototype/network/protocol';
vi.mock('../../src/prototype/core/world',async(importOriginal)=>{const original=await importOriginal<typeof import('../../src/prototype/core/world')>();const {VoxelField}=await import('../../src/prototype/core/voxel');return {...original,createArena:()=>{const field=new VoxelField(.25);field.box({x:-8,y:-.5,z:-8},{x:8,y:.25,z:10},3);return {field,objects:new Map()};}};});
vi.mock('../../src/prototype/campaign-network-state',()=>({captureSharedCampaign:()=>({version:1}),applySharedCampaign:()=>({ok:false})}));
/** Test the session transaction boundary directly; room delivery/dedupe itself is
 * covered by the real two-socket relay tests. No DOM, service or account access. */
function setup(){const sim=new CoreSimulation();sim.enableCompanion();sim.setCompanionConnected(true);const hooks={settings:()=>defaultSettings(),save:vi.fn(()=>true),mode:vi.fn(),notice:vi.fn()};const session=new CampaignRoomSession(sim,hooks,'https://example.test');const client={online:true,hostAck:vi.fn(),disconnect:vi.fn()};const access=session as unknown as {roleValue:string;generation:number;connectionGeneration:number;client:typeof client;guestBuild:boolean;publish:()=>Promise<boolean>;executeGuest:(command:GuestCommand,id:string,generation?:number,connection?:number)=>Promise<void>};access.roleValue='host';access.generation=7;access.client=client;access.publish=vi.fn(async()=>true);return {sim,hooks,session,client,access};}
describe('host session authority boundaries',()=>{
 it('ignores a queued command from an earlier room generation',async()=>{const {sim,access,client}=setup();const before=sim.getCompanionSnapshot();await access.executeGuest({action:'jump',payload:{kind:'action',action:'jump'}},'stale-room-command',6);expect(sim.getCompanionSnapshot()).toEqual(before);expect(client.hostAck).not.toHaveBeenCalled();});
 it('does not trust the outer action label to bypass inner editing permission checks',async()=>{const {sim,access,client}=setup();await access.executeGuest({action:'interact',payload:{kind:'action',action:'cast'}},'forged-action',7);expect(sim.companion!.phase).toBe('idle');expect(client.hostAck).toHaveBeenCalledWith('forged-action',false,expect.any(String));await access.executeGuest({action:'repair',payload:{kind:'menu',command:{type:'homestead',id:'furniture:bed'}}},'forged-home',7);expect(client.hostAck).toHaveBeenCalledWith('forged-home',false,expect.any(String));});
 it('disconnects on persistence failure and never acknowledges durable success',async()=>{const {sim,hooks,access,client}=setup();sim.survival.inventory[4]=6;sim.survival.inventory[7]=4;hooks.save.mockReturnValue(false);await access.executeGuest({action:'craft',payload:{kind:'menu',command:{type:'craft',id:'bow'}}},'unsaved-craft',7);expect(sim.campaign.has('bow')).toBe(true);expect(client.disconnect).toHaveBeenCalledOnce();expect(client.hostAck).not.toHaveBeenCalled();expect(hooks.notice).toHaveBeenCalled();});
 it('blocks rescue aliases from healing a living guest for free',async()=>{const {sim,access,client}=setup();sim.companion!.hp=43;for(const id of ['rescue','rescue:anything'])await access.executeGuest({action:'repair',payload:{kind:'menu',command:{type:'gear',id}}},'rescue-'+id.replace(':','-'),7);expect(sim.companion!.hp).toBe(43);expect(client.hostAck.mock.calls.every(call=>call[1]===false)).toBe(true);});
 it('rejects all commands while the companion is suspended',async()=>{const {sim,access,client}=setup();sim.setCompanionConnected(false);sim.survival.inventory[4]=6;sim.survival.inventory[7]=4;await access.executeGuest({action:'craft',payload:{kind:'menu',command:{type:'craft',id:'bow'}}},'offline-craft',7);expect(sim.campaign.has('bow')).toBe(false);expect(sim.survival.inventory[4]).toBe(6);expect(client.hostAck.mock.calls.some(call=>call[1]===true)).toBe(false);});
});

describe('publication lifecycle fencing',()=>{
 it('does not let an old pending publisher send into a replacement room',async()=>{const {access}=setup();let release!:(value:boolean)=>void;const pending=new Promise<boolean>(resolve=>{release=resolve;});const oldClient={online:true,hostPublish:vi.fn(async()=>true)},newClient={online:true,hostPublish:vi.fn(async()=>true)};Object.assign(access,{client:oldClient,pendingPublish:pending});const method=(CampaignRoomSession.prototype as unknown as {publish:()=>Promise<boolean>}).publish;const operation=method.call(access);Object.assign(access,{generation:8,client:newClient,pendingPublish:null});release(true);await operation;expect(oldClient.hostPublish).not.toHaveBeenCalled();expect(newClient.hostPublish).not.toHaveBeenCalled();});
});

describe('socket reconnect command fence',()=>{
 it('rejects a prior-connection command even when room generation and client identity are unchanged',async()=>{const {sim,access,client}=setup();access.connectionGeneration=2;const before=sim.getCompanionSnapshot();await access.executeGuest({action:'jump',payload:{kind:'action',action:'jump'}},'stale-connection',7,1);expect(sim.getCompanionSnapshot()).toEqual(before);expect(client.hostAck).not.toHaveBeenCalled();});
 it('does not send a completed old-connection command receipt into a reconnected transport',async()=>{const {sim,access,client}=setup();sim.survival.inventory[4]=6;sim.survival.inventory[7]=4;let release!:(value:boolean)=>void;access.publish=()=>new Promise<boolean>(resolve=>{release=resolve;});const pending=access.executeGuest({action:'craft',payload:{kind:'menu',command:{type:'craft',id:'bow'}}},'old-connection-craft',7,0);expect(sim.campaign.has('bow')).toBe(true);access.connectionGeneration=1;release(true);await pending;expect(client.hostAck).not.toHaveBeenCalled();});
});

describe('timer-driven guest heartbeat still obeys freshness and pause boundaries',()=>{
 it('retains the exact three-second frame freshness limit and never sends stale held input',()=>{const {sim,session,access}=setup(),date=vi.spyOn(Date,'now');date.mockReturnValue(10000);const client={online:true,sendInput:vi.fn(()=>true)};Object.assign(access,{roleValue:'guest',ready:true,lastFrameAt:10000,client});const held={x:1,z:0,sprint:true,block:true,water:false};date.mockReturnValue(12999);session.tick(.1,held,true);expect(session.online).toBe(true);expect(client.sendInput).toHaveBeenCalledOnce();expect(session.diagnostics()).toMatchObject({sentInputs:1,frameAgeMs:2999});date.mockReturnValue(13000);session.tick(.1,held,true);expect(session.online).toBe(false);expect(client.sendInput).toHaveBeenCalledOnce();expect(sim.player.position.x).toBe(0);date.mockRestore();});
 it('sends neutral input when paused/hidden instead of queuing held movement',()=>{const {session,access}=setup(),date=vi.spyOn(Date,'now').mockReturnValue(10000),client={online:true,sendInput:vi.fn(()=>true)};Object.assign(access,{roleValue:'guest',ready:true,lastFrameAt:10000,client});session.tick(.1,{x:1,z:1,sprint:true,block:true,water:false},false);expect(client.sendInput).toHaveBeenCalledWith(expect.objectContaining({x:0,z:0,block:false,sprint:false}));date.mockRestore();});
});

describe('guest action rejection is a pre-send boundary, never a queue',()=>{
 it.each(['stale','syncing','offline'])('does not send or replay a build action rejected while %s',reason=>{
  const {sim,hooks,session,access}=setup(),date=vi.spyOn(Date,'now').mockReturnValue(13000),client={online:reason!=='offline',guestRequest:vi.fn(()=> 'request'),sendInput:vi.fn(()=>true)};
  try{
   Object.assign(access,{roleValue:'guest',guestBuild:true,ready:reason!=='syncing',lastFrameAt:reason==='stale'?10000:13000,client});
   expect(session.action('build')).toBe(true);expect(hooks.notice).toHaveBeenLastCalledWith('同期が完了するまで操作を待っています');expect(client.guestRequest).not.toHaveBeenCalled();expect(sim.buildMode).toBe(false);
   Object.assign(access,{ready:true,lastFrameAt:13000});client.online=true;
   session.tick(.1,{x:0,z:0,sprint:false,block:false,water:false},true);
   expect(session.online).toBe(true);expect(client.guestRequest).not.toHaveBeenCalled();expect(sim.buildMode).toBe(false);
   // Only a new, explicit action after fresh state can send; the guest still
   // does not mutate locally and waits for the host's authoritative response.
   session.action('build');expect(client.guestRequest).toHaveBeenCalledExactlyOnceWith({action:'build',payload:{kind:'action',action:'build'}});expect(sim.buildMode).toBe(false);
  }finally{date.mockRestore();}
 });
 it('still requires permission after freshness recovers',()=>{
  const {hooks,session,access}=setup(),date=vi.spyOn(Date,'now').mockReturnValue(13000),client={online:true,guestRequest:vi.fn()};
  try{Object.assign(access,{roleValue:'guest',guestBuild:false,ready:true,lastFrameAt:13000,client});session.action('build');expect(hooks.notice).toHaveBeenLastCalledWith('この操作は周辺世界を変えるため、ホストの許可が必要です');expect(client.guestRequest).not.toHaveBeenCalled();}finally{date.mockRestore();}
 });
});

describe('inventory and specified storage authority',()=>{
 it('sends guest requests without local quantity changes or solo save writes, and blocks unpermitted storage',()=>{
  const {sim,hooks,session,access}=setup(),client={online:true,guestRequest:vi.fn(()=> 'request')};sim.survival.inventory[4]=8;const revision=sim.campaign.inventory.reconcile().revision,before=sim.campaign.snapshot();Object.assign(access,{roleValue:'guest',guestBuild:false,ready:true,lastFrameAt:Date.now(),client});
  const inventory={type:'inventory' as const,id:'split' as const,slot:0,target:95,count:2,revision};expect(session.gameCommand(inventory)).toBe(true);expect(client.guestRequest).toHaveBeenCalledWith({action:'craft',payload:{kind:'menu',command:inventory}});expect(sim.campaign.snapshot()).toEqual(before);expect(hooks.save).not.toHaveBeenCalled();client.guestRequest.mockClear();const storage={type:'storage' as const,id:'deposit:4',count:2,revision,stored:0};expect(session.gameCommand(storage)).toBe(true);expect(client.guestRequest).not.toHaveBeenCalled();access.guestBuild=true;expect(session.gameCommand(storage)).toBe(true);expect(client.guestRequest).toHaveBeenCalledWith({action:'storage',payload:{kind:'menu',command:storage}});expect(sim.survival.inventory[4]).toBe(8);expect(hooks.save).not.toHaveBeenCalled();
 });
 it('host executes shared inventory count changes once and refuses forged storage permissions',async()=>{
  const {sim,hooks,access,client}=setup();sim.survival.inventory[4]=8;sim.campaign.state.flameTier=1;const revision=sim.campaign.inventory.reconcile().revision,command={type:'inventory',id:'split',slot:0,target:95,count:2,revision};await access.executeGuest({action:'craft',payload:{kind:'menu',command}},'split-once');expect(sim.campaign.inventory.state.slots[95]?.count).toBe(2);expect(hooks.save).toHaveBeenCalledOnce();await access.executeGuest({action:'craft',payload:{kind:'menu',command}},'split-stale');expect(hooks.save).toHaveBeenCalledOnce();expect(client.hostAck).toHaveBeenLastCalledWith('split-stale',false,expect.any(String));
  const storage={type:'storage',id:'deposit:4',count:3,revision:sim.campaign.inventory.state.revision,stored:0};await access.executeGuest({action:'craft',payload:{kind:'menu',command:storage}},'forged-storage');expect(sim.home.storedCount).toBe(0);access.guestBuild=true;sim.companionCanEdit=true;sim.companion!.position={x:-3,y:.25,z:5.3};await access.executeGuest({action:'storage',payload:{kind:'menu',command:storage}},'stored-once');expect(sim.home.state.storage.materials[4]).toBe(3);expect(sim.survival.inventory[4]).toBe(5);expect(hooks.save).toHaveBeenCalledTimes(2);
 });
});

describe('explicit saved companion exit',()=>{
 it('preserves the solo world and actor resources while saving only removal of the suspended party',()=>{const {sim,hooks,session,access}=setup();Object.assign(access,{roleValue:null,client:null});sim.setCompanionConnected(false);sim.combat.mana=40;sim.focus.value=36;const before=captureCampaign(sim,defaultSettings());hooks.save.mockImplementation(()=>{const saved=captureCampaign(sim,defaultSettings());expect(saved.partyCompanion).toBeNull();expect({...saved,partyCompanion:before.partyCompanion}).toEqual(before);return true;});session.leave();expect(hooks.save).toHaveBeenCalledOnce();expect(sim.companion).toBeNull();expect(sim.combat.mana).toBe(40);expect(sim.focus.value).toBe(36);});
 it('reports persistence failure without asserting a durable solo transition',()=>{const {sim,hooks,session,access}=setup();Object.assign(access,{roleValue:null,client:null});sim.setCompanionConnected(false);hooks.save.mockReturnValue(false);session.leave();expect(hooks.notice).toHaveBeenCalledWith(expect.stringContaining('保存できません'));expect(sim.companion).toBeNull();});
});
