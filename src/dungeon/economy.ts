import {CLASSES,ITEMS} from './catalog';
import {place,STASH_HEIGHT} from './inventory';
import type {ClassId,Item,ItemKind,Profile,RaidState,SupplyKind,SupplyStock} from './types';
export type {SupplyKind} from './types';

/** One room-local supplier, using earned game currency only. No player market. */
export const SUPPLIES={
 potion:{name:'赤灯の薬',price:12,stock:6},
 bandage:{name:'清潔な包帯',price:6,stock:10},
} as const;
export const freshSupplyStock=():SupplyStock=>({potion:SUPPLIES.potion.stock,bandage:SUPPLIES.bandage.stock});
export function validSupplyStock(value:unknown):value is SupplyStock{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const stock=value as Record<string,unknown>;
 return Object.keys(stock).length===2&&Object.keys(SUPPLIES).every(key=>Number.isInteger(stock[key])&&Number(stock[key])>=0&&Number(stock[key])<=SUPPLIES[key as SupplyKind].stock);
}
const weapons=new Set<ItemKind>(['sword','greatsword','dagger','bow','staff']);
export function loadoutWeapon(items:Item[],classId:ClassId):ItemKind|null{
 return items.length?items.find(item=>weapons.has(item.kind))?.kind??null:CLASSES[classId].weapon;
}
export function preparationIssue(items:Item[]):string|null{
 return items.length&&!items.some(item=>weapons.has(item.kind))?'携行品に武器がありません。倉庫から武器を戻すか、鞄を空にして初期補給を受けてください。':null;
}
/** Found alone is not enough: extracted free equipment must never mint money. */
export function saleValue(item:Item):number{
 return item.found&&(item.kind==='relic'||item.kind==='ore')?ITEMS[item.kind].value*item.count*(item.quality+1):0;
}
function allowed(state:RaidState,profile:Profile){return state.phase!=='raid'&&profile.actor.status==='lobby'&&!profile.actor.ready;}
function receipt(profile:Profile,state:RaidState,description:string){
 profile.receipt.push(`遠征${state.raid}・取引${profile.lastAction} ${description}（残高${profile.gold}）`);
 if(profile.receipt.length>128)profile.receipt.splice(0,profile.receipt.length-128);
}
/** Check all conditions before assigning any item, coin, stock or serial change. */
export function buySupply(state:RaidState,profile:Profile,supply:SupplyKind):string{
 if(!allowed(state,profile))return '補給所へ戻り、準備を解除してから取引してください';
 if(profile.pendingReturn?.length)return '帰還品をすべて受け取ってから購入してください';
 const offer=SUPPLIES[supply],stock=state.shop??freshSupplyStock();
 if(!offer||!stock[supply])return 'この補給品は売り切れです。次の遠征開始時に補充されます';
 if(profile.gold<offer.price)return `金貨が足りません（必要${offer.price}）`;
 if(state.serial>=1e9)return '品物の上限に達したため購入できません';
 const item:Item={id:`r${state.raid}-i${state.serial+1}`,kind:supply,quality:0,count:1,x:0,y:0,rotated:false,found:false};
 const owned=[...state.profiles.flatMap(value=>[...value.stash,...value.actor.bag,...(value.pendingReturn??[])]),...state.enemies.flatMap(value=>value.bag),...state.containers.flatMap(value=>value.items)];
 if(owned.some(value=>value.id===item.id))return '品物の識別子が重複するため購入を停止しました';
 const candidate=profile.stash.map(value=>({...value}));
 if(!place(candidate,item,STASH_HEIGHT))return '倉庫に空きがありません。購入は成立していません';
 profile.stash=candidate;profile.gold-=offer.price;state.serial++;state.shop={...stock,[supply]:stock[supply]-1};
 receipt(profile,state,`${offer.name}×1を購入 -${offer.price}金貨`);
 return `${offer.name}を倉庫へ届けました（-${offer.price}金貨）`;
}
export function sellTreasure(state:RaidState,profile:Profile,id:string):string{
 if(!allowed(state,profile))return '補給所へ戻り、準備を解除してから取引してください';
 const index=profile.stash.findIndex(item=>item.id===id),item=profile.stash[index];
 if(!item)return 'この倉庫に品物がありません';
 const value=saleValue(item);
 if(!value)return '買い取りは帰還済みの遺宝・鉱石だけです。初期装備や薬は売れません';
 if(profile.gold+value>1e9)return '金貨の保管上限を超えるため売却できません';
 profile.stash.splice(index,1);profile.gold+=value;
 receipt(profile,state,`${ITEMS[item.kind].name}×${item.count}を売却 +${value}金貨`);
 return `${ITEMS[item.kind].name}を売却しました（+${value}金貨）`;
}
