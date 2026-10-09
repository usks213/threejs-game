import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {skyContext} from '../../src/game/skybound/context';
it('preserves the starting runestone veto and permits an upward-away move from the recorded browser pose',()=>{
 const sim=new GameSimulation();Object.assign(sim.player,{x:.8,y:1.3395160657736493,z:8});
 // Boundary fixture from CI37383321716. It does not claim a new playthrough.
 const part={id:1,kind:'block' as const,material:'wood' as const,position:{x:1.3066285905271442,y:1.5517556798929317,z:3.4410047309390848},rotation:.28048459968398265,q:{x:-.03185616920738053,y:.1395479414045896,z:-.0008258314016449519,w:.989702417161678},angularVelocity:{x:0,y:0,z:0},sleeping:false,velocity:{x:0,y:0,z:0},mass:6,links:[],epoch:1,shared:true,enabled:false,integrity:100,wet:0,frozen:0};sim.skybound.state.parts.push(part);
 const context={...skyContext(sim),actors:[{id:'a',position:{x:.8,y:1.3395160657736493,z:8}},{id:'b',position:{x:1.6,y:1.3538545813146492,z:8}}]},aim={x:Math.sin(part.rotation),y:0,z:Math.cos(part.rotation)},before=structuredClone(part);
 sim.skybound.action('a','sky-grab','1',undefined,aim,context);const originalLease=sim.skybound.leases.get(1)!.expiresTick;context.tick=10;
 expect(()=>sim.skybound.action('a','sky-move','1',{...before.position,y:before.position.y+.5},aim,context)).toThrow('保護領域');expect(part.position).toEqual(before.position);expect(part.epoch).toBe(before.epoch);expect(sim.skybound.leases.get(1)!.expiresTick).toBe(originalLease);
 context.tick=14;sim.skybound.action('a','sky-move','1',{...before.position,y:before.position.y+.5,z:before.position.z+.5},aim,context);expect(part.position).toEqual({x:1.25,y:2,z:4});expect(sim.skybound.leases.get(1)!.expiresTick).toBe(164);
});
