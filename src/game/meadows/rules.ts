import {isEquipment} from '../equipment/items';
import {chartNearby} from '../charted-map';
import {assertInteractionReach} from '../interaction/reach';
import {assertBuildingAccess} from '../building-permissions';
import {foodEffect} from '../../content/adventure-food';
import {adventureEnvironment} from '../../environment/adventure';
import { dropItem, pickupItem,dropOwnedItem } from '../interaction/drops';
import { stepRaids } from './raids';
import { landscape } from './landscaping';
import { meadowRecipe,MAX_QUALITY,upgradeCost } from '../../content/meadows/recipes';
import { stepVillage } from './village';
import { fishingAction,stepFishing } from './fishing';
import { changeLayout, reconcileSlots } from './inventory-layout';
import { chopWood, stepForestry } from './forestry';
import { canCarry, occupiedSlots, stackSize } from './inventory';
import { nearestFacility, stepFacilities, waterHeight } from './facilities';
import type { Adventure } from '../adventure';
import type { GameAction } from '../types';
import type { Vec3 } from '../../world/types';
import { ARMOR, COOKING, FOODS, ITEM_WEIGHT, MEADOW_CRAFT_IDS, TREE_KINDS, LOOT } from '../../content/meadows/data';
import { BOSSES, ITEM_NAMES, RECIPES, WEAPONS } from '../../content/catalog';
import { armorValue, benchLevel, foodStats, learn, maxDurability, roofed, weight } from './state';
import { environmentAt } from '../../environment/time';
import { meadowEnemy } from './world';
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
export class MeadowRules{
 constructor(private readonly game:Adventure){}
 private get s(){return this.game.state;}private get m(){return this.s.meadows!;}private get sim(){return this.game.sim;}
 grant(id:string,n:number){if(!canCarry(this.s.inventory,id,n,this.m)){const p=this.sim.player;dropItem(this.game,id,n,{x:p.x+1,y:p.y,z:p.z});return;}if(isEquipment(id)){this.game.gear.craft(id,n,this.s.inventory);return;}this.s.inventory[id]=(this.s.inventory[id]??0)+n;if(!this.m.discovered.includes(id))this.m.discovered.push(id);}
 private spend(cost:Record<string,number>){for(const [id,n]of Object.entries(cost))if((this.s.inventory[id]??0)<n)throw new Error(`${ITEM_NAMES[id]??id}が${n}個必要です`);for(const [id,n]of Object.entries(cost))this.s.inventory[id]-=n;}
 private merchantAccess(){const n=this.s.resources.find(n=>n.kind==='merchant'&&distance(n,this.sim.player)<4);if(!n)throw new Error('旅商人へ近づいてください');if(this.sim.world.generator===4)assertInteractionReach(this.s,this.sim.player,'r:'+n.id,{x:n.x,y:n.y+.8,z:n.z},point=>this.sim.world.density(point));}
 private station(){const level=benchLevel(this.sim.player,this.s.buildings);if(!level)throw new Error('作業台の近くで使ってください');const b=this.s.buildings.find(b=>b.definition==='bench'&&distance(b,this.sim.player)<5)!;if(!roofed(b,this.s.buildings))throw new Error('作業台を屋根で覆ってください');return level;}
 wear(id:string,n=1){this.game.gear.wear(id,n);}
 action(action:GameAction,id:string,ground:Vec3):{dirty:string[];message:string}|undefined{
 const s=this.s,m=this.m,p=this.sim.player,ok=(message:string)=>({dirty:[] as string[],message});
 if(action==='landscape')return landscape(this.game,id,ground);
 if(action==='split'||action==='move'){changeLayout(m,s.inventory,action,id);return ok(action==='split'?'持ち物を半分に分けました':'持ち物を移動しました');}
 if(action==='pin'){m.pins??=[];if(m.pins.length>=100)throw new Error('地図の目印を削除してください');m.pins.push({id:this.sim.allocateEntityId(),x:p.x,z:p.z,...(this.sim.world.generator===4?{y:p.y}:{}),label:(id||'目印').slice(0,24)});return ok('現在地を地図に記録しました');}
 if(action==='unpin'){m.pins=m.pins?.filter(pin=>pin.id!==Number(id));return ok('目印を削除しました');}
 if(action==='label'){const b=nearestFacility(this.game,['sign']);if(!b)throw new Error('看板へ近づいてください');assertBuildingAccess(this.game,b,'withdraw');b.label=id.slice(0,40);return ok('看板を書き換えました');}
 if(action==='store'||action==='take'){const [box,selection]=id.includes('|')?id.split('|'):['',id];id=selection;const b=box?s.buildings.find(b=>b.id===Number(box)&&b.definition==='chest'&&distance(b,p)<3.5):nearestFacility(this.game,['chest']);if(!b)throw new Error('箱へ近づいてください');assertBuildingAccess(this.game,b,action==='take'?'withdraw':'cooperate');if(id.startsWith('gear:')||isEquipment(id.split(':')[0])){this.game.gear.transferBuilding(b,id,action);return ok('装備を個体のまま移しました');}const [key,raw]=id.split(':'),source=action==='store'?s.inventory:b.contents,n=Math.min(source[key]??0,Math.max(1,Math.floor(Number(raw)||1)));if(!n)throw new Error('移動する品物がありません');if(action==='store'&&occupiedSlots({...b.contents,[key]:(b.contents[key]??0)+n})>10)throw new Error('箱の10枠がいっぱいです');if(action==='take'&&!canCarry(s.inventory,key,n,m))throw new Error('持ち物に空きがありません');source[key]-=n;if(action==='store')b.contents[key]=(b.contents[key]??0)+n;else this.grant(key,n);return ok('品物を移しました');}
 if(action==='sprint'){m.sprinting=id==='on'?true:id==='off'?false:!m.sprinting;m.sneaking=false;return ok(m.sprinting?'走る':'歩く');}
 if(action==='sneak'){m.sneaking=!m.sneaking;m.sprinting=false;return ok(m.sneaking?'忍び足':'歩く');}
 if(action==='fish')return ok(fishingAction(this.game));
 if(action==='sell'){this.merchantAccess();const price:Record<string,number>={amber:5,amberPearl:10,ruby:20,silverNecklace:30};let coins=0;for(const [key,value]of Object.entries(price)){coins+=(s.inventory[key]??0)*value;s.inventory[key]=0;}if(!coins)throw new Error('売れる琥珀や宝石がありません');this.grant('coins',coins);return ok(`遺物を売却 · ${coins}硬貨`);}
 if(action==='trade'){
  this.merchantAccess();
  const prices:Record<string,number>={fishingRod:350,bait:10,linenHat:100};if(!Object.hasOwn(prices,id))throw new Error('商品を選んでください');if(isEquipment(id)){if((s.inventory.coins??0)<prices[id])throw Error('硬貨が足りません');this.game.gear.craft(id,1,{...s.inventory,coins:s.inventory.coins-prices[id]});}else{this.spend({coins:prices[id]});this.grant(id,id==='bait'?20:1);}return ok(`${ITEM_NAMES[id]}を購入`);
 }
 if(action==='repairBuilding'){if(!s.inventory.hammer)throw new Error('ハンマーが必要です');const b=id?s.buildings.find(b=>b.id===Number(id)&&distance(p,b)<4):s.buildings.filter(b=>distance(p,b)<4).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(!b)throw new Error('建物に近づいてください');assertBuildingAccess(this.game,b,'cooperate');b.health=100;b.removed=[];return ok('建物を修理しました');}
 if(action==='gather'){
  const grave=!id?m.graves?.find(g=>distance(g,p)<2.5):undefined;if(grave){this.game.gear.recover(grave);if(!Object.values(grave.items).some(n=>n>0))m.graves=m.graves!.filter(g=>g!==grave);m.corpseRun=50;return ok('前の墓標から持ち物を回収しました');}

  if((!id||id==='grave')&&s.death&&distance(p,s.death)<2.5){const holder={items:s.grave??{},gearItems:s.graveGear};this.game.gear.recover(holder);s.grave=holder.items;s.graveGear=holder.gearItems;if(!Object.values(s.grave).some(n=>n>0))s.death=null;m.corpseRun=50;s.stamina=foodStats(s).stamina;return ok('墓標から持ち物を回収しました');}
  const n=id?s.resources.find(n=>n.id===Number(id)&&n.ready<=s.seconds&&distance(p,n)<3.5):s.resources.filter(n=>n.ready<=s.seconds&&distance(p,n)<3).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(!n)throw new Error('拾えるものへ近づいてください');
  if(this.sim.world.generator===4)assertInteractionReach(s,p,'r:'+n.id,{x:n.x,y:n.y+.2,z:n.z},point=>this.sim.world.density(point));
  if(n.drop||isEquipment(n.kind)){const count=pickupItem(this.game,n.id);return ok(`${ITEM_NAMES[n.kind]} +${count}`);}
  if(['dolmen','stoneCircle','graveyard'].includes(n.kind))return ok('古い遺跡です。周囲を探し、地面を掘ると遺物が見つかることがあります');
  if(['perch','pike'].includes(n.kind)){const top=waterHeight(this.game,n.x,n.z);if(top!==null&&top-this.sim.groundAt(n.x,n.z)>.15)throw new Error('泳ぐ魚は釣り竿で釣ってください');this.grant('rawFish',n.kind==='pike'?2:1);n.ready=s.seconds+300;return ok('岸に打ち上がった魚を拾いました');}
  if(n.kind==='merchant')return ok('旅商人：釣り竿と餌を販売しています。野営タブから取引できます');
  if(n.kind==='runestone'){m.tutorial=Math.max(m.tutorial,1);return ok('旅の石碑：鹿の証を二つ集め、北の雷鹿の祭壇へ。肉は火で焼き、屋根の下で休め。');}
  if(n.kind==='sacrifice')return this.action('offer','',ground);
  if(n.kind==='altar')return this.action('summon','',ground);
  if(n.kind==='sapling'){this.grant('wood',2);n.ready=1e10;n.growth=undefined;return ok('若木から木材を回収しました');}
  if(TREE_KINDS.has(n.kind)||n.kind==='fallenLog'||n.kind==='stump'){
   if(!['axe','flintAxe'].includes(s.equipment))throw new Error('木は斧を装備して伐採します');
   if(TREE_KINDS.has(n.kind)&&n.kind!=='beech')throw new Error('この硬い木には青銅以上の斧が必要です');
   if(m.durability[s.equipment]===0)throw new Error('斧が壊れています。屋根のある作業台で修理してください');
   if(s.stamina<6)throw new Error('スタミナが足りません');this.game.gear.prepareUse(s.equipment);s.stamina-=6;this.wear(s.equipment);learn(s,'woodcutting',.2);
   return ok(chopWood(this.game,n));
  }
  if(n.kind==='bodyPile'){if(s.stamina<8)throw new Error('スタミナが足りません');s.stamina-=8;n.health=(n.health??100)-(WEAPONS[s.equipment]?.damage??7);if(n.health<=0){n.ready=1e10;this.grant('bone',3);return ok('亡者の巣を破壊しました。ここからは出現しません');}return ok('巣を攻撃 · 残り '+Math.ceil(n.health));}
  if(n.kind==='beeNest'){
   if(s.equipment==='hands')throw new Error('蜂の巣は道具で壊してください');this.game.hurtPlayer(3,'poison');this.grant('queenBee',1);this.grant('honey',2);n.ready=1e10;return ok('女王蜂と蜂蜜を回収。蜂箱を作れます');
  }
  if(n.kind==='lootChest'||n.kind==='buriedChest'){
   if(n.kind==='buriedChest'&&this.sim.world.density({x:n.x,y:n.y-.8,z:n.z})<0)throw new Error('箱は地中です。足元を掘ってください');
   this.grant('coins',n.kind==='lootChest'?10:30);this.grant(n.kind==='lootChest'?'amber':'ruby',1);if(n.kind==='buriedChest'){this.grant('amberPearl',2);this.grant('silverNecklace',1);this.grant('fireArrow',10);}this.grant('bone',3);this.grant('feathers',3);this.grant('flintArrow',10);n.ready=1e10;return ok('遺物と矢を回収しました');
  }
  const item=n.kind==='branch'?'wood':n.kind;
  if(!canCarry(s.inventory,item,n.amount,m))throw new Error('荷物が重すぎます。箱に預けるか持ち物を落としてください');
  this.grant(item,n.amount);n.ready=['berry','mushroom','dandelion'].includes(n.kind)?s.seconds+300:1e10;return ok(`${ITEM_NAMES[item]} +${n.amount}`);
 }
 if(action==='build'){if(id==='raft'&&waterHeight(this.game,ground.x,ground.z)===null)throw new Error('いかだは水の上に設置してください');if(!s.inventory.hammer)throw new Error('建築にはハンマーを制作してください');return undefined;}
 if(action==='craft'){
  if(!MEADOW_CRAFT_IDS.has(id))throw new Error('この装備は草原の制作対象ではありません');
  const r=meadowRecipe(RECIPES.find(r=>r.id===id)!);if(r.station||id==='shield')this.station();
  if(isEquipment(r.output)){const inventory={...s.inventory};for(const[k,n]of Object.entries(r.cost)){if((inventory[k]??0)<n)throw Error('制作の素材が足りません');inventory[k]-=n;}this.game.gear.craft(r.output,r.amount,inventory);}else{this.spend(r.cost);this.grant(r.output,r.amount);}
  if(WEAPONS[id]&&!['hammer','hoe'].includes(id)&&s.inventory[id])s.equipment=id;if(ARMOR[id]&&s.inventory[id])m.gear[ARMOR[id].slot]=id;if(['shield','towerShield'].includes(id)&&s.inventory[id])m.gear.offhand=id;
  return ok(`${r.name}を作りました`);
 }
 if(action==='equip'&&['shield','towerShield'].includes(id)){if(!s.inventory[id])throw new Error('持っていません');m.gear.offhand=id;return ok(`${ITEM_NAMES[id]}を構えました`);}
 if(action==='equip'&&ARMOR[id]){if(!s.inventory[id])throw new Error('持っていません');m.gear[ARMOR[id].slot]=id;return ok(`${ITEM_NAMES[id]}を装備`);}
 if(action==='eat'){
  const selected=id||Object.keys(FOODS).filter(k=>s.inventory[k]>0&&!m.foods.some(f=>f.id===k)).sort((a,b)=>FOODS[b].health+FOODS[b].stamina-FOODS[a].health-FOODS[a].stamina)[0];
  if(!selected||!FOODS[selected])throw new Error('食べられる料理や木の実がありません');
  const active=m.foods.find(f=>f.id===selected);if(active&&active.remaining>FOODS[selected].seconds/2)throw new Error('同じ食べ物は効果が半分以下になってから食べ直せます');
  if(!active&&m.foods.length>=3)throw new Error('食事は異なる3種類までです');
  this.spend({[selected]:1});if(active)active.remaining=FOODS[selected].seconds;else m.foods.push({id:selected,remaining:FOODS[selected].seconds});s.food=Math.max(...m.foods.map(f=>f.remaining));if(selected==='dawnSoup')s.health=Math.min(foodStats(s).health,s.health+15);return ok(`${ITEM_NAMES[selected]}を食べた · 最大HP/スタミナ上昇`);
 }
 if(action==='repair'){this.station();this.game.gear.repairAll();return ok('道具と装備をすべて修理しました');}
 if(action==='upgrade'){
  const level=this.station(),q=m.quality[id]??1,r=RECIPES.find(r=>r.id===id);if(!r||!s.inventory[id]||m.durability[id]===undefined)throw new Error('強化する道具や装備を選んでください');if(q>=(MAX_QUALITY[id]??4)||level<=q)throw new Error('切り株・皮なめし台で作業台のレベルを上げてください');
  const cost=upgradeCost(id,q);if(!cost)throw new Error('この品物は強化できません');const inventory={...s.inventory};for(const[k,n]of Object.entries(cost)){if((inventory[k]??0)<n)throw Error('強化の素材が足りません');inventory[k]-=n;}this.game.gear.edit(id,lot=>{lot.quality=q+1;lot.durability=maxDurability(id,q+1);},inventory);return ok(`${r.name}を品質 ${q+1}へ強化`);
 }
 if(action==='cook'){
  const [facility,recipe]=id.includes('|')?id.split('|'):['',id];id=recipe;const b=s.buildings.find(b=>b.definition==='cook'&&(!facility||b.id===Number(facility))&&distance(p,b)<3.5);if(!b)throw new Error('料理台に近づいてください');
  assertBuildingAccess(this.game,b,'cooperate');b.cooking??=[];const done=b.cooking.find(c=>c.time>=COOKING[c.id].seconds);
  if(done){assertBuildingAccess(this.game,b,'withdraw');this.grant(done.time>=COOKING[done.id].seconds*2?'coal':COOKING[done.id].output,1);b.cooking.splice(b.cooking.indexOf(done),1);return ok('料理を取り出しました');}
  if(!s.buildings.some(f=>f.definition==='fire'&&(f.fuel??0)>0&&distance(f,b)<2&&!f.open))throw new Error('料理台の下に火のついた焚き火が必要です');
  if(b.cooking.length>=2)throw new Error('料理中です。焼けるまで待ってください');const raw=id||Object.keys(COOKING).find(k=>s.inventory[k]>0);if(!raw||!COOKING[raw])throw new Error('生肉・尾・魚がありません');this.spend({[raw]:1});b.cooking.push({id:raw,time:0});return ok('肉を焼き始めました。放置すると炭になります');
 }
 if(action==='fuel'){const b=s.buildings.find(b=>['fire','standingTorch'].includes(b.definition)&&(!id||b.id===Number(id))&&distance(p,b)<3.5);if(!b)throw new Error('火へ近づいてください');assertBuildingAccess(this.game,b,'cooperate');this.spend({[b.definition==='fire'?'wood':'resin']:1});b.fuel=Math.min(3600,(b.fuel??0)+300);return ok('燃料を追加しました');}
 if(action==='interact'){
  if(!id&&(m.fishing||s.equipment==='fishingRod'))return ok(fishingAction(this.game));
  if(m.riding&&(!id||Number(id)===m.riding)){m.riding=undefined;p.x+=2.5;return ok('いかだから降りました');}
  const boat=id?s.buildings.find(b=>b.id===Number(id)&&b.definition==='raft'&&distance(b,p)<3.5):nearestFacility(this.game,['raft']);if(boat){m.riding=boat.id;return ok('いかだに乗りました。スティックで操舵、使うボタンで降ります');}

  const b=id?s.buildings.find(b=>b.id===Number(id)&&distance(p,b)<3.5):s.buildings.filter(b=>['door','gate','beehive','cook','bed'].includes(b.definition)&&distance(p,b)<3).sort((a,b)=>distance(p,a)-distance(p,b))[0];if(!b)throw new Error('扉・設備へ近づいてください');
  assertBuildingAccess(this.game,b,'cooperate');if(b.definition==='chest'||b.definition==='bench')return ok('');if(['fire','standingTorch'].includes(b.definition))return this.action('fuel',String(b.id),ground);if(b.definition==='cook')return this.action('cook',String(b.id)+'|',ground);if(b.definition==='bed')return this.action('rest',String(b.id),ground);
  if(b.definition==='beehive'){assertBuildingAccess(this.game,b,'withdraw');const n=b.contents.honey??0;if(!n)throw new Error('蜂蜜はまだできていません。空の開けた場所で待ちます');this.grant('honey',n);b.contents.honey=0;return ok(`蜂蜜 +${n}`);}
  b.open=!b.open;return ok(b.open?'扉を開きました':'扉を閉じました');
 }
 if(action==='rest'){
  const distance3D=(a:Vec3,b:Vec3)=>this.sim.world.generator===4?Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z):distance(a,b);
  const bed=s.buildings.find(b=>b.definition==='bed'&&(!id||b.id===Number(id))&&distance3D(p,b)<3.5);if(!bed)throw new Error('ベッドに近づいてください');assertBuildingAccess(this.game,bed,'cooperate');s.spawn={x:bed.x+1.5,y:bed.y+.5,z:bed.z};
  if(!roofed(bed,s.buildings))throw new Error('復活地点を設定しました。眠るにはベッドを屋根で覆ってください');
  if(!s.buildings.some(b=>b.definition==='fire'&&(b.fuel??0)>0&&!b.open&&distance3D(b,bed)<6))throw new Error('眠るには近くに火が必要です');
  if(s.enemies.some(e=>e.health>0&&(e.tame??0)<1&&!['deer','gull'].includes(e.definition)&&distance3D(e,bed)<12))throw new Error('近くに敵がいます');
  if(this.sim.world.generator===4){s.rested=480+m.comfort*60;s.health=foodStats(s).health;return ok('休息しました。ベッドが復帰地点です');}
  const hour=environmentAt(s.seconds).hour;if(hour>=6&&hour<18)return ok('復活地点を設定しました。夜になったら眠れます');
  s.rested=480+m.comfort*60;s.health=foodStats(s).health;s.seconds+=((7-environmentAt(s.seconds).hour+24)%24)/24*720;return ok('朝まで休みました。ベッドが復活地点です');
 }
 if(action==='summon'){
  const altar=s.resources.find(n=>n.kind==='altar'&&distance(n,p)<5);if(!altar)throw new Error('雷鹿の祭壇に近づいてください');if(s.enemies.some(e=>e.boss&&e.health>0))throw new Error('ボスは出現中です');this.spend({deerTrophy:2});
  const def=BOSSES.find(b=>b.id==='stormstag')!;s.enemies.push({id:this.sim.allocateEntityId(),definition:def.id,tier:1,x:altar.x,y:altar.y,z:altar.z-4,homeX:altar.x,homeZ:altar.z,health:def.health,cooldown:3,windup:0,slow:0,boss:true,attackKind:'antler'});return ok('雷角の主が現れた。角・雷撃・足踏みの予兆を見よ');
 }
 if(action==='offer'){if(!s.resources.some(n=>n.kind==='sacrifice'&&distance(n,p)<4))throw new Error('出発地点の供物石へ戻ってください');if(m.offered)return ok('奉納済みです。加護を発動できます');this.spend({stormTrophy:1});m.offered=true;return ok('雷鹿の証を奉納。加護を解放しました');}
 if(action==='power'){if(!m.offered)throw new Error('ボスの証を供物石に奉納してください');if(m.powerCooldown>0)throw new Error(`加護はあと ${Math.ceil(m.powerCooldown)} 秒`);m.power=300;m.powerCooldown=1200;return ok('雷鹿の加護 · 5分間、走行と跳躍の消費を軽減');}
 if(action==='feed'){const e=s.enemies.find(e=>e.definition==='boar'&&e.health>0&&distance(e,p)<5);if(!e)throw new Error('猪に近づいてください');const food=['berry','mushroom'].find(k=>s.inventory[k]>0);if(!food)throw new Error('木の実かキノコが必要です');this.spend({[food]:1});e.fed=300;e.tame??=0;return ok('餌を置きました。離れて猪を落ち着かせてください');}
 if(action==='drop'){const kind=dropOwnedItem(this.game,id,{x:p.x+Math.sin(p.heading),y:p.y+.4,z:p.z+Math.cos(p.heading)});return ok(`${ITEM_NAMES[kind]}を地面に置きました`);}
 if(action==='plant'){if(!s.inventory.cultivator)throw new Error('植樹には黒い森の金属で作る耕運具が必要です');const seed=id||'beechSeed',kind=({beechSeed:'beech',birchSeed:'birch',acorn:'oak'} as Record<string,string>)[seed];if(!kind)throw new Error('木の種を選んでください');if(s.resources.some(n=>TREE_KINDS.has(n.kind)&&distance(n,ground)<3))throw new Error('木から3m離してください');this.spend({[seed]:1});s.resources.push({id:this.sim.allocateEntityId(),kind:'sapling',growth:{kind,remaining:3000+(this.sim.tick%5001)},x:ground.x,y:this.sim.groundAt(ground.x,ground.z),z:ground.z,amount:1,ready:0});return ok('苗木を植えました');}
 if(action==='chest'){const b=s.buildings.find(b=>b.definition==='chest'&&distance(p,b)<3);if(!b)throw new Error('箱に近づいてください');assertBuildingAccess(this.game,b,Object.values(b.contents).some(n=>n>0)?'withdraw':'cooperate');if(Object.values(b.contents).some(n=>n>0)){const holder={items:b.contents,gearItems:b.gearItems};this.game.gear.recover(holder);b.contents=holder.items;b.gearItems=holder.gearItems;}else for(const [key,n]of Object.entries(s.inventory))if(!isEquipment(key)&&n){const size=stackSize(key),current=b.contents[key]??0,space=Math.max(0,10-occupiedSlots(b.contents))*size+(current%size?size-current%size:0),count=Math.min(n,space);if(count){b.contents[key]=current+count;s.inventory[key]-=count;}}return ok('箱の素材を出し入れしました');}
 return undefined;
 }
 damage(amount:number):number{const armor=armorValue(this.s);return armor<amount/2?amount-armor:amount*amount/(4*Math.max(1,armor));}
 loot(definition:string,stars=0,point:Vec3=this.sim.player){for(const [id,n]of Object.entries(LOOT[definition]??{resin:1}))dropItem(this.game,id,n*2**stars,point);this.m.kills=(this.m.kills??0)+1;let seed=Math.imul(this.m.kills,374761393);seed=Math.imul(seed^(seed>>>13),1274126177);const roll=((seed^(seed>>>16))>>>0)/4294967296;if(['boar','deer','neck'].includes(definition)&&roll<(definition==='deer'?.5:.15))dropItem(this.game,definition+'Trophy',1,point);}
 step(dt:number){
 const s=this.s,m=this.m,p=this.sim.player,env=this.sim.world.generator===4?adventureEnvironment(s.seconds,p):environmentAt(s.seconds,1);
 for(const f of m.foods)f.remaining=Math.max(0,f.remaining-dt);m.foods=m.foods.filter(f=>f.remaining>0);s.food=Math.max(0,...m.foods.map(f=>f.remaining));
 stepFishing(this.game,dt);reconcileSlots(m,s.inventory);m.mapCells??=[];if(this.sim.tick%15===0&&this.sim.world.generator===4)chartNearby(m,p);else if(this.sim.tick%15===0){const known=new Set(m.mapCells);for(let x=-3;x<=3;x++)for(let z=-3;z<=3;z++)if(x*x+z*z<=9)known.add((Math.floor(p.x/8)+x)+','+(Math.floor(p.z/8)+z));m.mapCells=[...known];}
 m.corpseRun=Math.max(0,(m.corpseRun??0)-dt);if(m.corpseRun&&s.health>0)s.health=Math.min(foodStats(s).health,s.health+dt*3);m.noSkillDrain=Math.max(0,(m.noSkillDrain??0)-dt);m.power=Math.max(0,m.power-dt);m.powerCooldown=Math.max(0,m.powerCooldown-dt);m.shelter=roofed(p,s.buildings);m.warmth=s.buildings.some(b=>b.definition==='fire'&&(b.fuel??0)>0&&!b.open&&distance(b,p)<6);m.cold=(env.daylight<.1||(env.temperature??20)<0)&&!m.warmth&&!foodEffect(s,'warmth');
 if(this.sim.fluid.immersion(p,1.45)>0.1||(!m.shelter&&['rain','storm'].includes(env.weather)))m.wet=120;else m.wet=Math.max(0,m.wet-dt*(m.warmth?10:1));
 m.comfort=(m.shelter?2:0)+(m.warmth?1:0)+(s.buildings.some(b=>b.definition==='bed'&&distance(b,p)<8)?1:0);m.weight=weight(s.inventory);
 const stats=foodStats(s);s.health=Math.min(s.health,stats.health);s.stamina=Math.min(s.stamina,stats.stamina);
 if(s.health>0)s.health=Math.min(stats.health,s.health+stats.healing*dt*(m.cold?.5:1));
 if(this.sim.world.generator===4&&(env.temperature??20)>40&&!foodEffect(s,'cooling')&&!m.wet&&this.sim.tick%30===0)this.game.hurtPlayer(1,'fire');
 const calm=m.shelter&&m.warmth&&!m.smoke&&!m.exerting&&!this.game.attack&&!s.enemies.some(e=>e.health>0&&(e.tame??0)<1&&!['deer','gull'].includes(e.definition)&&distance(e,p)<10);m.resting=calm?Math.min(20,(m.resting??0)+dt):0;if(m.resting>=20)s.rested=Math.max(s.rested,480+m.comfort*60);
 if(this.game.owner!=='host')return;
 stepFacilities(this.game,dt);stepForestry(this.game,dt);stepVillage(this.game,dt);
 for(const b of s.buildings){
  if(b.definition==='fire'||b.definition==='standingTorch'){b.fuel=Math.max(0,(b.fuel??120)-dt);b.open=this.sim.fluid.immersion(b,.4)>.2||(!roofed(b,s.buildings)&&['rain','storm'].includes(env.weather));}
  if(b.definition==='cook'&&s.buildings.some(f=>f.definition==='fire'&&(f.fuel??0)>0&&!f.open&&distance(f,b)<2))for(const c of b.cooking??[])c.time+=dt;
  if(b.definition==='beehive'&&!roofed(b,s.buildings)){b.progress=(b.progress??0)+dt;if(b.progress>=300){b.progress=0;b.contents.honey=Math.min(4,(b.contents.honey??0)+1);}}
 }
 for(const e of s.enemies)if(e.definition==='boar'&&e.health>0){e.fed=Math.max(0,(e.fed??0)-dt);if(e.fed>0&&!(e.alerted??0)&&(this.sim.targets.length?this.sim.targets.map(t=>t.player):[p]).every(actor=>distance(e,actor)>8)&&!s.buildings.some(b=>b.definition==='fire'&&(b.fuel??0)>0&&!b.open&&distance(b,e)<6))e.tame=Math.min(1,(e.tame??0)+dt/1800);if(e.baby)e.baby=Math.max(0,e.baby-dt);}
 stepRaids(this.game,dt);
 }
}
