import { expect,it } from 'vitest';
import { newMeadows } from '../../src/game/meadows/state';
import { changeLayout,reconcileSlots } from '../../src/game/meadows/inventory-layout';
import { canCarry } from '../../src/game/meadows/inventory';
it('splits, moves and merges slots without changing item totals',()=>{const m=newMeadows(),items={wood:40,stone:5};reconcileSlots(m,items);changeLayout(m,items,'split','0');expect(m.slots![0]!.count).toBe(20);expect(m.slots![2]!.count).toBe(20);changeLayout(m,items,'move','2:5');expect(m.slots![5]!.count).toBe(20);changeLayout(m,items,'move','5:0');expect(m.slots![0]!.count).toBe(40);expect(items).toEqual({wood:40,stone:5});items.wood=8;reconcileSlots(m,items);expect(m.slots!.filter(s=>s?.id==='wood').reduce((n,s)=>n+s!.count,0)).toBe(8);});
it('does not hide new items when manually split stacks consume all slots',()=>{const m=newMeadows();m.slots=Array.from({length:32},()=>({id:'wood',count:1}));expect(canCarry({wood:32},'stone',1,m)).toBe(false);expect(canCarry({wood:32},'wood',1,m)).toBe(true);});
