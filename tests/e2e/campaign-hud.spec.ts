import {test,expect} from '@playwright/test';
import {expectClearTouchBuildFeedback} from './helpers/hud-layout';
import {PlayerControls,read} from './helpers/campaign-controls';
test('campaign HUD keeps readable backed zones and contextual 48px controls',async({page,isMobile},testInfo)=>{
 test.setTimeout(240000);await page.goto('/?test=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();await expect(page.locator('#game')).toHaveAttribute('data-running','true');
 await expect(page.locator('body')).toHaveClass(/campaign-mode/);await expect(page.locator('#recipe-switch')).toBeHidden();await expect(page.locator('#special')).toBeHidden();await expect(page.locator('#recipe-cost')).toBeHidden();
 const controls=new PlayerControls(page,isMobile);
 try{
 if(isMobile){await controls.initialize();const position=(await read(page)).position;await controls.aim({x:position.x,y:position.y-.05,z:position.z-1});await expect(page.locator('#target')).not.toBeEmpty();}
 const sizes=isMobile?[{width:844,height:390},{width:568,height:320}]:[{width:960,height:540}];
 for(const size of sizes){await page.setViewportSize(size);for(const selector of ['#objective','#inventory','#campaign-status','#recipe-cost']){const font=await page.locator(selector).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));expect(font,selector+' should remain readable').toBeGreaterThanOrEqual(12);}
  const status=await page.locator('#campaign-status').boundingBox();for(const selector of ['#menu-toggle','#campaign-toggle','.vitals']){const b=await page.locator(selector).boundingBox();expect(status&&b).toBeTruthy();expect(status!.x<b!.x+b!.width&&status!.x+status!.width>b!.x&&status!.y<b!.y+b!.height&&status!.y+status!.height>b!.y,selector+' must not overlap region status').toBe(false);}
  if(isMobile)await page.locator('#build').tap();else await page.keyboard.press('KeyB');await expect(page.locator('body')).toHaveClass(/building-mode/);await expect(page.locator('#recipe-switch')).toBeVisible();await expect(page.locator('#special')).toBeVisible();
  if(isMobile){
   for(const id of ['element-switch','cast','recipe-switch','build','build-snap','special','dismantle'])await expect(page.locator('#'+id)).toBeVisible();
   await expect(page.locator('#message')).toContainText('「置く」をタップ');
   await expect(page.locator('#message')).not.toContainText(/V部品|F回転|B設置|X戻す|G終了/);
   await expect(page.locator('#inventory')).toBeHidden();
   await expect(page.locator('#recipe-cost')).toContainText('木材 8 / 0');
   await expectClearTouchBuildFeedback(page);
   // Returning to the hint after an actual build action must keep the same
   // readable zone, including the longer grid-snap control label.
   await page.locator('#build-snap').tap();
   await expect(page.locator('#build-snap')).toHaveAttribute('aria-pressed','true');
   await expectClearTouchBuildFeedback(page);
   await expect(page.locator('#message')).toContainText('「置く」をタップ');
   await expectClearTouchBuildFeedback(page);
  }
  const actions=await page.locator('.survival-actions button:visible').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {id:el.id,x:r.x,y:r.y,w:r.width,h:r.height};}));
  const blockers=isMobile?await page.locator('#move-pad,.touch-actions button:visible,.equipment button:visible').evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})):[];
  for(const a of actions){expect(a.w,a.id).toBeGreaterThanOrEqual(48);expect(a.h,a.id).toBeGreaterThanOrEqual(48);expect(a.x+a.w,a.id).toBeLessThanOrEqual(size.width);for(const b of blockers)expect(a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,a.id+' overlaps touch controls').toBe(false);}
  await page.screenshot({path:testInfo.outputPath(`hud-build-${size.width}.png`)});if(isMobile){await page.locator('#build-snap').tap();await page.locator('#cast').tap();}else await page.keyboard.press('KeyG');await expect(page.locator('body')).not.toHaveClass(/building-mode/);
  await expect(page.locator('#inventory')).toBeVisible();
 }
 }finally{await controls.dispose();}
});
