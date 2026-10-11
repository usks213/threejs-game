import { afterEach, expect, it, vi } from 'vitest';
import { Renderer } from '../../src/emberfall/render';
import { Run, idleInput } from '../../src/emberfall/simulation';
import { Material } from '../../src/emberfall/materials';
function context() {
  return { createImageData: (w: number,h: number) => ({ width:w,height:h,data:new Uint8ClampedArray(w*h*4) }), putImageData:vi.fn(), setTransform:vi.fn(), fillRect:vi.fn(), drawImage:vi.fn(), save:vi.fn(), restore:vi.fn(), translate:vi.fn(), strokeRect:vi.fn(), beginPath:vi.fn(), moveTo:vi.fn(), lineTo:vi.fn(), stroke:vi.fn(), fillText:vi.fn(), createRadialGradient:() => ({ addColorStop:vi.fn() }) };
}
afterEach(() => vi.unstubAllGlobals());
it('uploads startup terrain once, then only the retained dirty union', () => {
  const main = context(), terrain = context(), light = context(), bloom = context();
  const contexts = [terrain,light,bloom];
  vi.stubGlobal('document',{ createElement:() => { const ctx = contexts.shift(); return { getContext:() => ctx }; } });
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

it('refreshes only the small lighting buffers at 12 Hz and omits survival portal cues', () => {
  const main = context(), terrain = context(), light = context(), bloom = context();
  const contexts = [terrain,light,bloom];
  vi.stubGlobal('document',{ createElement:() => { const ctx = contexts.shift(); return { getContext:() => ctx }; } });
  const renderer = new Renderer({ getContext:() => main, dataset:{} } as unknown as HTMLCanvasElement);
  const run = Object.assign(new Run(3397), { mode: 'survival', structures: [{type:'torch',x:60,y:33}] });
  renderer.draw(run,idleInput());
  expect(main.fillText).not.toHaveBeenCalled();
  expect(light.putImageData).toHaveBeenCalledTimes(1); expect(bloom.putImageData).toHaveBeenCalledTimes(1);
  expect(renderer.metrics.lights).toBe(2);
  expect(renderer.metrics.lightWidth).toBeLessThan(renderer.width / 2);
  run.time = 0.04; renderer.draw(run,idleInput()); expect(light.putImageData).toHaveBeenCalledTimes(1);
  run.time = 0.09; renderer.draw(run,idleInput()); expect(light.putImageData).toHaveBeenCalledTimes(2);
  expect(terrain.putImageData).toHaveBeenCalledTimes(1);
  expect(renderer.metrics.rays).toBeLessThanOrEqual(6144);
});

it('uses the pure placement rule for green/red target corners at the actual footprint', () => {
  const main = context(), contexts = [context(),context(),context()], colors: string[] = [];
  Object.defineProperty(main,'fillStyle',{set:(value:string)=>colors.push(value)});
  vi.stubGlobal('document',{ createElement:() => { const ctx = contexts.shift(); return { getContext:() => ctx }; } });
  const renderer = new Renderer({getContext:()=>main} as unknown as HTMLCanvasElement);
  const canPlace = vi.fn().mockReturnValue(false);
  const run = Object.assign(new Run(3397),{mode:'survival',structures:[],tool:'torch',targetFromAim:()=>({x:70,y:33}),canPlace});
  renderer.draw(run,idleInput());
  expect(canPlace).toHaveBeenLastCalledWith('torch',70,33); expect(colors.at(-1)).toBe('#d48987');
  // Torch footprint is three cells wide and six high; corners enclose it.
  expect(main.fillRect).toHaveBeenCalledWith(68,27-renderer.cameraY,1,1);
  canPlace.mockReturnValue(true); renderer.draw(run,idleInput()); expect(colors.at(-1)).toBe('#b0deb3');
});
