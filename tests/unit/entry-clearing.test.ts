import {expect,it} from 'vitest';
import {SessionAuthority} from '../../src/simulation/session';
import {ENTRY_CLEARING,inEntryClearing,mayEnterEncounterPosition} from '../../src/game/entry-clearing';
import {legacySimulation} from '../helpers/legacy';
it('keeps actual newly joined players alive at the shared start while loading, then accepts pickup and movement',()=>{
 const room=new SessionAuthority(null,true),a=room.join('arrival-a');
 // Use the real seeded world, enemies and server ticks. No neutralized combat,
 // alternate save, or fabricated browser state is used for the loading delay.
 for(let i=0;i<30*20;i++)room.step();
 const b=room.join('arrival-b');for(let i=0;i<30*40;i++)room.step();
 expect(a.adventure.state.health).toBe(25);expect(b.adventure.state.health).toBe(25);
 expect(room.sim.adventure.state.enemies.some(e=>e.health>0)).toBe(true);
 const wood=a.adventure.state.resources.find(n=>n.drop&&n.kind==='wood')!;
 room.action(a.id,{type:'game-action',action:'gather',id:String(wood.id),aim:{x:0,y:0,z:-1}});expect(a.adventure.state.inventory.wood).toBe(12);
 const before=b.player.x;for(let i=0;i<12;i++){room.input(b.id,{x:1,z:0,jump:false},i+1);room.step();}expect(b.player.x).toBeGreaterThan(before+.4);
 // Leaving the expanded learning clearing reaches the gentler seeded encounter.
 for(let i=0;i<600&&b.adventure.state.health===25;i++){room.input(b.id,{x:0,z:i<260?1:0,jump:false},i+13);room.step();}
 expect(inEntryClearing(room.sim,b.player)).toBe(false);expect(b.adventure.state.health).toBeLessThan(25);
 expect(a.adventure.state.health).toBe(25);
},60000);
it('limits the peaceful boundary to the surface start and allows existing intruders to retreat',()=>{
 const room=new SessionAuthority(),sim=room.sim,y=sim.world.heightAt(0,8),inside={x:0,y,z:8},edge={x:ENTRY_CLEARING.radius,y,z:8},outside={x:ENTRY_CLEARING.radius+.01,y,z:8};
 expect(inEntryClearing(sim,edge)).toBe(true);expect(inEntryClearing(sim,outside)).toBe(false);
 expect(inEntryClearing(sim,{...inside,y:y-3})).toBe(false);expect(inEntryClearing(sim,{...inside,y:y+5})).toBe(false);
 expect(inEntryClearing(legacySimulation(),inside)).toBe(false);
 expect(mayEnterEncounterPosition(sim,outside,edge)).toBe(false);expect(mayEnterEncounterPosition(sim,inside,{...inside,x:1})).toBe(true);expect(mayEnterEncounterPosition(sim,{...inside,x:1},inside)).toBe(false);
});
