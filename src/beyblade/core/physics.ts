import type { Battle, BattleResult, Finish, Launch, Profile, Top } from './types';
import { points } from './rules';

export const STEP = 1 / 240;
/** Original simplified stadium, not a manufacturer CAD model. SI units. */
export const STADIUM = {
  radius: .22,
  bowlStiffness: 18,
  railRadius: .201,
  railHeightMin: .003,
  railHeightMax: .012,
  railMaxTilt: .55,
  pocketOuterRadius: .325,
  pockets: [
    { angle: 0, halfWidth: .245, finish: 'xtreme' as const },
    { angle: 2 * Math.PI / 3, halfWidth: .235, finish: 'over' as const },
    { angle: -2 * Math.PI / 3, halfWidth: .235, finish: 'over' as const },
  ],
};
export interface PhysicsTop extends Top {
  pendingFinish?: 'over' | 'xtreme';
  pocketEnteredTick?: number;
  pocketRestTime?: number;
  stoppedTime?: number;
  rotationStopped?: boolean;
  finishTick?: number;
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a-b), Math.cos(a-b));
const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback;

export function createBattle(profiles: [Profile, Profile], launches: [Launch, Launch]): Battle {
  const tops = profiles.map((profile, i): PhysicsTop => {
    if (![profile.mass, profile.radius, profile.inertia, profile.burstThreshold].every(n=>Number.isFinite(n) && n>0)
      || ![profile.grip,profile.drag,profile.restitution,profile.height,profile.railGrip,profile.gearRadius,profile.gearHeight,profile.contactLobes,profile.contactLobeDepth].every(Number.isFinite)
      || profile.radius>=STADIUM.radius/2 || profile.gearRadius<=0 || profile.gearRadius>=profile.radius
      || profile.gearHeight<0 || profile.contactLobes<1 || profile.contactLobeDepth<0 || profile.contactLobeDepth>.1
      || typeof profile.railEligible!=='boolean' || (profile.spin!==1 && profile.spin!==-1)) throw new Error('Invalid physical profile');
    const launch = launches[i];
    const power = clamp(finite(launch.power, .75), .05, 1);
    const angle = clamp(finite(launch.angle, 0), -Math.PI, Math.PI);
    const tilt = clamp(finite(launch.tilt, .12), 0, .65);
    const side = i === 0 ? -1 : 1;
    const direction = angle + (i === 0 ? 0 : Math.PI);
    return {
      profile: { ...profile }, x: side*.085, z: side*.045,
      vx: Math.cos(direction)*(.12+power*.68), vz: Math.sin(direction)*(.12+power*.68),
      omega: profile.spin*(170+power*440), phase: i*Math.PI,
      tilt, tiltVelocity: 0, lock: 0, railCooldown: 0, eliminated: null,
      stoppedTime: 0,
    };
  }) as [PhysicsTop, PhysicsTop];
  return { tick:0, tops, events:[], result:null };
}

export function kineticEnergy(top: Top): number {
  return .5*top.profile.mass*(top.vx*top.vx+top.vz*top.vz)+.5*top.profile.inertia*top.omega*top.omega;
}
export function totalEnergy(top: Top): number {
  return kineticEnergy(top)+.5*top.profile.mass*STADIUM.bowlStiffness*Math.min(top.x*top.x+top.z*top.z, STADIUM.radius*STADIUM.radius);
}

/** Coupled friction impulse: stationary rail cannot create mechanical energy. */
export function engageRail(top: Top, nx: number, nz: number): number {
  const p=top.profile, tx=-nz, tz=nx;
  const pitch=p.gearRadius;
  const slip=top.vx*tx+top.vz*tz+top.omega*pitch;
  const impulse=-slip/(1/p.mass+pitch*pitch/p.inertia)*clamp(p.railGrip,0,1);
  top.vx+=impulse*tx/p.mass; top.vz+=impulse*tz/p.mass;
  top.omega+=impulse*pitch/p.inertia;
  return Math.abs(impulse);
}

/** Small, estimated radial outline variation, not manufacturer blade geometry. */
export function contactRadius(top: Top, contactAngle: number): number {
  return top.profile.radius*(1+top.profile.contactLobeDepth*Math.cos(top.profile.contactLobes*(top.phase-contactAngle)));
}
export function railEligible(top: Top): boolean {
  const p=top.profile;
  const height=p.gearHeight*Math.cos(top.tilt);
  return p.railEligible && top.tilt<=STADIUM.railMaxTilt
    && height>=STADIUM.railHeightMin && height<=STADIUM.railHeightMax
    && Math.hypot(top.x,top.z)+p.gearRadius>=STADIUM.railRadius
    && top.railCooldown===0 && Math.abs(top.omega)>45;
}

/** Approximate rounded-outline contact with spin torque and Coulomb friction. */
export function resolveContact(a: Top, b: Top): number {
  let dx=b.x-a.x, dz=b.z-a.z;
  const azimuth=Math.atan2(dz,dx);
  const ra=contactRadius(a,azimuth),rb=contactRadius(b,azimuth+Math.PI);
  const minimum=ra+rb;
  let distance=Math.hypot(dx,dz);
  if (distance>=minimum) return 0;
  if(distance<1e-9) { dx=1; dz=0; distance=0; }
  const nx=distance ? dx/distance : 1, nz=distance ? dz/distance : 0;
  const invA=1/a.profile.mass, invB=1/b.profile.mass, inv=invA+invB;
  // Position correction is mass-weighted and not an energy-producing velocity impulse.
  const penetration=minimum-distance;
  a.x-=nx*penetration*invA/inv; a.z-=nz*penetration*invA/inv;
  b.x+=nx*penetration*invB/inv; b.z+=nz*penetration*invB/inv;
  const relative=(b.vx-a.vx)*nx+(b.vz-a.vz)*nz;
  if(relative>=0) return 0;
  const restitution=clamp(Math.min(a.profile.restitution,b.profile.restitution),0,1);
  const j=-(1+restitution)*relative/inv;
  a.vx-=j*nx*invA; a.vz-=j*nz*invA;
  b.vx+=j*nx*invB; b.vz+=j*nz*invB;
  const tx=-nz,tz=nx;
  const slip=(b.vx-a.vx)*tx+(b.vz-a.vz)*tz-b.omega*rb-a.omega*ra;
  const jt=clamp(-slip/(inv+ra*ra/a.profile.inertia+rb*rb/b.profile.inertia),-.28*j,.28*j);
  a.vx-=jt*tx*invA; a.vz-=jt*tz*invA;
  b.vx+=jt*tx*invB; b.vz+=jt*tz*invB;
  a.omega-=jt*ra/a.profile.inertia; b.omega-=jt*rb/b.profile.inertia;
  // Ratchet exposure depends on contact azimuth in the spinning body frame.
  // This type-dependent lobe surrogate is uncalibrated, but distinguishes contact orientation
  // and release-direction torque instead of assigning both tops identical damage.
  const exposureA=.15+.85*(.5+.5*Math.cos(a.profile.contactLobes*(a.phase-azimuth)));
  const exposureB=.15+.85*(.5+.5*Math.cos(b.profile.contactLobes*(b.phase-azimuth-Math.PI)));
  a.lock+=j*.035+Math.max(0,jt*a.profile.spin)*exposureA;
  b.lock+=j*.035+Math.max(0,jt*b.profile.spin)*exposureB;
  // Collision tilting is a coarse uncalibrated wobble mode, not a 6DOF solver.
  a.tiltVelocity+=j/(a.profile.mass)*.7;
  b.tiltVelocity+=j/(b.profile.mass)*.7;
  return j;
}

function eliminated(top: PhysicsTop, finish: Finish, tick: number) {
  if(top.eliminated) return;
  // Once a later burst/spin prevents a return, an earlier whole-body pocket entry wins.
  top.eliminated=top.pendingFinish ?? finish; top.finishTick=top.pocketEnteredTick ?? tick;
}

function integrate(top: PhysicsTop, dt: number) {
  const p=top.profile, radius=Math.hypot(top.x,top.z);
  if(top.omega*p.spin<=0) top.rotationStopped=true;
  top.railCooldown=Math.max(0,top.railCooldown-dt);
  top.lock=Math.max(0,top.lock-dt*.0025);
  if(radius<STADIUM.radius) {
    // Velocity Verlet gives a bounded conservative bowl integration before losses.
    top.vx-=STADIUM.bowlStiffness*top.x*dt/2;
    top.vz-=STADIUM.bowlStiffness*top.z*dt/2;
  }
  const friction=Math.exp(-(radius>STADIUM.radius ? 12 : .35+p.grip*.8)*dt);
  top.vx*=friction; top.vz*=friction;
  const absSpin=Math.abs(top.omega);
  const loss=(Math.max(0,p.drag)*absSpin+Math.sqrt(absSpin)+2.5+12*top.tilt)*dt;
  top.omega=Math.sign(top.omega)*Math.max(0,absSpin-loss);
  if(top.omega*p.spin<=0) top.rotationStopped=true;
  const gyroStability=Math.abs(top.omega)/150;
  const tiltTarget=clamp(.015+.018/(gyroStability*gyroStability+.025),0,1.6);
  top.tiltVelocity+=(8*(tiltTarget-top.tilt)-5*top.tiltVelocity)*dt;
  top.tilt=clamp(top.tilt+top.tiltVelocity*dt,0,Math.PI/2);
  // An inclined tip converts rotational energy to orbital motion through friction.
  if(radius>1e-6 && radius<STADIUM.radius-p.radius) {
    const tx=-top.z/radius,tz=top.x/radius,lever=.0025*top.tilt;
    const slip=top.vx*tx+top.vz*tz-top.omega*lever;
    const impulse=-slip/(1/p.mass+lever*lever/p.inertia)*clamp(p.grip*dt*12,0,1);
    top.vx+=impulse*tx/p.mass; top.vz+=impulse*tz/p.mass;
    top.omega-=impulse*lever/p.inertia;
  }
  top.x+=top.vx*dt; top.z+=top.vz*dt;
  if(Math.hypot(top.x,top.z)<STADIUM.radius) {
    top.vx-=STADIUM.bowlStiffness*top.x*dt/2;
    top.vz-=STADIUM.bowlStiffness*top.z*dt/2;
  }
  top.phase=(top.phase+top.omega*dt)%(Math.PI*2);
}

function stadium(top: PhysicsTop, battle: Battle, index: number, dt: number, eventTick: number) {
  const radius=Math.hypot(top.x,top.z),p=top.profile;
  const envelope=p.radius*(1+p.contactLobeDepth);
  if(radius<1e-9) return;
  const nx=top.x/radius,nz=top.z/radius,angle=Math.atan2(top.z,top.x);
  const pocket=STADIUM.pockets.find(slot=>Math.abs(angleDifference(angle,slot.angle))+Math.asin(Math.min(1,envelope/radius))<slot.halfWidth);
  if(top.pendingFinish && radius+envelope<STADIUM.radius) {
    // Reverse-finish cancellation: the whole still-spinning body has returned.
    delete top.pendingFinish; delete top.pocketEnteredTick; top.pocketRestTime=0;
  }
  if(pocket && radius-envelope>STADIUM.radius && !top.pendingFinish) {
    top.pendingFinish=pocket.finish; top.pocketEnteredTick=eventTick; top.pocketRestTime=0;
  }
  if(top.pendingFinish) {
    // A pocket remains provisional until the top settles, allowing physical re-entry.
    top.pocketRestTime=(top.pocketRestTime??0)+ (Math.hypot(top.vx,top.vz)<.055 ? dt : 0);
    if((top.pocketRestTime??0)>.12 || Math.abs(top.omega)<1) eliminated(top,top.pendingFinish,top.pocketEnteredTick??eventTick);
  }
  const boundary=pocket ? STADIUM.pocketOuterRadius-envelope : STADIUM.radius-contactRadius(top,angle);
  if(radius>boundary) {
    top.x=nx*boundary; top.z=nz*boundary;
    const outward=top.vx*nx+top.vz*nz;
    if(outward>0) { top.vx-=nx*outward*1.45; top.vz-=nz*outward*1.45; }
  }
  if(!pocket && railEligible(top)) {
      const j=engageRail(top,nx,nz);
      top.railCooldown=.22;
      battle.events.push({tick:eventTick,kind:'rail',top:index,intensity:j});
  }
}

function resultFor(battle: Battle): BattleResult | null {
  const tops=battle.tops as [PhysicsTop,PhysicsTop];
  if(!tops[0].eliminated && !tops[1].eliminated) return null;
  const candidates=tops.map((top,i)=>({top,i})).filter(({top})=>top.eliminated);
  if(!candidates.length) return null;
  const earliest=Math.min(...candidates.map(({top})=>top.finishTick??battle.tick));
  // An earlier pocket entry must first settle or cancel; do not award a later finish.
  if(tops.some(top=>!top.eliminated && top.pendingFinish && (top.pocketEnteredTick??Infinity)<=earliest)) return null;
  const first=candidates.filter(({top})=>(top.finishTick??battle.tick)===earliest);
  if(first.length===2) return {winner:null,finish:'draw',points:0};
  const loser=first[0],finish=loser.top.eliminated!;
  return {winner:loser.i===0?1:0,finish,points:points[finish]};
}

/** Mutates a serializable battle. Use fixed STEP on every authority/client replay. */
export function stepBattle(battle: Battle, dt=STEP): Battle {
  if(!Number.isFinite(dt) || dt<=0 || dt>STEP+1e-10) throw new Error('Use positive fixed physics steps <= STEP');
  if(battle.result) return battle;
  battle.tick++;
  // Four deterministic contact substeps reduce fast rail-contact tunneling and timing ties.
  for(let substep=0;substep<4 && !battle.result;substep++) {
    simulateSubstep(battle,dt/4,battle.tick-1+(substep+1)/4);
  }
  // Bounded replay event ring; state carries all simulation data, no hidden RNG/cache.
  if(battle.events.length>96) battle.events.splice(0,battle.events.length-96);
  return battle;
}

function simulateSubstep(battle: Battle, dt: number, eventTick: number) {
  const tops=battle.tops as [PhysicsTop,PhysicsTop];
  for(const top of tops) if(!top.eliminated) integrate(top,dt);
  if(!tops[0].eliminated && !tops[1].eliminated) {
    const j=resolveContact(tops[0],tops[1]);
    if(j>0) battle.events.push({tick:eventTick,kind:'collision',intensity:j});
  }
  for(let i=0;i<2;i++) {
    const top=tops[i]; if(top.eliminated) continue;
    if(top.lock>=top.profile.burstThreshold) eliminated(top,'burst',eventTick);
    if(!top.eliminated) stadium(top,battle,i,dt,eventTick);
    if(!top.eliminated) {
      // Official Spin Finish is loss of the original rotation, not a low-RPM or tilt threshold.
      // Remember a stop within this substep even if a subsequent contact could restart motion.
      if(top.rotationStopped || top.omega*top.profile.spin<=0) eliminated(top,top.pendingFinish??'spin',top.pocketEnteredTick??eventTick);
    }
    if(top.eliminated) battle.events.push({tick:eventTick,kind:'finish',top:i,finish:top.eliminated});
  }
  battle.result=resultFor(battle);
}
