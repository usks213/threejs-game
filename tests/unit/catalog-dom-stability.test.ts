import {expect,it} from 'vitest';
import {placeCatalogRows} from '../../src/ui/catalog-filter';

function catalog(names:string[]){
 const nodes=names.map(name=>({name,get nextElementSibling(){return children[children.indexOf(this)+1]??null;}}));
 const children=[...nodes];let moves=0;
 const group={get firstElementChild(){return children[0]??null;},insertBefore(node:typeof nodes[number],anchor:typeof nodes[number]|null){moves++;children.splice(children.indexOf(node),1);children.splice(anchor===null?children.length:children.indexOf(anchor),0,node);}};
 return {nodes,children,get moves(){return moves;},place(rows:typeof nodes){placeCatalogRows(group as unknown as HTMLElement,rows as unknown as HTMLElement[]);}};
}
it('leaves catalog cards attached across repeated unchanged snapshot refreshes',()=>{
 const list=catalog(['axe','club','food']);
 for(let i=0;i<60;i++)list.place(list.nodes);
 expect(list.moves).toBe(0);expect(list.children).toEqual(list.nodes);
});
it('changes only necessary positions when sorting or filtering and stabilizes immediately',()=>{
 const list=catalog(['axe','club','food']);
 list.place([list.nodes[2],list.nodes[0],list.nodes[1]]);expect(list.moves).toBe(1);
 list.place([list.nodes[2],list.nodes[0],list.nodes[1]]);expect(list.moves).toBe(1);
 // Filtered-out cards remain attached; visible results keep their stable identity.
 list.place([list.nodes[1]]);expect(list.children).toHaveLength(3);expect(list.children[0]).toBe(list.nodes[1]);
 const moves=list.moves;list.place([list.nodes[1]]);expect(list.moves).toBe(moves);
 list.place(list.nodes);expect(list.children).toEqual(list.nodes);
});
