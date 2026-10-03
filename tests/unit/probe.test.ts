import { expect,test } from 'vitest';
import { DataUtils, Vector3 } from 'three';
import { projectProbe } from '../../src/rendering/environment/probe';
function cube(){return Array.from({length:6},()=>{const data=new Uint16Array(8*8*4);for(let i=0;i<data.length;i+=4){data[i]=DataUtils.toHalfFloat(1);data[i+1]=DataUtils.toHalfFloat(.5);data[i+2]=DataUtils.toHalfFloat(.25);data[i+3]=DataUtils.toHalfFloat(1);}return data;});}
test('constant HDR environment yields direction-independent diffuse irradiance',()=>{
 const sh=projectProbe(cube(),8).sh,a=new Vector3(),b=new Vector3();sh.getIrradianceAt(new Vector3(1,0,0),a);sh.getIrradianceAt(new Vector3(0,1,0),b);
 expect(a.x).toBeCloseTo(Math.PI,3);expect(a.y).toBeCloseTo(Math.PI*.5,3);expect(a.distanceTo(b)).toBeLessThan(.0001);
});
test('WebGL cube face +X illuminates +X more than -X',()=>{const data=cube();for(let f=1;f<6;f++)data[f].fill(0);const sh=projectProbe(data,8).sh,a=new Vector3(),b=new Vector3();sh.getIrradianceAt(new Vector3(1,0,0),a);sh.getIrradianceAt(new Vector3(-1,0,0),b);expect(a.x).toBeGreaterThan(b.x+1);});
