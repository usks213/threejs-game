import {desktopInputLabel} from './helpers/native-input';
import {test,expect,type Locator} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();

test('C16 new codex is unknown, searchable, read-only and usable after repeated dismissal',async({page,isMobile})=>{
 test.setTimeout(180000);const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=codex]'),isMobile);
 await expect(page.locator('[data-codex-count]')).toContainText('発見済み 0 /');const wood=page.locator('[data-codex-id="material:4"]');await expect(wood).toHaveAttribute('data-discovered','false');await expect(wood).toContainText('地域：未確認');
 const before=await read(page),search=page.getByRole('searchbox',{name:'図鑑を検索'}),filter=page.getByRole('combobox',{name:'図鑑の発見状態'});
 for(const control of [page.locator('[data-tab=codex]'),search,filter]){const box=await control.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(48);expect(box?.width).toBeGreaterThanOrEqual(48);}
 await search.fill('木材');await expect(page.locator('[data-codex-id]')).toHaveCount(1);await filter.selectOption('discovered');await expect(page.getByText('一致する記録はありません。検索や発見状態を変えてください。')).toBeVisible();await filter.selectOption('unknown');await expect(wood).toBeVisible();
 await activate(page.locator('[data-tab=crafting]'),isMobile);await activate(page.locator('[data-tab=codex]'),isMobile);await expect(search).toHaveValue('木材');await expect(filter).toHaveValue('unknown');
 await activate(page.getByRole('button',{name:'旅の記録を閉じる',exact:true}),isMobile);await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=codex]'),isMobile);await expect(search).toHaveValue('木材');
 expect((await read(page)).inventory).toEqual(before.inventory);expect((await read(page)).campaign.items).toEqual(before.campaign.items);await search.fill('存在しない物');await expect(page.locator('[data-codex-id]')).toHaveCount(0);expect(errors).toEqual([]);
});

test('C16 real gathering and crafting register once, reveal uses, and survive saved reload',async({page,isMobile},testInfo)=>{
 test.setTimeout(900000);testInfo.annotations.push({type:'input-mode',description:isMobile?'Production Android touch collection and menus':desktopInputLabel()});const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);await activate(page.locator('#start'),isMobile);const controls=new PlayerControls(page,isMobile);await controls.initialize();
 try{
  await controls.walkTo(-.55,6.15);await controls.action('#tool-switch','Digit2');await controls.gather(4,2,[{x:-1.7,y:.58,z:6.25},{x:-1.7,y:.58,z:6.95}],'sample-wood');
  await controls.walkTo(-.55,5.25);await controls.walkTo(-3.45,5.25);await controls.walkTo(-3.45,6.35);await controls.gather(3,2,[{x:-4.2,y:.55,z:6.8},{x:-4.5,y:.55,z:6.8}],'sample-stone');
  await controls.menu('codex');const beforeView=await read(page);await expect(page.locator('[data-codex-id="material:4"]')).toHaveAttribute('data-discovered','true');await expect(page.locator('[data-codex-id="material:4"]')).toContainText('木の梯子');await expect(page.locator('[data-codex-id="item:arrows"]')).toHaveAttribute('data-discovered','false');
  await page.getByRole('combobox',{name:'図鑑の発見状態'}).selectOption('discovered');expect((await read(page)).inventory).toEqual(beforeView.inventory);
  await activate(page.locator('[data-tab=crafting]'),isMobile);await controls.row('arrows','craft');const crafted=await read(page);expect(crafted.inventory[4]).toBe(beforeView.inventory[4]-1);expect(crafted.inventory[3]).toBe(beforeView.inventory[3]-1);expect(crafted.campaign.items.arrows).toBe(8);
  await activate(page.locator('[data-tab=codex]'),isMobile);const arrows=page.locator('[data-codex-id="item:arrows"]');await expect(arrows).toHaveAttribute('data-discovered','true');await expect(arrows).toContainText('地域：各地（手作り）');await expect(arrows).toContainText('用途：弓用');await expect(page.locator('[data-codex-id="item:lake-pearl"]')).toHaveCount(0);
  await page.screenshot({path:testInfo.outputPath('codex-gathered-and-crafted.png')});await activate(page.locator('[data-tab=settings]'),isMobile);await expect.poll(async()=>(await read(page)).worldReady,{timeout:120000}).toBe(true);await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await expect.poll(async()=>(await read(page)).saveStatus).toContain('保存済み');
  await controls.dispose();await page.reload();await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read(page)).saveStatus,{timeout:120000}).toContain('読み込みました');await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=codex]'),isMobile);await expect(arrows).toHaveAttribute('data-discovered','true');await expect(page.locator('[data-codex-id="item:lake-pearl"]')).toHaveAttribute('data-discovered','false');expect((await read(page)).inventory).toEqual(crafted.inventory);expect((await read(page)).campaign.items).toEqual(crafted.campaign.items);
 }finally{await controls.dispose();}
 expect(errors).toEqual([]);
});
