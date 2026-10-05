import {CAMPAIGN_PROTOCOL} from '../../src/prototype/network/protocol';
import {test,expect,type Locator,type Page} from '@playwright/test';
import type {CampaignSettings} from '../../src/prototype/campaign-session';

const PRIMARY='ash-campaign-v3',SELECTOR='ash-campaign-active-format';
const INVITATION='#campaign-room='+'b'.repeat(64);
interface InvitationProbe {
 worldReady:boolean;guestPreview:boolean;streamedWorld:boolean;westernContent:boolean;
 saveStatus:string;restoreFailure:string|null;settings:CampaignSettings;
 cooperation:{enabled:boolean;online:boolean;role:'host'|'guest'|null;guestPreview:boolean};
}
const probe=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as InvitationProbe);
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();
/** Observe all campaign slots, selectors, migration records and immutable history.
 * The test never seeds, edits, removes or monkey-patches browser storage. */
const campaignStorage=(page:Page)=>page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(key=>key.startsWith('ash-campaign-')).sort().map(key=>[key,localStorage.getItem(key)!])));
async function unchanged(page:Page,before:Record<string,string>,stage:string){
 const after=await campaignStorage(page);expect(Object.keys(after),stage+' storage keys').toEqual(Object.keys(before));
 for(const key of Object.keys(before))expect(after[key]===before[key],stage+': byte-exact '+key).toBe(true);
}
async function ready(page:Page){
 await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});
 await expect.poll(async()=>(await probe(page)).worldReady,{timeout:120000}).toBe(true);
 expect((await probe(page)).restoreFailure).toBeNull();
}
async function settings(page:Page,mobile:boolean){await activate(page.locator('#restart'),mobile);await activate(page.locator('[data-tab=settings]'),mobile);}
async function volume(page:Page,mobile:boolean,target:number){
 const slider=page.getByRole('slider',{name:'音量',exact:true});await slider.scrollIntoViewIfNeeded();
 if(mobile){const box=await slider.boundingBox();expect(box).not.toBeNull();await slider.tap({position:{x:box!.width*target,y:box!.height/2}});}
 else{await slider.focus();await page.keyboard.press('Home');for(let i=0;i<Math.round(target/.05);i++)await page.keyboard.press('ArrowRight');}
 await expect.poll(async()=>Math.abs((await probe(page)).settings.volume-target)).toBeLessThanOrEqual(.1);
}
async function save(page:Page,mobile:boolean){await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),mobile);await expect.poll(async()=>(await probe(page)).saveStatus).toContain('保存済み');}
async function previewSaveControls(page:Page){
 for(const name of ['今すぐ保存','保存から続ける','新しく始める'])await expect(page.getByRole('button',{name,exact:true})).toBeDisabled();
 await expect(page.locator('[data-archive-action]:enabled')).toHaveCount(0);
 await expect(page.locator('[data-archive-id]')).toHaveCount(0);
 await expect(page.getByRole('group',{name:'新しい旅の確認'})).toHaveCount(0);
 await expect(page.getByRole('group',{name:'旅の復元の確認'})).toHaveCount(0);
}

test('an unjoined western invitation preserves existing solo saves and returns to their preferences',async({page,context,isMobile},testInfo)=>{
 test.setTimeout(360000);
 testInfo.annotations.push({type:'invitation-privacy',description:'Real solo menu/settings/save/new-game controls create the checkpoints and archive. Storage is observed only. Only room-service health is stubbed; no room is created or joined.'});
 const errors:string[]=[],roomAttempts:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 // Show available join/create controls without depending on any deployed relay.
 await context.route('**/campaign-room/health',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({service:'pr4-campaign-room',protocol:CAMPAIGN_PROTOCOL,enabled:true})}));
 // A regression must fail this test without opening an external room connection.
 // Not connecting the route to a server keeps all room traffic intercepted.
 await context.routeWebSocket(/\/campaign-room\//,route=>{roomAttempts.push(route.url());route.close({code:1008,reason:'No room connection is allowed in this acceptance test'});});

 await test.step('Create a real non-default solo checkpoint and archive through normal controls',async()=>{
  await page.goto('/?test=1&streaming=1');await ready(page);await settings(page,isMobile);
  await volume(page,isMobile,.2);await page.getByRole('combobox',{name:'描画品質',exact:true}).selectOption('performance');await save(page,isMobile);
  const first=await campaignStorage(page);expect(first[SELECTOR]).toBe('campaign-v3');expect(first[PRIMARY]).toBeTruthy();
  await activate(page.getByRole('button',{name:'新しく始める',exact:true}),isMobile);
  const confirmation=page.getByRole('group',{name:'新しい旅の確認'});await expect(confirmation).toBeVisible();
  await Promise.all([page.waitForEvent('domcontentloaded'),activate(confirmation.getByRole('button',{name:'バックアップして新しい旅へ',exact:true}),isMobile)]);
  await ready(page);expect((await probe(page)).settings.volume).toBe(.8);
  const afterReset=await campaignStorage(page),archives=Object.keys(afterReset).filter(key=>key.startsWith(PRIMARY+':archive:'));
  expect(archives).toHaveLength(1);expect(afterReset[archives[0]]===first[PRIMARY]).toBe(true);
  await settings(page,isMobile);await volume(page,isMobile,.35);await page.getByRole('combobox',{name:'描画品質',exact:true}).selectOption('performance');await save(page,isMobile);
  await expect(page.locator('[data-archive-id]')).toHaveCount(1);await expect(page.getByRole('button',{name:'この旅を復元',exact:true})).toBeEnabled();
 });
 const ownSettings=(await probe(page)).settings,before=await campaignStorage(page);
 expect(ownSettings.volume).toBeLessThan(.5);expect(ownSettings.graphics).toBe('performance');expect(before[SELECTOR]).toBe('campaign-v3');expect(before[PRIMARY+':archives']).toBeTruthy();
 expect(Object.keys(before).some(key=>key.startsWith('ash-campaign-v4'))).toBe(false);
 expect(JSON.parse(JSON.parse(before[PRIMARY]).payload).settings).toEqual(ownSettings);

 // Keep the original solo tab paused. Unloading it would legitimately perform
 // its own pagehide save, obscuring which writes came from invitation startup.
 // The second tab shares localStorage but has no inherited host-resume identity.
 const invited=await context.newPage();invited.on('pageerror',error=>errors.push(String(error)));
 await test.step('Open the invitation without reading or migrating the existing solo campaign',async()=>{
  await invited.goto('/?test=1&streaming=1&expedition=west'+INVITATION);await ready(invited);
  await expect.poll(async()=>(await probe(invited)).cooperation.enabled).toBe(true);
  expect(await probe(invited)).toMatchObject({guestPreview:true,streamedWorld:true,westernContent:true,cooperation:{online:false,role:null,guestPreview:true}});
  expect((await probe(invited)).settings.volume).toBe(.8);expect((await probe(invited)).settings.graphics).toBe('balanced');
  await expect(invited.locator('#game')).toHaveAttribute('data-running','false');await unchanged(invited,before,'invitation startup');
  await activate(invited.locator('#start'),isMobile);await expect(invited.locator('#campaign-panel')).toBeVisible();
  await expect(invited.locator('[data-tab=cooperation]')).toHaveAttribute('aria-pressed','true');
  await expect(invited.locator('[data-coop=create]')).toBeDisabled();await expect(invited.locator('[data-coop=join]')).toBeEnabled();
  await expect(invited.getByRole('button',{name:'自分の旅へ戻る',exact:true})).toBeEnabled();
  await expect(invited.locator('#game')).toHaveAttribute('data-running','false');expect(roomAttempts).toEqual([]);await unchanged(invited,before,'unjoined cooperation menu');
 });

 await test.step('Keep save, reset and restore unavailable while temporary preferences change',async()=>{
  await activate(invited.locator('[data-tab=settings]'),isMobile);await previewSaveControls(invited);await unchanged(invited,before,'preview save controls');
  await volume(invited,isMobile,.9);expect((await probe(invited)).settings.volume).toBeGreaterThan(.7);
  await invited.getByRole('combobox',{name:'描画品質',exact:true}).selectOption('performance');
  await activate(invited.locator('[data-tab=inventory]'),isMobile);await activate(invited.locator('[data-tab=settings]'),isMobile);
  await previewSaveControls(invited);await unchanged(invited,before,'preview preference changes');
  await activate(invited.getByRole('button',{name:'旅の記録を閉じる',exact:true}),isMobile);await expect(invited.locator('#campaign-panel')).toBeHidden();
  await activate(invited.locator('#start'),isMobile);await expect(invited.locator('[data-tab=cooperation]')).toHaveAttribute('aria-pressed','true');
  await expect(invited.locator('[data-coop=create]')).toBeDisabled();await expect(invited.getByRole('button',{name:'自分の旅へ戻る',exact:true})).toBeEnabled();
  expect((await probe(invited)).cooperation.role).toBeNull();expect(roomAttempts).toEqual([]);await unchanged(invited,before,'reopened preview');
 });

 await test.step('Leave before joining, clear invitation flags, and load the untouched solo preferences',async()=>{
  await Promise.all([invited.waitForEvent('domcontentloaded'),activate(invited.getByRole('button',{name:'自分の旅へ戻る',exact:true}),isMobile)]);
  await ready(invited);await expect.poll(async()=>(await probe(invited)).saveStatus).toContain('読み込みました');
  const returnedURL=new URL(invited.url());expect(returnedURL.hash).toBe('');expect(returnedURL.searchParams.has('streaming')).toBe(false);expect(returnedURL.searchParams.has('expedition')).toBe(false);expect(returnedURL.searchParams.get('test')).toBe('1');
  const restored=await probe(invited);expect(restored.guestPreview).toBe(false);expect(restored.streamedWorld).toBe(true);expect(restored.westernContent).toBe(false);expect(restored.settings).toEqual(ownSettings);expect(restored.cooperation.role).toBeNull();
  await unchanged(invited,before,'return to solo');await settings(invited,isMobile);
  for(const name of ['今すぐ保存','保存から続ける','新しく始める','この旅を復元'])await expect(invited.getByRole('button',{name,exact:true})).toBeEnabled();
  await expect(invited.locator('[data-archive-id]')).toHaveCount(1);await unchanged(invited,before,'restored solo menus');
 });
 expect(roomAttempts).toEqual([]);expect(errors).toEqual([]);
 await testInfo.attach('invitation-storage-privacy',{body:JSON.stringify({preservedKeys:Object.keys(before),soloSettings:ownSettings,returnedURL:invited.url(),roomConnections:roomAttempts.length},null,2),contentType:'application/json'});
});
