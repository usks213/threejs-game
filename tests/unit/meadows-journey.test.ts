import { expect,it } from 'vitest';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { validateSave } from '../../src/save/format';
/** Rules-level acceptance: no inventory grants. Travel is direct; this is not a device playtest. */
it('supports the initial gathering, camp, food, gear, boss and offering progression using obtainable items',()=>{
 const sim=new GameSimulation(),g=sim.adventure,s=g.state;
 const gather=(kind:string,count:number)=>{for(const n of s.resources.filter(n=>n.kind===kind&&n.ready<=s.seconds).slice(0,count)){Object.assign(sim.player,{x:n.x,y:n.y,z:n.z});g.action('gather');}};
 gather('branch',18);gather('stone',4);g.action('craft','axe');g.action('craft','hammer');
 Object.assign(sim.player,{x:0,y:sim.groundAt(0,8),z:8});
 const place=(id:string,x:number,z:number,height=0)=>g.action('build',id,{x,y:sim.groundAt(x,z)+height,z});
 place('bench',3,8);place('roof',3,8,2);place('fire',0,11);place('cook',0,11,.65);
 const hunt=(kind:string)=>{g.action('equip','axe');if((s.meadows!.durability.axe??0)<10){Object.assign(sim.player,{x:0,y:sim.groundAt(0,8),z:8});g.action('repair');}let e=s.enemies.find(e=>e.definition===kind&&e.health>0);if(!e){g.stepPersonal(121);g.step(0);e=s.enemies.find(e=>e.definition===kind&&e.health>0);}if(!e)throw Error('No renewable '+kind);
  while(e.health>0){Object.assign(sim.player,{x:e.x,y:e.y,z:e.z+1});g.action('attack');g.stepPersonal(1);}
 };
 while((s.inventory.leatherScraps??0)<12)hunt('boar');
 while((s.inventory.deerHide??0)<22||(s.inventory.deerTrophy??0)<2)hunt('deer');
 Object.assign(sim.player,{x:0,y:sim.groundAt(0,8),z:8});
 // Relight after the time spent hunting. Recipe/food paths must be usable without debug grants.
 sim.player.z=9;g.action('fuel');g.action('cook','boarMeat');g.stepPersonal(26);g.action('cook');
 gather('berry',1);gather('mushroom',1);for(const id of ['cookedBoar','berry','mushroom'])g.action('eat',id);
 Object.assign(sim.player,{x:0,y:sim.groundAt(0,8),z:8});g.action('craft','crudeBow');g.action('craft','woodArrow');g.action('craft','leatherTunic');g.action('craft','leatherHelmet');g.action('craft','leatherPants');
 const altar=s.resources.find(n=>n.kind==='altar')!;Object.assign(sim.player,altar);g.action('summon');const boss=s.enemies.find(e=>e.boss&&e.health>0)!;
 g.action('equip','axe');while(boss.health>0){if(s.stamina<15)g.stepPersonal(5);Object.assign(sim.player,{x:boss.x,y:boss.y,z:boss.z+1});g.action('attack');g.stepPersonal(1);}
 expect(s.inventory.hardAntler).toBe(3);const shrine=s.resources.find(n=>n.kind==='sacrifice')!;Object.assign(sim.player,shrine);g.action('offer');g.action('power');
 gather('branch',4);Object.assign(sim.player,{x:0,y:sim.groundAt(0,8),z:8});g.action('craft','antlerPickaxe');expect(s.inventory.antlerPickaxe).toBe(1);expect(new GameSimulation(validateSave(sim.save())).adventure.state.meadows!.offered).toBe(true);
});
