import {test,expect} from '@playwright/test';
// Dedicated fixture: npx playwright test --config=playwright.rendering.config.ts
// This is separate from production-route acceptance and real-device FPS.
test.describe('bounded water/fog GPU fixture',()=>{
 test('renders depth-correct above/shallow/below water, ripple input and resize',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto('/tests/e2e/fixtures/water-volume.html');await page.waitForFunction(()=>Boolean((window as unknown as {__waterHarness?:unknown}).__waterHarness));
  const layers=await page.evaluate(()=>{const h=(window as unknown as {__waterHarness:{compareLayers:()=>{waterPixels:number;fogPixels:number}}}).__waterHarness;return h.compareLayers();});
  expect(layers.waterPixels).toBeGreaterThan(150);expect(layers.fogPixels).toBeGreaterThan(150);
  await testInfo.attach('render-layer-evidence',{body:JSON.stringify(layers),contentType:'application/json'});
  for(const state of ['above','input','shallow','underwater','floor','resize','dry']){
   const result=await page.evaluate(state=>{const h=(window as unknown as {__waterHarness:{[key:string]:unknown;stats:()=>{error:number;programs:number};hdrStats:()=>{invalid:number;negative:number;invalidAlpha:number};pixelStats:()=>{mean:number;nonBlack:number;pixels:number};draw:()=>void}}).__waterHarness;if(state!=='above')(h[state] as ()=>void)();else h.draw();return {...h.pixelStats(),...h.hdrStats(),...h.stats()};},state);
   expect(result.error).toBe(0);expect(result.invalid).toBe(0);expect(result.negative).toBe(0);expect(result.invalidAlpha).toBe(0);expect(result.programs).toBeGreaterThan(0);expect(result.mean).toBeGreaterThan(5);expect(result.nonBlack/result.pixels).toBeGreaterThan(.65);await page.screenshot({path:testInfo.outputPath(`water-${state}.png`)});
  }
  expect(errors).toEqual([]);
 });
});
