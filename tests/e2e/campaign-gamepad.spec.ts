import {test,expect,type Locator} from '@playwright/test';
const activate=(locator:Locator,mobile:boolean)=>mobile?locator.tap():locator.click();
test('campaign gamepad settings remap, swap, persist and reset through visible controls',async({page,isMobile},info)=>{
 test.setTimeout(240000);const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 const read=()=>page.evaluate(()=>Reflect.get(window,'__coreProbe') as {worldReady:boolean;settings:{gamepad?:{buttons:Record<string,number>;deadzone:number;invertY:boolean;swapSticks:boolean}};inventory:Record<string,number>;campaign:{items:Record<string,number>}});
 await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await expect.poll(async()=>(await read()).worldReady,{timeout:120000}).toBe(true);
 const before=await read();expect(before.settings.gamepad?.buttons.attack).toBe(7);await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=settings]'),isMobile);
 const attack=page.getByRole('combobox',{name:'斬撃のコントローラーボタン',exact:true});expect(await attack.evaluate(element=>element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(48);await attack.selectOption('0');await expect(attack).toHaveValue('0');await expect(page.getByRole('combobox',{name:'ジャンプ/滑空のコントローラーボタン',exact:true})).toHaveValue('7');expect(await attack.locator('option[value="9"]').count()).toBe(0);
 await page.getByRole('combobox',{name:'スティックの遊び',exact:true}).selectOption('0.3');await page.getByRole('combobox',{name:'上下の視点を反転',exact:true}).selectOption('1');await page.getByRole('combobox',{name:'左右のスティックを交換',exact:true}).selectOption('1');
 await activate(page.getByRole('button',{name:'今すぐ保存',exact:true}),isMobile);await page.reload();await expect.poll(async()=>(await read())?.worldReady,{timeout:120000}).toBe(true);
 const restored=await read();expect(restored.settings.gamepad).toMatchObject({buttons:{attack:0,jump:7},deadzone:.3,invertY:true,swapSticks:true});expect(restored.inventory).toEqual(before.inventory);expect(restored.campaign.items).toEqual(before.campaign.items);
 await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=settings]'),isMobile);await expect(attack).toHaveValue('0');await attack.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('saved-gamepad-remapping.png')});
 await activate(page.getByRole('button',{name:'コントローラー設定を初期化',exact:true}),isMobile);await expect(attack).toHaveValue('7');expect((await read()).settings.gamepad).toMatchObject({buttons:{attack:7,jump:0},deadzone:.18,invertY:false,swapSticks:false});expect(errors).toEqual([]);
});
