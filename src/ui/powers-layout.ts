export type PowerPage='build'|'travel'|'equipment'|'plans'|'devices';
const pages:readonly {id:PowerPage;label:string;intro:string;selectors:readonly string[]}[]=[
 {id:'build',label:'組立',intro:'作る → 掴む → 動かす → 接着。プレビューで位置を確認してから確定できます。',selectors:['#power-kind','#power-material','create','#power-part','create-adjacent','grab','glue','release','up','down','forward','back','rotate','throw','unglue','salvage','share','recall']},
 {id:'travel',label:'移動',intro:'頭上に足場がある場所で「出口を探す」。登れない壁や地形編集の失敗もここで戻せます。',selectors:['ascend-preview','ascend','#power-exit','climb','terrain-undo']},
 {id:'equipment',label:'継ぎ装',intro:'持っている武器や盾に素材の性質を追加。消費素材と効果は確定前に表示されます。',selectors:['#power-fusion-equipment','fuse-stone','fuse-fire','fuse-frost','fuse-shield','fuse-arrow','unfuse']},
 {id:'plans',label:'設計帳',intro:'組立で選んだ部品を記録します。再建には素材が必要で、中身や充電は複製しません。',selectors:['#power-plan-name','blueprint','#power-plan-search','#power-plan-sort','#power-plan-filter-status','#power-blueprint','rebuild','plan-rename','plan-delete','#power-plan-confirm']},
 {id:'devices',label:'装置・拠点',intro:'組立で装置を選び、接着した電池を充電して動力をON。席に乗ると移動入力で操縦できます。',selectors:['toggle','charge','ride','upright','element-fire','element-frost','element-shock','#power-camp']},
];
/** Keep the existing commands and listeners; only divide the giant form into tasks. */
export function arrangePowerPanels(panel:HTMLElement):{show:(page:PowerPage)=>void;current:()=>PowerPage}{
 const adjacent=document.createElement('button');adjacent.type='button';adjacent.dataset.power='create-adjacent';adjacent.textContent='選んだ部品に重ねて作る';adjacent.disabled=true;panel.append(adjacent);
 const nav=document.createElement('nav');nav.id='power-pages';nav.setAttribute('aria-label','能力の用途');
 const sections=new Map<PowerPage,HTMLElement>();
 for(const page of pages){
  const tab=document.createElement('button');tab.type='button';tab.dataset.powerPage=page.id;tab.textContent=page.label;tab.setAttribute('aria-controls','power-page-'+page.id);nav.append(tab);
  const section=document.createElement('section');section.id='power-page-'+page.id;section.dataset.powerSection=page.id;
  const intro=document.createElement('p');intro.textContent=page.intro;section.append(intro);
  const controls=document.createElement('div');controls.className='power-controls';section.append(controls);
  for(const selector of page.selectors){
   const element=panel.querySelector<HTMLElement>(selector.startsWith('#')?selector:`[data-power="${selector}"]`);
   if(!element)throw Error('Missing power control: '+selector);
   controls.append(element.closest('label')??element);
  }
  sections.set(page.id,section);
 }
 // Old explanatory paragraphs are replaced by the relevant task intro. The
 // current materials, pending preview and nearby trial remain common to all tabs.
 for(const element of panel.querySelectorAll(':scope > p,:scope > hr,:scope > .power-controls'))element.remove();
 panel.querySelector('.panel-header')!.after(nav);
 for(const section of sections.values())panel.append(section);
 let current:PowerPage='build';
 const show=(page:PowerPage)=>{current=page;for(const [id,section]of sections)section.hidden=id!==page;for(const tab of nav.querySelectorAll('button'))tab.setAttribute('aria-pressed',String(tab.dataset.powerPage===page));panel.scrollTop=0;};
 show('build');return {show,current:()=>current};
}
export function isPowerPage(value:string|undefined):value is PowerPage{return pages.some(page=>page.id===value);}
