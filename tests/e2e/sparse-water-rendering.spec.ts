import {test,expect} from '@playwright/test';
test('sparse water GPU fixture covers above, below, near plane, ripple, resize and dry field',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('/tests/e2e/fixtures/sparse-water-volume.html');await page.waitForFunction(()=>Boolean((window as unknown as {__sparseHarness?:unknown}).__sparseHarness));
 const water=await page.evaluate(async()=>(window as unknown as {__sparseHarness:{probe:()=>Promise<{waterPixels:number;invalidPixels:number}>}}).__sparseHarness.probe());expect(water.waterPixels).toBeGreaterThan(150);expect(water.invalidPixels).toBe(0);
 for(const state of ['above','input','underwater','noDetail','noSSR','noDetailOrSSR','nearplane','resize','dry']){const data=await page.evaluate(state=>{const h=(window as unknown as {__sparseHarness:{[key:string]:unknown;stats:()=>{error:number;mean:number;sdfBricks:number;volumeFrames:number};draw:()=>void}}).__sparseHarness;if(state==='above')h.draw();else(h[state] as ()=>void)();return h.stats();},state);expect(data.error).toBe(0);expect(data.mean).toBeGreaterThan(5);expect(data.volumeFrames).toBeGreaterThan(0);if(state==='dry')expect(data.sdfBricks).toBe(0);await info.attach(`sparse-${state}-metrics`,{body:JSON.stringify(data),contentType:'application/json'});await page.screenshot({path:info.outputPath(`sparse-${state}.png`)});}
 expect(errors).toEqual([]);
});
