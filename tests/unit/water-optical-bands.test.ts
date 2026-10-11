import {describe,it,expect} from 'vitest';
import {VoxelWater} from '../../src/prototype/core/water';
import {VoxelField} from '../../src/prototype/core/voxel';
import {WaterDistanceField} from '../../src/prototype/rendering/water-distance-field';
import {waterVolumeFragment as shader} from '../../src/prototype/rendering/water-volume-shaders';
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};

describe('water optical band regression',()=>{
 it('does not turn a calm shore or thin film into periodic white foam',()=>{
  const foam=shader.match(/float shore=([^;]+);/)?.[1];expect(foam).toBeDefined();expect(foam).toContain('disturbance');expect(foam).not.toContain('coastWave');expect(foam).not.toContain('thickness');
  expect(shader).toContain('smoothstep(.002,.016,abs(ripple(p)))');
  for(const coast of [0,.25,.5,.75,1])for(const height of [0,.035/255,-.035/255])expect(coast**6*smooth(.002,.016,Math.abs(height))*.12).toBe(0);
  expect(smooth(.002,.016,.02)).toBe(1);
 });
 it('filters unresolved detail using derivatives evaluated before divergent tracing',()=>{
  const derivative=shader.indexOf('float pixelCone='),tracing=shader.indexOf('for(int step=0;step<96;step++)');expect(derivative).toBeGreaterThan(0);expect(derivative).toBeLessThan(tracing);
  expect(shader).toContain('footprint=t*pixelCone/max(abs(dot(n,-rd)),.04)');expect(shader).toContain('abs(n.y)*detailFilter');
  const filter=(distance:number,cone:number,incidence:number)=>1-smooth(.35,2.5,distance*cone/Math.max(incidence,.04)*25);
  expect(filter(2,.002,1)).toBe(1);expect(filter(8,.002,.03)).toBe(0);
 });
 it('refines coarse near-hit candidates to the same quantized planar zero across ray slopes',()=>{
  expect(shader).toContain('for(int i=0;i<2;i++){vec3 candidate=eye+rd*t');expect(shader).toContain('t=clamp(t-clamp(value/slope,-.03,.03),start,end)');
  const water=new VoxelWater(new VoxelField());water.volume.fill(0);for(let z=8;z<40;z++)for(let x=8;x<40;x++)for(let y=0;y<4;y++)water.volume[water.index(x,y,z)]=1;
  const field=new WaterDistanceField(water);for(let i=0;i<field.distance.length;i++)field.distance[i]=(field.encoded[i]/255*2-1)*field.range;
  for(const directionY of [-.2,-.35,-.5,-.7])for(const residual of [.0005,.002,.004]){
   const distance=(t:number)=>field.sample(7,residual+directionY*t,-2);let t=0;
   for(let i=0;i<2;i++){const value=distance(t),slope=(distance(t+.01)-distance(t-.01))/.02;if(Math.abs(slope)>.08)t=clamp(t-clamp(value/slope,-.03,.03),-.1,.1);}
   expect(Math.abs(distance(t))).toBeLessThan(.00001);expect(Math.abs(residual+directionY*t)).toBeLessThan(.00001);
  }
 });
});
