import { test, expect } from '@playwright/test';
test('host and three guests share movement, edits and disconnect safely', async ({ browser }) => {
 test.setTimeout(240000);
 const contexts = await Promise.all(Array.from({length:4}, () => browser.newContext({viewport:{width:640,height:360},deviceScaleFactor:.5})));
 const pages = await Promise.all(contexts.map(context => context.newPage()));
 const errors: string[] = [];
 try {
  for (const page of pages) { page.on('pageerror', e => errors.push(e.message)); await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running',{timeout:45000});await page.locator('#session-menu').click(); }
  const host = pages[0]; await host.locator('#session-host').click();
  await expect(host.locator('#session-code')).toHaveValue(/^[a-f0-9]{48}$/); const code = await host.locator('#session-code').inputValue();
  for (const guest of pages.slice(1)) { await guest.locator('#session-code').fill(code); await guest.locator('#session-join').click(); await expect(guest.locator('#session-status')).toHaveText('協力プレイに参加中',{timeout:45000}); }
  // Inactive guests stay in the lobby; this is transport coverage, not a four-GPU benchmark.
  await pages[1].locator('#session-close').click();
  await host.locator('#session-close').click();
  const guest=pages[1], before=Number(await guest.locator('#position').getAttribute('data-x'));
  await guest.keyboard.down('KeyD'); await expect.poll(async()=>Number(await guest.locator('#position').getAttribute('data-x')),{timeout:20000}).toBeGreaterThan(before+0.4); await guest.keyboard.up('KeyD');
  await host.locator('#use-tool').click(); await expect(host.locator('#edit-count')).toHaveAttribute('data-count','1');
  for (const peer of pages.slice(1)) await expect(peer.locator('#edit-count')).toHaveAttribute('data-count','1',{timeout:20000});
  await host.locator('#session-menu').click(); await host.locator('#session-leave').click();
  for (const peer of pages.slice(1)) await expect(peer.locator('#session-status')).toHaveText('Single Player',{timeout:20000});
  expect(errors).toEqual([]);
 } finally { if(errors.length) console.error('Browser errors:',errors); await Promise.all(contexts.map(c=>c.close().catch(error=>console.error('Context cleanup:',String(error))))); }
});

