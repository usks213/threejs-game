import { describe,expect,it } from 'vitest';
import { applyRatchetWork,bodyAxis,bowlHeightAt,bowlNormalAt,comHeight,createBattle,engageRail,getBladeOutline,getBladeVertices,getRailPath,integrateFree,kineticEnergy,railEligible,resolveContact,resolveFloor,setAngularVelocity,setOrientation,STEP,stepBattle,STADIUM,totalEnergy } from '../../../src/beyblade/core/physics';
import type { PhysicsTop } from '../../../src/beyblade/core/physics';
import type { Profile,Top,Vec3 } from '../../../src/beyblade/core/types';
import { buildForBlade,defaultBuild,parts,profileFor } from '../../../src/beyblade/data/catalog';
const profile:Profile={name:'synthetic test body',type:'balance',spin:1,mass:.035,radius:.024,inertia:.55*.035*.024**2,grip:.25,drag:.025,restitution:.6,burstThreshold:.04,height:.028,railGrip:.65,gearRadius:.006,gearHeight:.007,railEligible:true,contactLobes:4,contactLobeDepth:.04,color:0,centerOfMassHeight:.019,tipRadius:.0015,tipShape:'taper',tipFriction:.22};
const launch={power:.8,angle:0,tilt:.14};
const battle=()=>createBattle([profile,profile],[launch,{...launch,power:.78}]);
const len=(v:Vec3)=>Math.hypot(v.x,v.y,v.z);
const difference=(a:Vec3,b:Vec3)=>len({x:a.x-b.x,y:a.y-b.y,z:a.z-b.z});
const momentum=(a:Top,b:Top)=>({x:a.profile.mass*a.vx+b.profile.mass*b.vx,y:a.profile.mass*a.vy+b.profile.mass*b.vy,z:a.profile.mass*a.vz+b.profile.mass*b.vz});
const qnorm=(t:Top)=>Math.hypot(t.orientation.x,t.orientation.y,t.orientation.z,t.orientation.w);
function run(state:ReturnType<typeof battle>,seconds=12){for(let n=0;n<seconds/STEP&&!state.result;n++)stepBattle(state);return state;}

describe('6DOF quaternion / angular-momentum solver',()=>{
  it('uses finite serialized 3D state and deterministic replays',()=>{
    const a=battle(),b=structuredClone(a);for(let i=0;i<500;i++){stepBattle(a);stepBattle(b);}expect(a).toEqual(b);
    for(const t of a.tops){expect(qnorm(t)).toBeCloseTo(1,12);expect(Number.isFinite(t.y)).toBe(true);expect(t.bodyInertia.x).toBeGreaterThan(0);}
  });
  it('guards physical constants and launch inputs',()=>{
    const a=createBattle([profile,profile],[{power:NaN,angle:Infinity,tilt:-4},launch]);expect(a.tops[0].tilt).toBe(0);expect(Number.isFinite(a.tops[0].omega)).toBe(true);
    expect(()=>createBattle([{...profile,mass:0},profile],[launch,launch])).toThrow();expect(()=>stepBattle(a,.1)).toThrow();
  });
  it('preserves world angular momentum in torque-free motion and normalizes orientation',()=>{
    const t=battle().tops[0];setAngularVelocity(t,{x:40,y:1000,z:20});const initial={...t.angularMomentum},energy=kineticEnergy(t);
    for(let i=0;i<4000;i++)integrateFree(t,1/4000,false,false);
    expect(t.angularMomentum).toEqual(initial);expect(Math.abs(kineticEnergy(t)-energy)/energy).toBeLessThan(.001);expect(qnorm(t)).toBeCloseTo(1,13);
  });
  it('converges under dt, dt/2, dt/4 for torque-free orientation',()=>{
    const initial=battle().tops[0];setAngularVelocity(initial,{x:30,y:600,z:20});const states=[1000,2000,4000].map(rate=>{const t=structuredClone(initial);for(let n=0;n<rate;n++)integrateFree(t,1/rate,false,false);return bodyAxis(t);});
    const coarse=difference(states[0],states[1]),fine=difference(states[1],states[2]);expect(coarse).toBeLessThan(1e-9);expect(fine).toBeLessThan(1e-9);
  });
  it('gravity accelerates vertical COM instead of a synthetic planar spring',()=>{
    const t=battle().tops[0];t.y=1;t.vx=t.vy=t.vz=0;const oldL={...t.angularMomentum};integrateFree(t,.001,true,false);
    expect(t.vy).toBeCloseTo(-.00981,12);expect(t.vx).toBe(0);expect(t.vz).toBe(0);expect(t.angularMomentum).toEqual(oldL);
  });
  it('actual off-center tip contact transfers support torque into world angular momentum',()=>{
    const t=battle().tops[0];t.x=0;t.z=0;t.y=comHeight(t.profile)*Math.cos(t.tilt)-.001;t.vx=t.vz=0;t.vy=-.3;
    const before={...t.angularMomentum};expect(resolveFloor(t)).toBeGreaterThan(0);expect(difference(before,t.angularMomentum)).toBeGreaterThan(1e-7);expect(t.vy).toBeGreaterThan(-.3);
  });
  it('tilted spinning top precesses from support torque, not a prescribed scalar tilt target',()=>{
    const t=battle().tops[0];t.x=0;t.z=0;t.y=.018;t.vx=t.vy=t.vz=0;
    const before=bodyAxis(t);for(let i=0;i<3000;i++){integrateFree(t,1/3000);resolveFloor(t);}
    const after=bodyAxis(t);expect(difference(before,after)).toBeGreaterThan(.05);expect(Math.abs(after.z)).toBeGreaterThan(.02);expect(qnorm(t)).toBeCloseTo(1,12);
  });
  it('uses distinct flat patch and spherical tip contact behavior',()=>{
    const flat=battle().tops[0],ball=structuredClone(flat);flat.profile.tipShape='flat';ball.profile.tipShape='ball';flat.tipRadius=ball.tipRadius=.002;
    for(const t of [flat,ball]){t.x=0;t.z=0;t.y=.019;t.vx=t.vy=t.vz=0;for(let i=0;i<1000;i++){integrateFree(t,1/4000);resolveFloor(t);}}
    expect(Math.abs(flat.omega-ball.omega)).toBeGreaterThan(.1);expect(difference(bodyAxis(flat),bodyAxis(ball))).toBeGreaterThan(.001);
  });
});

describe('physical contact, stadium geometry and Xtreme gear coupling',()=>{
  it('shares actual lower/upper blade outlines and official-topology rear rail notch',()=>{
    const shape=getBladeOutline(profile),vertices=getBladeVertices(profile);expect(vertices).toHaveLength(shape.length*2);expect(vertices[0].y).toBeLessThan(vertices[shape.length].y);
    const rail=getRailPath(),back=rail.filter(p=>p.z<-.1);expect(Math.min(...back.map(p=>Math.hypot(p.x,p.z)))).toBeLessThan(STADIUM.railRadius-.03);
    expect(STADIUM.coverRadius-profile.radius).toBeGreaterThan(STADIUM.railRadius-profile.gearRadius);
    expect(STADIUM.pockets.filter(p=>p.finish==='over').every(p=>Math.sin(p.angle)>0)).toBe(true);
  });
  it('conserves linear momentum and dissipates kinetic energy in full 3D blade impacts',()=>{
    const a=battle(),[x,y]=a.tops;
    setOrientation(x,{x:0,y:0,z:0,w:1});setOrientation(y,{x:0,y:0,z:0,w:1});x.x=-.0248;y.x=.0248;x.z=y.z=0;x.y=y.y=.03;x.vx=1;y.vx=-1;x.vy=y.vy=x.vz=y.vz=0;
    setAngularVelocity(x,{x:0,y:200,z:0});setAngularVelocity(y,{x:0,y:-150,z:0});
    const before=kineticEnergy(x)+kineticEnergy(y),p=momentum(x,y);expect(resolveContact(x,y)).toBeGreaterThan(0);
    expect(difference(momentum(x,y),p)).toBeLessThan(1e-12);expect(kineticEnergy(x)+kineticEnergy(y)).toBeLessThanOrEqual(before+1e-10);expect(Math.abs(x.angularMomentum.z)).toBeGreaterThan(0);expect(x.lock).toBe(0);expect(y.lock).toBe(0);
  });
  it('beveled leading geometry generates vertical recoil without an upward-kick force',()=>{
    const shape={...profile,contactLobes:3,contactLobeDepth:.15,bladeRampAmplitude:.0015,bladeSkew:.25};
    const state=createBattle([shape,shape],[{...launch,tilt:0},{...launch,tilt:0}]),[a,b]=state.tops;
    setOrientation(a,{x:0,y:Math.sin(.2),z:0,w:Math.cos(.2)});setOrientation(b,{x:0,y:0,z:0,w:1});
    a.x=-.022;b.x=.022;a.y=b.y=.03;a.z=b.z=0;a.vx=1;b.vx=-1;a.vy=b.vy=a.vz=b.vz=0;
    setAngularVelocity(a,{x:0,y:400,z:0});setAngularVelocity(b,{x:0,y:400,z:0});
    const energy=kineticEnergy(a)+kineticEnergy(b),p=momentum(a,b);expect(resolveContact(a,b)).toBeGreaterThan(0);
    expect(Math.abs(a.vy)).toBeGreaterThan(.05);expect(a.vy*b.vy).toBeLessThan(0);expect(difference(momentum(a,b),p)).toBeLessThan(1e-12);expect(kineticEnergy(a)+kineticEnergy(b)).toBeLessThanOrEqual(energy+1e-10);
  });
  it('ratchet detent work is directional, energy-bounded and capped at release',()=>{
    const t=battle().tops[0],before=totalEnergy(t);expect(applyRatchetWork(t,-.001,.1)).toBe(0);expect(t.lock).toBe(0);
    const work=applyRatchetWork(t,.001,.0001);expect(work).toBeLessThanOrEqual(.0001);expect(totalEnergy(t)-before).toBeCloseTo(work,12);
    applyRatchetWork(t,.001,10);expect(t.lock).toBeCloseTo(t.profile.lockReleaseAngle??.24,12);
  });
  it('an exposed lower-ratchet hit can unlock one body without generic damage to both blades',()=>{
    const state=createBattle([profile,profile],[{...launch,tilt:0},{...launch,tilt:0}]),[a,b]=state.tops;
    setOrientation(a,{x:0,y:0,z:0,w:1});setOrientation(b,{x:0,y:0,z:0,w:1});a.x=-.018;b.x=.018;a.y=.04;b.y=.027;a.z=b.z=0;a.vx=1;b.vx=-1;a.vy=b.vy=a.vz=b.vz=0;
    setAngularVelocity(a,{x:0,y:400,z:0});setAngularVelocity(b,{x:0,y:400,z:0});const before=totalEnergy(a)+totalEnergy(b);
    expect(resolveContact(a,b)).toBeGreaterThan(0);expect(a.lock).toBeGreaterThan(0);expect(b.lock).toBe(0);expect(totalEnergy(a)+totalEnergy(b)).toBeLessThanOrEqual(before+.00001);
  });
  it('gear impulse converts spin to translation with no total-energy creation, using full 3D inertia',()=>{
    const t=battle().tops[0];t.vx=t.vy=t.vz=0;const energy=totalEnergy(t),spin=t.omega;engageRail(t,1,0);
    expect(Math.hypot(t.vx,t.vz)).toBeGreaterThan(.5);expect(t.omega).toBeLessThan(spin);expect(totalEnergy(t)).toBeLessThan(energy);expect(Math.abs(t.angularMomentum.x)+Math.abs(t.angularMomentum.z)).toBeGreaterThan(0);
  });
  it('bit pitch radius, not blade radius, determines rail torque',()=>{
    const a=battle().tops[0],b=structuredClone(a);b.profile.radius=.04;engageRail(a,1,0);engageRail(b,1,0);expect(a.angularMomentum).toEqual(b.angularMomentum);expect(a.vz).toBe(b.vz);
  });
  it('rail eligibility requires signed interior geometry, actual gear height and adequate tilt',()=>{
    const t=battle().tops[0];setOrientation(t,{x:0,y:0,z:0,w:1});t.x=STADIUM.railRadius-profile.gearRadius;t.z=0;t.y=bowlHeightAt(STADIUM.railRadius,0)+.007-profile.gearHeight+t.centerOfMassHeight;
    expect(railEligible(t)).toBe(true);t.x=STADIUM.railRadius+.01;expect(railEligible(t)).toBe(false);t.x=STADIUM.railRadius-profile.gearRadius;t.y+=.03;expect(railEligible(t)).toBe(false);
    t.y-=.03;t.profile.railEligible=false;expect(railEligible(t)).toBe(false);
  });
  it('public default launches reach gearing, inward release and later actual opponent contact',()=>{
    const p=profileFor(defaultBuild),cpu=profileFor(buildForBlade(parts.find(p=>p.category==='blade'&&p.release==='released'&&p.id!==defaultBuild.blade)!.id)),state=createBattle([p,cpu],[{power:.8,angle:0,tilt:8*Math.PI/180},{power:.76,angle:-.12,tilt:.11}]),events=new Map<string,(typeof state.events)[number]>();let maxRadius=0;
    for(let n=0;n<240*15&&!state.result;n++){stepBattle(state);for(const t of state.tops)maxRadius=Math.max(maxRadius,Math.hypot(t.x,t.z));for(const e of state.events)events.set(`${e.tick}:${e.kind}:${e.top}`,e);}
    const all=[...events.values()],mesh=all.find(e=>e.kind==='rail-engage'&&Math.hypot(e.velocityAfter!.x,e.velocityAfter!.z)>Math.hypot(e.velocityBefore!.x,e.velocityBefore!.z)+.1&&Math.abs(e.spinAfter!)<Math.abs(e.spinBefore!));
    expect(maxRadius).toBeGreaterThan(.18);expect(mesh).toBeDefined();expect(mesh!.energyAfter).toBeLessThanOrEqual(mesh!.energyBefore!+1e-10);
    const dash=all.find(e=>e.kind==='dash'&&e.tick>mesh!.tick);expect(dash).toBeDefined();expect(all.some(e=>e.kind==='collision'&&e.tick>dash!.tick)).toBe(true);
    expect(state.result).not.toBe(null);
  },20000);
});

describe('finish arbitration and replay bounds',()=>{
  it('does not use positive low RPM or tilt alone to award Spin Finish',()=>{
    const state=battle(),t=state.tops[0];setAngularVelocity(t,{x:0,y:4,z:0});t.y=.1;t.vy=0;stepBattle(state);expect(t.eliminated).toBe(null);
  });
  it('latches actual loss of original-direction rotation',()=>{
    const state=battle();setAngularVelocity(state.tops[0],{x:0,y:0,z:0});stepBattle(state);expect(state.tops[0].eliminated).toBe('spin');
  });
  it('simultaneous burst produces a draw, not largest-score selection',()=>{
    const a=battle();for(const t of a.tops)t.lock=1;stepBattle(a);expect(a.result).toEqual({winner:null,finish:'draw',points:0});
  });
  it('retains earlier provisional pocket occurrence ahead of later finish',()=>{
    const a=battle(),x=a.tops[0] as PhysicsTop;x.pendingFinish='over';x.pocketEnteredTick=1;x.lock=1;a.tick=5;stepBattle(a);expect(a.result).toEqual({winner:1,finish:'over',points:2});
  });
  it('whole-body still-spinning return cancels pocket candidate',()=>{
    const a=battle(),t=a.tops[0] as PhysicsTop;t.pendingFinish='over';t.pocketEnteredTick=1;t.x=0;t.z=.1;t.vx=t.vz=0;stepBattle(a);expect(t.pendingFinish).toBeUndefined();expect(t.eliminated).toBeNull();
  });
  it.each([-50,50])('does not teleport a normal %s degree launch at pocket sidewalls or lip height',angle=>{
    const p=profileFor(defaultBuild),cpu=profileFor(buildForBlade(parts.find(p=>p.category==='blade'&&p.release==='released'&&p.id!==defaultBuild.blade)!.id));
    const state=createBattle([p,cpu],[{power:.5,angle:angle*Math.PI/180,tilt:30*Math.PI/180},{power:.76,angle:-.12,tilt:.11}]);
    let energy=state.tops.reduce((sum,t)=>sum+totalEnergy(t),0);
    for(let i=0;i<240*15&&!state.result;i++){
      const before=state.tops.map(t=>({x:t.x,y:t.y,z:t.z,speed:Math.hypot(t.vx,t.vy,t.vz)}));stepBattle(state);
      state.tops.forEach((t,n)=>{const moved=Math.hypot(t.x-before[n].x,t.y-before[n].y,t.z-before[n].z),speed=Math.max(before[n].speed,Math.hypot(t.vx,t.vy,t.vz));expect(moved).toBeLessThan(speed*STEP+.005);});
      const next=state.tops.reduce((sum,t)=>sum+totalEnergy(t),0);expect(next).toBeLessThanOrEqual(energy+1e-5);energy=next;
    }
    expect(state.result).not.toBe(null);
  },20000);
  it('pocket drop and reverse climb follow a continuous surface with its actual slope normal',()=>{
    const z=STADIUM.pocketEntryRadius+STADIUM.pocketRampLength/2,e=.000001;
    const gradient=(bowlHeightAt(0,z+e)-bowlHeightAt(0,z-e))/(2*e),normal=bowlNormalAt(0,z);
    expect(-normal.z/normal.y).toBeCloseTo(gradient,5);
    for(const direction of [1,-1]){
      const t=createBattle([profile,profile],[{...launch,tilt:0},{...launch,tilt:0}]).tops[0];t.profile.tipShape='ball';t.x=0;t.z=direction===1?.225:.247;t.y=bowlHeightAt(t.x,t.z)+t.centerOfMassHeight;t.vx=t.vy=0;t.vz=direction;
      const startY=t.y,energy=totalEnergy(t);let peak=energy;
      for(let n=0;n<100;n++){integrateFree(t,1/2000);resolveFloor(t);peak=Math.max(peak,totalEnergy(t));}
      expect((t.y-startY)*direction).toBeLessThan(0);expect(peak).toBeLessThanOrEqual(energy+.00001);
    }
  });
  it('contacts the finite launch-hole rim without a vertical pose snap',()=>{
    const state=battle(),t=state.tops[0],envelope=t.profile.radius*(1+t.profile.contactLobeDepth);
    t.x=STADIUM.launchOpeningRadius-envelope-.0002;t.z=0;t.y=STADIUM.coverRoofHeight-.005;t.vx=.5;t.vy=t.vz=0;
    const before={x:t.x,y:t.y,z:t.z};stepBattle(state);
    expect(Math.abs(t.y-before.y)).toBeLessThan(.003);expect(Math.hypot(t.x-before.x,t.y-before.y,t.z-before.z)).toBeLessThan(.005);
  });
  it('different launches and opposite spin stay finite without noncontact burst',()=>{
    for(let i=0;i<6;i++){
      const enemy={...profile,spin:(i%2?1:-1) as 1|-1},state=createBattle([profile,enemy],[{power:.3+i*.1,angle:(i-2)*.25,tilt:i*.06},launch]);run(state,8);
      for(const t of state.tops){for(const key of ['x','y','z','vx','vy','vz','omega','tilt']as const)expect(Number.isFinite(t[key])).toBe(true);expect(qnorm(t)).toBeCloseTo(1,11);expect(t.y).toBeLessThan(.17);}
      if(state.events.some(e=>e.finish==='burst'))expect(state.events.some(e=>e.kind==='collision')).toBe(true);
    }
  },20000);
});
