import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {boxDistance,combineMedia,dualPhase,froxelCoordinate,froxelDepth,integrateMedium} from '../../src/rendering/volumetrics/medium';
import {FogField} from '../../src/rendering/volumetrics/fog-field';
import {HybridVolume} from '../../src/rendering/volumetrics/hybrid-volume';
import {campaignFogBoxes} from '../../src/prototype/rendering/campaign-volume';
describe('analytic medium integration',()=>{
 it('uses the vacuum limit and Beer-Lambert attenuation without density-squared scattering',()=>{
  expect(integrateMedium({extinction:0,source:[2,1,0]},3)).toEqual({transmittance:1,radiance:[6,3,0]});
  const r=integrateMedium({extinction:.2,source:[.2,.4,.6]},5);expect(r.transmittance).toBeCloseTo(Math.exp(-1));expect(r.radiance[0]).toBeCloseTo(1-Math.exp(-1));
 });
 it('combines both media once and is invariant to ray partition',()=>{
  const m=combineMedia({extinction:.1,source:[.2,0,.1]},{extinction:.4,source:[0,.3,.2]}),whole=integrateMedium(m,12),a=integrateMedium(m,3),b=integrateMedium(m,9);
  expect(a.transmittance*b.transmittance).toBeCloseTo(whole.transmittance);whole.radiance.forEach((v,i)=>expect(a.radiance[i]+a.transmittance*b.radiance[i]).toBeCloseTo(v));
 });
 it('maps logarithmic froxel slices invertibly including near/far endpoints',()=>{for(const far of [55,72,120])for(let i=0;i<=24;i++){const u=i/24,d=froxelDepth(u,.035,far);expect(froxelCoordinate(d,.035,far)).toBeCloseTo(u);if(i)expect(d).toBeGreaterThan(froxelDepth((i-1)/24,.035,far));}});
 it('dual HG is positive, finite and integrates to approximately one',()=>{let total=0;for(let i=0;i<10000;i++){const value=dualPhase(-1+(i+.5)*2/10000);expect(value).toBeGreaterThan(0);total+=value*2/10000*2*Math.PI;}expect(total).toBeCloseTo(1,5);});
});
describe('independent fog interface volume',()=>{
 const box={min:[0,0,0] as const,max:[12,6,12] as const,density:.2};
 it('measures signed fog boundary distance rather than solid terrain occupancy',()=>{expect(boxDistance(6,3,6,box)).toBe(-3);expect(boxDistance(12,3,6,box)).toBe(0);expect(boxDistance(15,10,12,box)).toBe(5);});
 it('keeps a bounded two-channel texture and rebuilds only on snapped camera movement',()=>{const field=new FogField([box]);const dispose=vi.spyOn(field.texture,'dispose');field.update(new THREE.Vector3(1,2,1));expect(field.stats).toMatchObject({fogFieldUpdates:1,fogFieldVoxels:36864,fogFieldBytes:73728});field.update(new THREE.Vector3(2,3,2));expect(field.stats.fogFieldUpdates).toBe(1);field.update(new THREE.Vector3(7,3,2));expect(field.stats.fogFieldUpdates).toBe(2);const pixels=field.texture.image.data as Uint8Array;expect(pixels.some((v,i)=>i%2===0&&v<128)).toBe(true);expect(pixels.some((v,i)=>i%2===1&&v>0)).toBe(true);field.dispose();expect(dispose).toHaveBeenCalledOnce();});
 it('preserves the gameplay shroud bounds in the render-only field',()=>{const boxes=campaignFogBoxes(false);expect(boxes[0]).toEqual({min:[5,.15,-15],max:[11,6.15,-5],density:.19});expect(boxes[1].min[0]).toBe(-80);expect(campaignFogBoxes(true)[1].min[0]).toBe(-128);});
 it('resizes and releases froxel, field and half-resolution targets',()=>{const v=new HybridVolume(new THREE.PerspectiveCamera(70,1,.035,55),{density:.01,ambient:new THREE.Color(),direction:new THREE.Vector3(0,1,0),points:[],groundHeight:0},[box]);v.resize(845,391);expect(v.stats).toMatchObject({volumeWidth:423,volumeHeight:196,froxelDimensions:[48,28,24],temporalHistory:false});const target=vi.spyOn(v.target,'dispose'),atlas=vi.spyOn(v.atlas,'dispose'),field=vi.spyOn(v.field.texture,'dispose');v.dispose();expect(target).toHaveBeenCalledOnce();expect(atlas).toHaveBeenCalledOnce();expect(field).toHaveBeenCalledOnce();});
});
