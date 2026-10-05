import {expect} from 'vitest';
import {CoreSimulation,type Action,type Controls} from '../../../src/prototype/core/simulation';
import {executeGameCommand,type GameCommand} from '../../../src/prototype/campaign-commands';
import type {Vec3} from '../../../src/prototype/core/voxel';
const neutral:Controls={x:0,z:0,sprint:false,block:false,water:false};
const angle=(n:number)=>Math.atan2(Math.sin(n),Math.cos(n));
/** Core integration evidence only. All state changes go through production look,
 * action, tick, or the same validated menu transaction used by the application. */
export class NormalPlayer {
 readonly sim:CoreSimulation;private steps=0;private started=performance.now();
 constructor(western=false){this.sim=new CoreSimulation(true,false,true,western);}
 diagnostic(label:string){const s=this.sim,p=s.player;return JSON.stringify({label,seconds:s.seconds,position:p.position,hp:p.hp,stamina:p.stamina,phase:p.phase,animal:s.animal.state,inventory:s.survival.inventory,enemies:s.enemies.filter(e=>e.hp>0).map(e=>({id:e.id,hp:e.hp,position:e.position,phase:e.phase})),recent:s.events.slice(-4).map(e=>e.text)});}
 // The 24,000 simulation-step cap is invariant. Allow slower shared CI CPUs
 // to execute the same route; this is a liveness timeout, not an FPS benchmark.
 tick(input:Partial<Controls>={}){if(++this.steps>24000||performance.now()-this.started>150000)throw Error(this.diagnostic('Bounded normal-play wall-time/step budget exceeded'));this.sim.tick(1/30,{...neutral,...input});if(this.sim.player.hp<=0)throw Error(this.diagnostic('Player died during normal play'));}
 advance(seconds:number,input:Partial<Controls>={}){for(let i=0;i<Math.ceil(seconds*30);i++)this.tick(input);}
 until(predicate:()=>boolean,seconds:number,input:Partial<Controls>={},label='condition'){for(let i=0;i<Math.ceil(seconds*30)&&!predicate();i++)this.tick(input);expect(predicate(),this.diagnostic(label)).toBe(true);}
 idle(){this.until(()=>this.sim.player.phase==='idle',5,{},'action returns to idle');}
 look(point:Vec3){this.idle();this.track(point);}
 // Re-aim an ongoing cast through the same production look path.
 track(point:Vec3){const p=this.sim.player,dx=point.x-p.position.x,dz=point.z-p.position.z,yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(point.y-p.position.y-1.52,Math.hypot(dx,dz));this.sim.look(-angle(yaw-p.yaw),p.pitch-pitch);}
 act(action:Action,input:Partial<Controls>={}){this.sim.action(action,{...neutral,...input});}
 walk(x:number,z:number){this.idle();const start={...this.sim.player.position},dx=x-start.x,dz=z-start.z,len=Math.hypot(dx,dz);if(len<.18)return;this.look({x,y:start.y+1.52,z});this.until(()=>((x-this.sim.player.position.x)*dx+(z-this.sim.player.position.z)*dz)/len<.18,Math.max(6,len*2),{z:1},`walk to ${x},${z}`);this.advance(.25);}
 harvest(material:number,minimum:number,points:Vec3[],object:string){for(let attempt=0;attempt<20&&this.sim.survival.inventory[material]<minimum;attempt++){this.look(points[attempt%points.length]);if(this.sim.target(2.5)?.hit.cell.object!==object)continue;this.act('heavy');expect(this.sim.player.phase,this.diagnostic('harvest strike accepted')).not.toBe('idle');this.idle();this.advance(.4);}expect(this.sim.survival.inventory[material],this.diagnostic('gather material '+material)).toBeGreaterThanOrEqual(minimum);}
 interact(id:string,point:Vec3){this.look(point);expect(this.sim.target(this.sim.campaign.canGrapple?7:2.75)?.hit.cell.object,this.diagnostic('aim '+id)).toBe(id);this.act('interact');this.tick();}
 menu(type:GameCommand['type'],id:string){const result=executeGameCommand(this.sim,{type,id} as GameCommand);expect(result.ok,this.diagnostic(id+': '+result.message)).toBe(true);}
 heal(){const p=this.sim.player;if(p.hp>=65)return;if(this.sim.campaign.has('bandage'))this.menu('consume','bandage');else if(p.flasks>0){this.act('heal');this.until(()=>p.phase==='idle',4,{},'normal starting flask while stationary');}}
 fight(index:number,recover?:()=>void){const e=this.sim.enemies[index];for(let round=0;round<18&&e.hp>0;round++){this.idle();this.heal();this.look({...e.position,y:e.position.y+1.52});if(this.sim.player.stamina<45){if(recover)recover();else this.advance(2.6,this.sim.player.position.z>6?{x:this.sim.player.position.x>5?-1:1}:{z:-1});continue;}this.until(()=>['recover','stagger','dead'].includes(e.phase),12,{block:true},'shield enemy attack');if(e.hp<=0)break;this.act('attack');expect(this.sim.player.phase,this.diagnostic('counter accepted')).not.toBe('idle');this.idle();}expect(e.hp,this.diagnostic('defeat enemy '+index)).toBeLessThanOrEqual(0);}
 checkpoint(label:string){console.info('Normal-play checkpoint',label,{seconds:Number(this.sim.seconds.toFixed(2)),hp:this.sim.player.hp,position:this.sim.player.position,inventory:this.sim.survival.inventory});}
}

export function playFirstChapter(d:NormalPlayer,{reserveRidgeMedicine=false,reserveGemMaterials=false,reserveManaDoses=0,reserveManaLeaves=0}:{reserveRidgeMedicine?:boolean;reserveGemMaterials?:boolean;reserveManaDoses?:number;reserveManaLeaves?:number}={}){
  const s=d.sim;expect(s.player.position).toEqual({x:0,y:.25,z:6});expect(Object.values(s.survival.inventory).every(n=>n===0)).toBe(true);
  d.walk(-.55,6.15);d.act('chisel');d.harvest(4,24,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95},{x:-2.2,y:.58,z:6.25},{x:-2.2,y:.58,z:6.95}],'sample-wood');
  d.walk(-.55,5.25);d.walk(-3.45,5.25);d.walk(-3.45,6.35);d.harvest(3,(reserveGemMaterials?25:6)+reserveManaDoses,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8},{x:-4.5,y:.65,z:6.5}],'sample-stone');
  d.walk(-3.45,6.65);d.harvest(7,reserveRidgeMedicine?14:8,[{x:-3.45,y:.5,z:7.9},{x:-3.1,y:.5,z:7.9},{x:-3.8,y:.5,z:7.9}],'sample-grass');
  d.walk(-3.45,5.3);d.walk(2.5,5.3);d.walk(2.5,5.75);d.harvest(6,reserveGemMaterials?17:4,[{x:2.5,y:.8,z:7.1},{x:2.8,y:.8,z:7.1},{x:2.2,y:.8,z:7.1},...(reserveGemMaterials?[{x:1.6,y:.5,z:7.1},{x:3.8,y:.5,z:7.1},{x:1.6,y:1,z:7.1},{x:3.8,y:1,z:7.1}]:[])],'sample-metal');d.walk(2.5,5.3);d.walk(-3.5,5.3);d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.state.flameTier).toBe(1);d.checkpoint('hearth');
  if(reserveManaLeaves){for(const [x,z] of [[0,5.3],[0,9.5],[-10,9.5],[-10,1.9],[-6,1.9]])d.walk(x,z);d.act('chisel');d.harvest(7,(s.survival.inventory[7]??0)+reserveManaLeaves,[{x:-5.75,y:3.4,z:3},{x:-5.4,y:3.5,z:3},{x:-6.1,y:3.5,z:3}],'tree0');for(const [x,z] of [[-10,1.9],[-10,9.5],[0,9.5],[0,5.3],[-3.5,5.3]])d.walk(x,z);}
  d.act('sword');d.walk(0,5.3);d.walk(0,3.2);d.interact('door',{x:0,y:1.4,z:1});d.fight(0);d.heal();d.checkpoint('entrance guard outside');d.walk(0,0);d.walk(-2.4,-1.8);d.interact('artisan',{x:-2.5,y:1.1,z:-3.5});expect(s.campaign.state.artisanRescued).toBe(true);d.walk(0,0);d.walk(0,3.2);d.walk(0,5.3);d.walk(-3.5,5.3);d.checkpoint('artisan rescued');
  for(const id of ['iron-blade','hide-coat','grapple','glider','bandage','bandage','berry-meal'])d.menu('craft',id);for(const id of ['iron-blade','hide-coat','grapple','glider'])d.menu('equip',id);d.menu('consume','berry-meal');expect(s.campaign.canGrapple&&s.campaign.canGlide).toBe(true);d.checkpoint('travel equipment');
  d.walk(0,5.3);d.walk(0,3.2);for(const i of [0,1]){const e=s.enemies[i];if(e.hp>0&&Math.hypot(e.position.x-s.player.position.x,e.position.z-s.player.position.z)<8)d.fight(i);}
  d.heal();for(const [x,z] of [[0,5.3],[3.5,5.3],[11,5.3],[11,-5.5],[7,-5.5]])d.walk(x,z);d.interact('grapple-mist',{x:7,y:4.1,z:-6.8});d.until(()=>s.player.position.y>3.15,5,{},'grapple ascent');d.until(()=>s.grapple===null,5,{},'grapple landing');d.walk(7,-8);d.interact('mist-cache',{x:7,y:3.65,z:-9});expect(s.campaign.state.items['mist-core']).toBe(1);d.checkpoint('mist cache');
  d.walk(8,-8);d.walk(8,-7);d.look({x:7,y:s.player.position.y+1.52,z:4});const height=s.player.position.y;d.act('jump');d.until(()=>s.player.position.y>height+.12,2,{},'jump before glider');d.act('jump');expect(s.gliding).toBe(true);d.until(()=>s.player.position.z>1.4,12,{},'glide across basin');d.act('jump');expect(s.gliding).toBe(false);d.until(()=>s.player.grounded,6,{},'controlled glider landing');d.heal();d.walk(7,4);d.walk(0,5.3);d.walk(-3.5,5.3);d.checkpoint('glide return');
  if(s.enemies[1].hp>0){d.walk(0,5.3);d.walk(0,3.2);d.walk(0,-3);d.fight(1);d.walk(0,3.2);d.walk(0,5.3);d.walk(-3.5,5.3);}expect(s.campaign.state.items['warden-core']).toBe(1);d.interact('hearth',{x:-3,y:.9,z:4});expect(s.campaign.state.flameTier).toBe(2);d.checkpoint('flame two');
  // The browser route budgets this reserve explicitly. Longer regional test
  // routes manage their own finite supplies and retain their original budget.
  if(reserveRidgeMedicine){const before={...s.survival.inventory},owned=s.campaign.state.items.bandage??0;for(let count=0;count<2;count++)d.menu('craft','bandage');expect(s.survival.inventory[7]).toBe(before[7]-6);expect(s.survival.inventory[10]).toBe(before[10]-2);expect(s.campaign.state.items.bandage).toBe(owned+2);if(s.player.hp<70)d.menu('consume','bandage');}
  for(const [x,z] of [[0,5.3],[0,3.2],[0,-3],[2,-8],[2,-11.1],[0,-11.1],[0,-14],[0,-15]])d.walk(x,z);d.interact('ridge-gate',{x:0,y:1.3,z:-17});expect(s.campaign.state.gateOpen).toBe(true);for(const [x,z] of [[-1.5,-15],[-1.5,-19],[-1.5,-24]])d.walk(x,z);if(s.enemies[3].hp>0)d.fight(3);d.walk(-1.5,-27);d.walk(0,-28.5);d.interact('nextcamp',{x:0,y:3.8,z:-31});expect(s.campaign.state.campUnlocked).toBe(true);expect(s.campaign.state.completed).toEqual(expect.arrayContaining(['gather','hearth','rescue','forge','traverse','cache','warden','flame','ridge']));expect(s.campaign.state.deaths).toBe(0);d.checkpoint('ridge camp');
}
