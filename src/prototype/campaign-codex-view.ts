import {filterCodex,type CampaignCodexEntry,type CodexFilter} from './campaign-codex';
import './campaign-codex.css';
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,className?:string){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
/** A read-only tab: filters only change this view's local draft. */
export function createCodexView(entries:readonly CampaignCodexEntry[],filter:CodexFilter,signal:AbortSignal){
 const section=node('section',undefined,'campaign-codex'),count=node('p',`発見済み ${entries.filter(e=>e.discovered).length} / ${entries.length} 種類`,'campaign-codex-count');
 count.dataset.codexCount='';section.append(count,node('p','初めて手に入れた素材・品物を自動で記録します。登録による消費はありません。使い切っても記録は残ります。未発見の地域や場所を地図に表示する機能ではありません。','campaign-help'));
 const controls=node('div',undefined,'campaign-codex-controls'),label=node('label','図鑑を探す'),search=node('input'),statusLabel=node('label','発見状態'),status=node('select');
 search.type='search';search.id='campaign-codex-search';search.value=filter.query;search.placeholder='名前・発見済みの地域や用途';search.setAttribute('aria-label','図鑑を検索');label.append(search);
 status.id='campaign-codex-filter';status.setAttribute('aria-label','図鑑の発見状態');for(const [value,text] of [['all','すべて'],['discovered','発見済み'],['unknown','未発見']]){const option=node('option',text);option.value=value;status.append(option);}status.value=filter.status;statusLabel.append(status);controls.append(label,statusLabel);section.append(controls);
 const results=node('div',undefined,'campaign-grid'),summary=node('p',undefined,'campaign-help');summary.setAttribute('role','status');section.append(summary,results);
 const refresh=()=>{const found=filterCodex(entries,filter);summary.textContent=`表示 ${found.length} 件`;results.replaceChildren();if(!found.length)results.append(node('p','一致する記録はありません。検索や発見状態を変えてください。','campaign-empty'));
  for(const entry of found){const article=node('article',undefined,'campaign-item campaign-codex-entry');article.dataset.codexId=entry.id;article.dataset.discovered=String(entry.discovered);article.append(node('h3',entry.label),node('p',`${entry.discovered?'✓ 発見済み':'○ 未発見'} · ${entry.category}`,'campaign-codex-status'),node('p','地域：'+entry.region),node('p','入手：'+entry.source),node('p','用途：'+entry.uses));results.append(article);}
 };
 search.addEventListener('input',()=>{filter.query=search.value;refresh();},{signal});status.addEventListener('change',()=>{filter.status=status.value as CodexFilter['status'];refresh();},{signal});refresh();return section;
}
