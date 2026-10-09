import type {AdventureSnapshot} from '../game/types';
import {TUTORIAL_STEPS,REGIONAL_RECORDS,REGIONAL_COMMISSIONS,ADVENTURE_DECORATIONS} from '../content/adventure-chapters';
import {SITES} from '../content/adventure-sites';
import {ITEM_NAMES} from '../content/catalog';
export function progressionPanel(s:AdventureSnapshot):string{
 const view=s.progressionView;if(!view)return '';const button=(label:string,action:string,id='')=>`<button data-game-action="${action}" data-id="${id}">${label}</button>`;
 let html=`<h3>操作を練習する（任意） ${Math.min(5,view.tutorial.step+1)}/5</h3><p>灯の旅は練習を終えなくても進められます。</p><p>${view.tutorial.title} · ${view.tutorial.hint}</p><ol>${TUTORIAL_STEPS.map((step,i)=>`<li>${i<view.tutorial.step?'◆':'◇'} ${step.title}</li>`).join('')}</ol>`;
 if(view.tutorial.step===4)html+=button(view.tutorial.practiceSeconds?'練習をやめる':'練習人形を3秒助ける','tutorial-rescue',view.tutorial.practiceSeconds?'cancel':'start');
 html+=`<h3>三層の記録集 ${view.records.length}/9</h3><p>調べた記録と装飾の解放は自分の記録です。依頼の銀貨と世界の復旧は仲間と一度だけ共有します。</p>`;
 for(const region of view.regions){const site=SITES.find(site=>site.id===region.site)!;html+=`<article class="recipe-card"><strong>${site.name} · ${region.count}/3</strong><p>${region.hint}</p>${button('案内人に別棟の依頼を聞く','chronicle-accept',String(site.id))}`;
  for(const record of REGIONAL_RECORDS.filter(r=>r.site===site.id)){const at=view.locations[record.id]??{x:site.x+record.x,z:site.z+record.z};html+=`<p>${view.records.includes(record.id)?'◆':view.heritage.includes(record.id)?'◇ 前周の記録':'◇'} ${record.name} · X ${at.x} / Z ${at.z}${record.kind==='loft'?' / 上の書架':''}${view.records.includes(record.id)||view.heritage.includes(record.id)?'：'+record.line:''}</p>${button('近くで記録を調べる','chronicle-inspect',String(record.id))}`;
  }
  html+=button('埋まった記録を案内人に救出してもらう','chronicle-recover',String(site.id));
  html+=button(region.reported?'記録の報告済み':'案内人へ記録を報告','chronicle-report',String(site.id));
  if(view.ending){const c=REGIONAL_COMMISSIONS.find(c=>c.site===site.id)!;html+=`<p>嵐のあとの依頼：${c.title}。${c.line} 必要：${Object.entries(c.cost).map(([id,n])=>(ITEM_NAMES[id]??id)+' '+n).join('・')}</p>`+button(region.epilogue?'新航路の支度済み':'素材を届けて新航路を支える','chronicle-epilogue',String(site.id));}html+='</article>';
 }
 html+='<h3>集めた記録で作る拠点の飾り</h3>'+ADVENTURE_DECORATIONS.map(d=>`<p>${view.decorations.includes(d.id)?'◆':'◇'} ${d.name} · ${Object.entries(d.cost).map(([id,n])=>(ITEM_NAMES[id]??id)+' '+n).join('・')}</p>`+(view.decorations.includes(d.id)?button('置く場所を選ぶ','place',d.id):'<small>地域の記録を3枚収集。帰還碑は終幕後の3依頼を完了すると解放。</small>')).join('');
 if(view.cycle)html+=`<p>第${view.cycle+1}航路：機関室の必要重量と灯の数が変化しています。前周の記録${view.heritage.length}枚は図鑑と装飾の解放として残っています。</p>`;
 if(view.previousBest!==undefined)html+=`<p>前周までの競走最高記録：${view.previousBest.toFixed(2)}秒</p>`;
 if(view.ending)html+='<h3>嵐のあとの世界</h3><p>案内人たちの新しい依頼、未踏の記録、建築と競走を続けられます。個人ワールドは設定から確認後に次の航路へ進めます。共有ワールドはそのまま残ります。</p>';
 return html;
}
