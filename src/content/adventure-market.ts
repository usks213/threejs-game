import type {Adventure} from '../game/adventure';
import type {AdventureSnapshot} from '../game/types';
import {canCarry} from '../game/meadows/inventory';
import {clearMeleeContact} from '../game/combat/occlusion';
import {SITES} from './adventure-sites';
import {ITEM_NAMES} from './catalog';
export const MARKET=[
 {id:'wood',amount:5,buy:3,sell:1},{id:'stone',amount:5,buy:3,sell:1},{id:'resin',amount:3,buy:3,sell:1},
 {id:'berry',amount:3,buy:2,sell:1},{id:'mushroom',amount:3,buy:3,sell:1},{id:'honey',amount:2,buy:4,sell:1},
 {id:'iron',amount:2,buy:8,sell:2},{id:'crystal',amount:2,buy:10,sell:3},{id:'woodArrow',amount:12,buy:3,sell:1},
 {id:'amber',amount:1,buy:12,sell:5},{id:'ruby',amount:1,buy:35,sell:15},
] as const;
/** One request performs one bounded exchange, after reach and capacity validation. */
export function marketTrade(game:Adventure,selection:string):string{
 const [direction,id,...rest]=selection.split(':');const offer=MARKET.find(r=>r.id===id);if(rest.length||!offer||!['buy','sell'].includes(direction))throw Error('交易一覧から商品を選んでください');
 const s=game.state,p=game.sim.player,npc=s.resources.find(n=>SITES.some(site=>site.npc===n.id)&&Math.hypot(n.x-p.x,n.y-p.y,n.z-p.z)<4);
 if(!npc)throw Error('地域拠点の案内人の前へ近づいてください');if(!clearMeleeContact(s,{...p,y:p.y+.9},{x:npc.x,y:npc.y+.9,z:npc.z},point=>game.sim.world.density(point)))throw Error('案内人との間が遮られています');
 const buy=direction==='buy',spend=buy?'coins':offer.id,cost=buy?offer.buy:offer.amount,receive=buy?offer.id:'coins',amount=buy?offer.amount:offer.sell;
 if((s.inventory[spend]??0)<cost)throw Error(buy?'硬貨が足りません':'交換する品物が足りません');const inventory={...s.inventory};inventory[spend]-=cost;
 if(!canCarry(inventory,receive,amount,s.meadows))throw Error('交換品を入れる持ち物の空きを作ってください');inventory[receive]=(inventory[receive]??0)+amount;s.inventory=inventory;if(!s.meadows!.discovered.includes(receive))s.meadows!.discovered.push(receive);
 return `${ITEM_NAMES[receive]}を${amount}受け取りました`;
}
export function marketPanel(s:AdventureSnapshot):string{return `<h3>三層の交換所</h3><p>地域拠点の案内人の前で交易できます。硬貨 ${s.inventory.coins??0}。売値は買値より低く、一回分ずつ交換します。</p><div class="recipe-grid">`+MARKET.map(r=>`<article class="recipe-card"><strong>${ITEM_NAMES[r.id]} ×${r.amount}</strong><p>所持 ${s.inventory[r.id]??0}</p><button data-game-action="trade" data-id="buy:${r.id}" ${(s.inventory.coins??0)<r.buy?'disabled':''}>買う · ${r.buy}硬貨</button><button data-game-action="trade" data-id="sell:${r.id}" ${(s.inventory[r.id]??0)<r.amount?'disabled':''}>売る · ${r.sell}硬貨</button></article>`).join('')+'</div>';}
