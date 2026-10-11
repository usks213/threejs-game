import type {AdventureSnapshot} from '../game/types';
import type {Vec3} from '../world/types';
import {BUILDINGS} from '../content/catalog';
export function buildingAccessPanel(state:AdventureSnapshot,p:Vec3,owner:string):string{
 const near=state.buildings.filter(b=>Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z)<6).sort((a,b)=>a.id-b.id);
 return '<section><h3>近くの建築の権限</h3><p>新しい建築は作成者の所有です。共同にすると、仲間も解体・加工・箱の取出ができます。修理と燃料投入は協力できます。</p><div class=region-cards>'+near.map(b=>`<article class=recipe-card><strong>${BUILDINGS.find(d=>d.id===b.definition)?.name??'建築'} #${b.id}</strong><p>${!b.creator||b.shared?'共同で利用・変更可能':b.creator===owner?'自分の建築':'仲間の建築 · 取出と変更は保護中'}</p>${b.creator===owner?`<button data-game-action="building-share" data-id="${b.id}:${b.shared?'off':'on'}" ${Math.hypot(b.x-p.x,b.y-p.y,b.z-p.z)>4?'disabled':''}>${b.shared?'共同の取出・解体をやめる':'共同の取出・解体を許可'}</button>`:''}</article>`).join('')+(near.length?'':'<p>6m以内に建築はありません。</p>')+'</div></section>';
}
