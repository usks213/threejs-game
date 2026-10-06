import {it,expect} from 'vitest';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
const idle:Controls={x:0,z:0,sprint:false,block:false,water:false};
function damagedByFire(){
 const s=new CoreSimulation(true,false,true);s.environment.burning=1;s.tick(.1,idle);
 expect(s.player.hp).toBeLessThan(100);expect(s.deathCause).toBe('炎上');
 s.environment.wet=3;s.tick(.1,idle);expect(s.environment.burning).toBe(0);
 s.player.position={x:0,y:.25,z:-4.5};s.player.yaw=0;s.player.hp=20;
 for(const e of s.enemies){e.hp=0;e.phase='dead';}const guard=s.enemies[0];Object.assign(guard,{hp:100,phase:'strike',time:.18,yaw:Math.PI,hit:false,hitstop:0});
 return s;
}
it('replaces an actual prior fire-damage cause when a later ordinary blade kills the player',()=>{
 const s=damagedByFire();s.tick(1/60,idle);expect(s.player.hp).toBe(0);expect(s.events.some(e=>e.kind==='hurt')).toBe(true);expect(s.deathCause).toBe('敵の攻撃');
 s.respawn();expect(s.player.hp).toBe(100);expect(s.deathCause).toBe('');expect(s.arena.field.overlaps(s.player.position)).toBe(false);
});
it('does not replace the last damage cause when the ordinary blade is parried',()=>{
 const s=damagedByFire();s.player.guard=.65;s.tick(1/60,{...idle,block:true});expect(s.player.hp).toBe(20);expect(s.events.some(e=>e.kind==='parry')).toBe(true);expect(s.deathCause).toBe('炎上');
});
