import {describe,it,expect} from 'vitest';
import {VoxelField} from '../../src/prototype/core/voxel';
import {explorationCamera} from '../../src/prototype/rendering/exploration-camera';
const eye={x:0,y:1.8,z:0};
describe('optional exploration camera',()=>{
 it('stays behind the body and keeps the authoritative aimed target',()=>{const field=new VoxelField(.25),target={x:0,y:1,z:-2};const p=explorationCamera(field,eye,0,0,3,3,1/60,target);expect(p.position.z).toBeGreaterThan(2.9);expect(p.position.x).toBeGreaterThan(0);expect(p.target).toEqual(target);expect(p.showBody).toBe(true);});
 it('moves inward immediately before a real SDF wall and smoothly recovers after it is removed',()=>{const field=new VoxelField(.25);field.box({x:-2,y:0,z:1.2},{x:2,y:4,z:1.6},3,'wall');const p=explorationCamera(field,eye,0,0,3,3,.016);expect(p.position.z).toBeLessThan(1.1);expect(field.distance(p.position)).toBeGreaterThanOrEqual(.175);field.removeObject('wall');const next=explorationCamera(field,eye,0,0,3,p.distance,.016);expect(next.distance).toBeGreaterThan(p.distance);expect(next.distance).toBeLessThan(3);});
 it('hides the body at close collision distances and bounds work/zoom',()=>{let samples=0;const field={distance:(p:{z:number})=>{samples++;return .4-p.z;}};const p=explorationCamera(field,eye,0,0,100,Infinity,.1);expect(p.showBody).toBe(false);expect(p.distance).toBeLessThan(.4);expect(samples).toBeLessThanOrEqual(42);expect(Object.values(p.position).every(Number.isFinite)).toBe(true);});
 it('avoids ground penetration at extreme look angles',()=>{const field=new VoxelField(.25);field.box({x:-8,y:-1,z:-8},{x:8,y:0,z:8},2);for(const pitch of [-1.5,1.5]){const p=explorationCamera(field,eye,0,pitch,4,4,.016);expect(field.distance(p.position)).toBeGreaterThanOrEqual(.175);}});
});
