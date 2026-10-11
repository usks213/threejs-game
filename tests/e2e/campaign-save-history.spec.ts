import {test,expect,type Locator,type Page} from '@playwright/test';
const KEY='ash-campaign-v3';
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();
const probe=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as {worldReady:boolean;saveStatus:string;settings:{volume:number};restoreFailure:string|null});
const primary=(page:Page)=>page.evaluate(key=>localStorage.getItem(key),KEY);
const history=(page:Page)=>page.evaluate(key=>{const raw=localStorage.getItem(key+':archives');if(raw===null)return [];return (JSON.parse(JSON.parse(raw).payload) as {id:string;reason:string}[]).map(entry=>({...entry,raw:localStorage.getItem(key+':archive:'+entry.id)}));},KEY);
async function ready(page:Page){await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await probe(page)).worldReady,{timeout:120000}).toBe(true);expect((await probe(page)).restoreFailure).toBeNull();}
async function settings(page:Page,mobile:boolean){await activate(page.locator('#restart'),mobile);await activate(page.locator('[data-tab=settings]'),mobile);}
async function save(page:Page,mobile:boolean){await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),mobile);await expect.poll(async()=>(await probe(page)).saveStatus).toContain('保存済み');}

test('saved journeys survive new-world autosaves and restore only after visible confirmation',async({page,isMobile},testInfo)=>{
 test.setTimeout(360000);testInfo.annotations.push({type:'save-history',description:'Worlds created and restored using production menus; storage is observed only, never seeded or changed by the test'});
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto('/?test=1&streaming=1');await ready(page);await settings(page,isMobile);
 const volume=page.getByRole('slider',{name:'音量',exact:true});
 if(isMobile){await volume.scrollIntoViewIfNeeded();const box=await volume.boundingBox();expect(box).not.toBeNull();await volume.tap({position:{x:box!.width*.2,y:box!.height/2}});}
 else{await volume.focus();await page.keyboard.press('Home');for(let i=0;i<4;i++)await page.keyboard.press('ArrowRight');}
 await expect.poll(async()=>(await probe(page)).settings.volume).toBeLessThan(.5);await save(page,isMobile);const firstVolume=(await probe(page)).settings.volume,original=await primary(page);expect(original).not.toBeNull();
 await activate(page.getByRole('button',{name:'新しく始める',exact:true}),isMobile);const newConfirmation=page.getByRole('group',{name:'新しい旅の確認'});await expect(newConfirmation).toContainText('自動保存で上書き・自動削除されません');
 await activate(newConfirmation.getByRole('button',{name:'やめる',exact:true}),isMobile);expect(await primary(page)).toBe(original);expect(await history(page)).toEqual([]);
 await activate(page.getByRole('button',{name:'新しく始める',exact:true}),isMobile);
 await Promise.all([page.waitForEvent('domcontentloaded'),activate(page.getByRole('button',{name:'バックアップして新しい旅へ',exact:true}),isMobile)]);await ready(page);expect((await probe(page)).settings.volume).toBe(.8);
 const savedHistory=await history(page);expect(savedHistory).toHaveLength(1);expect(savedHistory[0].raw).toBe(original);const archiveId=savedHistory[0].id;
 await settings(page,isMobile);await save(page,isMobile);await save(page,isMobile);
 // Normal pagehide autosaves rotate :backup too; neither is the durable archive.
 for(let i=0;i<2;i++){await page.reload();await ready(page);}
 expect((await history(page)).find(entry=>entry.id===archiveId)?.raw).toBe(original);expect(await page.evaluate(key=>localStorage.getItem(key+':backup'),KEY)).not.toBe(original);
 await settings(page,isMobile);const row=page.locator(`[data-archive-id="${archiveId}"]`),choose=row.getByRole('button',{name:'この旅を復元',exact:true});await expect(row).toContainText('保存先：');await expect(row).toContainText('保存日時：');await expect(row).toContainText('保管日時：');await expect(row).toContainText('KiB');
 const beforeRestore=await primary(page);await activate(choose,isMobile);const confirm=page.getByRole('group',{name:'旅の復元の確認'});await expect(confirm).toBeVisible();expect(await primary(page)).toBe(beforeRestore);
 await activate(confirm.getByRole('button',{name:'やめる',exact:true}),isMobile);await expect(confirm).toBeHidden();expect(await primary(page)).toBe(beforeRestore);
 await activate(choose,isMobile);await activate(page.locator('[data-tab=inventory]'),isMobile);await activate(page.locator('[data-tab=settings]'),isMobile);await expect(confirm).toBeHidden();
 await activate(choose,isMobile);await activate(page.getByRole('button',{name:'旅の記録を閉じる',exact:true}),isMobile);await settings(page,isMobile);await expect(confirm).toBeHidden();
 await activate(choose,isMobile);for(const button of [choose,confirm.getByRole('button',{name:'現在の旅を保管して復元',exact:true}),confirm.getByRole('button',{name:'やめる',exact:true})]){const box=await button.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(48);}
 await Promise.all([page.waitForEvent('domcontentloaded'),activate(confirm.getByRole('button',{name:'現在の旅を保管して復元',exact:true}),isMobile)]);await ready(page);expect((await probe(page)).settings.volume).toBe(firstVolume);expect(await primary(page)).toBe(original);
 const afterRestore=await history(page);expect(afterRestore.find(entry=>entry.id===archiveId)?.raw).toBe(original);expect(afterRestore.some(entry=>entry.reason==='restore'&&entry.raw===beforeRestore)).toBe(true);
 await settings(page,isMobile);await page.locator('.campaign-archive-list').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('restored-world-history.png')});expect(errors).toEqual([]);
});
