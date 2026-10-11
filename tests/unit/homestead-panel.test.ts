import {afterEach,it,expect,vi} from 'vitest';
import {createHomesteadPanel} from '../../src/prototype/homestead-panel';
import type {CampaignRow} from '../../src/prototype/campaign-ui';
class Element extends EventTarget {
 children:Element[]=[];parent:Element|null=null;className='';textContent='';moves=0;
 constructor(readonly tag:string){super();}
 append(child:Element){this.insertBefore(child,null);}
 insertBefore(child:Element,before:Element|null){child.remove();const index=before?this.children.indexOf(before):this.children.length;this.children.splice(index,0,child);child.parent=this;child.moves++;}
 remove(){if(this.parent){this.parent.children=this.parent.children.filter(c=>c!==this);this.parent=null;}}
 replaceWith(next:Element){this.parent!.insertBefore(next,this);this.remove();}
 querySelector(tag:string):Element|null{return this.children.find(c=>c.tag===tag)??null;}
}
afterEach(()=>vi.unstubAllGlobals());
const rest=(remaining:number):CampaignRow=>({id:'player-rest:cancel',label:'休息を中断する',detail:`あと${remaining}ゲーム秒`,available:true,action:'homestead'});
function setup(){
 vi.stubGlobal('document',{createElement:(tag:string)=>new Element(tag)});
 const commands=vi.fn();
 const panel=createHomesteadPanel(row=>{const item=new Element('article'),detail=new Element('p'),button=new Element('button');detail.textContent=row.detail??'';button.addEventListener('click',()=>commands(row.id));item.append(detail);item.append(button);return item as unknown as HTMLElement;});
 return {panel,root:panel.root as unknown as Element,commands};
}
it('keeps cancel attached across countdowns and unrelated live row changes',()=>{
 const {panel,root,commands}=setup();const other:CampaignRow={id:'crop',label:'作物',detail:'0'};
 panel.update([other,rest(900)]);const row=root.children[1],button=row.querySelector('button'),moves=row.moves;
 for(let i=1;i<=100;i++){
  panel.update([{...other,detail:String(i)},rest(900-i)]);
  expect(root.children[1]).toBe(row);expect(row.querySelector('button')).toBe(button);expect(row.moves).toBe(moves);expect(row.querySelector('p')!.textContent).toBe(`あと${900-i}ゲーム秒`);
 }
 button!.dispatchEvent(new Event('click'));expect(commands).toHaveBeenCalledExactlyOnceWith('player-rest:cancel');
});
it('removes completed rest actions and reconciles changed eligibility and ordering',()=>{
 const {panel,root}=setup();panel.update([rest(1)]);const old=root.children[0];
 const dawn:CampaignRow={id:'player-rest:dawn',label:'朝まで休む',available:true,action:'homestead'};
 panel.update([dawn]);expect(old.parent).toBeNull();const enabled=root.children[0];
 panel.update([{...dawn,available:false}]);expect(root.children[0]).not.toBe(enabled);
 panel.update([rest(4),dawn]);expect(root.children).toHaveLength(2);panel.update([]);expect(root.children).toHaveLength(0);
});
