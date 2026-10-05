import {it,expect} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
it('accepts the first real terrain edit after immediate menu guard and sprint releases',()=>{
 const room=new SessionAuthority(null,true),actor=room.join('menu-player');
 for(const action of ['guard','sprint']as const)room.action(actor.id,{type:'game-action',action,id:'off',aim:{x:0,y:0,z:-1}});
 expect(()=>room.action(actor.id,{type:'action',tool:'dig',target:{x:actor.player.x+4,y:actor.player.y,z:actor.player.z+2}})).not.toThrow();expect(room.sim.world.edits).toHaveLength(1);
});
