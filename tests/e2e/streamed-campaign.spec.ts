import {test,expect,type Page,type Locator,type TestInfo} from '@playwright/test';
import {PlayerControls,read,choosePerformance,gatherAndLightHearth,type CampaignProbe} from './helpers/campaign-controls';
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();
async function ready(page:Page){await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);const state=await read(page);expect(state.restoreFailure).toBeNull();await expect(page.locator('#start'),state.saveStatus).toBeEnabled();}
async function open(page:Page,mobile:boolean,url:string){await page.goto(url);await ready(page);await choosePerformance(page,mobile);}
async function play(page:Page,mobile:boolean){await activate(page.locator('#start'),mobile);await expect(page.locator('#game')).toHaveAttribute('data-running','true');const controls=new PlayerControls(page,mobile);await controls.initialize();return controls;}
async function save(page:Page,mobile:boolean){await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),mobile);await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');}
const storage=(page:Page)=>page.evaluate(()=>({legacy:localStorage.getItem('ash-campaign-v1'),v3:localStorage.getItem('ash-campaign-v3'),selector:localStorage.getItem('ash-campaign-active-format'),archives:Object.keys(localStorage).filter(k=>k.startsWith('ash-campaign-v1:migration:')).sort().map(key=>({key,raw:localStorage.getItem(key)}))}));
function sameGameplay(actual:CampaignProbe,expected:CampaignProbe){expect(actual.inventory).toEqual(expected.inventory);expect(actual.campaign).toEqual(expected.campaign);expect(actual.worldSamples).toEqual(expected.worldSamples);expect(actual.position.x).toBeCloseTo(expected.position.x,4);expect(actual.position.y).toBeCloseTo(expected.position.y,4);expect(actual.position.z).toBeCloseTo(expected.position.z,4);}
async function providerEvidence(page:Page,info:TestInfo,name:string){
 await expect.poll(async()=>(await read(page)).stats.worldResidency.provider?.numericCacheBudgetBytes??0,{timeout:60000}).toBeGreaterThan(0);
 const p=await read(page),residency=p.stats.worldResidency,provider=residency.provider!;
 expect(p.streamedWorld).toBe(true);expect(residency.bucketScans,'Provider rendering must not rebuild global cell buckets').toBe(0);
 expect(Number.isFinite(provider.numericCacheBytes)).toBe(true);expect(provider.numericCacheBytes).toBeGreaterThanOrEqual(0);expect(provider.numericCacheBytes).toBeLessThanOrEqual(provider.numericCacheBudgetBytes);
 await info.attach(name,{body:JSON.stringify({backend:'campaign-v3 sampled provider',graphics:p.stats.graphics,residency,worldSamples:p.worldSamples},null,2),contentType:'application/json'});
}

test('streamed campaign fresh provider supports actual mining, hearth and v3 continuation',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);testInfo.annotations.push({type:'input-mode',description:isMobile?'Actual Android touch':'Actual desktop keyboard-look accessibility; no raw-relative-mouse claim'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));await open(page,isMobile,'/?test=1&streaming=1');const pristine=await read(page);expect(pristine.streamedWorld).toBe(true);expect(pristine.campaign.flameTier).toBe(0);
 const controls=await play(page,isMobile);let saved:CampaignProbe;
 try{await gatherAndLightHearth(page,controls);await controls.menu('settings');await save(page,isMobile);saved=await read(page);expect(saved.worldSamples).not.toEqual(pristine.worldSamples);await providerEvidence(page,testInfo,'fresh-provider-after-mining');}finally{await controls.dispose();}
 const written=await storage(page);expect(written.legacy).toBeNull();expect(written.archives).toEqual([]);expect(written.selector).toBe('campaign-v3');expect(JSON.parse(JSON.parse(written.v3!).payload).world).toBe('campaign-v3');
 await page.reload();await ready(page);sameGameplay(await read(page),saved!);await providerEvidence(page,testInfo,'fresh-provider-after-reload');await page.screenshot({path:testInfo.outputPath('streamed-fresh-continued.png')});expect(errors).toEqual([]);
});

test('streamed campaign opt-in preserves a played legacy world, archives exact bytes, and isolates New Game',async({page,context,isMobile},testInfo)=>{
 test.setTimeout(1200000);testInfo.annotations.push({type:'migration-source',description:'Created by actual controls in this fresh browser profile, never seeded or injected'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));await open(page,isMobile,'/?test=1');const pristine=await read(page);expect(pristine.streamedWorld).toBe(false);
 const controls=await play(page,isMobile);let saved:CampaignProbe;
 try{await gatherAndLightHearth(page,controls);await controls.menu('settings');await save(page,isMobile);saved=await read(page);expect(saved.worldSamples).not.toEqual(pristine.worldSamples);}finally{await controls.dispose();}
 const source=await storage(page);expect(source.legacy).not.toBeNull();expect(source.v3).toBeNull();expect(source.archives).toEqual([]);const legacySave=JSON.parse(JSON.parse(source.legacy!).payload);expect(legacySave.world).toBe('campaign-v2');
 await testInfo.attach('legacy-migration-source',{body:JSON.stringify({baseline:legacySave.field.baseline,inventory:legacySave.survival.inventory,saveStatus:saved!.saveStatus}),contentType:'application/json'});
 // Keep the source tab paused: unloading it legitimately writes another checkpoint.
 // A second real tab in the same profile isolates migration's byte-preservation claim.
 const migrated=await context.newPage();migrated.on('pageerror',error=>errors.push(String(error)));
 await open(migrated,isMobile,'/?test=1&streaming=1');const after=await read(migrated);expect(after.streamedWorld).toBe(true);sameGameplay(after,saved!);
 const first=await storage(migrated);expect(first.legacy).toBe(source.legacy);expect(first.selector).toBe('campaign-v3');expect(first.archives).toHaveLength(1);expect(first.archives[0].raw).toBe(source.legacy);const migratedSave=JSON.parse(JSON.parse(first.v3!).payload);expect(migratedSave.world).toBe('campaign-v3');expect(migratedSave.environment).toEqual(legacySave.environment);expect(migratedSave.fishing).toEqual(legacySave.fishing);
 await providerEvidence(migrated,testInfo,'migrated-provider');
 await activate(migrated.locator('#restart'),isMobile);await save(migrated,isMobile);await migrated.reload();await ready(migrated);sameGameplay(await read(migrated),saved!);
 let current=await storage(migrated);expect(current.legacy).toBe(source.legacy);expect(current.archives).toEqual(first.archives);await providerEvidence(migrated,testInfo,'migrated-provider-reloaded');
 await test.step('Confirm a new v3 game without resurrecting the old v2 journey',async()=>{
  await activate(migrated.locator('#restart'),isMobile);await activate(migrated.getByRole('button',{name:'新しく始める',exact:true}),isMobile);
  await Promise.all([migrated.waitForEvent('domcontentloaded'),activate(migrated.getByRole('button',{name:'バックアップして新しい旅へ',exact:true}),isMobile)]);await ready(migrated);
  let fresh=await read(migrated);expect(fresh.streamedWorld).toBe(true);expect(fresh.campaign.flameTier).toBe(0);expect(fresh.campaign.completed).toEqual([]);expect(Object.values(fresh.inventory).every(n=>n===0)).toBe(true);expect(fresh.worldSamples).toEqual(pristine.worldSamples);
  current=await storage(migrated);expect(current.selector).toBe('campaign-v3');expect(current.legacy).toBe(source.legacy);expect(current.archives).toEqual(first.archives);
  // The persisted selector must work without the opt-in query on subsequent visits.
  await migrated.goto('/?test=1');await ready(migrated);fresh=await read(migrated);expect(fresh.streamedWorld).toBe(true);expect(fresh.campaign.flameTier).toBe(0);expect(Object.values(fresh.inventory).every(n=>n===0)).toBe(true);expect(fresh.worldSamples).toEqual(pristine.worldSamples);
  current=await storage(migrated);expect(current.legacy).toBe(source.legacy);expect(current.archives).toEqual(first.archives);await providerEvidence(migrated,testInfo,'new-v3-without-opt-in-flag');await migrated.screenshot({path:testInfo.outputPath('streamed-new-game-isolated.png')});
 });
 expect(errors).toEqual([]);
});
