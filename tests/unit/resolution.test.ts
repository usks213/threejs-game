import {expect,it} from 'vitest';
import {AdaptiveResolution} from '../../src/rendering/resolution';
it('reduces resolution for sustained slow direct or mesh frames, excluding first compilation samples',()=>{const r=new AdaptiveResolution();r.observe(3000);r.observe(3000);expect(r.scale).toBe(1);for(let i=0;i<3;i++)r.observe(300);expect(r.scale).toBe(.85);for(let i=0;i<20;i++)r.observe(100);expect(r.scale).toBe(.55);});
it('honors explicit user quality and ignores invalid timings',()=>{const r=new AdaptiveResolution('high');for(let i=0;i<30;i++)r.observe(1000);expect(r.scale).toBe(1);r.setMode('low');expect(r.scale).toBe(.55);r.setMode('auto');r.observe(NaN);expect(r.scale).toBe(1);});
