import {test,expect} from '@playwright/test';
import {PlayerControls,read,choosePerformance} from './helpers/campaign-controls';
import {expectClearTouchBuildFeedback} from './helpers/hud-layout';
test('campaign caster can ignite nearby wood, catch fire, and extinguish with a real aimed water cast',async({page,isMobile},info)=>{
 test.setTimeout(360000);const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));await page.goto('/?test=1&streaming=1');await expect(page.locator('#game')).toHaveAttribute('data-ready','true',{timeout:90000});await choosePerformance(page,isMobile);if(isMobile)await page.locator('#start').tap();else await page.locator('#start').click();const controls=new PlayerControls(page,isMobile);await controls.initialize();const exposure=()=>page.evaluate(()=>Reflect.get(window,'__coreProbe').environment as {wet:number;burning:number;shock:number});
 try{await controls.walkTo(-.95,6.15);await controls.aim({x:-1.7,y:.58,z:6.25});expect((await read(page)).target).toBe('sample-wood');await controls.action('#cast','KeyG');await expect.poll(async()=>(await exposure()).burning,{timeout:60000}).toBeGreaterThan(0);await expect(page.locator('#campaign-status')).toContainText('炎上');expect((await read(page)).hp).toBeLessThan(100);
  if(isMobile){
   await page.setViewportSize({width:568,height:320});
   await controls.action('#build','KeyB');
   await expect(page.locator('body')).toHaveClass(/building-mode/);
   await expect(page.locator('#campaign-status')).toHaveClass(/danger/);
   await expect(page.locator('#campaign-status')).toContainText('炎上');
   await expect(page.locator('#target')).not.toBeEmpty();
   await expect(page.locator('#material-status')).toContainText('耐久');
   await expectClearTouchBuildFeedback(page);
   await page.screenshot({path:info.outputPath('build-with-active-fire-568.png')});
   await controls.action('#cast','KeyG');
   await page.setViewportSize({width:844,height:390});
  }
  const p=(await read(page)).position;await controls.aim({x:p.x,y:p.y-.05,z:p.z+.08});await controls.action('#element-switch','KeyF');await expect(page.locator('#element-switch')).toContainText('水');await controls.action('#cast','KeyG');await expect.poll(async()=>(await exposure()).wet,{timeout:60000}).toBeGreaterThan(0);expect((await exposure()).burning).toBe(0);expect((await read(page)).hp).toBeGreaterThan(0);await page.screenshot({path:info.outputPath('water-extinguished-caster.png')});expect(errors).toEqual([]);
 }finally{await controls.dispose();}
});
