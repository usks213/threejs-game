import type { Adventure } from '../adventure';
import { learn } from './state';
export interface FishingState { fish:number; phase:'waiting'|'bite'|'fight'; time:number; progress:number; strain:number; reeling:boolean }
export function fishingAction(game:Adventure):string{
 const s=game.state,m=s.meadows!,p=game.sim.player,active=m.fishing;
 if(active){if(active.phase==='waiting')throw new Error('浮きが沈むまで待ってください');if(active.phase==='bite'){active.phase='fight';active.time=0;active.reeling=true;return '掛かった！ 糸の張りとスタミナを見て引き寄せます';}active.reeling=!active.reeling;return active.reeling?'糸を巻いています':'巻くのを止めて糸を緩めます';}
 if(!s.inventory.fishingRod||!s.inventory.bait)throw new Error('釣り竿と餌を用意してください');
 const fish=s.resources.filter(n=>['perch','pike'].includes(n.kind)&&n.ready<=s.seconds&&Math.hypot(n.x-p.x,n.z-p.z)<10).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(!fish)throw new Error('魚が見える岸から釣り糸を投げてください');
 s.inventory.bait--;m.fishing={fish:fish.id,phase:'waiting',time:0,progress:0,strain:0,reeling:false};s.equipment='fishingRod';return '釣り糸を投げました。浮きが沈んだら「合わせる」を押してください';
}
export function stepFishing(game:Adventure,dt:number):void{
 const s=game.state,m=s.meadows!,f=m.fishing;if(!f)return;
 const fish=s.resources.find(n=>n.id===f.fish),p=game.sim.player;if(!fish||s.health<=0||Math.hypot(p.x-fish.x,p.z-fish.z)>14){m.fishing=undefined;return;}
 f.time+=dt;
 if(f.phase==='waiting'&&f.time>3+f.fish%4){f.phase='bite';f.time=0;}
 else if(f.phase==='bite'&&f.time>4)m.fishing=undefined;
 else if(f.phase==='fight'){
  const thrashing=Math.sin(f.time*1.7)>0.25;f.strain=Math.max(0,f.strain+dt*(f.reeling?(thrashing?.28:.08):-.35));
  if(f.reeling){s.stamina=Math.max(0,s.stamina-dt*6);f.progress+=dt*(thrashing?.035:.13)*(1+(m.skills.fishing??0)*.005);}else f.progress=Math.max(0,f.progress-dt*.025);
  if(f.strain>=1||s.stamina<=0){m.fishing=undefined;return;}
  if(f.progress>=1){game.meadowRules.grant('rawFish',fish.kind==='pike'?2:1);fish.ready=s.seconds+300;learn(s,'fishing',1);m.fishing=undefined;}
 }
}
