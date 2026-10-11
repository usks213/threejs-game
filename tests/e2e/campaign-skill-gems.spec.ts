import {test,expect,type Locator} from '@playwright/test';
import {read} from './helpers/campaign-controls';
const activate=(button:Locator,mobile:boolean)=>mobile?button.tap():button.click();

test('B18 skill ranks explain cost, level, matching prerequisites and refund before any earned points',async({page,isMobile},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=equipment]'),isMobile);
 for(const id of ['vigor','endurance','attunement']){
  const row=page.locator(`[data-item="${id}:1"]`),button=row.locator('[data-command=learn]');await expect(row).toContainText('ランク 0/3');await expect(row).toContainText('1ポイント・レベル2');await expect(button).toBeDisabled();const box=await button.boundingBox();expect(box?.height).toBeGreaterThanOrEqual(48);
 }
 await expect(page.locator('[data-item="attunement:1"]')).toContainText('旅人の呼吸が同じランク以上');
 await activate(page.locator('[data-tab=equipment]'),isMobile);const reset=page.locator('[data-item=reset-skills]');await expect(reset).toContainText('0ポイント');await expect(reset).toContainText('レベル10で合計9ポイント');await expect(reset.locator('[data-command=gear]')).toBeDisabled();
 await activate(page.getByRole('button',{name:'旅の記録を閉じる',exact:true}),isMobile);await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=equipment]'),isMobile);await expect(page.locator('[data-item="vigor:1"]')).toContainText('ランク 0/3');
 await page.screenshot({path:testInfo.outputPath('skill-ranks-locked.png')});expect(errors).toEqual([]);
});

test('B20 all three forge gem tiers show finite previous-stone costs and refuse locked crafting on desktop and touch',async({page,isMobile},testInfo)=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));
 await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await activate(page.locator('#restart'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);
 const before=await read(page);
 for(const [index,id] of ['ember-gem','ember-gem-2','ember-gem-3'].entries()){
  const row=page.locator(`[data-item="${id}"]`);await expect(row).toContainText(`ランク${index+1}/3`);await expect(row.locator('[data-command=craft]')).toBeDisabled();await expect(row).toContainText('各装備1枠');
  if(index>0){await expect(row).toContainText('前段階の石1個を消費');await expect(row.locator('.campaign-craft-cost')).toContainText(index===1?'灯火の石 ×1':'灯火の石 II ×1');}
 }
 await expect(page.locator('[data-item=ember-gem-2]')).toContainText('炉を段階2へ強化');await expect(page.locator('[data-item=ember-gem-3]')).toContainText('尾根の野営地へ到達');
 const quantity=page.locator('[data-item=ember-gem-3]').getByRole('spinbutton');await quantity.fill('2');await expect(page.locator('[data-item=ember-gem-3] .campaign-craft-cost')).toContainText('灯火の石 II ×2');await expect(page.locator('[data-item=ember-gem-3] [data-command=craft]')).toBeDisabled();
 await activate(page.locator('[data-tab=equipment]'),isMobile);await activate(page.locator('[data-tab=crafting]'),isMobile);await expect(quantity).toHaveValue('2');expect((await read(page)).inventory).toEqual(before.inventory);expect((await read(page)).campaign.items).toEqual(before.campaign.items);
 await page.screenshot({path:testInfo.outputPath('gem-forge-tiers-locked.png')});expect(errors).toEqual([]);
});
