import { AuthorityRoom } from '../../src/networking/authority-room';
import { COOP_PROTOCOL,type CoopWireServerPacket } from '../../src/networking/coop-protocol';
import { SessionAuthority } from '../../src/simulation/session';
import {expect,it} from 'vitest';
import {HeldPartHeartbeat} from '../../src/ui/held-part-heartbeat';
import {SkyboundPowers} from '../../src/game/skybound/powers';
import {SKY_LIMITS,type SkyContext} from '../../src/game/skybound/types';
import {WORLD} from '../../src/world/types';
const aim={x:0,y:0,z:1};
function fixture(){const powers=new SkyboundPowers(),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{wood:20},actors:[],solid:p=>p.y<0};powers.action('a','sky-part','block:wood',{x:2,y:2,z:0},aim,context);powers.action('a','sky-grab','1',undefined,aim,context);return{powers,context};}
it('maintains an already owned hold over multiple lease windows without changing objects or inventory',()=>{
 const {powers,context}=fixture(),part=structuredClone(powers.state.parts[0]),inventory={...context.inventory};
 for(let tick=1;tick<=SKY_LIMITS.leaseTicks*3;tick++){context.tick=tick;if(tick%30===0){const before=structuredClone(powers.state.parts[0]);expect(powers.action('a','sky-hold','1',undefined,aim,context).message).toBe('');expect(powers.state.parts[0]).toEqual(before);}powers.step(1/30,context);expect(powers.leases.get(1)?.owner).toBe('a');}
 expect(powers.state.parts[0]).toMatchObject({position:part.position,velocity:part.velocity,rotation:part.rotation,epoch:part.epoch,links:part.links,mass:part.mass});expect(context.inventory).toEqual(inventory);
});
it('never acquires, resurrects, steals or renews a distant/occluded hold',()=>{
 const {powers,context}=fixture(),expires=powers.leases.get(1)!.expiresTick;
 expect(()=>powers.action('b','sky-hold','1',undefined,aim,context)).toThrow();expect(powers.leases.get(1)!.expiresTick).toBe(expires);
 context.player.x=20;expect(()=>powers.action('a','sky-hold','1',undefined,aim,context)).toThrow('近づいて');context.player.x=0;
 context.solid=()=>true;expect(()=>powers.action('a','sky-hold','1',undefined,aim,context)).toThrow('遮られ');context.solid=p=>p.y<0;
 context.tick=expires+1;expect(()=>powers.action('a','sky-hold','1',undefined,aim,context)).toThrow('掴んで');expect(powers.leases.size).toBe(0);
 powers.action('a','sky-grab','1',undefined,aim,context);powers.release('a');expect(()=>powers.action('a','sky-hold','1',undefined,aim,context)).toThrow('掴んで');
});
it('client heartbeat is bounded, stops for hidden/disconnected state, and never replays an expired hold',()=>{
 const {powers,context}=fixture(),heartbeat=new HeldPartHeartbeat(),parts=powers.snapshot('a').parts;
 expect(heartbeat.next(parts,'a',0,context.player,0,true)).toBe(1);
 expect(heartbeat.next(parts,'a',0,context.player,999,true)).toBeUndefined();
 expect(heartbeat.next(parts,'a',0,context.player,1000,false)).toBeUndefined();
 expect(heartbeat.next(parts,'b',0,context.player,1000,true)).toBeUndefined();
 expect(heartbeat.next(parts,'a',0,{x:20,y:0,z:0},1000,true)).toBeUndefined();
 expect(heartbeat.next(parts,'a',0,context.player,1000,true)).toBe(1);
 expect(heartbeat.next(parts,'a',151,context.player,3000,true)).toBeUndefined();
 parts[0].lease=undefined;expect(heartbeat.next(parts,'a',0,context.player,4000,true)).toBeUndefined();
});

it('authority maintenance does not steal a manual action slot and disconnect still releases the assembly',()=>{
 const room=new SessionAuthority(),actor=room.join('carry-player');
 Object.assign(actor.player,{x:20,y:room.sim.groundAt(20,8),z:8});actor.adventure.state.inventory.wood=10;
 const target={x:22,y:actor.player.y+2,z:8},action=(kind:'sky-part'|'sky-grab'|'sky-hold'|'sky-move',id:string,point?:{x:number;y:number;z:number})=>room.action(actor.id,{type:'game-action',action:kind,id,aim,target:point});
 action('sky-part','block:wood',target);room.sim.tick+=4;
 const id=String(room.sim.skybound.state.parts.at(-1)!.id);action('sky-grab',id);room.sim.tick+=4;
 action('sky-hold',id);expect(()=>action('sky-move',id,{...target,y:target.y+.5})).not.toThrow();
 expect(()=>action('sky-hold',id)).toThrow('更新間隔');
 room.leave(actor.id);expect(room.sim.skybound.leases.size).toBe(0);
});
it('holding maintenance preserves an active three-second rescue',()=>{
 const room=new SessionAuthority(),helper=room.join('helper'),target=room.join('target');
 room.sim.world.density=p=>p.y-2;room.sim.adventure.state.resources=[];room.sim.adventure.state.enemies=[];
 Object.assign(helper.player,{x:20,y:2,z:8,grounded:true});Object.assign(target.player,{x:21,y:2,z:8,grounded:true});helper.adventure.state.inventory.wood=10;
 const act=(action:'sky-part'|'sky-grab'|'sky-hold'|'revive',id:string,point?:{x:number;y:number;z:number})=>room.action(helper.id,{type:'game-action',action,id,aim,target:point});
 act('sky-part','block:wood',{x:20,y:4,z:11});room.sim.tick+=4;const part=String(room.sim.skybound.state.parts.at(-1)!.id);act('sky-grab',part);room.sim.tick+=4;
 target.adventure.hurtPlayer(1000,'physical',target.player);act('revive',target.id);expect(helper.adventure.helping?.target).toBe(target.id);
 act('sky-hold',part);expect(helper.adventure.helping?.target).toBe(target.id);
 for(let i=0;i<95;i++){for(const actor of room.actors.values())room.input(actor.id,{x:0,z:0,jump:false},actor.sequence+1);room.step();if(i%30===29)act('sky-hold',part);}
 expect(target.adventure.state.health).toBeGreaterThan(0);expect(helper.adventure.helping).toBeUndefined();expect(room.sim.skybound.leases.size).toBe(1);
});

it('acknowledges a hold heartbeat without scheduling a whole-world checkpoint',()=>{
 const room=new AuthorityRoom(null,'holding'),owner='a'.repeat(64),packets:CoopWireServerPacket[]=[];
 room.connect('socket',{send:p=>packets.push(p),close(){}});room.receive('socket',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),owner).acknowledgment?.();
 const actor=room.authority.actors.get(owner)!;Object.assign(actor.player,{x:20,y:room.authority.sim.groundAt(20,8),z:8});actor.adventure.state.inventory.wood=10;
 room.authority.action(owner,{type:'game-action',action:'sky-part',id:'block:wood',target:{x:22,y:actor.player.y+2,z:8},aim});room.authority.sim.tick+=4;
 const id=String(room.authority.sim.skybound.state.parts.at(-1)!.id);room.authority.action(owner,{type:'game-action',action:'sky-grab',id,aim});room.authority.sim.tick+=4;
 const result=room.receive('socket',JSON.stringify({type:'action',commandId:'seq_1_hold',message:{type:'game-action',action:'sky-hold',id,aim}}));
 expect(result.changed).toBe(false);result.acknowledgment?.();expect(packets.at(-1)).toMatchObject({type:'ack',commandId:'seq_1_hold',accepted:true,message:''});
 expect(room.authority.sim.skybound.leases.size).toBe(1);room.disconnect('socket');expect(room.authority.sim.skybound.leases.size).toBe(0);
});
