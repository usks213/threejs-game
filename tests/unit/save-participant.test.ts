import { expect, it } from 'vitest';
import { SessionAuthority } from '../../src/simulation/session';
import { GameSimulation } from '../../src/simulation/game-simulation';
import { participantSave } from '../../src/save/participant';
import { legacySimulation } from '../helpers/legacy';
import { skyContext } from '../../src/game/skybound/context';
it('exports the world and one player only, projects known fields, and remaps their portable blueprint/fusion to host',()=>{
 const room=new SessionAuthority(legacySimulation().save()),a=room.join('player-a'),b=room.join('player-b');a.adventure.state.inventory.wood=20;b.adventure.state.inventory.wood=987;room.sim.adventure.state.inventory.wood=654;
 Object.assign(a.adventure.state,{resumeKey:'never-export-this-key'});Object.assign(a.adventure.state.resources[0],{resumeKey:'never-export-node-secret'});
 const sky=room.sim.skybound;sky.state.parts=[{id:10,kind:'block',material:'wood',position:{x:10,y:3,z:8},velocity:{x:0,y:0,z:0},rotation:0,mass:6,links:[],epoch:0,creator:'player-a',shared:false},{id:11,kind:'block',material:'wood',position:{x:12,y:3,z:8},velocity:{x:0,y:0,z:0},rotation:0,mass:6,links:[],epoch:0,creator:'player-b',shared:false}];sky.state.blueprints=[{id:1,owner:'player-a',name:'My bridge',parts:[{kind:'block',material:'wood',offset:{x:0,y:0,z:0},rotation:0,links:[]}]},{id:2,owner:'player-b',name:'Private plan',parts:[{kind:'block',material:'wood',offset:{x:0,y:0,z:0},rotation:0,links:[]}]}];sky.state.fusions={'player-a':[{equipment:'sword',material:'stone',damage:6,durability:30,effect:'impact'}],'player-b':[{equipment:'axe',material:'resin',damage:4,durability:20,effect:'fire'}]};
 const exported=participantSave(room,'player-a',{portable:true}),json=JSON.stringify(exported);expect(exported.members).toBeUndefined();expect(exported.adventure!.inventory.wood).toBe(20);expect(json).not.toContain('resumeKey');expect(json).not.toContain('never-export');expect(exported.skybound!.parts.map(p=>p.creator)).toEqual(['host','player-b']);expect(json).not.toContain('Private plan');expect(exported.skybound!.blueprints[0].owner).toBe('host');expect(Object.keys(exported.skybound!.fusions)).toEqual(['host']);
 const imported=new GameSimulation(exported);imported.world.density=()=>1;imported.adventure.state.resources=[];const target={x:imported.player.x+2,y:imported.player.y+2,z:imported.player.z};expect(()=>imported.skybound.action('host','sky-rebuild','1',target,{x:0,y:0,z:1},skyContext(imported))).not.toThrow();expect(imported.adventure.state.inventory.wood).toBe(17);expect(imported.skybound.fusion('host','sword')?.damage).toBe(6);
 const welcome=participantSave(room,'player-a');expect(welcome.skybound!.blueprints[0].owner).toBe('player-a');expect(()=>participantSave(room,'missing')).toThrow();
});
