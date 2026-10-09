import {expect,it} from 'vitest';
import {FluidGrid} from '../../src/fluid/fluid';
import {SdfWorld} from '../../src/world/density';
import {WORLD} from '../../src/world/types';
import {SkyboundPowers} from '../../src/game/skybound/powers';
import {assemblyBuoyancy} from '../../src/game/skybound/buoyancy';
import {createHullWaterSampler,HULL_WATER_BUDGET} from '../../src/game/skybound/hull-water';
import {updateWaterObstacles} from '../../src/game/meadows/water-obstacles';
import {MATERIAL_MASS,PART_COST,PART_HALF} from '../../src/game/skybound/types';
import type {SkyContext,SkyPart,SkyPartKind} from '../../src/game/skybound/types';
import type {GameSimulation} from '../../src/simulation/game-simulation';
import {increment,orientation,rotate} from '../../src/game/skybound/orientation';
const total=(fluid:FluidGrid)=>[...fluid.cells.values()].reduce((n,p)=>n+p.volume,0);
function part(id:number,kind:SkyPartKind,x:number,y:number,z:number):SkyPart{return{id,kind,material:'wood',mass:MATERIAL_MASS.wood*PART_COST[kind],position:{x,y,z},velocity:{x:0,y:0,z:0},rotation:0,links:[],epoch:0,creator:'a'};}
function pool(){const world=new SdfWorld(undefined,4);world.density=p=>p.y<0||Math.abs(p.x)>6||Math.abs(p.z)>6?-1:1;const fluid=new FluidGrid(world,.5);for(let x=-6;x<6;x+=.5)for(let z=-6;z<6;z+=.5)for(let y=0;y<2;y+=.5)fluid.add({x,y,z},.125);return{world,fluid};}
function obstacleHost(powers:SkyboundPowers,fluid:FluidGrid,player:{x:number;y:number;z:number}){return{skybound:powers,fluid,player,targets:[],bodies:[],adventure:{state:{buildings:[],resources:[],seconds:0}}}as unknown as GameSimulation;}
it('samples exterior columns directly for wide rafts without reading raised water under their own hull',()=>{
 const parts=Array.from({length:16},(_,i)=>part(i+1,'slab',(i%4)*2-3,1.8,Math.floor(i/4)*2-3));let reads=0,solidReads=0;
 const sampler=createHullWaterSampler({cellSize:.5,immersion:(p,h)=>{reads++;expect(Math.abs(p.x)>4||Math.abs(p.z)>4).toBe(true);return Math.max(0,Math.min(1,(2-p.y)/h));}},()=>{solidReads++;return false;});
 for(const p of parts)expect(sampler(parts,p.position,.04)).toBeCloseTo(1);
 expect(reads).toBe(HULL_WATER_BUDGET.references);expect(solidReads).toBeLessThanOrEqual(HULL_WATER_BUDGET.references*(HULL_WATER_BUDGET.raySteps+1));
 expect(sampler(parts,{x:0,y:2.1,z:0},.04)).toBe(0);
});
it('bounds solid queries for a tilted sixteen-part hull while preserving exact exterior-water depth',()=>{
 const q=increment({x:.15,y:.2,z:.18},1),parts=Array.from({length:16},(_,i)=>{const offset=rotate({x:(i%4)*2-3,y:0,z:Math.floor(i/4)*2-3},q);return {...part(i+1,'slab',offset.x,25+offset.y,offset.z),q};});
 let solidReads=0,fluidReads=0;const sampler=createHullWaterSampler({cellSize:.5,immersion:()=>{fluidReads++;return .37;}},()=>{solidReads++;return false;}),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:25,z:0},actors:[],inventory:{},solid:()=>false,hullWaterFraction:sampler};
 const water=assemblyBuoyancy(parts,context);expect(water.wet).toBeCloseTo(.37,10);expect(water.force.y).toBeCloseTo(parts.reduce((sum,p)=>sum+p.mass*14*.37,0),8);
 expect(fluidReads).toBeLessThanOrEqual(HULL_WATER_BUDGET.references*HULL_WATER_BUDGET.heightEntries);expect(solidReads).toBeLessThanOrEqual(HULL_WATER_BUDGET.solidQueries);expect(solidReads).toBeLessThan(8000);
 const before=solidReads;expect(assemblyBuoyancy(parts,context)).toEqual(water);expect(solidReads).toBe(before);
 let dryQueries=0;const dry=createHullWaterSampler({cellSize:.5,immersion:()=>0},()=>{dryQueries++;return false;});expect(assemblyBuoyancy(parts,{...context,hullWaterFraction:dry}).force.y).toBe(0);expect(dryQueries).toBe(0);
});
it('treats a blocked height band or an exhausted assembly query budget as dry without inventing lift',()=>{
 const parts=[part(1,'slab',0,1,0)],blocked=createHullWaterSampler({cellSize:.5,immersion:()=>1},p=>Math.abs(p.x)>.8&&Math.abs(p.y-1)<.02||Math.abs(p.z)>.8&&Math.abs(p.y-1)<.02);
 expect(blocked(parts,{x:0,y:1.04,z:0},.04)).toBe(0);
 const tall=Array.from({length:16},(_,i)=>part(i+1,'slab',i*3,i*3,0));let reads=0;const limited=createHullWaterSampler({cellSize:.5,immersion:()=>1},()=>{reads++;return false;});
 for(const p of tall){const value=limited(tall,p.position,.04);expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
 expect(reads).toBe(HULL_WATER_BUDGET.solidQueries);expect(limited(tall,{x:0,y:100,z:0},.04)).toBe(0);expect(reads).toBe(HULL_WATER_BUDGET.solidQueries);
});
it('does not sample sleeping distant hulls while preserving their enabled-device energy bookkeeping',()=>{
 const parts=[part(1,'slab',0,25,0),part(2,'battery',0,25.4,0),part(3,'thruster',0,25,1)];parts[0].links=[2,3];parts[1].links=[1];parts[2].links=[1];parts[1].energy=100;parts[2].enabled=true;
 const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),player={x:100,y:25,z:100};let hullReads=0;
 powers.step(1/30,{tick:1,bounds:WORLD,player,actors:[{id:'a',position:player}],inventory:{},solid:()=>false,hullWaterFraction:()=>{hullReads++;return 1;}});
 expect(hullReads).toBe(0);expect(powers.state.parts.every(p=>p.sleeping)).toBe(true);expect(powers.state.parts[1].energy).toBeCloseTo(99.9);expect(powers.state.parts[0].position).toEqual(parts[0].position);
});
it('rejects remote water above the sample and water across a solid wall; empty exterior is conservatively dry',()=>{
 const parts=[part(1,'slab',0,1,0)],sampler=createHullWaterSampler({cellSize:.5,immersion:(p,h)=>p.y>=20&&p.y+h<=21?1:0},()=>false);expect(sampler(parts,{x:0,y:1,z:0},.04)).toBe(0);
 const enclosed=createHullWaterSampler({cellSize:.5,immersion:()=>1},p=>Math.abs(p.x)>.8||Math.abs(p.z)>.8);expect(enclosed(parts,{x:0,y:1,z:0},.04)).toBe(0);
 expect(createHullWaterSampler({cellSize:.5,immersion:()=>NaN},()=>false)(parts,{x:0,y:1,z:0},.04)).toBe(0);
});
it('adds quaternion Skybound geometry to authoritative obstacles without letting cargo create hull volume or lift',()=>{
 const {world,fluid}=pool(),storage=part(1,'storage',0,1.5,0),powers=new SkyboundPowers({version:1,parts:[storage],blueprints:[],fusions:{}}),host=obstacleHost(powers,fluid,{x:5,y:3,z:5});
 updateWaterObstacles(host);const before=fluid.snapshot().map(p=>[p.x,p.y,p.z,p.bottom]),context:SkyContext={tick:0,bounds:WORLD,player:host.player,actors:[],inventory:{},solid:p=>world.density(p)<0,hullWaterFraction:createHullWaterSampler(fluid,p=>world.density(p)<0)};
 const lift=assemblyBuoyancy(powers.state.parts,context).force.y;powers.state.parts[0].cargoMass=40;powers.state.parts[0].mass+=40;updateWaterObstacles(host);
 expect(fluid.snapshot().map(p=>[p.x,p.y,p.z,p.bottom])).toEqual(before);expect(assemblyBuoyancy(powers.state.parts,context).force.y).toBeCloseTo(lift);
 expect(before.some(p=>Number(p[3])>0)).toBe(true);
});
it('keeps an actually powered floating raft finite and volume-conserving without self-raised lift runaway',()=>{
 const {world,fluid}=pool(),parts=[part(1,'slab',-1,1.8,0),part(2,'slab',1,1.8,0),part(3,'battery',0,2.05,-.7),part(4,'thruster',0,1.8,1.3),part(5,'seat',0,2.3,0)];parts[0].links=[2,3,4,5];for(const p of parts.slice(1))p.links=[1];parts[2].energy=100;parts[3].enabled=true;
 const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),player={x:0,y:2,z:-3,heading:0,vy:0,grounded:true},host=obstacleHost(powers,fluid,player),context:SkyContext={tick:0,bounds:WORLD,player,actors:[],inventory:{},solid:p=>world.density(p)<0};
 powers.action('a','sky-ride','5',undefined,{x:0,y:0,z:1},context);powers.drive('a',{x:0,z:-1},player);context.actors=[{id:'a',position:player}];const before=total(fluid),heights:number[]=[];let maxDisplacement=0,shorted=0,nextShort=0;
 for(let tick=1;tick<=240;tick++){
  if(tick===61)powers.state.parts[3].enabled=false;
  if(tick%3===0){updateWaterObstacles(host);fluid.step([player]);}
  context.tick=tick;context.immersion=p=>fluid.immersion(p,1);context.waterFraction=(p,h)=>fluid.immersion(p,h);context.hullWaterFraction=createHullWaterSampler(fluid,context.solid);context.current=p=>({...fluid.current(p),y:0});if(fluid.immersion(powers.state.parts[2].position,1)>.05&&tick>=nextShort){shorted++;nextShort=tick+30;}powers.step(1/30,context);
  heights.push(powers.state.parts[0].position.y);maxDisplacement=Math.max(maxDisplacement,powers.state.parts[0].position.z);expect(total(fluid)).toBeCloseTo(before,7);expect(powers.state.parts.every(p=>[...Object.values(p.position),...Object.values(p.velocity),...Object.values(orientation(p))].every(Number.isFinite))).toBe(true);
 }
 console.info(JSON.stringify({scope:'coupled raft Node prototype',minY:Math.min(...heights),maxY:Math.max(...heights),finalY:heights.at(-1),lastRange:Math.max(...heights.slice(150))-Math.min(...heights.slice(150)),maxDisplacement,displaced:fluid.displaced,energy:powers.state.parts[2].energy,shorted,riding:powers.isRiding('a'),up:rotate({x:0,y:1,z:0},orientation(powers.state.parts[0])).y}));
 expect(fluid.displaced).toBeGreaterThan(0);expect(maxDisplacement).toBeGreaterThan(.2);expect(Math.max(...heights)).toBeLessThan(2.6);expect(Math.min(...heights)).toBeGreaterThan(1);expect(powers.isRiding('a')).toBe(true);expect(shorted).toBeGreaterThan(0);expect(powers.state.parts[2].energy).toBeCloseTo(94-shorted,8);expect(Math.max(...heights.slice(150))-Math.min(...heights.slice(150))).toBeLessThan(.25);expect(rotate({x:0,y:1,z:0},orientation(powers.state.parts[0])).y).toBeGreaterThan(.9);
},20000);

it('keeps a full sixteen-slab raft supported without an unbounded search for exterior water',()=>{
 const {world,fluid}=pool(),parts=Array.from({length:16},(_,i)=>part(i+1,'slab',(i%4)*2-3,1.93,Math.floor(i/4)*2-3));parts[0].links=parts.slice(1).map(p=>p.id);for(const p of parts.slice(1))p.links=[1];
 const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),player={x:5,y:3,z:5},host=obstacleHost(powers,fluid,player),context:SkyContext={tick:0,bounds:WORLD,player,actors:[],inventory:{},solid:p=>world.density(p)<0,immersion:p=>fluid.immersion(p,1)};const initial=total(fluid),heights:number[]=[];
 for(let tick=1;tick<=150;tick++){if(tick%3===0){updateWaterObstacles(host);fluid.step([player]);}context.tick=tick;context.hullWaterFraction=createHullWaterSampler(fluid,context.solid);powers.step(1/30,context);heights.push(powers.state.parts.reduce((n,p)=>n+p.position.y,0)/16);expect(total(fluid)).toBeCloseTo(initial,7);}
 expect(Math.min(...heights)).toBeGreaterThan(1.4);expect(Math.max(...heights)).toBeLessThan(2.6);expect(powers.state.parts).toHaveLength(16);
});
