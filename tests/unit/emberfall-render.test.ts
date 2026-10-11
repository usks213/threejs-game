import { afterEach, expect, it, vi } from 'vitest';
import { Renderer } from '../../src/emberfall/render';
import { Run, idleInput } from '../../src/emberfall/simulation';
import { Material } from '../../src/emberfall/materials';
function context() {
  return { createImageData: (w: number,h: number) => ({ width:w,height:h,data:new Uint8ClampedArray(w*h*4) }), putImageData:vi.fn(), setTransform:vi.fn(), fillRect:vi.fn(), drawImage:vi.fn(), save:vi.fn(), restore:vi.fn(), translate:vi.fn(), strokeRect:vi.fn(), beginPath:vi.fn(), moveTo:vi.fn(), lineTo:vi.fn(), stroke:vi.fn(), fillText:vi.fn(), createRadialGradient:() => ({ addColorStop:vi.fn() }) };
}
afterEach(() => vi.unstubAllGlobals());
it('uploads startup terrain once, then only the retained dirty union', () => {
  const main = context(), terrain = context();
  vi.stubGlobal('document',{ createElement:() => ({ getContext:() => terrain }) });
  const renderer = new Renderer({ getContext:() => main } as unknown as HTMLCanvasElement);
  const run = new Run(3397), input = idleInput();
  renderer.draw(run,input);
  expect(terrain.putImageData).toHaveBeenCalledTimes(1);
  expect(terrain.putImageData.mock.calls[0].slice(3)).toEqual([0,0,256,384]);
  renderer.draw(run,input); expect(terrain.putImageData).toHaveBeenCalledTimes(1);
  run.world.set(41,26,Material.Water);
  renderer.draw(run,input); expect(terrain.putImageData).toHaveBeenCalledTimes(2);
  expect(terrain.putImageData.mock.calls[1].slice(3)).toEqual([32,16,16,16]);
  expect(renderer.pixels.data[(26*256+41)*4+3]).toBe(255);
  expect(run.world.dirty.size).toBe(0);
});
