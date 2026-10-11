import {CAMPAIGN_ITEMS} from './core/campaign';
import {DISPLAY_ITEMS,type CollectibleDisplaySystem,type DisplayContext} from './core/collectible-display';
import type {CampaignRow} from './campaign-ui';

/** The same read-only status checks drive buttons and authoritative transactions. */
export function collectibleDisplayRows(display:CollectibleDisplaySystem,context:DisplayContext):CampaignRow[]{
 const rows:CampaignRow[]=[],s=display.state;
 const add=(id:string,label:string,detail:string,status:{ok:boolean;message:string})=>rows.push({id,label,detail,action:'homestead',available:status.ok,reason:status.ok?'':status.message});
 rows.push({id:'display-status',label:'記念展示台 · '+(s.built?(s.item?CAMPAIGN_ITEMS[s.item].label:'空の展示台'):'未設置'),detail:'炉の北東（−1, 2.5）に1台。実物を1つ収納して展示。装備の性能は展示中は働きません。進行に必要な鍵・地域の印は対象外。'});
 if(!s.built)add('display-build','記念展示台を設置','木材4・石3 · 空なら撤去して全額回収 · 保護家具のため採掘不可',display.buildStatus(context));
 else{
  if(s.item){const gear=s.gear?` · 耐久 ${Math.ceil(s.gear.durability)}/100 · 強化 +${s.gear.upgrade} · ジェム ${s.gear.socket?CAMPAIGN_ITEMS[s.gear.socket].label:'なし'}`:'';add('display-withdraw',CAMPAIGN_ITEMS[s.item].label+'を展示台から取り出す','収納内の同じ1個を持ち物へ戻します'+gear,display.withdrawStatus(context));}
  else{
   const owned=DISPLAY_ITEMS.filter(i=>(display.campaign.state.items[i.id]??0)>0);
   if(!owned.length)rows.push({id:'display-empty',label:'展示できる所持品がありません',detail:'採集して短剣や採集道具を制作、畑で薬草を育成、地域で特産品・記録・薄響の封章を発見して持ち帰ろう。'});
   for(const item of owned)add('display-deposit:'+item.id,item.label+'を1つ展示する',`所持 ${display.campaign.state.items[item.id]} · 収納の1枠を使用 · 展示は戦闘能力を加算しません`,display.depositStatus(item.id,context));
  }
  add('display-remove','空の展示台を撤去','木材4・石3を回収 · 先に展示品を取り出してください',display.removeStatus(context));
 }
 return rows;
}
