import {expect,it} from 'vitest';
import {GameSimulation} from '../../src/simulation/game-simulation';
import {createdPreview} from '../../src/game/skybound/preview';
import {adjacentConstructionPoint} from '../../src/game/skybound/construction-placement';
import {skyContext} from '../../src/game/skybound/context';
it('previews a separate but joinable second beam and commits only normal create/grab/glue actions',()=>{
 const sim=new GameSimulation(),g=sim.adventure;g.state.inventory.wood=8;sim.fluid.restore([]);g.state.resources=[];g.state.buildings=[];g.state.enemies=[];
 sim.world.density=p=>p.y;Object.assign(sim.player,{x:0,y:0,z:3,grounded:true});
 g.action('sky-part','beam:wood',{x:0,y:.5,z:0});const first=sim.skybound.state.parts[0],point=adjacentConstructionPoint(first,'beam');
 expect(point).toEqual({x:0,y:.875,z:0});expect(g.state.inventory.wood).toBe(6);expect(sim.skybound.state.parts).toHaveLength(1);
 g.action('sky-part','beam:wood',point);const second=sim.skybound.state.parts[1];expect(g.state.inventory.wood).toBe(4);
 g.action('sky-grab',String(first.id));g.action('sky-glue',first.id+':'+second.id);expect(first.links).toContain(second.id);
});
it('uses the selected part actual bounds, even after rotation, without mutating it',()=>{
 const part=createdPreview('beam','wood',{x:3,y:4,z:5}).parts[0];part.rotation=Math.PI/2;part.q={x:0,y:Math.sin(Math.PI/4),z:0,w:Math.cos(Math.PI/4)};const before=structuredClone(part);
 expect(adjacentConstructionPoint(part,'beam')).toEqual({x:3,y:4.375,z:5});expect(part).toEqual(before);
});
it('does not bypass authority collision rejection for an adjacent draft inside a ceiling',()=>{
 const sim=new GameSimulation(),g=sim.adventure;g.state.inventory.wood=8;sim.fluid.restore([]);g.state.resources=[];g.state.buildings=[];g.state.enemies=[];sim.world.density=p=>p.y;Object.assign(sim.player,{x:0,y:0,z:3,grounded:true});
 g.action('sky-part','beam:wood',{x:0,y:.5,z:0});const point=adjacentConstructionPoint(sim.skybound.state.parts[0],'beam');sim.world.density=p=>Math.min(p.y,.6-p.y);
 const before=g.state.inventory.wood;expect(()=>sim.skybound.action('host','sky-part','beam:wood',point,{x:0,y:0,z:-1},skyContext(sim))).toThrow();expect(sim.skybound.state.parts).toHaveLength(1);expect(g.state.inventory.wood).toBe(before);
});
it('builds and joins above a settled beam in the unmodified opening terrain',()=>{
 const sim=new GameSimulation(),g=sim.adventure;for(let i=0;i<30;i++)sim.step({x:0,z:0,jump:false});
 const wood=g.state.resources.find(n=>n.kind==='wood'&&n.drop)!;g.action('gather',String(wood.id));
 // The first draft uses the same actual opening ground and ordinary create API.
 const ground=sim.groundAt(wood.x,wood.z),at={x:wood.x,y:Math.max(ground+.75,sim.player.y+.5),z:wood.z};
 g.action('sky-part','beam:wood',at);for(let i=0;i<90;i++)sim.step({x:0,z:0,jump:false});
 const first=sim.skybound.state.parts[0],point=adjacentConstructionPoint(first,'beam');g.action('sky-part','beam:wood',point);
 const second=sim.skybound.state.parts[1];g.action('sky-grab',String(first.id));g.action('sky-glue',first.id+':'+second.id);
 expect(first.links).toContain(second.id);expect(g.state.inventory.wood).toBe(8);
});
