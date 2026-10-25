import {test,expect,devices} from '@playwright/test';
test('real desktop and phone clients match, launch, receive same result and leave',async({browser,baseURL},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','One isolated two-device match prevents cross-project queue interference');
  test.setTimeout(120_000);
  const desktop=await browser.newContext({baseURL});const mobile=await browser.newContext({...devices['Pixel 7'],baseURL});
  const a=await desktop.newPage(),b=await mobile.newPage();const errors:string[]=[];
  const snapshots:[Map<number,string>,Map<number,string>]=[new Map(),new Map()];
  for(const [i,page] of [a,b].entries())page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.type==='state'&&message.battle){const battle=message.battle;snapshots[i].set(battle.tick,JSON.stringify(battle.tops.map((t:{x:number;y:number;z:number;orientation:unknown;angularMomentum:unknown})=>({x:t.x,y:t.y,z:t.z,orientation:t.orientation,angularMomentum:t.angularMomentum}))));}}catch{/* non-JSON protocol frames are ignored here */}}));
  for(const page of [a,b]){page.on('pageerror',e=>errors.push(e.message));await page.goto('/beyblade/');await page.getByRole('tab',{name:'オンライン'}).click();}
  await a.locator('#queue').click();await expect(a.locator('#connection')).toContainText('queued');
  await b.locator('#queue').click();
  for(const page of [a,b])await expect(page.locator('#connection')).toContainText('ready');
  await a.locator('#power').fill('100');await b.locator('#power').fill('20');await b.locator('#angle').fill('35');
  await a.locator('#launch').click();await b.locator('#launch').click();
  for(const page of [a,b])await expect(page.locator('#phase')).toContainText('ONLINE BATTLE',{timeout:10_000});
  await expect.poll(()=>[...snapshots[0].keys()].filter(tick=>tick>0&&snapshots[1].has(tick)).length).toBeGreaterThan(0);
  const sharedTick=[...snapshots[0].keys()].find(tick=>tick>0&&snapshots[1].has(tick))!;
  expect(snapshots[0].get(sharedTick)).toBe(snapshots[1].get(sharedTick));
  const poses=JSON.parse(snapshots[0].get(sharedTick)!);for(const pose of poses){expect(Number.isFinite(pose.y)).toBe(true);expect(pose.orientation).toBeDefined();expect(pose.angularMomentum).toBeDefined();expect(Math.hypot(pose.orientation.x,pose.orientation.y,pose.orientation.z,pose.orientation.w)).toBeCloseTo(1,6);}
  await a.locator('.stage').screenshot({path:testInfo.outputPath('online-live-desktop.png')});await b.locator('.stage').screenshot({path:testInfo.outputPath('online-live-phone.png')});
  await expect(a.locator('#phase')).toContainText('ROUND-END',{timeout:80_000});
  await expect(b.locator('#phase')).toContainText('ROUND-END');
  expect(await a.locator('#score-you').textContent()).toBe(await b.locator('#score-other').textContent());
  expect(await a.locator('#score-other').textContent()).toBe(await b.locator('#score-you').textContent());
  await a.screenshot({path:testInfo.outputPath('online-desktop.png'),fullPage:true,scale:'css'});await b.screenshot({path:testInfo.outputPath('online-phone.png'),fullPage:true,scale:'css'});
  await a.locator('#launch').click();await b.locator('#launch').click();
  for(const page of [a,b])await expect(page.locator('#phase')).toContainText('ONLINE READY');
  await b.locator('#cancel-queue').click();
  await expect(a.locator('#phase')).toContainText('MATCH-END');
  await expect(b.locator('#connection')).toContainText('接続を終了');
  expect(errors).toEqual([]);await desktop.close();await mobile.close();
});
