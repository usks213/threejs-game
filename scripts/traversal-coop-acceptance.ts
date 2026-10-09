/** Bounded pristine-world traversal controls. Builds real geometry and pours
 * actual water; never injects positions, terrain, stamina, wetness or flags. */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {ContinuousCoopJourney} from './playthrough-coop';
import {siteSupport,siteClear} from '../src/game/site-walking';

const j:ContinuousCoopJourney=new ContinuousCoopJourney(process.env.TRAVERSAL_OUTPUT??'/tmp/voxel-traversal-source'),[a,b]=j.players;
const observations:Record<string,unknown>[]=[];
const observe=(stage:string)=>{while(j.sim.tick%3)j.step(1);const entry={stage,tick:j.sim.tick,players:j.players.map(id=>{const state=j.room.view(id);return{id,player:{...state.player},traversal:state.adventure.traversal,stamina:state.adventure.stamina,health:state.adventure.health,wet:j.actor(id).adventure.state.meadows!.wet};})};j.event('traversal-observation',{observation:stage,traversals:entry.players.map(({id,traversal,stamina,health})=>({id,traversal,stamina,health}))});observations.push(entry);writeFileSync(resolve(j.output,'traversal-observations.json'),JSON.stringify(observations,null,2));return entry;};
try{
 j.stage='traversal-real-supplies';j.step(30);j.pair(0,9);
 for(const kind of ['wood','stone']){const drop=j.sim.adventure.state.resources.find(resource=>resource.drop&&resource.kind===kind)!;j.require(drop,'Starting supply missing');j.act('gather',String(drop.id));}
 j.act('craft','hammer');j.walk(5.5,12,a,300,.03);j.walk(6.5,12,b,300,.03);
 const base=j.sim.groundAt(6,10);j.act('build','wall',{x:6,y:base,z:10},a,{x:0,y:0,z:1});j.act('build','floor',{x:6,y:base+2,z:9.2},a,{x:0,y:0,z:1});
 for(const [id,x]of [[a,5.5],[b,6.5]]as const)j.walk(x,10.55,id,200,.025);
 const before=j.players.map(id=>({id,y:j.actor(id).player.y,stamina:j.actor(id).adventure.state.stamina}));
 for(const id of j.players)j.act('climb','on',undefined,id,{x:0,y:0,z:-1});j.step(15);
 j.require(j.players.every((id,index)=>j.actor(id).adventure.traversal.snapshot().hanging&&Math.abs(j.actor(id).player.y-before[index].y)<.001),'Both players must genuinely hang without movement input');observe('both-hanging');j.checkpoint('both-hanging');
 j.step(9,Object.fromEntries(j.players.map(id=>[id,{x:0,z:-1,jump:false}])));
 j.require(j.players.every((id,index)=>j.actor(id).player.y>before[index].y+.3&&j.actor(id).adventure.state.stamina<before[index].stamina),'Both players must climb with real stamina expenditure');observe('both-climbing');
 for(let tick=0;tick<90&&j.players.some(id=>j.actor(id).adventure.traversal.climbing);tick++)j.step(1,Object.fromEntries(j.players.map(id=>[id,{x:0,z:-1,jump:false}])));
 j.require(j.players.every(id=>!j.actor(id).adventure.traversal.climbing&&j.actor(id).player.y>=base+2&&j.actor(id).player.z<10),'Both players must mantle the real built roof');observe('both-mantled-roof');j.restart('both-climbed-roof');
 j.stage='actual-dug-swimming-basin';j.walk(5.4,12,a,300,.03);j.walk(6.6,12,b,300,.03);
 const pool={x:6,y:j.sim.groundAt(6,14),z:14};j.message(a,{type:'action',tool:'dig',target:{x:pool.x,y:pool.y+.5,z:pool.z}});for(let pour=0;pour<1;pour++)j.message(a,{type:'action',tool:'water',target:{x:pool.x,y:pool.y-1,z:pool.z}});j.step(60);
 const intoPool=(id:string,x:number)=>{for(let tick=0;tick<200;tick++){const p=j.actor(id).player,dx=x-p.x,dz=14-p.z,d=Math.hypot(dx,dz);if(j.actor(id).adventure.traversal.snapshot().swimming&&d<.4)return;j.step(1,{[id]:{x:d>.12?dx/Math.max(d,1e-9):0,z:d>.12?dz/Math.max(d,1e-9):0,jump:false}});}throw Error('Could not enter actual water '+id);};
 for(let tick=0;tick<250&&!(j.sim.tick%3===0&&j.players.every((id,index)=>j.actor(id).adventure.traversal.snapshot().swimming&&Math.hypot(j.actor(id).player.x-(index?6.6:5.4),j.actor(id).player.z-14)<.4));tick++){const inputs=Object.fromEntries(j.players.map((id,index)=>{const p=j.actor(id).player,dx=(index?6.6:5.4)-p.x,dz=14-p.z,d=Math.hypot(dx,dz);return[id,{x:d>.12?dx/Math.max(d,1e-9):0,z:d>.12?dz/Math.max(d,1e-9):0,jump:false}];}));j.step(1,inputs);}j.require(j.players.every(id=>j.actor(id).adventure.traversal.snapshot().swimming),'Both players must swim in real water');observe('both-swimming');j.checkpoint('both-swimming');
 // Entry can still be a falling dive. Let real buoyancy lift both swimmers
 // while they use ordinary corrective movement to stay inside the pool.
 for(let tick=0;tick<90&&!j.players.every(id=>j.actor(id).player.y>j.sim.groundAt(j.actor(id).player.x,16)-1.1);tick++){
  const inputs=Object.fromEntries(j.players.map((id,index)=>{const p=j.actor(id).player,dx=(index?6.6:5.4)-p.x,dz=14-p.z,d=Math.hypot(dx,dz);return[id,{x:d>.15?dx/Math.max(d,1e-9):0,z:d>.15?dz/Math.max(d,1e-9):0,jump:false}];}));j.step(1,inputs);
 }
 observe('both-buoyant-at-surface');
 const swimmingStart=j.players.map(id=>({...j.actor(id).player}));j.step(12,Object.fromEntries(j.players.map(id=>[id,{x:0,z:.5,jump:false}])));
 j.require(j.players.every((id,index)=>Math.hypot(j.actor(id).player.x-swimmingStart[index].x,j.actor(id).player.z-swimmingStart[index].z)>.1),'Both swimmers must move under real controls');observe('both-swim-moved');
 for(const [id,x]of [[a,5.4],[b,6.6]]as const){
  let exited=false;
  for(let attempt=0;attempt<180&&!exited;attempt++){
   const p=j.actor(id).player;let direction:{x:number;z:number}|undefined;
   if(j.sim.fluid.immersion(p,1.45)>.35&&(j.sim.tick+1)%3!==0){
    for(let angle=0;angle<16&&!direction;angle++){
     const dx=Math.sin(angle*Math.PI/8),dz=Math.cos(angle*Math.PI/8),to={x:p.x+dx*.8,y:p.y,z:p.z+dz*.8},y=siteSupport(j.sim,to.x,to.z,p.y+1)??j.sim.groundAt(to.x,to.z,p.y+1);to.y=y+.02;
     const normal={x:0,y:0,z:0};j.sim.world.surfaceDistance({x:to.x,y:to.y+.3,z:to.z},normal);
     if(normal.y<.8||y-p.y<.1||y-p.y>1.2||j.sim.fluid.immersion(to,1)>.4||j.players.some(other=>other!==id&&Math.hypot(j.actor(other).player.x-to.x,j.actor(other).player.z-to.z)<.65&&Math.abs(j.actor(other).player.y-to.y)<1.7))continue;
     let clear=true;for(let height=p.y+.1;height<=to.y+.01;height+=.1)if(!siteClear(j.sim,{x:p.x,y:height,z:p.z}))clear=false;
     for(let sample=1;sample<=8;sample++)if(!siteClear(j.sim,{x:p.x+dx*.1*sample,y:to.y,z:p.z+dz*.1*sample}))clear=false;
     if(clear)direction={x:dx,z:dz};
    }
   }
   if(direction){const before={...p},stamina=j.actor(id).adventure.state.stamina;j.step(1,{[id]:{...direction,jump:true}});const after=j.actor(id).player;
    j.require(Math.hypot(after.x-before.x,after.z-before.z)>.7&&after.grounded&&!j.actor(id).adventure.traversal.snapshot().swimming,'Eligible jump+direction must execute the real bank mantle '+id);j.require(j.actor(id).adventure.state.stamina<stamina-4,'Bank mantle must spend real stamina');observe('bank-mantle-'+id);exited=true;
   }else{const dx=p.x-6,dz=p.z-14,r=Math.hypot(dx,dz),outward=r<.85&&j.sim.fluid.immersion(p,1.45)>.35,sign=outward?1:-1;j.step(1,{[id]:{x:r>.08?sign*dx/r:0,z:r>.08?sign*dz/r:0,jump:false}});}
  }
  j.require(exited,'No reachable wet-to-dry bank mantle within bounded movement '+id);
 }
 j.require(j.players.every(id=>j.actor(id).adventure.state.meadows!.wet>0),'Real swimming must produce the normal wet status');j.checkpoint('both-exited-bank');
 for(const id of j.players){const p=j.actor(id).player,dx=p.x-6,dz=p.z-14,r=Math.hypot(dx,dz);j.walk(6+dx/r*2.4,14+dz/r*2.4,id,120,.2);}
 for(const id of j.players){const p=j.actor(id).player,side=p.x<6?3.5:8.5;j.walk(side,p.z,id,120,.2);j.walk(side,11.5,id,180,.2);j.walk(8.5,11.5,id,180,.2);j.walk(8.5,8.5,id,180,.2);}j.walk(4.5,7.5,a,180,.15);j.walk(8,7.5,b,180,.15);
 j.stage='paid-stone-climb-column';const floor=Math.max(...[-.5,.5].flatMap(x=>[-.5,.5].map(z=>j.sim.groundAt(6+x,7+z))));
 j.act('sky-part','block:stone',{x:6,y:Math.ceil((floor+.75)*8)/8,z:7});const lower=j.sim.skybound.state.parts.at(-1)!;j.act('sky-grab',String(lower.id));j.act('sky-part','block:stone',{x:6,y:lower.position.y+1.25,z:7});const upper=j.sim.skybound.state.parts.at(-1)!;j.act('sky-glue',`${lower.id}:${upper.id}`);
 for(const [climber,holder]of [[b,a],[a,b]]as const){
  j.walk(climber===b?8:4,8.5,climber,150,.15);j.walk(6,8.5,climber,150,.15);j.walk(6,7.9,climber,150,.08);
  j.act('sky-grab',String(lower.id),undefined,holder);j.require(j.actor(climber).adventure.state.meadows!.wet>0,'Slip must use earned wet status');
  j.act('climb','on',undefined,climber,{x:0,y:0,z:-1});const start=j.actor(climber).player.y;j.step(10,{[climber]:{x:0,z:-1,jump:false}});
  j.require(j.actor(climber).adventure.traversal.climbing&&j.actor(climber).player.y>start+.4,'Climber must gain real height on the paid stone column');let warned=false,warningTick=0;
  for(let tick=0;tick<100&&j.actor(climber).adventure.traversal.climbing;tick++){j.step(1);const t=j.actor(climber).adventure.traversal.snapshot();if(t.warning?.includes('間もなく')&&!warned){warned=true;warningTick=j.sim.tick;observe('wet-stone-warning-'+climber);}}
  const slipped=j.actor(climber).adventure.traversal.snapshot();j.require(warned&&warningTick<j.sim.tick&&!slipped.climbing&&slipped.warning?.includes('手が離れました'),'Wet stone must warn before bounded slip '+climber);observe('wet-stone-slip-'+climber);
  j.act('sky-release',String(lower.id),undefined,holder);j.act('sky-grab',String(lower.id),undefined,climber);j.step(20);j.walk(climber===b?8:4,8.5,climber,150,.15);j.walk(climber===b?8:4,7.5,climber,150,.15);
 }
 j.require(j.players.every(id=>j.actor(id).adventure.state.health>0),'Both climbers must remain alive');j.restart('traversal-complete-saved');
 j.event('route-complete',{scope:'pristine-two-player-climb-hang-mantle-swim-bank-wet-slip',fixturesReplaced:false,remaining:['browser','real devices','latency impairment']});j.flush();
}catch(error){j.event('blocked',{message:String(error),players:j.players.map(id=>({id,player:{...j.actor(id).player},traversal:j.actor(id).adventure.traversal.snapshot(),stamina:j.actor(id).adventure.state.stamina})),buildings:j.sim.adventure.state.buildings});j.flush();process.exitCode=1;}
