import {describe,it,expect} from 'vitest';
import {TouchContacts,type TouchEvent} from '../e2e/helpers/touch-contacts';

describe('real CDP multi-contact delivery',()=>{
 it('obeys Chromium TouchEmulator contact changes across repeated gestures',async()=>{
  const down:number[]=[],up:number[]=[];let active=new Set<number>();
  // The normal CDP path preserves omitted contacts on touchMove and releases
  // only IDs explicitly supplied to touchEnd (or all IDs for empty touchEnd).
  const contacts=new TouchContacts(async event=>{
   const next=new Set(active),changed=event.touchPoints.map(p=>p.id);
   if(event.type==='touchStart')expect(changed.length).toBeGreaterThan(0);
   if(event.type==='touchMove'){expect(active.size).toBeGreaterThan(0);expect(changed.length).toBeGreaterThan(0);}
   if(event.type==='touchEnd'){if(changed.length)for(const id of changed){expect(active.has(id)).toBe(true);next.delete(id);}else next.clear();}
   else for(const id of changed)next.add(id);
   for(const id of next)if(!active.has(id))down.push(id);
   for(const id of active)if(!next.has(id))up.push(id);
   active=next;
  });
  await contacts.set(8,{x:750,y:300});await contacts.set(1,{x:70,y:250});
  for(let gesture=0;gesture<2;gesture++){
   await contacts.set(7,{x:500,y:150});await contacts.set(9,{x:800,y:250});
   await contacts.set(7,{x:510,y:145});await contacts.release(7);await contacts.release(9);
   expect([...active]).toEqual([8,1]);
  }
  expect(down.filter(id=>id===7)).toHaveLength(2);expect(down.filter(id=>id===9)).toHaveLength(2);
  await contacts.release(1);expect([...active]).toEqual([8]);await contacts.clear();
  expect(active.size).toBe(0);expect(up.filter(id=>id===8)).toHaveLength(1);
 });
 it('retains movement and shield through concurrent look, jump and cast gestures',async()=>{
  const events:TouchEvent[]=[],contacts=new TouchContacts(async event=>{events.push(event);});
  await contacts.set(1,{x:70,y:250});await contacts.set(8,{x:750,y:300});
  await Promise.all([contacts.set(7,{x:500,y:150}),contacts.set(9,{x:800,y:250})]);
  await contacts.set(7,{x:510,y:145});
  await Promise.all([contacts.release(7),contacts.release(9)]);
  expect(events.at(-1)).toEqual({type:'touchEnd',touchPoints:[{id:9,x:800,y:250}]});
  for(const event of events.slice(1).filter(e=>e.type!=='touchEnd'))expect(event.touchPoints.map(p=>p.id)).toEqual(expect.arrayContaining([1,8]));
  expect(events.filter(e=>e.type==='touchEnd').flatMap(e=>e.touchPoints.map(p=>p.id))).toEqual([7,9]);
  await contacts.set(9,{x:720,y:220});await contacts.release(9);await contacts.release(1);
  expect(events.at(-1)).toEqual({type:'touchEnd',touchPoints:[{id:1,x:70,y:250}]});
  await contacts.release(8);expect(events.at(-1)).toEqual({type:'touchEnd',touchPoints:[]});
 });
 it('serializes in-flight input before cleanup without losing a retained finger',async()=>{
  const events:TouchEvent[]=[];let deliver:()=>void=()=>{};
  const contacts=new TouchContacts(async event=>{events.push(event);if(events.length===1)await new Promise<void>(resolve=>{deliver=resolve;});});
  const movement=contacts.set(1,{x:70,y:250}),shield=contacts.set(8,{x:750,y:300}),cleanup=contacts.clear();
  await Promise.resolve();expect(events).toHaveLength(1);deliver();await Promise.all([movement,shield,cleanup]);
  expect(events.map(e=>e.touchPoints.map(p=>p.id))).toEqual([[1],[1,8],[]]);
  expect(events.at(-1)?.type).toBe('touchEnd');
 });
 it('preserves dispatch failures while allowing a held shield to be released',async()=>{
  const events:TouchEvent[]=[],failure=Error('CDP delivery failed');let fail=false;
  const contacts=new TouchContacts(async event=>{if(fail){fail=false;throw failure;}events.push(event);});
  await contacts.set(8,{x:750,y:300});fail=true;
  await expect(contacts.set(9,{x:800,y:250})).rejects.toBe(failure);
  await contacts.clear();expect(events.at(-1)).toEqual({type:'touchEnd',touchPoints:[]});
 });
});
