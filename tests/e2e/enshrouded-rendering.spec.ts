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
  const coast=await page.evaluate(()=>{const h=(window as unknown as {__waterHarness:{compareCalmCoast:()=>{currentVsNoFoamPixels:number;legacyVsNoFoamPixels:number}}}).__waterHarness;return h.compareCalmCoast();});
  // A calm surface must not acquire the old periodic white foam. The legacy
  // diagnostic must visibly differ, proving this contrast check is meaningful.
  expect(coast.currentVsNoFoamPixels).toBe(0);expect(coast.legacyVsNoFoamPixels).toBeGreaterThan(150);
  await testInfo.attach('calm-coast-contrast',{body:JSON.stringify(coast),contentType:'application/json'});
  for(const variant of ['legacy-foam','no-foam','current']){await page.evaluate(name=>(window as unknown as {__waterHarness:{waterVariant:(name:string)=>void}}).__waterHarness.waterVariant(name),variant);await page.screenshot({path:testInfo.outputPath(`calm-coast-${variant}.png`)});}
  for(const state of ['above','input','shallow','underwater','floor','resize','dry']){
   const result=await page.evaluate(state=>{const h=(window as unknown as {__waterHarness:{[key:string]:unknown;stats:()=>{error:number;programs:number};hdrStats:()=>{invalid:number;negative:number;invalidAlpha:number};pixelStats:()=>{mean:number;nonBlack:number;pixels:number};draw:()=>void}}).__waterHarness;if(state!=='above')(h[state] as ()=>void)();else h.draw();return {...h.pixelStats(),...h.hdrStats(),...h.stats()};},state);
   expect(result.error).toBe(0);expect(result.invalid).toBe(0);expect(result.negative).toBe(0);expect(result.invalidAlpha).toBe(0);expect(result.programs).toBeGreaterThan(0);expect(result.mean).toBeGreaterThan(5);expect(result.nonBlack/result.pixels).toBeGreaterThan(.65);await page.screenshot({path:testInfo.outputPath(`water-${state}.png`)});
   if(state==='underwater'){
    const reflection=await page.evaluate(()=>(window as unknown as {__waterHarness:{compareUnderwaterReflection:()=>{currentVsDisabledPixels:number;legacyVsDisabledPixels:number;currentVsLegacyPixels:number}}}).__waterHarness.compareUnderwaterReflection());
    // Preserve real reflected scene contribution; a silent SSR disable is not a fix.
    expect(reflection.currentVsDisabledPixels).toBeGreaterThan(30);expect(reflection.legacyVsDisabledPixels).toBeGreaterThan(30);expect(reflection.currentVsLegacyPixels).toBeGreaterThan(30);
    await testInfo.attach('underwater-reflection-contrast',{body:JSON.stringify(reflection),contentType:'application/json'});
    for(const variant of ['legacy-ssr','no-ssr','no-detail','no-ssr-detail','current']){
     const variantStats=await page.evaluate(name=>{const h=(window as unknown as {__waterHarness:{waterVariant:(name:string)=>void;stats:()=>{error:number};hdrStats:()=>{invalid:number;negative:number;invalidAlpha:number}}}).__waterHarness;h.waterVariant(name);return {...h.hdrStats(),...h.stats()};},variant);
     expect(variantStats.error).toBe(0);expect(variantStats.invalid).toBe(0);expect(variantStats.negative).toBe(0);expect(variantStats.invalidAlpha).toBe(0);
     await page.screenshot({path:testInfo.outputPath(`water-underwater-${variant}.png`)});
    }
   }
  }
  expect(errors).toEqual([]);
 });
});
