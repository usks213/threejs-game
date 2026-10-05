import {describe,it,expect} from 'vitest';
import {inputObservation} from '../../src/prototype/input-observation';
const actor=()=>({position:{x:1,y:2,z:3},hp:80,phase:'recover',time:.3});
describe('low-overhead input observations',()=>{
 it('copies only actor values without reading terrain, targeting, rendering or save state',()=>{
  const source={seconds:14,player:{...actor(),stamina:60,yaw:.2,pitch:-.1},enemies:[actor()],get arena(){throw Error('terrain read');},get campaign(){throw Error('save read');},target(){throw Error('raycast');},pose(){throw Error('weapon query');}};
  expect(inputObservation(source)).toEqual({position:{x:1,y:2,z:3},hp:80,stamina:60,phase:'recover',seconds:14,yaw:.2,pitch:-.1,enemies:[actor()]});
 });
 it('exposes no live actor references and does not advance the world',()=>{
  const source={seconds:14,player:{...actor(),stamina:60,yaw:.2,pitch:-.1},enemies:[actor()]},before=structuredClone(source),snapshot=inputObservation(source);
  snapshot.position.x=100;snapshot.enemies[0].position.y=100;snapshot.enemies[0].hp=0;snapshot.enemies.pop();expect(source).toEqual(before);
  source.player.hp=1;expect(inputObservation(source).hp).toBe(1);expect(snapshot.hp).toBe(80);
 });
});
