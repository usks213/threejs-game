import {CAMPAIGN_ITEMS,CAMPAIGN_MATERIALS} from './core/campaign';
import {FURNITURE,PROCESSING_RECIPES,STORAGE_CAPACITY,CROP_SECONDS,ANIMAL_SECONDS} from './core/homestead';
import type {HomesteadSystem,HomesteadContext} from './core/homestead';
import type {CampaignRow} from './campaign-ui';

/** Read-only view model; every enabled operation is revalidated by HomesteadSystem. */
export function homesteadRows(home:HomesteadSystem,context:HomesteadContext):CampaignRow[]{
 const rows:CampaignRow[]=[];
 const distance=Math.hypot(context.position.x-context.basePosition.x,context.position.y-context.basePosition.y,context.position.z-context.basePosition.z);
 const gate=!context.baseActive?'先に拠点の炉を灯してください。':!Number.isFinite(distance)||distance>4?'拠点の4m以内で操作してください。':'';
 const materialName=(id:string|number)=>CAMPAIGN_MATERIALS[Number(id)]?.label??String(id);
 const costText=(materials:Record<number,number>,items:Record<string,number>={})=>[...Object.entries(materials).map(([id,n])=>`${materialName(id)} ${n}`),...Object.entries(items).map(([id,n])=>`${CAMPAIGN_ITEMS[id]?.label??id} ${n}`)].join(' · ');
 const canPay=(materials:Record<number,number>,items:Record<string,number>={})=>Object.entries(materials).every(([id,n])=>(home.materials[Number(id)]??0)>=n)&&Object.entries(items).every(([id,n])=>(home.items[id]??0)>=n);
 const add=(id:string,label:string,detail:string,reason='')=>rows.push({id,label,detail,reason:gate||reason,available:!(gate||reason),action:'homestead'});
 rows.push({id:'homestead-status',label:'灯守りの住まい',detail:`収納 ${home.storedCount}/${STORAGE_CAPACITY} · 快適度 ${home.comfort} · 休息時間 +${home.restBonusSeconds}秒${gate?' · '+gate:''}`});
 let total=0;
 for(const id of [4,3,2,6,7,10]){
  const held=home.materials[id]??0,stored=home.state.storage.materials[id]??0;total+=held;
  add(`deposit:${id}`,`${materialName(id)}を1つ預ける`,`所持 ${held} · 収納 ${stored}`,held<1?'所持数が足りません。':home.storedCount>=STORAGE_CAPACITY?'収納がいっぱいです。':'');
  add(`withdraw:${id}`,`${materialName(id)}を1つ取り出す`,`所持 ${held} · 収納 ${stored}`,stored<1?'収納にありません。':held>=999999?'所持上限です。':'');
 }
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
 for(const furniture of FURNITURE){const placed=home.state.furniture.includes(furniture.id);if(placed)rows.push({id:`furniture:${furniture.id}`,label:furniture.label+' · 設置済み',detail:`快適度 +${furniture.comfort} · 同じ種類は重複しません。`,completed:true});else add(`furniture:${furniture.id}`,furniture.label+'を設置',`${costText(furniture.cost)} · 快適度 +${furniture.comfort}`,!canPay(furniture.cost)?'家具の素材が足りません。':'');}
 return rows;
}
