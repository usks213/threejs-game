import {describe,it,expect} from 'vitest';
import {encodeCompactFluidDelta as encode,decodeCompactFluidDelta as decode,MAX_COMPACT_FLUID_BASE64} from '../../src/networking/compact-fluid';
import {FluidWireDecoder,FluidWireEncoder,type FluidDelta,type FluidTuple} from '../../src/networking/fluid-wire';
const tuple:FluidTuple=[-.5,1,2,.5,.012345678901234567,.26953125,-1.429,.483,1];
const delta=(t:FluidTuple=tuple):FluidDelta=>({base:0,revision:1,count:1,changed:[t],removed:[]});
const edit=(raw:ReturnType<typeof encode>,fn:(bytes:Uint8Array)=>void)=>{const b=Uint8Array.from(atob(raw.data),c=>c.charCodeAt(0));fn(b);return {...raw,data:btoa(String.fromCharCode(...b))};};
describe('lossless compact water transport',()=>{
 it('roundtrips current snapshot numbers exactly, including fallback values and negative zero',()=>{
  for(const t of [tuple,[-0,1,2,.5,Number.MIN_VALUE,.1234567890123456,-0,Math.PI,0] as FluidTuple,[0,1,2,1,.9999999999999999,1,12,-12,0] as FluidTuple]){const restored=decode(encode(delta(t)));expect(restored).toEqual(delta(t));for(let i=0;i<9;i++)expect(Object.is(restored.changed[0][i],t[i])).toBe(true);}
 });
 it('preserves every millimetre-per-second velocity including binary multiplication underflow',()=>{for(let n=-12000;n<=12000;n++){const t:FluidTuple=[0,1,0,.5,.1,.25,n/1000,-n/1000,0];expect(decode(encode(delta(t))).changed[0]).toEqual(t);}});
 it('handles empty frames, removed coordinates and gap checks without advancing a rejected dictionary',()=>{
  const encoder=new FluidWireEncoder(),decoder=new FluidWireDecoder(),cells=[{x:0,y:1,z:0,size:.5,volume:.1,vx:0,vz:0}];encoder.reset(cells);decoder.reset(cells);
  const d=encoder.encode([]);expect(decoder.apply(decode(encode(d)))).toEqual([]);expect(()=>decoder.apply(decode(encode(d)))).toThrow('連続');
  const next=encoder.encode(cells),wire=encode(next);expect(()=>decoder.apply({...decode(wire),count:2})).toThrow('数');expect(decoder.apply(decode(wire))).toHaveLength(1);
 });
 it('bounds full 8192-cell frames with no precision reduction',()=>{
  const changed:FluidTuple[]=Array.from({length:8192},(_,i)=>[i%128*.5,1,Math.floor(i/128)*.5,.5,.1+(i%5)*.001,.25,Math.sin(i),Math.cos(i),0]);const d={base:10,revision:11,count:8192,changed,removed:[]};const packed=encode(d);expect(packed.data.length).toBeLessThanOrEqual(MAX_COMPACT_FLUID_BASE64);expect(JSON.stringify(packed).length).toBeLessThan(JSON.stringify(d).length);expect(decode(packed)).toEqual(d);
 });
 it('rejects malformed base64, oversize, versions, metadata, flags, truncation and trailing bytes',()=>{
  const good=encode(delta());for(const bad of [{...good,data:'!!!!'},{...good,data:'A'.repeat(MAX_COMPACT_FLUID_BASE64+4)},{...good,format:'unknown'},{...good,base:-1},{...good,revision:1.5},{...good,count:8193},edit(good,b=>b[2]=2),edit(good,b=>b[8]=255),{...good,data:good.data.slice(0,-4)},{...good,data:btoa(atob(good.data)+'x')}])expect(()=>decode(bad)).toThrow();
 });
 it('rejects invalid coordinates, NaN/Infinity, duplicate/overlapping keys and size limits',()=>{
  for(const d of [delta([2000,...tuple.slice(1)] as FluidTuple),delta([.25,...tuple.slice(1)] as FluidTuple),delta([...tuple.slice(0,4),NaN,...tuple.slice(5)] as FluidTuple),{...delta(),removed:['-0,1,2']},{...delta(),removed:['-0.5,1,2']},{...delta(),changed:[tuple,tuple]},{...delta(),changed:Array(8193).fill(tuple)}])expect(()=>encode(d)).toThrow();
  const nan=edit(encode(delta()),b=>new DataView(b.buffer).setFloat64(15,Infinity,true));expect(()=>decode(nan)).toThrow();
  const duplicate=encode({...delta(),count:2,changed:[tuple,[.5,...tuple.slice(1)] as FluidTuple]});const bad=edit(duplicate,b=>{b[30]=b[9];b[31]=b[10];});expect(()=>decode(bad)).toThrow();
 });
 it('keeps genuine IEEE precision that is not representable by compact integer fields',()=>{
  const t:FluidTuple=[1,1,1,.5,.1,.30000000000000004,.00000000000001,-.123456789123456,0];const packed=encode(delta(t));expect(decode(packed).changed[0]).toEqual(t);expect(atob(packed.data).length).toBe(8+21+18);
 });
});
