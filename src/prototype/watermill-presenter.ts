import type {CampaignRow} from './campaign-ui';
import {WATERMILL_SECONDS,type WatermillSystem,type WatermillContext} from './core/watermill';
export function watermillRows(m:WatermillSystem,context:WatermillContext):CampaignRow[]{
 const gate=m.interactionStatus(context),rows:CampaignRow[]=[],state=m.state,job=state.job,intact=m.frameIntact();
 const add=(id:string,label:string,detail:string,reason='')=>rows.push({id,label,detail,reason:!gate.ok?gate.message:reason,available:gate.ok&&!reason,action:'homestead'});
 rows.push({id:'watermill-status',label:'東の水槽 · 水車の織機',detail:`地下聖堂の水門レバー脇（東側）。草葉6 → 布2 / 実動力${WATERMILL_SECONDS}秒。局所の落水のみで動き、静水・満水・羽根の障害物では停止。${state.built?`流量 ${(m.flow*1000).toFixed(1)} L/秒 · ${m.blockedReason||'水流で回転中'}`:'木材8・石4・金属2で固定位置に組み立てる。'} 加工中断では投入素材を保持。解体返却なし。`});
 if(!state.built)add('watermill-build','水車の織機を組み立てる','木材8・石4・金属2。水門レバー脇の地面と羽根の空間が必要。');
 else if(!intact)add('watermill-repair','水車の織機を修理する','木材4・石2。加工中の素材と進み具合は保持。');
 else add('watermill-start','水車に草葉を投入する',`草葉6 → 布2 / 定格流量で${WATERMILL_SECONDS}秒。隣の水門レバーを開いて放水。`,job?'先に現在の布を受け取ってください。':(m.materials[7]??0)<6?'草葉6が必要です。':'');
 if(job)add('watermill-claim:'+job.id,'水車の布2を受け取る',job.remaining===0?'完成 · 布2を受け取れます':`${m.blockedReason?'停止':'加工中'} · 残り実動力 ${job.remaining.toFixed(1)}秒`,job.remaining>0?m.blockedReason||'加工中です。':(m.materials[10]??0)>999997?'布の所持上限です。':'');
 return rows;
}
