import {expect,it} from 'vitest';
import {SessionAuthority,type SessionActor} from '../../src/simulation/session';
import type {ClientMessage,PlayerInput} from '../../src/simulation/protocol';
import type {GameAction,EnemyState} from '../../src/game/types';
import type {Vec3} from '../../src/world/types';
import {validateSave} from '../../src/save/format';
import {participantSave} from '../../src/save/participant';
import {REGIONAL_RECORDS} from '../../src/content/adventure-chapters';
import {SITES} from '../../src/content/adventure-sites';
import {bossPartDefinitions,bossPartPosition} from '../../src/game/combat/boss-parts';

const idle:PlayerInput={x:0,z:0,jump:false},aim={x:0,y:0,z:1};
/** Real authority/actions/terrain. Enemy absence and already-explored surrounding
 * tiles isolate collaboration; explicit staging positions below are fixtures,
 * never evidence of a full walk from the starting island to every region. */
function fixture(){
 const room=new SessionAuthority(null,true),a=room.join('journey-a'),b=room.join('journey-b'),sim=room.sim;
 sim.adventure.state.enemies=[];sim.fluid.restore([]);
 sim.adventure.state.exploration={version:1,tiles:Array.from({length:49},(_,i)=>`surface:${i%7-3},${Math.floor(i/7)-3}`),pending:[],generated:0,exhausted:false,waterJobs:[]};
 const sequences=new Map<string,number>();
 const step=(ticks=5,inputs:Record<string,PlayerInput>={})=>{for(let i=0;i<ticks;i++){for(const actor of room.actors.values())if(actor.id!=='host'){const sequence=(sequences.get(actor.id)??0)+1;sequences.set(actor.id,sequence);room.input(actor.id,inputs[actor.id]??idle,sequence);}room.step(idle);}};
 const act=(actor:SessionActor,action:GameAction,id?:string,target?:Vec3,extra:Partial<Extract<ClientMessage,{type:'game-action'}>>={})=>{step();return room.action(actor.id,{type:'game-action',action,id,target,aim,...extra});};
 const stage=(actor:SessionActor,p:Vec3)=>Object.assign(actor.player,p,{vy:0,grounded:true});
 return{room,sim,a,b,step,act,stage};
}

it('uses real member input and action hooks for ordered tutorial, exclusive pickup, assembly lease, and cooperative revival',()=>{
 const {room,sim,a,b,step,act,stage}=fixture();
 stage(a,{x:2,y:sim.groundAt(2,8),z:8});stage(b,{x:-2,y:sim.groundAt(-2,8),z:8});
 step(65,{[a.id]:{x:0,z:1,jump:false}});
 expect(a.adventure.state.progression?.tutorial).toBe(1);expect(b.adventure.state.progression?.tutorial).toBe(0);
 const mine={x:a.player.x+3.5,y:sim.groundAt(a.player.x+3.5,a.player.z)-.2,z:a.player.z};
 const revision=sim.world.edits.length;step();room.action(a.id,{type:'action',tool:'dig',target:mine,expectedRevision:revision});
 expect(sim.world.edits.length).toBeGreaterThan(revision);expect(a.adventure.state.progression?.tutorial).toBe(2);
 const supply=sim.adventure.state.resources.find(r=>r.drop&&r.kind==='wood'&&r.amount===12)!;
 stage(a,{x:supply.x,y:supply.y,z:supply.z});act(a,'gather',String(supply.id));
 stage(b,{x:supply.x+.7,y:supply.y,z:supply.z});expect(()=>act(b,'gather',String(supply.id))).toThrow();
 expect((a.adventure.state.inventory.wood??0)+(b.adventure.state.inventory.wood??0)).toBe(12);expect(a.adventure.state.progression?.tutorial).toBe(3);
 // Place above clear ground away from the protected tutorial mannequin.
 const ground=sim.groundAt(7,16);stage(a,{x:5,y:ground,z:16});stage(b,{x:5,y:ground,z:18});
 act(a,'sky-part','block:wood',{x:7,y:ground+1.5,z:16});act(a,'sky-part','block:wood',{x:8,y:ground+1.5,z:16});
 const parts=sim.skybound.state.parts.filter(p=>p.creator===a.id),one=parts[0],two=parts[1];
 act(a,'sky-grab',String(one.id));expect(()=>act(b,'sky-grab',String(one.id))).toThrow('別の冒険者');
 const oldEpoch=one.epoch;act(a,'sky-glue',`${one.id}:${two.id}`,undefined,{expectedEpoch:oldEpoch});
 expect(a.adventure.state.progression?.tutorial).toBe(4);expect(room.view(b.id).adventure.skybound!.parts.find(p=>p.id===one.id)!.links).toContain(two.id);
 expect(()=>act(b,'sky-move',String(one.id),{...one.position,y:one.position.y+.5},{expectedEpoch:oldEpoch})).toThrow('更新');
 act(a,'sky-release',String(one.id));
 stage(a,{x:0,y:sim.groundAt(0,10),z:10});stage(b,{x:1.2,y:sim.groundAt(1.2,10),z:10});
 b.adventure.hurtPlayer(10000,'physical',b.player);expect(b.adventure.state.downed).toBeGreaterThan(0);
 act(a,'revive',b.id);step(92);
 expect(b.adventure.state.health).toBeGreaterThan(0);expect(a.adventure.state.progression?.tutorial).toBe(5);expect(b.adventure.state.progression?.tutorial).toBe(0);
},30000);

it('solves an actual regional mechanism and records personal discoveries separately from once-only room payout across late join and restart',()=>{
 const {room,sim,a,b,step,act,stage}=fixture(),site=SITES[0],base=sim.adventure.state.siteWorld!.bases[site.id];
 const guide={x:site.x,y:base+.4,z:site.z+5.5};stage(a,guide);stage(b,{...guide,x:guide.x+1});
 act(a,'chronicle-accept',String(site.id));expect(a.adventure.state.progression!.accepted).toEqual([site.id]);expect(b.adventure.state.progression?.accepted??[]).toEqual([]);
 // Resource and position fixture only; the solved/reported state is never assigned.
 a.adventure.state.inventory.stone=6;stage(a,{x:site.x,y:base+.3,z:site.z-5.5});
 const mechanism=REGIONAL_RECORDS.find(r=>r.site===site.id&&r.kind==='mechanism')!;
 expect(()=>act(a,'chronicle-inspect',String(mechanism.id))).toThrow();
 act(a,'sky-part','block:stone',{x:site.x,y:base+.85,z:site.z-8});step(65);
 expect(sim.adventure.state.siteWorld!.regional!.solved).toContain(site.id);
 const inspect=(actor:SessionActor)=>{for(const record of REGIONAL_RECORDS.filter(r=>r.site===site.id)){stage(actor,{x:site.x+record.x,y:base+record.y,z:site.z+record.z});act(actor,'chronicle-inspect',String(record.id));}};
 inspect(a);expect(a.adventure.state.progression!.records).toHaveLength(3);expect(b.adventure.state.progression?.records??[]).toEqual([]);
 stage(a,guide);act(a,'chronicle-report',String(site.id));const coins=()=>sim.adventure.state.resources.filter(r=>r.drop&&r.kind==='coins').reduce((n,r)=>n+r.amount,0);expect(coins()).toBe(12);
 inspect(b);stage(b,guide);act(b,'chronicle-report',String(site.id));expect(coins()).toBe(12);
 const late=room.join('journey-late');expect(late.adventure.state.siteWorld!.regional!.reported).toEqual([site.id]);expect(late.adventure.state.progression?.records??[]).toEqual([]);
 const portable=validateSave(participantSave(room,a.id)),checkpoint=validateSave(room.save());expect(portable.adventure!.progression!.records).toHaveLength(3);
 room.leave(a.id);const returned=room.join(a.id);expect(returned.adventure.state.progression!.records).toHaveLength(3);
 const restarted=new SessionAuthority(checkpoint,true),resumed=restarted.join(a.id),resumedLate=restarted.join(late.id);
 expect(resumed.adventure.state.progression!.records).toHaveLength(3);expect(resumedLate.adventure.state.progression?.records??[]).toEqual([]);expect(resumedLate.adventure.state.siteWorld!.regional!.reported).toEqual([site.id]);
 expect(restarted.sim.adventure.state.resources.filter(r=>r.drop&&r.kind==='coins').reduce((n,r)=>n+r.amount,0)).toBe(12);
},30000);

it('applies a members actual melee contact to a shared independent boss part and retains it through leave and durable restart',()=>{
 const {room,sim,a,b,step,act,stage}=fixture();
 // This is a combat encounter fixture, not an assertion that the story unlocked
 // the boss: actual attack input resolves the part and damage on the authority.
 sim.adventure.state.buildings=[];sim.adventure.state.resources=[];sim.world.density=p=>p.y<0?-1:1;
 const enemy:EnemyState={id:900001,definition:'loadwarden',tier:1,x:20,y:0,z:20,homeX:20,homeZ:20,health:130,boss:true,cooldown:100,windup:2,slow:0,heading:0,attackYaw:0};sim.adventure.state.enemies=[enemy];
 const part=bossPartDefinitions(enemy).find(p=>p.id==='leftDrive')!,target=bossPartPosition(enemy,part);
 stage(a,{x:target.x,y:0,z:target.z-1.5});stage(b,{x:target.x-3,y:0,z:target.z-1.5});a.adventure.state.equipment='club';
 const dy=target.y-.85,length=Math.hypot(dy,1.5);act(a,'attack',undefined,undefined,{aim:{x:0,y:dy/length,z:1.5/length}});step(12);
 expect(enemy.bossParts!.health.leftDrive).toBeLessThan(part.health);expect(enemy.bossParts!.health.rightDrive).toBe(28);
 const health=enemy.bossParts!.health.leftDrive;expect(room.view(a.id).adventure.enemies.find(e=>e.id===enemy.id)!.bossParts).toEqual(room.view(b.id).adventure.enemies.find(e=>e.id===enemy.id)!.bossParts);
 room.leave(a.id);expect(room.join(a.id).adventure.state.enemies.find(e=>e.id===enemy.id)!.bossParts!.health.leftDrive).toBe(health);
 const saved=validateSave(room.save()),restarted=new SessionAuthority(saved,true);expect(restarted.join(a.id).adventure.state.enemies.find(e=>e.id===enemy.id)!.bossParts!.health.leftDrive).toBe(health);
},30000);
