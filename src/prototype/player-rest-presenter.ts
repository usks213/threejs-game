import type {CoreSimulation} from './core/simulation';
import {PLAYER_BED,playerBedIntact} from './core/player-rest';
import type {CampaignRow} from './campaign-ui';

export function playerRestRows(sim:CoreSimulation,multiplayer=false):CampaignRow[]{
 const waiting=sim.bedWait.snapshot(),status=sim.playerRestStatus(multiplayer),hour=String(Math.floor(sim.worldHour)).padStart(2,'0'),minute=String(Math.floor(sim.worldHour%1*60)).padStart(2,'0');
 const rows:CampaignRow[]=[{id:'player-rest-status',label:'自分の寝台で時間を進める',detail:`${sim.worldDay+1}日目 ${hour}:${minute} · 単独プレイ専用。炉の東の屋根付き寝台で休息します。作物・加工・天候・敵・食事時間も進みます。終了時の休息は${180+sim.home.restBonusSeconds}秒。`}];
 if(waiting.active){rows.push({id:'player-rest:cancel',label:'休息を中断する',detail:`${waiting.target==='dawn'?'朝6時':'夕方18時'}まであと${Math.ceil(waiting.remaining)}ゲーム秒。経過済みの時間は戻りません。`,available:true,action:'homestead'});return rows;}
 for(const [target,label] of [['dawn','朝6時まで休息'],['dusk','夕方18時まで休息']])rows.push({id:'player-rest:'+target,label,detail:'自分用寝台・点火済みの炉・屋根・安全な場所が必要です。',available:status.ok,reason:status.ok?'':status.message,action:'homestead'});
 if(sim.home.state.furniture.includes(PLAYER_BED)&&!playerBedIntact(sim.arena.field))rows.push({id:'player-bed-repair',label:'自分用寝台と屋根を修理する',detail:'木材6・布2。設置場所から離れて修理してください。',available:!multiplayer,reason:multiplayer?'協力部屋から退出してください。':'',action:'homestead'});
 return rows;
}
