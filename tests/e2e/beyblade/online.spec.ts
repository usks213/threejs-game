import {test,expect,devices} from '@playwright/test';
test('real desktop and phone clients match, launch, receive same result and leave',async({browser,baseURL},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','One isolated two-device match prevents cross-project queue interference');
  test.setTimeout(120_000);
  const desktop=await browser.newContext({baseURL});const mobile=await browser.newContext({...devices['Pixel 7'],baseURL});
  const a=await desktop.newPage(),b=await mobile.newPage();const errors:string[]=[];
  for(const page of [a,b]){page.on('pageerror',e=>errors.push(e.message));await page.goto('/beyblade/');await page.getByRole('tab',{name:'オンライン'}).click();}
  await a.locator('#queue').click();await expect(a.locator('#connection')).toContainText('queued');
  await b.locator('#queue').click();
  for(const page of [a,b])await expect(page.locator('#connection')).toContainText('ready');
  await a.locator('#power').fill('100');await b.locator('#power').fill('20');await b.locator('#angle').fill('35');
  await a.locator('#launch').click();await b.locator('#launch').click();
  for(const page of [a,b])await expect(page.locator('#phase')).toContainText('ONLINE BATTLE',{timeout:10_000});
  await expect(a.locator('#phase')).toContainText('ROUND-END',{timeout:80_000});
  await expect(b.locator('#phase')).toContainText('ROUND-END');
  expect(await a.locator('#score-you').textContent()).toBe(await b.locator('#score-other').textContent());
  expect(await a.locator('#score-other').textContent()).toBe(await b.locator('#score-you').textContent());
  await a.screenshot({path:testInfo.outputPath('online-desktop.png'),fullPage:true});await b.screenshot({path:testInfo.outputPath('online-phone.png'),fullPage:true});
  await a.locator('#launch').click();await b.locator('#launch').click();
  for(const page of [a,b])await expect(page.locator('#phase')).toContainText('ONLINE READY');
  await b.locator('#cancel-queue').click();
  await expect(a.locator('#phase')).toContainText('MATCH-END');
  await expect(b.locator('#connection')).toContainText('接続を終了');
  expect(errors).toEqual([]);await desktop.close();await mobile.close();
});
