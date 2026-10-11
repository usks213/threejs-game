import {describe,it,expect} from 'vitest';
import {HomesteadSystem} from '../../src/prototype/core/homestead';
import {homesteadRows} from '../../src/prototype/homestead-presenter';
import type {HomesteadContext} from '../../src/prototype/core/homestead';
const ctx:HomesteadContext={position:{x:0,y:0,z:0},basePosition:{x:0,y:0,z:0},baseActive:true,artisanRescued:true};
describe('homestead display rows',()=>{
 it('is read-only and exposes numeric materials and ordinary item storage with counts',()=>{const home=new HomesteadSystem({4:10,7:20,2:2},{'herb-seed':2}),before=home.snapshot();const rows=homesteadRows(home,ctx);expect(rows.find(r=>r.id==='deposit:4')?.available).toBe(true);expect(rows.find(r=>r.id==='withdraw:4')?.available).toBe(false);expect(rows.find(r=>r.id==='deposit:item:herb-seed')?.transfer?.maxCount).toBe(2);expect(rows.find(r=>r.id==='deposit:4')?.transfer?.maxCount).toBe(10);expect(home.snapshot()).toEqual(before);});
 it('disables all transactions away from a lit base',()=>{const home=new HomesteadSystem({4:20,7:30,2:5});const rows=homesteadRows(home,{...ctx,baseActive:false});expect(rows.filter(r=>r.action).every(r=>r.available===false&&r.reason?.includes('炉'))).toBe(true);});
 it('changes crops and jobs from waiting to claimable with real timers',()=>{const home=new HomesteadSystem({7:30},{'herb-seed':1});home.plant(0,ctx);home.startProcessing('weave',ctx);expect(homesteadRows(home,ctx).find(r=>r.id==='harvest:0')?.available).toBe(false);for(let i=0;i<60;i++)home.tick(1);const rows=homesteadRows(home,ctx);expect(rows.find(r=>r.id==='harvest:0')?.available).toBe(true);expect(rows.find(r=>r.id==='claim:1')?.available).toBe(true);});
 it('lists placed furniture as completed without a repeat transaction',()=>{const home=new HomesteadSystem({4:10});home.placeFurniture('table',ctx);const row=homesteadRows(home,ctx).find(r=>r.id==='furniture:table');expect(row?.completed).toBe(true);expect(row?.action).toBeUndefined();});
});
