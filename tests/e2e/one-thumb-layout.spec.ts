import {test,expect} from '@playwright/test';
test('one-thumb portrait reach, clear hero and quality budgets at three phone sizes',async({page,context},info)=>{
  test.skip(info.project.name!=='android-chromium','Phone-only reach and quality check');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?seed=3397');await page.getByRole('button',{name:'新しい世界を作る',exact:true}).tap();
  const cave=page.locator('#cave'),metrics:unknown[]=[];
  for(const size of [{width:393,height:851},{width:360,height:640},{width:320,height:568}]){
    await page.setViewportSize(size);await page.waitForTimeout(350);
    const state=JSON.parse((await cave.getAttribute('data-survival'))!);const hero={x:(state.x-state.cameraX)/state.width*size.width,y:(state.y-3-state.cameraY)/state.height*size.height};
    for(const selector of ['#thumb-pad','#thumb-menu','button[data-thumb-mode="travel"]','button[data-thumb-mode="work"]']){
      const b=(await page.locator(selector).boundingBox())!;expect(b.width).toBeGreaterThanOrEqual(48);expect(b.height).toBeGreaterThanOrEqual(48);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(size.width);expect(b.y+b.height).toBeLessThanOrEqual(size.height);
      expect(hero.x>b.x-5&&hero.x<b.x+b.width+5&&hero.y>b.y-10&&hero.y<b.y+b.height+10).toBe(false);
    }
    const belt=(await page.locator('.toolbelt').boundingBox())!;expect(hero.y< belt.y-12 || hero.y>belt.y+belt.height+12).toBe(true);
    await page.screenshot({path:info.outputPath(`one-thumb-${size.width}x${size.height}.png`)});
    await page.locator('#thumb-menu').tap();const back=page.getByRole('button',{name:'世界に戻る',exact:true});const backBox=(await back.boundingBox())!;expect(backBox.y).toBeGreaterThan(size.height*.6);expect(backBox.y+backBox.height).toBeLessThanOrEqual(size.height);await page.screenshot({path:info.outputPath(`one-thumb-workshop-${size.width}x${size.height}.png`)});if(size.width===320){const content=page.locator('.workshop-content'),b=(await content.boundingBox())!,cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height*.85,id:1}]});for(let n=1;n<=8;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height*(.85-n*.075),id:1}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(async()=>content.evaluate(el=>el.scrollTop)).toBeGreaterThan(20);await page.screenshot({path:info.outputPath('one-thumb-workshop-swiped-320.png')});}await back.tap();
  }
  await page.setViewportSize({width:393,height:851});
  for(const quality of ['low','balanced','high']){
    await page.locator('#thumb-menu').tap();await page.locator('[data-tab="settings"]').tap();await page.locator('#quality-select').selectOption(quality);await page.getByRole('button',{name:'世界に戻る',exact:true}).tap();await page.waitForTimeout(500);
    const tick=Number(await cave.getAttribute('data-tick'));await page.waitForTimeout(1000);expect(Number(await cave.getAttribute('data-tick'))-tick).toBeGreaterThan(12);
    const metric=JSON.parse((await cave.getAttribute('data-lighting'))!);expect(metric.rays).toBeLessThanOrEqual(6144);expect(metric.lights).toBeLessThanOrEqual(7);expect(metric.backingWidth).toBeLessThanOrEqual(320);expect(metric.artScale).toBeGreaterThanOrEqual(1);expect(metric.artScale).toBeLessThanOrEqual(2);metrics.push({quality,...metric});
    await page.screenshot({path:info.outputPath(`one-thumb-art-${quality}.png`)});
  }
  expect(errors).toEqual([]);await info.attach('portrait-art-metrics.json',{body:JSON.stringify(metrics),contentType:'application/json'});
});
