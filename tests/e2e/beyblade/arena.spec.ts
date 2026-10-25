import {test,expect} from '@playwright/test';
test('arena opens, launches and resets without browser errors',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/beyblade/');
  await expect(page.getByRole('heading',{name:'バトルアリーナ'})).toBeVisible();
  await expect(page.locator('#arena-canvas')).toBeVisible();
  await expect(page.locator('#arena-error')).toBeHidden();
  await page.locator('#arena-focus').click();await expect(page.locator('#arena-focus')).toHaveAttribute('aria-pressed','true');
  await page.locator('#arena-focus').click();await expect(page.locator('#arena-focus')).toHaveAttribute('aria-pressed','false');
  await page.locator('#power').fill('60');
  await expect(page.locator('#power-value')).toHaveText('60%');
  await page.getByRole('button',{name:'3, 2, 1 — GO SHOOT!'}).click();
  await expect(page.locator('#phase')).toContainText('BATTLE LIVE',{timeout:8000});
  await expect(page.locator('#rpm')).not.toContainText('BLUE —');
  await page.getByRole('button',{name:'試合をリセット'}).click();
  await expect(page.locator('#score-you')).toHaveText('0');
  await expect(page.locator('#phase')).toContainText('READY');
  expect(errors).toEqual([]);
});
test('mode tabs and catalog filtering work',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/beyblade/');
  await page.getByRole('tab',{name:'オンライン'}).click();
  await expect(page.locator('#online-panel')).toBeVisible();
  await page.getByRole('tab',{name:'ひとりで練習'}).click();
  await expect(page.locator('#online-panel')).toBeHidden();
  await page.locator('#catalog-search').fill('見つからないパーツ');
  await expect(page.locator('#catalog-body tr')).toHaveCount(0);
  await page.locator('#catalog-search').fill('');
  expect(await page.locator('#catalog-body tr').count()).toBeGreaterThan(2);
  expect(errors).toEqual([]);
});
test('phone and desktop layouts fit and capture at CSS pixel scale',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/beyblade/');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('arena-mobile.png'),fullPage:true,scale:'css'});
  await page.setViewportSize({width:1400,height:1000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('arena-desktop.png'),fullPage:true,scale:'css'});
  expect(errors).toEqual([]);
});
test('countdown cancellation and repeated reset do not restart battle',async({page})=>{
  await page.goto('/beyblade/');
  await page.locator('#launch').click();
  await page.locator('#reset-match').click();
  await page.waitForTimeout(3300);
  await expect(page.locator('#phase')).toContainText('READY');
  await page.locator('#reset-match').click();
  await expect(page.locator('#sim-time')).toHaveText('SIM 0.00s');
});
test('CX and integrated customization is legal, persistent and source-transparent',async({page})=>{
  await page.goto('/beyblade/');
  const blade=page.locator('select[data-part="blade"]');
  await blade.selectOption({label:'バハムートブリッツBK'});
  await expect(page.locator('select[data-part="metal_blade"]')).toBeVisible();
  await expect(page.locator('select[data-part="over_blade"]')).toBeVisible();
  await expect(page.locator('select[data-part="main_blade"]')).toHaveCount(0);
  await expect(page.locator('#build-error')).toHaveText('');
  await blade.selectOption({label:'バレットグリフォン'});
  await expect(page.locator('select[data-part="ratchet"]')).toHaveCount(0);
  await expect(page.locator('#build-error')).toHaveText('');
  await page.reload();
  await expect(page.locator('#build-name')).toHaveText('バレットグリフォン');
  expect(Number((await page.locator('#catalog-count').innerText()).match(/\d+/)?.[0])).toBeGreaterThan(250);
  await page.locator('#product-count').click();
  await expect(page.locator('#product-body')).toContainText('発売予定');
  const response=await page.request.get('/beyblade-data/parts.json');expect(response.ok()).toBe(true);const rows=await response.json();expect(rows.length).toBeGreaterThan(250);expect(Number((await page.locator('#catalog-count').innerText()).match(/\d+/)?.[0])).toBe(rows.length);expect(rows.every((r:{physical_parameters:unknown})=>r.physical_parameters===null)).toBe(true);
});
test('static or denied backend is explicitly unavailable without a pretend online match',async({page})=>{
  for(const mock of [{status:403,contentType:'text/plain',body:'Forbidden'},{status:404,contentType:'text/html',body:'<html>static not found</html>'},{status:200,contentType:'application/json',body:'{"service":"not-an-arena","online":true}'}]){
    await page.route('**/api/beyblade/health',route=>route.fulfill(mock));
    await page.goto('/beyblade/');await page.getByRole('tab',{name:'オンライン'}).click();
    await expect(page.locator('#connection')).toContainText('この公開版ではオンライン対戦はまだ利用できません。CPU戦を利用できます。');
    await expect(page.locator('#queue')).toBeDisabled();await expect(page.locator('#score-you')).toHaveText('0');
    await page.getByText('開発用の接続設定',{exact:true}).click();await page.locator('#server-url').fill('invalid endpoint');await page.locator('#queue').click();
    await expect(page.locator('#connection')).toContainText('有効な ws://');
    await page.getByRole('tab',{name:'ひとりで練習'}).click();await expect(page.locator('#launch')).toBeEnabled();
    await page.unroute('**/api/beyblade/health');
  }
});

test('launch countdown uses wall time even when animation frames are slow',async({page})=>{
  await page.addInitScript(()=>{
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=callback=>raf(()=>{window.setTimeout(()=>callback(performance.now()),200);});
  });
  await page.goto('/beyblade/');
  await page.locator('#launch').click();
  const started=Date.now();
  await expect(page.locator('#phase')).toContainText('BATTLE LIVE',{timeout:5500});
  expect(Date.now()-started).toBeLessThan(5500);
  await page.locator('#reset-match').click();
  await expect(page.locator('#phase')).toContainText('READY');
});


test('part inspection exposes changed physical estimates, source evidence and unsupported geometry',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/beyblade/');
  const blade=page.locator('select[data-part="blade"]');
  await expect(page.locator('#bey-inspect-canvas')).toBeVisible();
  await expect(page.locator('#inspect-error')).toBeHidden();
  await blade.selectOption({label:'ドランバスター'});
  const busterValues=await page.locator('#model-values').innerText();
  await expect(page.locator('#model-values')).toContainText('推定');
  await page.locator('.model-evidence summary').click();
  await expect(page.locator('#model-evidence')).toContainText('attack');
  await expect(page.locator('#model-evidence a').first()).toHaveAttribute('href',/^https:\/\/beyblade\.takaratomy\.co\.jp\//);
  await blade.selectOption({label:'ウィザードロッド'});
  expect(await page.locator('#model-values').innerText()).not.toBe(busterValues);
  const bit=page.locator('select[data-part="bit"]');
  await bit.selectOption({label:'F · フラット'});const flatValues=await page.locator('#model-values').innerText();
  await bit.selectOption({label:'B · ボール'});expect(await page.locator('#model-values').innerText()).not.toBe(flatValues);
  await page.locator('#inspect-left').click();await page.locator('#inspect-right').click();
  await page.locator('#inspect-view').click();await expect(page.locator('#inspect-view')).toHaveAttribute('aria-pressed','true');
  await page.locator('#inspect-view').click();await expect(page.locator('#inspect-view')).toHaveAttribute('aria-pressed','false');
  await blade.selectOption({label:'バレットグリフォン'});
  await expect(page.locator('#shape-description')).toContainText('暫定');
  await expect(page.locator('#model-evidence')).toContainText('形状未再現・暫定モデル');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('#inspect-error')).toBeHidden();expect(errors).toEqual([]);
});

test('ordinary Burst keeps its score latched while physical pieces continue, then allows the next round',async({page})=>{
  await page.goto('/beyblade/');
  await page.evaluate(()=>{
    const phase=document.getElementById('phase')!,launch=document.getElementById('launch') as HTMLButtonElement;
    const state=window as unknown as {settlingObserved:boolean;settlingWasGated:boolean};state.settlingObserved=false;state.settlingWasGated=false;
    const observer=new MutationObserver(()=>{if(phase.textContent?.includes('SETTLING')){state.settlingObserved=true;state.settlingWasGated=launch.disabled;observer.disconnect();}});
    observer.observe(phase,{childList:true,characterData:true,subtree:true});
  });
  await page.locator('#launch').click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {settlingObserved:boolean}).settlingObserved),{timeout:20000}).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {settlingWasGated:boolean}).settlingWasGated)).toBe(true);
  await expect(page.locator('#score-you')).toHaveText('2');await expect(page.locator('#score-other')).toHaveText('0');
  await expect(page.locator('#phase')).toContainText('ROUND COMPLETE',{timeout:20000});await expect(page.locator('#launch')).toBeEnabled();
  await expect(page.locator('#score-you')).toHaveText('2');await page.locator('#launch').click();await expect(page.locator('#phase')).toContainText('COUNTDOWN');
  await page.locator('#reset-match').click();await expect(page.locator('#phase')).toContainText('READY');await expect(page.locator('#score-you')).toHaveText('0');
});
