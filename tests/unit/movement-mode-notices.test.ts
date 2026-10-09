import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {AuthorityRoom} from '../../src/networking/authority-room';
import {COOP_PROTOCOL,type CoopWireServerPacket} from '../../src/networking/coop-protocol';

it.each([3,4] as const)('keeps unchanged explicit movement modes quiet in generator %s',generator=>{
 const game=new GameSimulation(undefined,generator).adventure;
 expect(game.action('sprint','off')).toEqual({dirty:[],message:''});
 expect(game.action('sprint','on').message).toBe('走る');
 expect(game.action('sprint','on')).toEqual({dirty:[],message:''});
 expect(game.state.meadows).toMatchObject({sprinting:true,sneaking:false});
 expect(game.action('sprint','off').message).toBe('歩く');
 expect(game.action('sprint','off')).toEqual({dirty:[],message:''});
 expect(game.state.meadows).toMatchObject({sprinting:false,sneaking:false});
});

it.each([3,4] as const)('still reports touch toggles and leaving sneak in generator %s',generator=>{
 const game=new GameSimulation(undefined,generator).adventure;
 expect(game.action('sprint').message).toBe('走る');
 expect(game.action('sprint').message).toBe('歩く');
 expect(game.action('sneak').message).toBe('忍び足');
 expect(game.action('sprint','off').message).toBe('歩く');
 expect(game.state.meadows).toMatchObject({sprinting:false,sneaking:false});
 expect(game.action('sneak').message).toBe('忍び足');
 expect(game.action('sprint','on').message).toBe('走る');
 expect(game.state.meadows).toMatchObject({sprinting:true,sneaking:false});
 expect(game.action('sneak').message).toBe('忍び足');
 expect(game.action('sneak').message).toBe('歩く');
});

it('authoritatively accepts and acknowledges quiet cleanup without suppressing real mode changes',()=>{
 const room=new AuthorityRoom(null,'movement-notices'),player='f'.repeat(64),out:CoopWireServerPacket[]=[];
 room.connect('client',{send:packet=>out.push(packet),close(){}});
 room.receive('client',JSON.stringify({type:'hello',protocol:COOP_PROTOCOL}),player).acknowledgment?.();
 const send=(sequence:number,action:'sprint'|'sneak',id:string)=>{
  const commandId=`seq_${sequence}_movement`;
  const result=room.receive('client',JSON.stringify({type:'action',commandId,message:{type:'game-action',action,id,aim:{x:0,y:0,z:-1}}}));
  expect(result.changed).toBe(true);expect(result.acknowledgment).toBeTypeOf('function');result.acknowledgment!();
  return out.find(packet=>packet.type==='ack'&&packet.commandId===commandId);
 };
 expect(send(1,'sprint','off')).toMatchObject({accepted:true,message:''});
 expect(send(2,'sneak','')).toMatchObject({accepted:true,message:'忍び足'});
 // A safety release must bypass the same-tick action cooldown and clear sneak.
 expect(send(3,'sprint','off')).toMatchObject({accepted:true,message:'歩く'});
 expect(send(4,'sprint','off')).toMatchObject({accepted:true,message:''});
 expect(room.authority.actors.get(player)!.adventure.state.meadows).toMatchObject({sprinting:false,sneaking:false});
 expect(room.checkpoint().actionSequences).toContainEqual([player,4]);
});
