import { test, expect } from '@playwright/test';
test('two real browsers share authoritative movement, edits, reconnect and retained room state',async({browser})=>{
 test.setTimeout(240000);
 const aContext=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:.5}),bContext=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:.5});
 const a=await aContext.newPage(),b=await bContext.newPage(),errors:string[]=[];
 try{
  for(const page of[a,b]){page.on('pageerror',e=>errors.push(e.message));await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});await page.locator('#session-menu').click();}
  await a.locator('#session-host').click();await expect(a.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:60000});const code=await a.locator('#session-code').inputValue();
  await b.locator('#session-code').fill(code);await b.locator('#session-join').click();await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:60000});
  for(const page of[a,b]){await expect(page.locator('#session-status')).toHaveAttribute('data-players','2');await page.locator('#session-close').click();await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:60000});}
  const identity=await b.locator('#session-status').getAttribute('data-player');expect(identity).not.toBe(await a.locator('#session-status').getAttribute('data-player'));
  const before=Number(await b.locator('#position').getAttribute('data-x'));await b.keyboard.down('KeyD');await expect.poll(async()=>Number(await b.locator('#position').getAttribute('data-x')),{timeout:20000}).toBeGreaterThan(before+.4);await b.keyboard.up('KeyD');
  await a.locator('#use-tool').click();await expect(a.locator('#edit-count')).toHaveAttribute('data-count','1',{timeout:20000});await expect(b.locator('#edit-count')).toHaveAttribute('data-count','1',{timeout:20000});
  await bContext.setOffline(true);await expect(b.locator('#session-status')).toHaveAttribute('data-connection','reconnecting',{timeout:25000});await bContext.setOffline(false);
  await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online',{timeout:45000});await expect(b.locator('#session-status')).toHaveAttribute('data-player',identity!);await expect(b.locator('#edit-count')).toHaveAttribute('data-count','1');
  // The creator can leave without disconnecting the remaining player.
  await a.locator('#session-menu').click();await a.locator('#session-leave').click();await expect(b.locator('#session-status')).toHaveAttribute('data-players','1');await expect(b.locator('#session-status')).toHaveAttribute('data-connection','online');
  const tick=Number(await b.locator('#session-status').getAttribute('data-tick'));await expect.poll(async()=>Number(await b.locator('#session-status').getAttribute('data-tick'))).toBeGreaterThan(tick);
  await b.screenshot({path:'test-results/coop-two-browser.png'});expect(errors).toEqual([]);
 }finally{await Promise.all([aContext.close(),bContext.close()]);}
});
