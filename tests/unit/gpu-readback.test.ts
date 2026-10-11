import {expect,it,vi} from 'vitest';
import {captureDefaultPixels} from '../helpers/gpu-readback';
it('captures with no pack buffer and restores an in-flight asynchronous readback binding',()=>{
 const pending={},calls:unknown[]=[],gl={PIXEL_PACK_BUFFER:1,PIXEL_PACK_BUFFER_BINDING:2,RGBA:3,UNSIGNED_BYTE:4,getParameter:vi.fn(()=>pending),bindBuffer:vi.fn((_target:number,buffer:unknown)=>calls.push(buffer)),readPixels:vi.fn((_x:number,_y:number,_w:number,_h:number,_format:number,_type:number,data:Uint8Array)=>{expect(calls.at(-1)).toBeNull();data.fill(120);})} as unknown as WebGL2RenderingContext;
 expect(captureDefaultPixels(gl,2,1)).toEqual(new Uint8Array(8).fill(120));expect(calls).toEqual([null,pending]);expect(gl.getParameter).toHaveBeenCalledWith(gl.PIXEL_PACK_BUFFER_BINDING);
});
it('restores binding even if capture fails, without clearing the graphics error',()=>{
 const pending={},bindBuffer=vi.fn(),gl={PIXEL_PACK_BUFFER:1,PIXEL_PACK_BUFFER_BINDING:2,getParameter:()=>pending,bindBuffer,readPixels:()=>{throw Error('read failure');}} as unknown as WebGL2RenderingContext;
 expect(()=>captureDefaultPixels(gl,1,1)).toThrow('read failure');expect(bindBuffer).toHaveBeenLastCalledWith(1,pending);
});
