import {expect,it} from 'vitest';
import {SkyboundPowers} from '../../src/game/skybound/powers';
import {global,local} from '../../src/game/skybound/orientation';
import {MATERIAL_MASS,PART_COST,PART_HALF} from '../../src/game/skybound/types';
import {WHEEL_TRACTION_LIMITS} from '../../src/game/skybound/wheel-traction';
import type {SkyContext,SkyPart,SkyPartKind} from '../../src/game/skybound/types';
import {WORLD} from '../../src/world/types';
const aim={x:0,y:0,z:1};
function vehicle(energy=30){
  const kinds:SkyPartKind[]=['slab','seat','seat','battery','wheel','wheel','wheel','wheel','switch'];
  const positions=[{x:3,y:.75,z:0},{x:2.55,y:1.125,z:0},{x:3.45,y:1.125,z:0},{x:3,y:1,z:-.65},{x:2.2,y:.5,z:-.7},{x:3.8,y:.5,z:-.7},{x:2.2,y:.5,z:.7},{x:3.8,y:.5,z:.7},{x:2.4,y:.875,z:-.6}];
  const parts:SkyPart[]=kinds.map((kind,i)=>({id:i+1,kind,material:'wood',mass:MATERIAL_MASS.wood*PART_COST[kind],position:positions[i],velocity:{x:0,y:0,z:0},rotation:0,links:i?[1]:kinds.slice(1).map((_,j)=>j+2),epoch:0,creator:'owner',enabled:kind==='wheel',...(kind==='battery'?{energy}: {})}));
  const powers=new SkyboundPowers({version:1,parts,blueprints:[],fusions:{}}),context:SkyContext={tick:0,bounds:WORLD,player:{x:0,y:0,z:0},inventory:{},actors:[],solid:p=>p.y<0};
  powers.action('a','sky-ride','2',undefined,aim,context);powers.action('b','sky-ride','3',undefined,aim,context);
  const a={x:0,y:0,z:0,heading:0,vy:0,grounded:true},b={...a};powers.drive('a',{x:0,z:-1},a);powers.drive('b',{x:0,z:0},b);context.actors=[{id:'a',position:a},{id:'b',position:b}];
  return{powers,context,a,b,battery:powers.state.parts[3],root:powers.state.parts[0]};
}
function step(powers:SkyboundPowers,context:SkyContext){context.tick++;powers.step(1/30,context);}
function maxZ(part:SkyPart){const h=PART_HALF[part.kind];let max=-Infinity;for(const x of[-h.x,h.x])for(const y of[-h.y,h.y])for(const z of[-h.z,h.z])max=Math.max(max,global({x,y,z},part).z);return max;}

function actorCapsuleGap(part:SkyPart){
  const half=PART_HALF[part.kind];
  const distance=(t:number)=>{const p=local({x:3,y:.5+t*1.1,z:1.7},part);return Math.hypot(Math.max(0,Math.abs(p.x)-half.x),Math.max(0,Math.abs(p.y)-half.y),Math.max(0,Math.abs(p.z)-half.z));};
  // Distance from the actor's upright capsule segment to the OBB is convex in t.
  let low=0,high=1;for(let i=0;i<64;i++){const a=low+(high-low)/3,b=high-(high-low)/3;if(distance(a)<distance(b))high=b;else low=a;}
  return Math.min(distance(0),distance(1),distance((low+high)/2));
}

it('drives a battery/seat/wheel vehicle forward and backward without a thruster, charges only powered wheels and carries two riders',()=>{
  for(const direction of[-1,1]){
    const{powers,context,a,b,battery,root}=vehicle();powers.drive('a',{x:0,z:direction},a);let spent=0;
    for(let i=0;i<30;i++){step(powers,context);spent+=powers.snapshot('a').parts.filter(p=>p.kind==='wheel'&&p.powered).length*WHEEL_TRACTION_LIMITS.energyPerSecond/30;}
    expect(root.position.z*-direction).toBeGreaterThan(.25);expect(battery.energy).toBeCloseTo(30-spent,8);expect(spent).toBeGreaterThan(0);
    expect(powers.isRiding('a')).toBe(true);expect(powers.isRiding('b')).toBe(true);expect(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)).toBeCloseTo(.9,8);
    expect(powers.state.parts.some(p=>p.kind==='thruster')).toBe(false);
  }
});

it('does not spend drive energy in air, with disabled wheels, with no input, or after the driver leaves',()=>{
  for(const mode of['air','disabled','idle','disconnect']as const){
    const{powers,context,a,battery,root}=vehicle();
    if(mode==='air'){for(const p of powers.state.parts)p.position.y+=5;powers.drive('a',{x:0,z:-1},a);}
    if(mode==='disabled')for(const p of powers.state.parts)if(p.kind==='wheel')p.enabled=false;
    if(mode==='idle')powers.drive('a',{x:0,z:0},a);
    if(mode==='disconnect'){powers.release('a');powers.release('b');context.actors=[];}
    for(let tick=0;tick<8;tick++){step(powers,context);expect(powers.snapshot('a').parts.some(p=>p.kind==='wheel'&&p.powered)).toBe(false);}
    expect(battery.energy).toBe(30);expect([root.position.x,root.position.y,root.position.z].every(Number.isFinite)).toBe(true);
  }
});

it('cannot create drive force with an empty battery regardless of forward/reverse driver input',()=>{
  const forward=vehicle(0),reverse=vehicle(0);reverse.powers.drive('a',{x:0,z:1},reverse.a);
  for(let tick=0;tick<20;tick++){step(forward.powers,forward.context);step(reverse.powers,reverse.context);}
  expect(forward.powers.state.parts).toEqual(reverse.powers.state.parts);expect(forward.battery.energy).toBe(0);
});

it('toggles wheels individually and through the connected switch without changing battery charge',()=>{
  const{powers,context,battery}=vehicle();powers.action('a','sky-toggle','5',undefined,aim,context);expect(powers.state.parts[4].enabled).toBe(false);
  powers.action('a','sky-toggle','9',undefined,aim,context);expect(powers.state.parts.filter(p=>p.kind==='wheel').every(p=>p.enabled)).toBe(true);
  powers.action('a','sky-toggle','9',undefined,aim,context);expect(powers.state.parts.filter(p=>p.kind==='wheel').every(p=>p.enabled===false)).toBe(true);expect(battery.energy).toBe(30);
});

it('keeps strict wall and actor boundaries under powered traction while steering remains finite',()=>{
  for(const obstacle of['wall','actor']as const){
    const{powers,context,a,root}=vehicle();
    if(obstacle==='wall')context.solid=p=>p.y<0||p.z>1.4;
    else context.actors.push({id:'bystander',position:{x:3,y:.2,z:1.7}});
    for(let tick=0;tick<45;tick++){
      step(powers,context);
      if(obstacle==='wall')expect(Math.max(...powers.state.parts.map(maxZ))).toBeLessThanOrEqual(1.4+1e-8);
      else for(const p of powers.state.parts)expect(actorCapsuleGap(p),`tick=${tick}, part=${p.kind}#${p.id}`).toBeGreaterThanOrEqual(.3-1e-8);
    }
    if(obstacle==='actor')expect(context.actors.find(p=>p.id==='bystander')!.position).toEqual({x:3,y:.2,z:1.7});
    powers.drive('a',{x:.5,z:-1},a);step(powers,context);expect([root.position.x,root.position.y,root.position.z,...Object.values(root.q!)].every(Number.isFinite)).toBe(true);
  }
});
