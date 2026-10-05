import type {MeleeArchetype} from './equipment';
import { direction,type Vec3 } from './voxel';
export type AttackKind='slash'|'return'|'overhead';
export type AttackPhase='idle'|'windup'|'strike'|'recover'|'dodge'|'stagger'|'dead'|'heal';
export const attacks={
 slash:{windup:.38,strike:.29,recover:.48,damage:32,cost:20,reach:1.05},
 return:{windup:.32,strike:.31,recover:.5,damage:30,cost:19,reach:1.05},
 overhead:{windup:.7,strike:.34,recover:.78,damage:55,cost:32,reach:1.05},
} as const;
export interface MeleeDefinition {windup:number;strike:number;recover:number;damage:number;cost:number;reach:number;stagger:number;impulse:number}
/** Weapon timing and reach are used by the same runtime and rendered sweep. */
export function meleeDefinition(kind:AttackKind,archetype:MeleeArchetype='sword'):MeleeDefinition {
 const heavy=kind==='overhead';
 if(archetype==='greatsword')return {windup:heavy?.88:.56,strike:heavy?.4:.38,recover:heavy?.96:.7,damage:heavy?78:48,cost:heavy?44:30,reach:1.5,stagger:heavy?1.2:.45,impulse:heavy?3.2:1.6};
 if(archetype==='dagger')return {windup:heavy?.34:.16,strike:heavy?.19:.14,recover:heavy?.34:.2,damage:heavy?34:20,cost:heavy?18:10,reach:.58,stagger:heavy?.3:0,impulse:heavy?.8:.3};
 return {...attacks[kind],stagger:heavy?.95:0,impulse:heavy?2.4:.8};
}
export interface WeaponPose {grip:Vec3;tip:Vec3;twist:number;lean:number;step:number;drink?:number}
interface Key {t:number;grip:Vec3;vector:Vec3;twist:number;lean:number;step:number}
const v=(x:number,y:number,z:number):Vec3=>({x,y,z});
const guard={grip:v(.34,1.16,-.5),vector:v(.07,.97,-.3),twist:0,lean:0,step:0};
const slash:Omit<Key,'t'>[]=[guard,
 {grip:v(.5,1.3,-.5),vector:v(.6,.72,.22),twist:-.42,lean:.035,step:-.06},
 {grip:v(.12,1.16,-.55),vector:v(.02,.15,-1),twist:.05,lean:-.09,step:.21},
 {grip:v(-.32,.88,-.22),vector:v(-.88,-.32,-.35),twist:.48,lean:-.04,step:.12},
 {grip:v(-.12,.94,-.26),vector:v(-.45,.28,-.85),twist:.22,lean:0,step:.05},guard];
const overhead:Omit<Key,'t'>[]=[guard,
 {grip:v(.15,1.75,-.35),vector:v(.08,.92,.38),twist:-.16,lean:.1,step:-.1},
 {grip:v(.08,1.47,-.5),vector:v(.03,.12,-1),twist:.04,lean:-.14,step:.3},
 {grip:v(.1,.78,-.45),vector:v(.12,-.74,-.67),twist:.2,lean:-.13,step:.2},
 {grip:v(.27,.9,-.29),vector:v(.09,.5,-.86),twist:.08,lean:.015,step:.06},guard];
const daggerGuard={grip:v(.3,1.12,-.44),vector:v(.12,.2,-1),twist:0,lean:0,step:0};
const stab:Omit<Key,'t'>[]=[daggerGuard,
 {grip:v(.36,1.03,-.29),vector:v(.15,.25,-1),twist:-.16,lean:.02,step:-.02},
 {grip:v(.08,1.25,-.86),vector:v(0,.03,-1),twist:.03,lean:-.045,step:.11},
 {grip:v(.12,1.19,-.76),vector:v(-.12,-.04,-1),twist:.07,lean:-.025,step:.09},
 {grip:v(.3,1.12,-.5),vector:v(.08,.12,-1),twist:.02,lean:0,step:.02},daggerGuard];
const lowStab=stab.map((k,i)=>i===0||i===5?k:{...k,grip:v(k.grip.x-.15,k.grip.y-.13,k.grip.z),twist:-k.twist});
const lunge=stab.map((k,i)=>i===0||i===5?k:{...k,grip:v(k.grip.x,k.grip.y+.14,k.grip.z-.07),lean:k.lean*1.5,step:k.step*1.7});
const wide=slash.map((k,i)=>i===0||i===5?k:{...k,grip:v(k.grip.x*1.25,k.grip.y+.08,k.grip.z+.03),vector:v(k.vector.x*1.3,k.vector.y,k.vector.z),twist:k.twist*1.4,step:k.step*.8});
const wideReturn=wide.map((k,i)=>i===0||i===5?k:{...k,grip:v(-k.grip.x*.8+.12,k.grip.y,k.grip.z),vector:v(-k.vector.x,k.vector.y,k.vector.z),twist:-k.twist});
const reflected=slash.map((k,i)=>i===0||i===5?k:{...k,grip:v(-k.grip.x*.8+.12,k.grip.y,k.grip.z),vector:v(-k.vector.x,k.vector.y,k.vector.z),twist:-k.twist});
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
function hermite(a:number,b:number,ma:number,mb:number,u:number,span:number){return (2*u**3-3*u*u+1)*a+(u**3-2*u*u+u)*span*ma+(-2*u**3+3*u*u)*b+(u**3-u*u)*span*mb;}
/** Authored full-motion curve. Both display rigs and combat sample this exact blade trajectory. */
export function attackPose(kind:AttackKind,phase:AttackPhase,time:number,slow=1,archetype:MeleeArchetype='sword'):WeaponPose{
 const def=meleeDefinition(kind,archetype),w=def.windup*slow,a=def.strike*slow,r=def.recover*slow;
 const timeline=phase==='windup'?time:phase==='strike'?w+time:phase==='recover'?w+a+time:0;
 const times=[0,w,w+a*.48,w+a,w+a+r*.46,w+a+r],data=archetype==='dagger'?(kind==='overhead'?lunge:kind==='return'?lowStab:stab):kind==='overhead'?overhead:archetype==='greatsword'?(kind==='return'?wideReturn:wide):kind==='return'?reflected:slash;
 const keys=data.map((k,i)=>({...k,t:times[i]}));let segment=0;while(segment<4&&timeline>times[segment+1])segment++;
 const lo=keys[segment],hi=keys[segment+1],span=hi.t-lo.t,u=clamp((timeline-lo.t)/span),prev=keys[Math.max(0,segment-1)],next=keys[Math.min(5,segment+2)];
 const interpolate=(read:(k:Key)=>number)=>hermite(read(lo),read(hi),segment===0?0:(read(hi)-read(prev))/(hi.t-prev.t),segment===4?0:(read(next)-read(lo))/(next.t-lo.t),u,span);
 const grip=v(interpolate(k=>k.grip.x),interpolate(k=>k.grip.y),interpolate(k=>k.grip.z)),vector=v(interpolate(k=>k.vector.x),interpolate(k=>k.vector.y),interpolate(k=>k.vector.z)),length=Math.hypot(vector.x,vector.y,vector.z)||1;
 return {grip,tip:v(grip.x+vector.x/length*def.reach,grip.y+vector.y/length*def.reach,grip.z+vector.z/length*def.reach),twist:interpolate(k=>k.twist),lean:interpolate(k=>k.lean),step:interpolate(k=>k.step)};
}
export const transformPoint=(p:Vec3,position:Vec3,yaw:number):Vec3=>({x:position.x+Math.cos(yaw)*p.x+Math.sin(yaw)*p.z,y:position.y+p.y,z:position.z-Math.sin(yaw)*p.x+Math.cos(yaw)*p.z});
export function bladeWorld(pose:WeaponPose,position:Vec3,yaw:number,pitch=0){const pivot=1.52,tilt=(p:Vec3)=>({x:p.x,y:pivot+Math.cos(pitch)*(p.y-pivot)-Math.sin(pitch)*p.z,z:Math.sin(pitch)*(p.y-pivot)+Math.cos(pitch)*p.z});return {grip:transformPoint(tilt(pose.grip),position,yaw),tip:transformPoint(tilt(pose.tip),position,yaw)};}
/** Distance between segments, used by blade sweeps against articulated body capsules. */
export function segmentDistance(a:Vec3,b:Vec3,c:Vec3,d:Vec3){
 const sub=(p:Vec3,q:Vec3)=>v(p.x-q.x,p.y-q.y,p.z-q.z),dot=(p:Vec3,q:Vec3)=>p.x*q.x+p.y*q.y+p.z*q.z,u=sub(b,a),w=sub(d,c),r=sub(a,c),aa=dot(u,u),bb=dot(u,w),cc=dot(w,w),dd=dot(u,r),ee=dot(w,r),den=aa*cc-bb*bb;
 let s=den>1e-9?clamp((bb*ee-cc*dd)/den):0,t=cc>1e-9?clamp((bb*s+ee)/cc):0;s=aa>1e-9?clamp((bb*t-dd)/aa):0;t=cc>1e-9?clamp((bb*s+ee)/cc):0;
 return Math.hypot(r.x+s*u.x-t*w.x,r.y+s*u.y-t*w.y,r.z+s*u.z-t*w.z);
}
export function bodyCapsules(position:Vec3,yaw:number,pose:WeaponPose){const hip=transformPoint(v(0,.85+pose.lean*.2,0),position,yaw),neck=transformPoint(v(0,1.33,pose.lean*.6),position,yaw),head=transformPoint(v(0,1.65,pose.lean*.8),position,yaw);return [{a:hip,b:neck,r:.24,zone:'body'},{a:neck,b:head,r:.17,zone:'head'}] as const;}
export const facing=(yaw:number,from:Vec3,to:Vec3)=>{const f=direction(yaw,0),dx=to.x-from.x,dz=to.z-from.z;return (f.x*dx+f.z*dz)/Math.max(.001,Math.hypot(dx,dz));};
