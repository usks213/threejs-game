import { meadowPanel, meadowStatus, foodStats, ENEMIES } from './meadows';
import { FOODS } from '../content/meadows/data';
import { BIOMES, BOSSES, BUILDINGS, ITEM_NAMES, RECIPES, SPELLS, WEAPONS } from '../content/catalog';
import type { AdventureSnapshot, GameAction } from '../game/types';
import { journeyGoal } from '../game/journey';
import { itemIcon } from './icons/item';
export function adventureUI(signal:AbortSignal,action:(action:GameAction,id?:string)=>void,selectBuilding:(id:string)=>void){
 const hud=document.querySelector<HTMLElement>('#adventure-hud')!,panel=document.querySelector<HTMLElement>('#adventure-panel')!,content=document.querySelector<HTMLElement>('#adventure-content')!,goal=document.querySelector<HTMLButtonElement>('#journey')!;
 let chestId:number|undefined;let selectedSlot=0,moveFrom:number|null=null,mapRange=80,lastMarkup='';
 let latest:AdventureSnapshot|null=null,tab='bag',signature='',player={x:0,y:0,z:0},goalTab='craft';
 const open=(next=tab)=>{tab=next;panel.hidden=false;signature='';render();};
 const btn=(name:string,kind:string,id='',disabled=false)=>`<button type="button" data-game-action="${kind}" data-id="${id}" ${disabled?'disabled':''}>${name}</button>`;
 const costs=(cost:Record<string,number>)=>Object.entries(cost).map(([id,n])=>{const have=latest?.inventory[id]??0;return `<span class="cost ${have>=n?'ready':'missing'}">${itemIcon(id)}${ITEM_NAMES[id]} ${have}/${n}</span>`;}).join('');
 const enough=(cost:Record<string,number>)=>Object.entries(cost).every(([id,n])=>(latest?.inventory[id]??0)>=n);
 const station=()=>latest?.buildings.some(b=>b.definition==='bench'&&Math.hypot(b.x-player.x,b.z-player.z)<5);
 function render(){
  const s=latest;if(!s||panel.hidden)return;if(document.activeElement instanceof HTMLInputElement&&content.contains(document.activeElement))return;
  const next=tab+selectedSlot+':'+moveFrom+':'+mapRange+JSON.stringify([chestId,s.buildings.map(b=>[b.id,b.contents]),s.inventory,s.equipment,s.unlocked,s.defeated,station(),s.meadows?[Math.floor(s.seconds),s.meadows.slots,s.meadows.gear,s.meadows.quality]:0]);if(next===signature)return;signature=next;
  for(const b of panel.querySelectorAll<HTMLButtonElement>('[data-tab]'))b.setAttribute('aria-selected',String(b.dataset.tab===tab));
  if(s.meadows){const markup=meadowPanel(s,player,tab,selectedSlot,moveFrom!==null,mapRange,chestId);if(markup!==lastMarkup){content.innerHTML=markup;lastMarkup=markup;}return;}
  if(tab==='bag')content.innerHTML=`<div class="panel-intro"><span>装備：${ITEM_NAMES[s.equipment]??'素手'}</span><span>${s.inventory.armor?'革鎧を装備':'防具なし'}</span></div><div class="inventory-grid">${Object.entries(s.inventory).filter(([,n])=>n>0).map(([id,n])=>`<div class="item-slot ${s.equipment===id?'equipped':''}">${itemIcon(id)}<strong>${ITEM_NAMES[id]}</strong> <span>×${n}</span>${WEAPONS[id]?btn(s.equipment===id?'装備中':'装備する','equip',id,s.equipment===id):''}</div>`).join('')}</div><div class="panel-actions">${btn('食べる','eat','',!(s.inventory.berry||s.inventory.stew))}${btn('箱へ預ける／取り出す','chest')}</div><p class="muted">食事で体力が回復し、しばらく自然回復が続きます。倒れた時は墓標から素材を回収できます。</p>`;
  if(tab==='craft')content.innerHTML=`<div class="panel-intro">${station()?'作業台の範囲内':'手作業で制作 · 高度な装備には作業台が必要'}</div><div class="recipe-grid">${RECIPES.filter(r=>r.tier<=s.unlocked).map(r=>{const w=WEAPONS[r.id],can=enough(r.cost)&&(!r.station||station());return `<article class="recipe-card"><div class="card-title">${itemIcon(r.id)}<div><strong>${r.name}</strong><small>${w?`攻撃 ${w.damage} · 間合い ${w.reach}m`:r.id==='armor'?'受けるダメージを軽減':'回復と探索の備え'}</small></div></div><div class="costs">${costs(r.cost)}</div>${btn(r.station&&!station()?'作業台が必要':enough(r.cost)?'制作':'素材不足','craft',r.id,!can)}</article>`;}).join('')}</div>`;
  if(tab==='build')content.innerHTML=`<p class="muted">部品を選ぶ → 緑のプレビューを狙う → 設置。回転ボタンで向きを変更。赤は素材・場所を確認。</p><div class="recipe-grid">${BUILDINGS.map(b=>`<article class="recipe-card"><div class="card-title">${itemIcon(b.id)}<div><strong>${b.name}</strong><small>${b.size[0]} × ${b.size[2]}m · ${b.station?'高度な制作を解放':'支持のある地面・部品に接続'}</small></div></div><div class="costs">${costs(b.cost)}</div>${btn('配置する','place',b.id)}</article>`).join('')}</div><div class="panel-actions">${btn('近くの建物を解体','remove')}${btn('寝床と焚き火で休む','rest')}${btn('転移門を使う','portal')}</div>`;
  if(tab==='magic')content.innerHTML=`<p>杖・魔導書を制作して魔法を解放。</p><div class="recipe-grid">${SPELLS.map(sp=>`<article class="recipe-card"><div class="card-title">${itemIcon('staff')}<div><strong>${sp.name}</strong><small>魔力 ${sp.mana} · ${sp.damage?`威力 ${sp.damage}`:'体力を回復'}</small></div></div>${btn('使う','spell',sp.id,!s.inventory.staff&&!s.inventory.book)}</article>`).join('')}</div>`;
  if(tab==='world')content.innerHTML=`<div class="panel-intro">${s.objective}</div><div class="world-map" role="img" aria-label="五つの地域と現在地">${BIOMES.map(b=>`<span class="map-biome ${b.id===s.biome?'current':''}" style="left:${(b.center.x+130)/260*100}%;top:${(130-b.center.z)/220*100}%">${b.tier<=s.unlocked?'◆':'◇'}<small>${b.name}</small></span>`).join('')}<span class="map-player" style="left:${Math.max(3,Math.min(97,(player.x+130)/260*100))}%;top:${Math.max(3,Math.min(97,(130-player.z)/220*100))}%">▲</span></div><div class="region-cards">${BIOMES.map(b=>{const boss=BOSSES.find(v=>v.id===b.boss)!;return `<article class="recipe-card"><div class="card-title">${itemIcon('map')}<div><strong>${b.name}</strong><small>Tier ${b.tier} · ${boss.name} ${s.defeated.includes(b.boss)?'攻略済み':''}</small></div></div>${btn(b.tier<=s.unlocked?'地域へ移動':'未解放','travel',b.id,b.tier>s.unlocked)}</article>`;}).join('')}</div><article class="recipe-card"><strong>祭壇の供物</strong><div class="costs">${costs(BOSSES.find(b=>b.id===BIOMES.find(v=>v.id===s.biome)!.boss)!.summon)}</div>${btn('祭壇でボス召喚','summon')}</article>`;
 }
 document.querySelector('#adventure-menu')!.addEventListener('click',()=>{if(panel.hidden)open();else panel.hidden=true;},{signal});
 document.querySelector('#adventure-close')!.addEventListener('click',()=>panel.hidden=true,{signal});
 goal.addEventListener('click',()=>open(goalTab),{signal});
 panel.addEventListener('click',event=>{const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
 if(b.dataset.slot!==undefined){const index=Number(b.dataset.slot);if(moveFrom!==null){action('move',moveFrom+':'+index);moveFrom=null;}selectedSlot=index;signature='';render();return;}
 if(b.hasAttribute('data-layout-move')){moveFrom=selectedSlot;signature='';render();return;}
 if(b.dataset.mapZoom){mapRange=Number(b.dataset.mapZoom);signature='';render();return;}
 if(b.dataset.quantityAction){const value=(content.querySelector('#item-quantity') as HTMLInputElement)?.value??'1';action(b.dataset.quantityAction as GameAction,b.dataset.id+':'+value);return;}
 if(b.dataset.customAction){const value=(document.getElementById(b.dataset.field!) as HTMLInputElement)?.value??'';action(b.dataset.customAction as GameAction,value);return;}
 if(b.dataset.gameAction==='tool'){document.querySelector<HTMLButtonElement>(`[data-tool="${b.dataset.id}"]`)?.click();panel.hidden=true;return;}if(b.dataset.tab)open(b.dataset.tab);if(b.dataset.gameAction==='place'){selectBuilding(b.dataset.id!);panel.hidden=true;}else if(b.dataset.gameAction){action(b.dataset.gameAction as GameAction,b.dataset.id);if(['spell','travel'].includes(b.dataset.gameAction))panel.hidden=true;}},{signal});
 let lastHealth:number|undefined,hurtTimer:ReturnType<typeof setTimeout>|undefined;
 signal.addEventListener('abort',()=>clearTimeout(hurtTimer),{once:true});
 return {open,openContext(next:string,id:string){chestId=id.startsWith('b:')?Number(id.slice(2)):undefined;open(next);},update(s:AdventureSnapshot,p:{x:number;y?:number;z:number},yaw=0){
  latest=s;player={...p,y:p.y??0};const weather:Record<string,string>={clear:'晴れ',cloud:'曇り',rain:'雨',storm:'雷雨',snow:'雪',fog:'霧',magic:'魔力嵐'},biome=BIOMES.find(b=>b.id===s.biome)!;
  const bar=(kind:string,label:string,value:number,max:number)=>`<div class="vital ${kind}" aria-label="${label} ${Math.ceil(value)}"><span class="vital-fill" style="width:${Math.max(0,Math.min(100,value/max*100))}%"></span><span>${label} ${Math.ceil(value)}</span></div>`;
  hud.innerHTML=`<div class="region-line">${biome.name} · DAY ${s.environment.day} <b>${Math.floor(s.environment.hour).toString().padStart(2,'0')}:${Math.floor(s.environment.hour%1*60).toString().padStart(2,'0')}</b> ${weather[s.environment.weather]}</div><div class="vitals">${bar('health','HP',s.health,foodStats(s).health)}${bar('stamina','スタミナ',s.stamina,foodStats(s).stamina)}${s.meadows?'':bar('mana','魔力',s.mana,70)}</div><small>${ITEM_NAMES[s.equipment]??'素手'}${s.guarding?' · ガード':''}${s.food>0?' · 食事':''}${s.rested>0?' · 休息':''}${s.wet?' · 水中':''}${s.meadows?' · '+meadowStatus(s):''}</small>${s.meadows?'<div class=food-hud>'+Array.from({length:3},(_,i)=>{const f=s.meadows!.foods[i];return '<span>'+ (f?ITEM_NAMES[f.id]:'空腹')+'</span>';}).join('')+'</div>':''}`;
  const mission=journeyGoal(s,player);goalTab=mission.tab;
  const distance=mission.target?Math.round(Math.hypot(mission.target.x-p.x,mission.target.z-p.z)):0;
  goal.innerHTML=`<span class="goal-kicker">JOURNEY ${mission.target?`· ${distance}m`:''}</span><strong>${mission.title}</strong><small>${mission.detail}</small><i style="width:${mission.progress*100}%"></i>`;
  const bearing=mission.target?Math.atan2(mission.target.x-p.x,mission.target.z-p.z)-(yaw+Math.PI):0;
  document.querySelector('#compass')!.innerHTML=`<span>${['北','北西','西','南西','南','南東','東','北東'][((Math.round(yaw/(Math.PI/4))%8)+8)%8]}</span>${mission.target?`<b style="transform:rotate(${-bearing}rad)">↑</b>`:''}`;
  const nearest=s.resources.filter(n=>n.ready<=s.seconds).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  const gather=document.querySelector<HTMLButtonElement>('#gather')!;const ready=nearest&&Math.hypot(nearest.x-p.x,nearest.z-p.z)<3;
  gather.classList.toggle('available',!!ready);gather.innerHTML=`${itemIcon(ready?nearest.kind:'wood')}<span>${ready?ITEM_NAMES[nearest.kind]:'採集'}</span>`;gather.setAttribute('aria-label','採集');
  const enemy=s.enemies.filter(e=>e.health>0&&Math.hypot(e.x-p.x,e.z-p.z)<12).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0],enemyHud=document.querySelector<HTMLElement>('#enemy-focus')!;
  enemyHud.hidden=!enemy;if(enemy){const def=enemy.boss?BOSSES.find(b=>b.id===enemy.definition):undefined;enemyHud.textContent=enemy.windup>0?'⚠ 攻撃が来る — 回避':`${def?.name??ENEMIES.find(d=>d.id===enemy.definition)?.name??'敵'} · ${Math.ceil(enemy.health)} HP`;enemyHud.classList.toggle('danger',enemy.windup>0);}
  document.querySelector<HTMLButtonElement>('#quick-eat')!.disabled=!Object.keys(FOODS).some(id=>s.inventory[id]>0);
  document.querySelector('#sprint')!.setAttribute('aria-pressed',String(!!s.meadows?.sprinting));document.querySelector('#sneak')!.setAttribute('aria-pressed',String(!!s.meadows?.sneaking));
  document.querySelector('#guard')!.setAttribute('aria-pressed',String(s.guarding));
  if(lastHealth!==undefined&&s.health<lastHealth){document.querySelector('#app')!.classList.add('hurt');clearTimeout(hurtTimer);hurtTimer=setTimeout(()=>document.querySelector('#app')!.classList.remove('hurt'),350);}lastHealth=s.health;
  render();
 }};
}
