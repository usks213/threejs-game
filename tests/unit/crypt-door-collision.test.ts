import {describe,it,expect} from 'vitest';
import {CoreSimulation,type Controls} from '../../src/prototype/core/simulation';
import {setDoor} from '../../src/prototype/core/world';

const neutral:Controls={x:0,z:0,sprint:false,block:false,water:false};
function aimDoor(s:CoreSimulation,open=false){
 const p=s.player.position,target={x:open?-.8:0,y:1.4,z:open?2:1};
 s.player.yaw=Math.atan2(p.x-target.x,p.z-target.z);
 s.player.pitch=Math.atan2(target.y-p.y-1.52,Math.hypot(target.x-p.x,target.z-p.z));
 expect(s.target()?.hit.cell.object).toBe('door');
}
describe('crypt door candidate collision',()=>{
 it('opens from the ordinary approach while a remote enemy remains in unrelated terrain contact',()=>{
  const s=new CoreSimulation(true,false,true);s.player.position={x:0,y:.25,z:3.2};
  for(let i=0;i<60;i++)s.tick(1/30,neutral);
  const remote=s.enemies[2],before={...remote.position};
  expect(remote.hp).toBeGreaterThan(0);expect(s.arena.field.overlaps(remote.position,.27,1.7)).toBe(true);
  aimDoor(s);s.action('interact',neutral);
  expect(s.arena.objects.get('door')!.open).toBe(true);
  expect(remote.position).toEqual(before);expect(s.arena.field.overlaps(remote.position,.27,1.7)).toBe(true);
  expect(s.arena.field.overlaps(s.player.position)).toBe(false);
  s.tick(1/30,neutral);expect(s.enemyAwareness(s.enemies[0])).toBe('alert');
 });
 for(const opening of [true,false])for(const body of ['player','enemy','companion'] as const){
  it(`rejects ${opening?'opening':'closing'} into a ${body} and leaves field state unchanged`,()=>{
   const s=new CoreSimulation(true,false,true);s.player.position={x:0,y:.25,z:3.4};
   setDoor(s.arena.field,!opening);s.arena.objects.get('door')!.open=!opening;
   const position=opening?{x:-1.1,y:.25,z:2}:{x:0,y:.25,z:.9};
   if(body==='player')s.player.position=opening?{x:-.7,y:.25,z:2.8}:{x:0,y:.25,z:1.15};else if(body==='enemy')s.enemies[0].position=position;else s.enableCompanion().position=position;
   aimDoor(s,!opening);const before=s.arena.field.exportState();
   s.action('interact',neutral);
   expect(s.arena.objects.get('door')!.open).toBe(!opening);
   expect(s.events.at(-1)?.text).toContain('体に当たる');
   expect(s.arena.field.exportState()).toEqual(before);
  });
 }
});
