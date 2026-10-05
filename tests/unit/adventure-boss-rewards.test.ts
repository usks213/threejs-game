import {expect,it,vi} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {validateSave} from '../../src/save/format';
import {participantSave} from '../../src/save/participant';
import {flushPendingBossRewards} from '../../src/game/combat/boss-rewards';
import {DROP_LIMIT} from '../../src/game/interaction/drops';
import type {EnemyState} from '../../src/game/types';
// Synthetic capacity fixtures exercise the boundary; they are not playthrough evidence.
function fixture(definition='stormcore',count=0){
 const room=new SessionAuthority(),game=room.sim.adventure;
 const original=count?game.state.resources:[];game.state.resources=[...original,...Array.from({length:Math.max(0,count-original.length)},(_,i)=>({id:1000000+i,kind:'wood',amount:100,ready:0,drop:true,x:80,y:2,z:80}))];
 const enemy:EnemyState={id:900001,definition,tier:1,x:20,y:0,z:20,health:1,boss:true,homeX:20,homeZ:20,cooldown:5,windup:0,slow:0};game.state.enemies=[enemy];
 return {room,game,enemy};
}
it('pays the final boss exactly once through the real lethal hit path',()=>{const {game,enemy}=fixture();game.hit(enemy,100,'fire');expect(game.state.defeated).toContain('stormcore');expect(game.state.resources.map(n=>[n.kind,n.amount])).toEqual([['star',4],['crystal',6]]);game.hit(enemy,100,'fire');flushPendingBossRewards(game);expect(game.state.resources).toHaveLength(2);expect(enemy.rewardPending).toBeUndefined();});
it('records victory without partial payout when only one slot remains; saves and retries atomically',()=>{
 const {room,game,enemy}=fixture('stormcore',DROP_LIMIT-1);expect(()=>game.hit(enemy,100,'fire')).not.toThrow();expect(enemy.rewardPending).toBe(true);expect(game.state.defeated).toContain('stormcore');expect(game.state.resources).toHaveLength(DROP_LIMIT-1);expect(game.state.resources.some(n=>n.kind==='star')).toBe(false);
 const restored=new SessionAuthority(validateSave(room.save()),true),next=restored.sim.adventure,boss=next.state.enemies[0];restored.join('observer');expect(participantSave(restored,'observer').adventure!.enemies[0].rewardPending).toBe(true);
 next.state.resources.pop();flushPendingBossRewards(next);expect(boss.rewardPending).toBeUndefined();expect(next.state.resources.slice(-2).map(n=>[n.kind,n.amount])).toEqual([['star',4],['crystal',6]]);expect(next.state.resources).toHaveLength(DROP_LIMIT);flushPendingBossRewards(next);expect(next.state.resources).toHaveLength(DROP_LIMIT);
},20000);
it('keeps a site boss reward pending at full capacity and retries on the world step',()=>{const {room,game,enemy}=fixture('loadwarden',DROP_LIMIT);game.hit(enemy,100,'fire');expect(enemy.rewardPending).toBe(true);expect(game.state.defeated).toContain('loadwarden');game.state.resources=[];room.sim.tick=30;game.step(1/30);expect(enemy.rewardPending).toBeUndefined();expect(game.state.resources.some(n=>n.kind==='crystal'&&n.amount===2)).toBe(true);});
it('retains a payout receipt when the entity allocator fails and recovers without duplication',()=>{const {room,game,enemy}=fixture();const allocation=vi.spyOn(room.sim,'reserveEntityIds').mockImplementation(()=>{throw Error('allocation unavailable');});game.hit(enemy,100,'fire');expect(enemy.rewardPending).toBe(true);expect(game.state.resources).toHaveLength(0);allocation.mockRestore();flushPendingBossRewards(game);expect(game.state.resources).toHaveLength(2);});
it('rejects malformed pending rewards on living or non-boss enemies and missing victory records',()=>{const {room,enemy,game}=fixture();enemy.rewardPending=true;game.state.defeated=['stormcore'];expect(()=>validateSave(room.save())).toThrow();enemy.health=0;enemy.boss=false;expect(()=>validateSave(room.save())).toThrow();enemy.boss=true;game.state.defeated=[];expect(()=>validateSave(room.save())).toThrow();game.state.defeated=['stormcore'];expect(()=>validateSave(room.save())).not.toThrow();});
