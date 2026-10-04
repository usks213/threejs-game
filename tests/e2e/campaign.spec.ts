import {test,expect,type Page,type Locator} from '@playwright/test';
const probe=(page:Page)=>page.evaluate(()=>Reflect.get(window,'__coreProbe'));
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();
async function ready(page:Page){await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});}
async function saveReady(page:Page){await expect.poll(async()=>(await probe(page)).worldReady,{timeout:120000}).toBe(true);}

test('campaign menus and exact save continuation are reachable',async({page,isMobile})=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?test=1');await ready(page);
 // Use the visible initial-menu entry rather than clicking a HUD behind its overlay.
 await activate(page.locator('#restart'),isMobile);await expect(page.locator('#campaign-panel')).toBeVisible();await expect(page.locator('#game')).toHaveAttribute('data-running','false');
 await activate(page.locator('[data-tab=crafting]'),isMobile);await expect(page.locator('[data-item=grapple]')).toContainText('鍛冶師');
 await activate(page.locator('[data-tab=journal]'),isMobile);await expect(page.locator('[data-item=gather]')).toContainText('木材8');
 await activate(page.locator('[data-tab=map]'),isMobile);await expect(page.locator('.campaign-map-marker.player')).toBeVisible();
 await activate(page.locator('[data-tab=settings]'),isMobile);await saveReady(page);await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await probe(page)).saveStatus).toContain('保存済み');
 const before=await probe(page);await page.reload();await ready(page);await saveReady(page);await expect.poll(async()=>(await probe(page)).saveStatus).toContain('読み込みました');
 expect((await probe(page)).inventory).toEqual(before.inventory);expect((await probe(page)).campaign.completed).toEqual(before.campaign.completed);
 await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=settings]'),isMobile);await activate(page.getByRole('button',{name:'新しく始める',exact:true}),isMobile);await activate(page.getByRole('button',{name:'やめる',exact:true}),isMobile);expect((await probe(page)).campaign).toEqual(before.campaign);
 await activate(page.getByRole('button',{name:'探索に戻る',exact:true}),isMobile);await expect(page.locator('#campaign-panel')).toBeHidden();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 if(isMobile)await page.locator('#campaign-toggle').tap();else await page.keyboard.press('KeyM');await expect(page.locator('#campaign-panel')).toBeVisible();
 await activate(page.getByRole('button',{name:'探索に戻る',exact:true}),isMobile);await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 expect(errors).toEqual([]);await page.screenshot({path:`test-results/${isMobile?'mobile':'desktop'}-campaign-start.png`});
});

test('campaign new-world confirmation protects the previous checkpoint',async({page,isMobile})=>{
 test.setTimeout(240000);await page.goto('/?test=1');await ready(page);await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=settings]'),isMobile);
 const volume=page.getByRole('slider',{name:'音量'});
 if(isMobile){const box=await volume.boundingBox();expect(box).not.toBeNull();await volume.tap({position:{x:box!.width*.2,y:box!.height/2}});}else{await volume.focus();await page.keyboard.press('Home');for(let i=0;i<4;i++)await page.keyboard.press('ArrowRight');}
 await expect.poll(async()=>(await probe(page)).settings.volume).toBeLessThan(.5);await saveReady(page);await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await probe(page)).saveStatus).toContain('保存済み');
 await activate(page.getByRole('button',{name:'新しく始める',exact:true}),isMobile);await activate(page.getByRole('button',{name:'バックアップして新しい旅へ',exact:true}),isMobile);await ready(page);await saveReady(page);
 expect(await page.evaluate(()=>!!localStorage.getItem('ash-campaign-v1:backup'))).toBe(true);expect((await probe(page)).campaign.level).toBe(1);expect((await probe(page)).campaign.flameTier).toBe(0);expect((await probe(page)).settings.volume).toBe(.8);
});
