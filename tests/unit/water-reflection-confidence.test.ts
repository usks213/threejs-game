import {describe,it,expect} from 'vitest';
import {waterReflectionConfidence as confidence,WATER_REFLECTION_LIMITS as limits,waterVolumeFragment as shader} from '../../src/prototype/rendering/water-volume-shaders';

describe('continuous bounded water SSR confidence',()=>{
 it('retains valid reflected scene light while fading failed, near-self, screen-edge and range hits',()=>{
  expect(confidence(0,1,.5)).toBe(1);
  expect(confidence(.15,1,.5)).toBe(0);expect(confidence(0,.04,.5)).toBe(0);expect(confidence(0,1,.01)).toBe(0);expect(confidence(0,2.88,.5)).toBe(0);
  for(const v of [NaN,Infinity,-Infinity])expect(confidence(v,1,.5)).toBe(0);
  for(let error=0;error<=.2;error+=.01)for(let travel=0;travel<=3;travel+=.1)for(const edge of [0,.02,.04,.08,.5]){const value=confidence(error,travel,edge);expect(value).toBeGreaterThanOrEqual(0);expect(value).toBeLessThanOrEqual(1);}
 });
 it('is continuous on both sides of every confidence threshold, including the hard trace budget',()=>{
  const epsilon=1e-6;
  for(const edge of [limits.edgeStart,limits.edgeEnd])expect(Math.abs(confidence(0,1,edge-epsilon)-confidence(0,1,edge+epsilon))).toBeLessThan(.000001);
  for(const error of [limits.errorStart,limits.errorEnd])expect(Math.abs(confidence(error-epsilon,1,.5)-confidence(error+epsilon,1,.5))).toBeLessThan(.000001);
  for(const travel of [limits.selfStart,limits.selfEnd,limits.rangeStart,limits.rangeEnd])expect(Math.abs(confidence(0,travel-epsilon,.5)-confidence(0,travel+epsilon,.5))).toBeLessThan(.000001);
 });
 it('refines a planar depth crossing continuously across coarse tap boundaries',()=>{
  const refine=(hit:number)=>{let previous=.025;for(let i=1;i<=12;i++){const travel=i*.24;if(previous<=hit&&travel>hit){let low=previous,high=travel;for(let n=0;n<5;n++){const middle=(low+high)*.5;if(middle>hit)high=middle;else low=middle;}const lowGap=low-hit,highGap=high-hit;return low+(high-low)*(-lowGap/(highGap-lowGap));}previous=travel;}return null;};
  for(let i=1;i<12;i++)for(const offset of [-.00001,0,.00001]){const hit=i*.24+offset;expect(refine(hit)).toBeCloseTo(hit,10);}
  const a=refine(2.4-.00001)!,b=refine(2.4+.00001)!;expect(Math.abs(confidence(0,a,.5)-confidence(0,b,.5))).toBeLessThan(.0001);
 });
 it('keeps the bounded SSR feature and checks projections before dividing or sampling',()=>{
  expect(shader).toContain('for(int i=1;i<=12;i++)');expect(shader).toContain('for(int refine=0;refine<5;refine++)');expect(shader).toContain('sky=mix(sky,texture(opaqueColor,hitUv).rgb,confidence)');
  const sample=shader.slice(shader.indexOf('bool reflectionSample'),shader.indexOf('void main(){\n if(buffersReady'));
  expect(sample.indexOf('projected.w<=.00001')).toBeLessThan(sample.indexOf('projected.xy/projected.w'));expect(sample.indexOf('lessThanEqual')).toBeLessThan(sample.indexOf('texture(opaqueDepth'));expect(sample.indexOf('depth>=.999999')).toBeLessThan(sample.indexOf('worldAt(uv,depth)'));
  expect(shader).toContain('validSample&&previousValid&&gap>0.&&previousGap<=0.');expect(shader).toContain('hitTravel=mix(low,high');
 });
});
