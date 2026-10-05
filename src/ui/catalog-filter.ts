export type CatalogOrder='original'|'name'|'available';
export interface CatalogRow {label:string;text:string;available:boolean;index:number}
export const catalogQuery=(s:string)=>s.normalize('NFKC').trim().toLocaleLowerCase('ja').split(/\s+/).filter(Boolean);
export function catalogOrder<T extends CatalogRow>(rows:readonly T[],query:string,order:CatalogOrder):T[]{
 const words=catalogQuery(query),result=rows.filter(row=>{const text=row.text.normalize('NFKC').toLocaleLowerCase('ja');return words.every(w=>text.includes(w));});
 return result.sort((a,b)=>order==='original'?a.index-b.index:order==='available'&&a.available!==b.available?Number(b.available)-Number(a.available):a.label.localeCompare(b.label,'ja')||a.index-b.index);
}
/** Search UI is outside the replaced panel content, so live snapshots preserve it.
 * Inventory slots and map geometry are never reordered. */
export function catalogTools(panel:HTMLElement,content:HTMLElement,signal:AbortSignal){
 const section=document.createElement('section');section.className='catalog-tools';section.hidden=true;
 section.innerHTML='<label>一覧を検索<input type="search" aria-label="一覧を検索" placeholder="名前・素材・効果"></label><label>並び順<select aria-label="一覧の並び順"><option value="original">元の順</option><option value="name">名前順</option><option value="available">操作できる順</option></select></label><button type="button" data-catalog-clear>検索を消す</button><small role="status"></small>';
 content.before(section);const input=section.querySelector('input')!,select=section.querySelector('select')!,status=section.querySelector('small')!,orders=new WeakMap<Element,number>();
 const preferences=new Map<string,{query:string;order:CatalogOrder}>();let active='';
 const apply=()=>{
  if(section.hidden)return;let shown=0,total=0;
  for(const group of content.querySelectorAll<HTMLElement>('.recipe-grid,.region-cards,[data-catalog-group]')){
   const cards=[...group.children].filter((el):el is HTMLElement=>el instanceof HTMLElement&&(el.matches('.recipe-card,[data-catalog-row]')));
   const rows=cards.map((el,index)=>{if(!orders.has(el))orders.set(el,index);return {el,index:orders.get(el)!,label:el.dataset.catalogName??el.querySelector('strong,h3,h2')?.textContent??el.textContent??'',text:el.textContent??'',available:!!el.querySelector('button:not([disabled])')};});
   const sorted=catalogOrder(rows,input.value,select.value as CatalogOrder),visible=new Set(sorted.map(r=>r.el));for(const row of rows)row.el.hidden=!visible.has(row.el);for(const row of sorted)group.append(row.el);shown+=sorted.length;total+=rows.length;
  }
  const text=total?`${shown} / ${total}件。所持枠の配置や地図の位置は変わりません。`:'この欄には検索対象の一覧がありません。';if(status.textContent!==text)status.textContent=text;
 };
 const remember=()=>{preferences.set(active,{query:input.value,order:select.value as CatalogOrder});apply();};input.addEventListener('input',remember,{signal});select.addEventListener('change',remember,{signal});section.querySelector('button')!.addEventListener('click',()=>{input.value='';remember();input.focus();},{signal});
 signal.addEventListener('abort',()=>section.remove(),{once:true});
 return {refresh(tab:string,enabled:boolean){section.hidden=!enabled||!['craft','build','guide','market','world'].includes(tab);if(active!==tab){active=tab;const p=preferences.get(tab);input.value=p?.query??'';select.value=p?.order??'original';}apply();}};
}
