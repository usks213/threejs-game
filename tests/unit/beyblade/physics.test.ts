import { describe, expect, it } from 'vitest';
import { createBattle, engageRail, kineticEnergy, railEligible, resolveContact, STEP, stepBattle, STADIUM, totalEnergy } from '../../../src/beyblade/core/physics';
import type { PhysicsTop } from '../../../src/beyblade/core/physics';
import type { Profile } from '../../../src/beyblade/core/types';
const profile: Profile={name:'test',type:'balance',spin:1,mass:.035,radius:.024,inertia:.55*.035*.024**2,grip:.25,drag:.05,restitution:.6,burstThreshold:.028,height:.027,railGrip:.65,gearRadius:.006,gearHeight:.007,railEligible:true,contactLobes:3,contactLobeDepth:0,color:0};
const launch={power:.8,angle:.2,tilt:.1};
const battle=()=>createBattle([profile,profile],[launch,{...launch,angle:-.2,power:.78}]);
describe('deterministic spin/contact physics',()=>{
  it('does not call slow positive rotation or tilt alone a Spin Finish',()=>{
    for(const [omega,tilt] of [[4,.02],[1000,1.55]]){
      const state=battle();const top=state.tops[0];top.x=-.15;top.z=0;top.vx=top.vz=0;top.omega=omega;top.tilt=tilt;state.tops[1].x=.15;state.tops[1].z=0;state.tops[1].vx=state.tops[1].vz=0;
      for(let n=0;n<24;n++)stepBattle(state);
      expect(top.omega).toBeGreaterThan(0);expect(top.eliminated).toBeNull();
    }
  });
  it('latches an actual original-direction stop even if contact could restart rotation',()=>{
    const state=battle();state.tops[0].omega=0;state.tops[0].vx=.5;state.tops[0].x=-.15;state.tops[1].x=.15;
    stepBattle(state);expect(state.tops[0].eliminated).toBe('spin');expect(state.result?.winner).toBe(1);
  });
  it('replays byte-identically with serializable state',()=>{
    const a=battle(),b=JSON.parse(JSON.stringify(a));
    for(let i=0;i<3000;i++){stepBattle(a);stepBattle(b);}
    expect(a).toEqual(b);
  });
  it('launch validation clamps nonfinite user input and rejects invalid constants',()=>{
    const a=createBattle([profile,profile],[{power:NaN,angle:Infinity,tilt:-9},launch]);
    expect(Number.isFinite(a.tops[0].omega)).toBe(true);
    expect(a.tops[0].tilt).toBe(0);
    expect(()=>createBattle([{...profile,mass:0},profile],[launch,launch])).toThrow();
    expect(()=>stepBattle(a,1)).toThrow();
  });
  it('dissipates energy for a free isolated top',()=>{
    const a=battle();a.tops[1].eliminated='spin';
    const t=a.tops[0];t.x=.04;t.z=0;t.vx=0;t.vz=.1;t.omega=300;
    const before=totalEnergy(t);stepBattle(a);
    expect(totalEnergy(t)).toBeLessThan(before);
  });
  it('preserves linear momentum in contact and does not create kinetic energy',()=>{
    const a=battle(),[x,y]=a.tops;
    x.x=-.02;x.z=0;x.vx=1;x.vz=.2;x.omega=200;
    y.x=.02;y.z=0;y.vx=-.5;y.vz=-.1;y.omega=-170;
    const before=kineticEnergy(x)+kineticEnergy(y),px=profile.mass*(x.vx+y.vx),pz=profile.mass*(x.vz+y.vz);
    expect(resolveContact(x,y)).toBeGreaterThan(0);
    expect(profile.mass*(x.vx+y.vx)).toBeCloseTo(px,12);
    expect(profile.mass*(x.vz+y.vz)).toBeCloseTo(pz,12);
    expect(kineticEnergy(x)+kineticEnergy(y)).toBeLessThanOrEqual(before+1e-12);
    expect(Math.hypot(x.x-y.x,x.z-y.z)).toBeCloseTo(.048,12);
  });
  it('rail converts spin into translation while dissipating total kinetic energy',()=>{
    const t=battle().tops[0];t.vx=0;t.vz=0;t.omega=400;
    const before=kineticEnergy(t);engageRail(t,1,0);
    expect(Math.abs(t.vz)).toBeGreaterThan(0);
    expect(Math.abs(t.omega)).toBeLessThan(400);
    expect(kineticEnergy(t)).toBeLessThan(before);
  });
  it('engages only when the bit gear reaches the rail in its height and tilt band',()=>{
    const t=battle().tops[0];t.x=.196;t.z=0;t.tilt=.1;t.railCooldown=0;t.omega=300;
    expect(railEligible(t)).toBe(true);
    t.x=.1;expect(railEligible(t)).toBe(false);t.x=.196;
    t.profile.railEligible=false;expect(railEligible(t)).toBe(false);t.profile.railEligible=true;
    t.profile.gearHeight=.03;expect(railEligible(t)).toBe(false);t.profile.gearHeight=.007;
    t.tilt=.8;expect(railEligible(t)).toBe(false);t.tilt=.1;
    t.omega=10;expect(railEligible(t)).toBe(false);
  });
  it('uses bit pitch radius, not blade radius, for rail torque',()=>{
    const a=battle().tops[0],b=structuredClone(a);a.vx=b.vx=0;a.vz=b.vz=0;
    b.profile.radius=.04;
    engageRail(a,1,0);engageRail(b,1,0);
    expect(a.vz).toBe(b.vz);expect(a.omega).toBe(b.omega);
  });
  it('only resolves whole-body pocket admission, and cancels a returning top',()=>{
    const a=battle(),t=a.tops[0] as PhysicsTop;
    t.x=STADIUM.radius;t.z=0;t.vx=0;t.vz=0;
    stepBattle(a);expect(t.pendingFinish).toBeUndefined();
    t.x=.26;t.z=0;t.vx=-.1;t.vz=0;stepBattle(a);expect(t.pendingFinish).toBe('xtreme');
    t.x=.18;t.z=0;t.vx=0;t.vz=0;stepBattle(a);expect(t.pendingFinish).toBeUndefined();
    expect(t.eliminated).toBe(null);
  });
  it('classifies side pockets as over and front pocket as xtreme',()=>{
    for(const pocket of STADIUM.pockets){
      const a=battle(),t=a.tops[0];t.x=.27*Math.cos(pocket.angle);t.z=.27*Math.sin(pocket.angle);t.vx=0;t.vz=0;
      for(let i=0;i<40;i++)stepBattle(a);
      expect(a.result?.finish).toBe(pocket.finish);expect(a.result?.winner).toBe(1);
    }
  });
  it('awards simultaneous burst as a draw instead of highest-score preference',()=>{
    const a=battle();for(const t of a.tops)t.lock=1;stepBattle(a);
    expect(a.result).toEqual({winner:null,finish:'draw',points:0});
  });
  it('uses first finish when later finish has higher points',()=>{
    const a=battle(),[x,y]=a.tops as [PhysicsTop,PhysicsTop];
    x.eliminated='spin';x.finishTick=1;y.lock=1;a.tick=2;stepBattle(a);
    expect(a.result).toEqual({winner:1,finish:'spin',points:1});
  });
  it('holds an earlier provisional pocket result ahead of a later spin finish',()=>{
    const a=battle(),[x,y]=a.tops as [PhysicsTop,PhysicsTop];
    x.x=.27;x.z=0;x.vx=0;x.vz=0;x.pendingFinish='xtreme';x.pocketEnteredTick=1;
    y.eliminated='spin';y.finishTick=2;a.tick=2;
    stepBattle(a);expect(a.result).toBe(null);
    for(let i=0;i<40;i++)stepBattle(a);
    expect(a.result).toEqual({winner:1,finish:'xtreme',points:3});
  });
  it('retains first pocket timestamp if a later burst prevents return',()=>{
    const a=battle(),x=a.tops[0] as PhysicsTop;
    x.pendingFinish='over';x.pocketEnteredTick=1;x.lock=1;a.tick=5;stepBattle(a);
    expect(a.result).toEqual({winner:1,finish:'over',points:2});
  });
  it('keeps diverse launches, opposite spins and low-power cases finite and terminating',()=>{
    for(let i=0;i<48;i++){
      const enemy={...profile,spin:(i%2===0?-1:1) as 1|-1,drag:.025+(i%6)*.01,grip:.1+(i%7)*.05,burstThreshold:.018+(i%5)*.01};
      const a=createBattle([profile,enemy],[{power:.05+(i%10)/11,angle:-Math.PI+i/47*Math.PI*2,tilt:(i%7)*.08},{power:.2+(i%9)/12,angle:i/48*Math.PI,tilt:(i%3)*.15}]);
      for(let n=0;n<240*90&&!a.result;n++)stepBattle(a);
      expect(a.result).not.toBe(null);
      for(const t of a.tops){
        for(const key of ['x','z','vx','vz','omega','tilt'] as const)expect(Number.isFinite(t[key])).toBe(true);
        expect(Math.hypot(t.x,t.z)).toBeLessThanOrEqual(STADIUM.pocketOuterRadius+.001);
      }
    }
  });
  it('identical builds with unequal launches do not degenerate into perpetual simultaneous bursts',()=>{
    let decisive=0;
    for(let i=0;i<30;i++){
      const a=createBattle([profile,profile],[{power:.2,angle:-1.5+i*.1,tilt:.1},{power:1,angle:1.5-i*.1,tilt:.1}]);
      for(let n=0;n<240*90&&!a.result;n++)stepBattle(a);
      expect(a.result).not.toBe(null);if(a.result?.winner!==null)decisive++;
    }
    expect(decisive).toBeGreaterThan(20);
  });
  it('treats reversal of original spin as stopped, not renewed stamina',()=>{
    const a=battle();a.tops[0].omega=-20;
    for(let n=0;n<30;n++)stepBattle(a);
    expect(a.result).toEqual({winner:1,finish:'spin',points:1});
  });
  it('mirroring the two launches mirrors the result without player-index advantage',()=>{
    const weak={power:.2,angle:-.7,tilt:.1},strong={power:1,angle:.3,tilt:.1};
    const a=createBattle([profile,profile],[weak,strong]),b=createBattle([profile,profile],[strong,weak]);
    for(let n=0;n<240*90&&(!a.result||!b.result);n++){stepBattle(a);stepBattle(b);}
    expect(a.result?.finish).toBe(b.result?.finish);
    if(a.result?.winner!==null)expect(b.result?.winner).toBe(a.result!.winner===0?1:0);
    expect(a.tick).toBe(b.tick);
  });
  it('eventually produces a finite contact-driven match result without dice',()=>{
    const a=battle();for(let i=0;i<240*80&&!a.result;i++)stepBattle(a);
    expect(a.result).not.toBe(null);
    for(const top of a.tops)for(const key of ['x','z','vx','vz','omega','tilt'] as const)expect(Number.isFinite(top[key])).toBe(true);
    expect(a.tick*STEP).toBeLessThan(80);
  });
});
