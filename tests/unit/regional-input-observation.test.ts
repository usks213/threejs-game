import {describe,it,expect} from 'vitest';
import {regionalInputObservation} from '../../src/prototype/regional-input-observation';

function source(){return {
 seconds:1,player:{position:{x:9.5,y:3.25,z:-47},hp:80,stamina:60,phase:'idle',time:0,yaw:.2,pitch:-.1,grounded:true},
 enemies:[{id:0,regional:111,name:'澄鐘の環守',position:{x:10,y:3.25,z:-51},hp:520,phase:'windup',time:.7}],
 tactics:new Map([[0,{attack:{kind:'burst',remaining:.2,serial:7}}]]),enemyElements:[{wet:3}],
 combat:{mana:80,pending:'water'},focus:{value:100},selectedElement:'water',oxygen:20,
};}
describe('isolated regional browser observation',()=>{
 it('copies tell and actor values without reading terrain, saves, rendering or action APIs',()=>{
  const value={...source(),get arena(){throw Error('terrain');},get campaign(){throw Error('save');},target(){throw Error('raycast');},action(){throw Error('mutation');},tick(){throw Error('advance');},pose(){throw Error('render pose');}};
  const result=regionalInputObservation(value as unknown as Parameters<typeof regionalInputObservation>[0]);
  expect(result.enemies[0]).toMatchObject({id:0,regional:111,wet:3,tell:{kind:'burst',remaining:.2,serial:7}});expect(result.mana).toBe(80);expect(result.seconds).toBe(1);expect(result.grounded).toBe(true);
 });
 it('does not expose mutable actor, tell, or collection references',()=>{
  const value=source(),before=structuredClone(value),result=regionalInputObservation(value as unknown as Parameters<typeof regionalInputObservation>[0]);
  result.position.x=0;result.enemies[0].position.y=0;result.enemies[0].tell!.remaining=0;result.enemies[0].hp=0;result.enemies.pop();
  expect(value).toEqual(before);expect(Object.values(result).some(v=>typeof v==='function')).toBe(false);
 });
});
