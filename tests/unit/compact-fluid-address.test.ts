import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {WORLD} from '../../src/world/types';
import {encodeCompactFluidDelta as encode,decodeCompactFluidDelta as decode} from '../../src/networking/compact-fluid';
import type {FluidDelta,FluidTuple} from '../../src/networking/fluid-wire';
const cell=(x:number,y:number,z:number):FluidTuple=>[x,y,z,.5,.1,.25,0,0,0];
function fixture():FluidDelta{
 const changed:FluidTuple[]=[];
 for(const x of [WORLD.minX,WORLD.maxX])for(const y of [WORLD.minY,WORLD.maxY])for(const z of [WORLD.minZ,WORLD.maxZ])changed.push(cell(x,y,z));
 changed.push(cell(WORLD.minX+.5,WORLD.minY,WORLD.maxZ),cell(WORLD.minX,WORLD.minY+.5,WORLD.minZ),cell(WORLD.maxX,WORLD.maxY,WORLD.maxZ-.5),[-0,1,2,.5,Number.MIN_VALUE,.1234567890123456,-0,Math.PI,0]);
 return{base:7,revision:8,count:changed.length,changed,removed:['0,0,0','0.5,0,0']};
}
it('keeps the established exact bytes and distinct edge cells across coordinate strides',()=>{
 const input=fixture(),wire=encode(input);
 expect(createHash('sha256').update(wire.data).digest('hex')).toBe('acef5fee24563930e9e9f743cdaf8aba6d17c496e9e74135a2ffc5c2d95526c7');
 const restored=decode(wire);expect(restored).toEqual(input);
 input.changed.forEach((tuple,i)=>tuple.forEach((value,j)=>expect(Object.is(restored.changed[i][j],value)).toBe(true)));
 const x=(WORLD.maxX-WORLD.minX)*2+1,z=(WORLD.maxZ-WORLD.minZ)*2+1,y=(WORLD.maxY-WORLD.minY)*2+1;
 expect(Number.isSafeInteger(x*z*y-1)).toBe(true);
 // Boundary neighborhoods include ±0, adjacent half-cells and every axis extreme.
 const keys=new Set<string>(),cells:FluidTuple[]=[];
 for(const a of [WORLD.minX,WORLD.minX+.5,-.5,-0,0,.5,WORLD.maxX-.5,WORLD.maxX])for(const b of [WORLD.minY,WORLD.minY+.5,-.5,-0,0,.5,WORLD.maxY-.5,WORLD.maxY])for(const c of [WORLD.minZ,WORLD.minZ+.5,-.5,-0,0,.5,WORLD.maxZ-.5,WORLD.maxZ]){
  const id=`${a},${b},${c}`;if(keys.has(id))continue;keys.add(id);cells.push(cell(a,b,c));
 }
 expect(decode(encode({base:0,revision:1,count:cells.length,changed:cells,removed:[]})).changed).toEqual(cells);
});
it('preserves duplicate, canonical removal and malformed-coordinate rejection',()=>{
 const base={base:0,revision:1,count:1,changed:[cell(0,1,2)],removed:[]} satisfies FluidDelta;
 for(const bad of [
  {...base,changed:[cell(0,1,2),cell(-0,1,2)]},
  {...base,changed:[cell(-0,1,2)],removed:['0,1,2']},
  {...base,removed:['1,1,2','1,1,2']},
  ...['-0,1,2',' 0,1,2','0e0,1,2','0.00,1,2'].map(id=>({...base,removed:[id]})),
  ...[WORLD.maxX+.5,WORLD.minX-.5,.25,NaN,Infinity].map(x=>({...base,changed:[cell(x,1,2)]})),
  {...base,changed:[cell(0,WORLD.maxY+.5,2)]},{...base,changed:[cell(0,1,WORLD.maxZ+.5)]},
 ])expect(()=>encode(bad)).toThrow('圧縮水データが不正です');
});
