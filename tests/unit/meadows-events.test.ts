import { expect,it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { stepRaids } from '../../src/game/meadows/raids';
import { strikeBarrier,shamanMagic } from '../../src/game/meadows/defense';
import { meadowEnemy } from '../../src/game/meadows/world';
import { validateSave } from '../../src/save/format';
it('keeps raids gated by a base, progresses from animals to forest enemies, and persists waves',()=>{
 const sim=new GameSimulation(),g=sim.adventure,m=g.state.meadows!,p=sim.player;g.state.buildings=[];
 let check=1;while(((Math.imul(check+7319,374761393)>>>0)%100)>=20)check++;
 g.state.seconds=check*2760;m.raidAt=g.state.seconds;stepRaids(g,.1);expect(m.raid).toBe(0);
 for(const definition of ['bench','bed','fire'])g.state.buildings.push({id:sim.allocateEntityId(),definition,x:p.x+2,y:p.y,z:p.z,rotation:0,support:4,contents:{}});
 m.raidAt=g.state.seconds;stepRaids(g,.1);expect(m.raidKind).toBe('animals');expect(m.raid).toBeGreaterThan(89);
 m.raid=0;m.raidAt=g.state.seconds;g.state.defeated.push('stormstag');stepRaids(g,.1);expect(m.raidKind).toBe('forest');expect(m.raid).toBeGreaterThan(119);expect(()=>validateSave(sim.save())).not.toThrow();
});
it('lets enemies damage barriers and shamans heal injured allies',()=>{
 const sim=new GameSimulation(),g=sim.adventure,e=meadowEnemy(sim,'greydwarfBrute',4,8);e.cooldown=0;e.y=sim.player.y;
 const wall={id:sim.allocateEntityId(),definition:'wall',x:4,y:e.y,z:8.7,rotation:0,support:4,contents:{},health:20};g.state.buildings=[wall];expect(strikeBarrier(g,e,{x:4,y:e.y,z:12})).toBe(true);expect(g.state.buildings).toHaveLength(0);
 const shaman=meadowEnemy(sim,'greydwarfShaman',20,20),ally=meadowEnemy(sim,'greydwarf',21,20);ally.health=5;g.state.enemies=[shaman,ally];shamanMagic(g,shaman,.1);expect(ally.attackReady?.healing).toBeGreaterThan(g.state.seconds);
});
it('sells valuables once and exchanges the proceeds for fishing gear',()=>{
 const sim=new GameSimulation(),g=sim.adventure,merchant=g.state.resources.find(n=>n.kind==='merchant')!;Object.assign(sim.player,merchant);g.state.inventory={ruby:18};g.action('sell');expect(g.state.inventory.coins).toBe(360);expect(g.state.inventory.ruby).toBe(0);expect(()=>g.action('sell')).toThrow();g.action('trade','fishingRod');expect(g.state.inventory.fishingRod).toBe(1);expect(g.state.inventory.coins).toBe(10);g.action('trade','bait');expect(g.state.inventory.bait).toBe(20);
});
