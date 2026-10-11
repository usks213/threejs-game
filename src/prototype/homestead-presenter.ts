import {inventoryProtected} from './core/inventory';
import {CAMPAIGN_ITEMS,CAMPAIGN_MATERIALS} from './core/campaign';
import {FURNITURE,PROCESSING_RECIPES,STORAGE_CAPACITY,CROP_SECONDS,ANIMAL_SECONDS} from './core/homestead';
import type {HomesteadSystem,HomesteadContext} from './core/homestead';
import type {CampaignRow} from './campaign-ui';

export interface FurniturePresentation {context:(id:string)=>HomesteadContext;blocked:(id:string)=>boolean}

/** Read-only view model; every enabled operation is revalidated by HomesteadSystem. */
export function homesteadRows(home:HomesteadSystem,context:HomesteadContext,furnitureView?:FurniturePresentation,revision=0):CampaignRow[]{
 const rows:CampaignRow[]=[];
 const gateFor=(ctx:HomesteadContext)=>{const distance=Math.hypot(ctx.position.x-ctx.basePosition.x,ctx.position.y-ctx.basePosition.y,ctx.position.z-ctx.basePosition.z);return !ctx.baseActive?'先に拠点の炉を灯してください。':!Number.isFinite(distance)||distance>4?'拠点の4m以内で操作してください。':'';};
 const gate=gateFor(context);
 const materialName=(id:string|number)=>CAMPAIGN_MATERIALS[Number(id)]?.label??String(id);
 const costText=(materials:Record<number,number>,items:Record<string,number>={})=>[...Object.entries(materials).map(([id,n])=>`${materialName(id)} ${n}`),...Object.entries(items).map(([id,n])=>`${CAMPAIGN_ITEMS[id]?.label??id} ${n}`)].join(' · ');
 const canPay=(materials:Record<number,number>,items:Record<string,number>={})=>Object.entries(materials).every(([id,n])=>(home.materials[Number(id)]??0)>=n)&&Object.entries(items).every(([id,n])=>(home.items[id]??0)>=n);
 const transfer=(id:string,label:string,held:number,stored:number,available:number,reason='')=>rows.push({id,label,detail:`所持 ${held} · 収納 ${stored} · 指定数を移します。制作は手持ちの材料だけを使います。`,reason:gate||reason,available:!(gate||reason),action:'homestead',transfer:{maxCount:Math.max(0,available),revision,stored:home.storedCount}});
 const add=(id:string,label:string,detail:string,reason='')=>rows.push({id,label,detail,reason:gate||reason,available:!(gate||reason),action:'homestead'});
 rows.push({id:'homestead-status',label:'灯守りの住まい',detail:`収納 ${home.storedCount}/${STORAGE_CAPACITY} · 快適度 ${home.comfort} · 休息時間 +${home.restBonusSeconds}秒${gate?' · '+gate:''}`});
 let total=0;
 for(const id of [4,3,2,6,7,10]){
  const held=home.materials[id]??0,stored=home.state.storage.materials[id]??0;total+=held;
  transfer(`deposit:${id}`,`${materialName(id)}を預ける`,held,stored,Math.min(held,STORAGE_CAPACITY-home.storedCount),held<1?'所持数が足りません。':home.storedCount>=STORAGE_CAPACITY?'収納がいっぱいです。':'');
  transfer(`withdraw:${id}`,`${materialName(id)}を取り出す`,held,stored,Math.min(stored,Math.max(0,999999-held)),stored<1?'収納にありません。':held>=999999?'所持上限です。':'');
 }
 for(const [id,item] of Object.entries(CAMPAIGN_ITEMS)){const held=home.items[id]??0,stored=home.state.storage.items[id]??0;if(!held&&!stored)continue;const protectedItem=inventoryProtected('item:'+id),reserved=home.reservedItemCount(id);if(protectedItem&&!stored)continue;
  if(!protectedItem)transfer(`deposit:item:${id}`,`${item.label}を預ける`,held,stored,Math.min(held,STORAGE_CAPACITY-home.storedCount),held<1?'所持数が足りません。':home.storedCount>=STORAGE_CAPACITY?'収納がいっぱいです。':'');
  if(!item.slot)transfer(`withdraw:item:${id}`,`${item.label}を取り出す`,held,stored,Math.min(Math.max(0,stored-reserved),Math.max(0,item.stackLimit-held)),stored<=reserved?reserved?'展示中の1個は展示台から取り出してください。':'収納にありません。':held>=item.stackLimit?'所持上限です。':'');
 }
 const matching=[...Object.entries(home.materials).filter(([id,n])=>n>0&&(home.state.storage.materials[Number(id)]??0)>0),...Object.entries(home.items).filter(([id,n])=>n>0&&(home.state.storage.items[id]??0)>0&&!inventoryProtected('item:'+id))].reduce((n,[,count])=>n+count,0);
 add('deposit-matching','収納と同じ素材・消耗品をまとめて預ける',`対象 ${matching}個 · 収納内にある種類だけ。装備・重要品を除く。`,matching<1?'同じ種類の品物がありません。':home.storedCount+matching>STORAGE_CAPACITY?'収納の空きが足りません。何も移しません。':'');
 add('deposit-all','素材をすべて預ける',`装備とクエスト品を除く素材 ${total}個`,total<1?'預ける素材がありません。':home.storedCount+total>STORAGE_CAPACITY?'収納の空きが足りません。':'');
 for(const recipe of PROCESSING_RECIPES){
  add(`process:${recipe.id}`,recipe.label,`${costText(recipe.materialCost,recipe.itemCost)} → ${costText(recipe.materialOutput,recipe.itemOutput)} · ${recipe.seconds}秒`,recipe.requiresArtisan&&!context.artisanRescued?'鍛冶師の救出が必要です。':home.state.jobs.length>=3?'加工は同時に3件までです。':!canPay(recipe.materialCost,recipe.itemCost)?'加工用の素材が足りません。':'');
 }
 for(const job of home.state.jobs){const recipe=PROCESSING_RECIPES.find(r=>r.id===job.recipe)!;const full=Object.entries(recipe.itemOutput).some(([id,n])=>(home.items[id]??0)+n>(CAMPAIGN_ITEMS[id]?.stackLimit??0))||Object.entries(recipe.materialOutput).some(([id,n])=>(home.materials[Number(id)]??0)+n>999999);
  add(`claim:${job.id}`,`${recipe.label}を受け取る`,job.remaining>0?`加工中 · あと${Math.ceil(job.remaining)}秒`:'加工完了',job.remaining>0?'加工が終わるまでお待ちください。':full?'持ち物の空きを作ってください。':'');
 }
 add('seed','薬草の種を2つ選別する',`草葉2・土1 → 種2 · 所持 ${home.items['herb-seed']??0}`,!canPay({7:2,2:1})?'草葉2・土1が必要です。':(home.items['herb-seed']??0)>198?'種の所持上限です。':'');
 for(const plot of home.state.plots){
  if(!plot.planted)add(`plant:${plot.id}`,`畑${plot.id+1}に種をまく`,`薬草の種1 · 育成${CROP_SECONDS}秒`,(home.items['herb-seed']??0)<1?'薬草の種が必要です。':'');
  else add(`harvest:${plot.id}`,`畑${plot.id+1}を収穫する`,plot.remaining>0?`育成中 · あと${Math.ceil(plot.remaining)}秒`:'薬草3・種2を収穫できます。',plot.remaining>0?'まだ収穫できません。':(home.items.herbs??0)>197||(home.items['herb-seed']??0)>198?'持ち物の空きを作ってください。':'');
 }
 const animal=home.state.animal,animalStatus=home.animalInteractionStatus(context),animalReason=animalStatus.ok?'':animalStatus.message;
 if(!animal.tamed)add('tame','山羊をなつかせる','草葉8 · 拠点でミルクを生産できるようになります。',animalReason||(!canPay({7:8})?'草葉8が必要です。':''));
 else if(animal.ready)add('animal','山羊のミルクを受け取る','ミルク1 · 食事として使用できます。',animalReason||((home.items.milk??0)>=20?'ミルクの所持上限です。':''));
 else add('feed','山羊に餌を与える',animal.remaining>0?`餌を食べています · あと${Math.ceil(animal.remaining)}秒`:`草葉2 · ${ANIMAL_SECONDS}秒後にミルク1`,animalReason||(animal.remaining>0?'搾乳できるまでお待ちください。':!canPay({7:2})?'草葉2が必要です。':''));
 for(const furniture of FURNITURE){const placed=home.state.furniture.includes(furniture.id);if(placed)rows.push({id:`furniture:${furniture.id}`,label:furniture.label+' · 設置済み',detail:`快適度 +${furniture.comfort} · 同じ種類は重複しません。`,completed:true});else{const reason=furnitureView?.blocked(furniture.id)?'住人や同行者などが設置場所にいます。通り過ぎるのを待ってください':gateFor(furnitureView?.context(furniture.id)??context)||(!canPay(furniture.cost)?'家具の素材が足りません。':'');rows.push({id:`furniture:${furniture.id}`,label:furniture.label+'を設置',detail:`${costText(furniture.cost)} · 快適度 +${furniture.comfort}`,reason,available:!reason,action:'homestead'});}}
 return rows;
}
