import type { GameSimulation } from '../simulation/game-simulation';
import type { Adventure, } from '../game/adventure';
import type { AdventureSave, AdventureSnapshot } from '../game/types';
import { newMeadows } from '../game/meadows/state';
export const BEACONS = [
 {id:810001,name:'風原の道標',x:0,y:3,z:3,hint:'木の部品を2つ接着し、道標の近くへ運ぶ'},
 {id:810002,name:'空の航路灯',x:18,y:25,z:-18,hint:'北東の斜路を登り、天抜けで漂う台地へ'},
 {id:810003,name:'洞海の灯台',x:28,y:-10.5,z:8,hint:'帆布の翼で東の大穴を降り、地下の灯台へ'},
 {id:810004,name:'嵐心の観測台',x:48,y:29,z:24,hint:'3つの灯を結び、東の観測台で嵐心を鎮める'},
] as const;
export function seedAdventureWorld(sim:GameSimulation,state:AdventureSave):void{
 state.resources=[];state.enemies=[];state.buildings=[];state.meadows=newMeadows();state.meadows.raidAt=1e10;
 state.inventory={ragTunic:1,club:1,glider:1,berry:6};state.equipment='club';state.health=25;state.stamina=50;
 const node=(kind:string,x:number,y:number,z:number,amount=1,drop=false)=>state.resources.push({id:sim.allocateEntityId(),kind,x,y,z,amount,ready:0,...(drop?{drop:true}:{})});
 // One shared supply cache makes ownership visible instead of spawning personal duplicates.
 node('wood',.8,sim.groundAt(.8,8)+.1,8,12,true);node('stone',-1,sim.groundAt(-1,8)+.1,8,8,true);node('resin',0,sim.groundAt(0,10)+.1,10,4,true);
 for(let i=0;i<110;i++){const angle=i*2.39996,r=15+Math.sqrt(i)*5,x=Math.sin(angle)*r,z=Math.cos(angle)*r;const kind=i%13===0?'honey':i%11===0?'mushroom':i%7===0?'berry':i%5===0?'stone':i%3===0?'branch':'beech';const y=sim.groundAt(x,z);if(y>.1)node(kind,x,y,z,kind==='stone'||kind==='branch'?3:1);}
 for(const b of BEACONS)state.resources.push({id:b.id,kind:'runestone',x:b.x,y:b.id===810001?sim.groundAt(b.x,b.z):b.y,z:b.z,amount:1,ready:0});
 for(const[x,y,z]of[[15,25,-18],[22,25,-15],[28,-10.5,14],[33,-10.5,5]]){node('crystal',x,y,z,3);}
 for(const[x,y,z]of[[8,3,18],[30,-10.5,12],[-15,-10.5,-6]])node('iron',x,y,z,4);
 for(let i=0;i<8;i++){const angle=i*Math.PI/4,x=Math.sin(angle)*34,z=Math.cos(angle)*34-5;state.enemies.push({id:sim.allocateEntityId(),definition:i%2?'walker':'slime',tier:1,x,y:sim.groundAt(x,z),z,homeX:x,homeZ:z,health:i%2?48:24,cooldown:2,windup:0,slow:0,boss:false});}
}
export function adventureObjective(state:Pick<AdventureSave,'resources'|'defeated'|'siteWorld'>):string{
 if(state.defeated.includes('stormcore'))return '嵐心を鎮めた。三層の世界を自由に探索し、仲間と新しい航路を作ろう';
 const next=BEACONS.find(b=>(state.resources.find(n=>n.id===b.id)?.ready??0)<1e9);
 if(next?.id===810004&&state.siteWorld?.storyMode==='full'&&state.siteWorld.completed.length<3)return '三つの地域拠点で輸送・救助・設備復旧を進め、番人の記録を集めよう';
 return next?`${next.name} · ${next.hint}`:'観測台の嵐心を鎮めよう。攻撃の予兆を見て、盾と回避で弱点を狙う';
}
export function adventureBeacon(game:Adventure,id:string):{dirty:string[];message:string}|null{
 const number=Number(id.startsWith('r:')?id.slice(2):id),beacon=BEACONS.find(b=>b.id===number);if(!beacon)return null;
 const node=game.state.resources.find(n=>n.id===number);if(!node)throw new Error('道標が見つかりません');
 if(Math.hypot(game.sim.player.x-node.x,game.sim.player.y-node.y,game.sim.player.z-node.z)>3.5)throw new Error('道標へ近づいてください');
 if(node.ready>=1e9)return {dirty:[],message:'この灯はすでにつながっています'};
 if(beacon.id===810001&&!game.sim.skybound.state.parts.some(p=>p.links.length&&Math.hypot(p.position.x-node.x,p.position.y-node.y,p.position.z-node.z)<7))throw new Error('能力で木の部品を2つ接着し、道標の近くへ運んでみよう');
 if(beacon.id===810004){
  if(!game.sites.finalReady())throw Error('三つの地域拠点で連絡網を復旧し、番人の記録を集めてください');
  if(BEACONS.slice(0,3).some(b=>(game.state.resources.find(n=>n.id===b.id)?.ready??0)<1e9))throw new Error('地表・空・地下の3つの灯を先につないでください');
  if(!game.state.enemies.some(e=>e.definition==='stormcore'))game.state.enemies.push({id:game.sim.allocateEntityId(),definition:'stormcore',tier:1,x:48,y:29,z:29,homeX:48,homeZ:29,health:260,cooldown:3,windup:0,slow:0,boss:true});
 }
 node.ready=1e10;game.state.unlocked=Math.min(5,game.state.unlocked+1);
 game.state.health=Math.min(100,game.state.health+12);game.state.stamina=Math.min(100,game.state.stamina+20);
 return {dirty:[],message:`${beacon.name}が輝きだした。${beacon.id===810004?'嵐心の目覚めに備えよう':'地図の灯を頼りに、次の高さへ進もう'}`};
}
export function beaconProgress(state:AdventureSnapshot){return BEACONS.map(b=>({...b,active:(state.resources.find(n=>n.id===b.id)?.ready??0)>=1e9}));}
