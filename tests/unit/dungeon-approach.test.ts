import {expect,it} from 'vitest';
import {closeApproachKey} from '../e2e/helpers/dungeon-approach';
it('chooses the nearest local cardinal direction, including backward and strafing corrections',()=>{
 expect(closeApproachKey(0,1,0)).toBe('KeyD');expect(closeApproachKey(0,-1,0)).toBe('KeyA');
 expect(closeApproachKey(0,0,-1)).toBe('KeyW');expect(closeApproachKey(0,0,1)).toBe('KeyS');
 expect(closeApproachKey(Math.PI/2,-1,0)).toBe('KeyW');expect(closeApproachKey(Math.PI/2,0,-1)).toBe('KeyD');
});
it('converges a crouched 1–2 server-tick pulse to the unchanged 15cm target without camera orbiting',()=>{
 for(const yaw of [0,.7,1.244,Math.PI,-2.4])for(const start of [{x:-1.9196,z:3.1387},{x:-.764,z:3.432},{x:-1.838,z:2.627}]){
  let {x,z}=start;const target={x:-1.0072635,z:3.006768};let steps=0;
  for(;Math.hypot(x-target.x,z-target.z)>.15&&steps<30;steps++){
   const key=closeApproachKey(yaw,target.x-x,target.z-z),right=key==='KeyD'?1:key==='KeyA'?-1:0,forward=key==='KeyW'?1:key==='KeyS'?-1:0;
   const amount=3*.55*.05*(steps%2+1);
   x+=(Math.cos(yaw)*right-Math.sin(yaw)*forward)*amount;
   z+=(-Math.sin(yaw)*right-Math.cos(yaw)*forward)*amount;
  }
  expect(Math.hypot(x-target.x,z-target.z)).toBeLessThanOrEqual(.15);expect(steps).toBeLessThan(30);
 }
});
