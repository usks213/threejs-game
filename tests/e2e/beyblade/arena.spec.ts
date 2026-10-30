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
  // Pin the round seed (0 = exact inputs) so this legal-launch Burst fixture
  // is deterministic; normal play draws a fresh seed every round.
  await page.goto('/beyblade/?seed=0');
  await page.locator('select[data-part="blade"]').selectOption({label:'ヘルズサイズ'});
  await page.locator('select[data-part="ratchet"]').selectOption({label:'4-60'});
  await page.locator('select[data-part="bit"]').selectOption({label:'T · テーパー'});
  await page.locator('#power').fill('50');await page.locator('#angle').fill('-50');await page.locator('#tilt').fill('30');
  await page.evaluate(()=>{
    const phase=document.getElementById('phase')!,launch=document.getElementById('launch') as HTMLButtonElement;
    const state=window as unknown as {settlingObserved:boolean;settlingWasGated:boolean};state.settlingObserved=false;state.settlingWasGated=false;
    const observer=new MutationObserver(()=>{if(phase.textContent?.includes('SETTLING')){state.settlingObserved=true;state.settlingWasGated=launch.disabled;observer.disconnect();}});
    observer.observe(phase,{childList:true,characterData:true,subtree:true});
  });
  await page.locator('#launch').click();
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {settlingObserved:boolean}).settlingObserved),{timeout:20000}).toBe(true);
  expect(await page.evaluate(()=>(window as unknown as {settlingWasGated:boolean}).settlingWasGated)).toBe(true);
  const scores=[await page.locator('#score-you').innerText(),await page.locator('#score-other').innerText()];expect(scores.map(Number).sort()).toEqual([0,2]);
  await expect(page.locator('#battle-result')).toBeVisible();await expect(page.locator('#result-finish')).toHaveText('バーストフィニッシュ');await expect(page.locator('#finish-banner')).toHaveText('バーストフィニッシュ');await expect(page.locator('#result-points')).toContainText('+2 pt');await expect(page.locator('#result-score')).toContainText(`YOU ${scores[0]} : ${scores[1]} CPU`);
  await expect(page.locator('#phase')).toContainText('ROUND COMPLETE',{timeout:20000});await expect(page.locator('#launch')).toBeEnabled();
  expect([await page.locator('#score-you').innerText(),await page.locator('#score-other').innerText()]).toEqual(scores);await page.locator('#launch').click();await expect(page.locator('#phase')).toContainText('COUNTDOWN');await expect(page.locator('#battle-result')).toBeHidden();await expect(page.locator('#finish-banner')).toBeHidden();
  await page.locator('#reset-match').click();await expect(page.locator('#phase')).toContainText('READY');await expect(page.locator('#score-you')).toHaveText('0');
});


test('ratchet-only swaps change modeled COM and inertia, with an exact-scale inspection reference',async({page})=>{
  await page.goto('/beyblade/');
  await page.locator('select[data-part="blade"]').selectOption({label:'ドランソード'});
  await page.locator('select[data-part="bit"]').selectOption({label:'F · フラット'});
  const ratchet=page.locator('select[data-part="ratchet"]');
  await ratchet.selectOption({label:'3-60'});
  const center=async()=>JSON.parse((await page.locator('#mass-summary').getAttribute('data-center'))!) as {x:number;y:number;z:number};
  const low=await center();const lowTensor=await page.locator('#mass-summary').getAttribute('data-inertia');
  expect(Math.hypot(low.x,low.z)).toBeLessThan(1e-10);
  await ratchet.selectOption({label:'3-80'});expect((await center()).y).toBeGreaterThan(low.y);
  expect(await page.locator('#mass-summary').getAttribute('data-inertia')).not.toBe(lowTensor);
  await ratchet.selectOption({label:'1-60'});const offset=await center();expect(Math.hypot(offset.x,offset.z)).toBeGreaterThan(1e-5);
  await page.locator('#inspect-mass').click();await expect(page.locator('#inspect-mass')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#mass-reference-legend')).toContainText('実寸');
  await page.locator('#inspect-view').click();await page.locator('#inspect-left').click();
  await expect(page.locator('#inspect-error')).toBeHidden();
  await page.locator('#inspect-mass').click();await expect(page.locator('#mass-reference-legend')).toBeHidden();
});

test('the reported Sword Needle launch no longer leaves the CPU fenced behind the rail',async({page})=>{
  test.setTimeout(95000);
  await page.goto('/beyblade/');
  await page.locator('select[data-part="blade"]').selectOption({label:'ドランソード'});
  await page.locator('select[data-part="ratchet"]').selectOption('ratchet:3-60');
  await page.locator('select[data-part="bit"]').selectOption('bit:N');
  await page.locator('#power').fill('80');await page.locator('#angle').fill('0');await page.locator('#tilt').fill('8');
  await expect(page.locator('#other-name')).toHaveText('ドランソード');
  // The core regression separately verifies inward return and absence of the old exterior pin.
  // With observed component masses the equal-work launch ends after 28.4 simulated seconds.
  // Isolated SwiftShader runs take ~50–59 wall seconds for this 30.9 s simulation.
  // The bound includes tracing overhead; performance is reported separately, not inferred from passing.
  await page.locator('#launch').click();
  await expect(page.locator('#phase')).toContainText('ROUND COMPLETE',{timeout:75000});
  const total=Number(await page.locator('#score-you').innerText())+Number(await page.locator('#score-other').innerText());
  expect(total).toBeGreaterThan(0);await expect(page.locator('#launch')).toBeEnabled();
  await page.locator('#reset-match').click();await expect(page.locator('#phase')).toContainText('READY');
});

test('independent mass observations stay separate from official ratings and estimated COM',async({page},testInfo)=>{
  await page.goto('/beyblade/');
  const blade=page.locator('select[data-part="blade"]');
  await blade.selectOption('blade:e383f65c06a2');
  await page.locator('select[data-part="ratchet"]').selectOption('ratchet:3-60');
  await page.locator('select[data-part="bit"]').selectOption('bit:F');
  const panel=page.locator('#mass-calibration');
  await expect(panel).toBeVisible();
  await expect(panel.locator('details')).toHaveCount(3);
  await expect(page.locator('#model-values')).toContainText('43.32 g');
  await expect(page.locator('#mass-summary')).toContainText('重心と慣性（推定）');
  await panel.locator('summary').first().click();
  await expect(panel).toContainText('34.77–35.12 g');
  await expect(panel).toContainText('確認個体数 不明');
  await expect(panel.locator('a').first()).toHaveAttribute('href','https://beybase.com/beyblade-part-weights-database/');
  await expect(panel).toContainText('誤差帯や母集団範囲ではない');
  await panel.screenshot({path:testInfo.outputPath('independent-mass-provenance.png'),scale:'css'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('mass provenance does not leak across unmeasured variants or reloads',async({page})=>{
  await page.goto('/beyblade/');
  const blade=page.locator('select[data-part="blade"]'),panel=page.locator('#mass-calibration');
  // Unknown blade variants must not inherit standard or coated specimens.
  await blade.selectOption({label:'ウィザードアロー'});
  await expect(panel.locator('details[data-mass-part^="blade:"]')).toHaveCount(0);
  await page.reload();
  await expect(panel.locator('details[data-mass-part^="blade:"]')).toHaveCount(0);
  await blade.selectOption('blade:e383f65c06a2');
  await expect(panel.locator('details[data-mass-part="blade:e383f65c06a2"]')).toHaveCount(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('pointer and keyboard select a launch position, settings lock during countdown',async({page,isMobile})=>{
  await page.goto('/beyblade/');
  const canvas=page.locator('#arena-canvas');
  await expect(canvas).toHaveAttribute('data-launch-x','-0.105');
  await page.locator('#pick-position').click();
  const box=(await canvas.boundingBox())!;
  // Left of stadium center, inside the visible blue launch lane on both aspect ratios.
  const point={x:box.x+box.width*.39,y:box.y+box.height*.5};
  if(isMobile)await page.touchscreen.tap(point.x,point.y);else await page.mouse.click(point.x,point.y);
  await expect(canvas).not.toHaveAttribute('data-launch-x','-0.105');
  const x=Number(await canvas.getAttribute('data-launch-x')),z=Number(await canvas.getAttribute('data-launch-z'));
  expect(x).toBeLessThanOrEqual(-.04);expect(Math.hypot(x,z)).toBeLessThanOrEqual(.120001);
  await page.locator('#reset-position').click();await expect(canvas).toHaveAttribute('data-launch-x','-0.105');
  await page.locator('#pick-position').click();await canvas.press('ArrowRight');await canvas.press('Enter');
  expect(Number(await canvas.getAttribute('data-launch-x'))).toBeCloseTo(-.1);
  await page.locator('#launch').click();
  for(const id of ['power','angle','tilt','pick-position','reset-position'])await expect(page.locator(`#${id}`)).toBeDisabled();
  await page.locator('#reset-match').click();await expect(page.locator('#pick-position')).toBeEnabled();
  await expect(page.locator('#battle-result')).toBeHidden();
});

test('spoken settings are reviewed before applying and unsupported speech has a text fallback',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'SpeechRecognition',{value:undefined,configurable:true});Object.defineProperty(window,'webkitSpeechRecognition',{value:undefined,configurable:true});});
  await page.goto('/beyblade/');await page.locator('.speech-controls summary').click();
  await expect(page.locator('#speech-start')).toBeDisabled();await expect(page.locator('#speech-status')).toContainText('未対応');
  await page.locator('#spoken-command').fill('パワー８０、角度マイナス１０、傾き５');await page.locator('#speech-preview').click();
  await expect(page.locator('#power')).toHaveValue('60');await expect(page.locator('#speech-status')).toContainText('角度 -10°');
  await page.locator('#speech-apply').click();await expect(page.locator('#power')).toHaveValue('80');await expect(page.locator('#angle')).toHaveValue('-10');await expect(page.locator('#tilt')).toHaveValue('5');await expect(page.locator('#phase')).toContainText('READY');
  await page.locator('#spoken-command').fill('パワー50、傾き90');await page.locator('#speech-preview').click();await expect(page.locator('#speech-apply')).toBeDisabled();await expect(page.locator('#power')).toHaveValue('80');
});

test('speech recognition transcript is reviewable and cancelled when launching',async({page})=>{
  await page.addInitScript(()=>{
    class MockRecognition {
      lang='';continuous=false;interimResults=false;onresult:((event:{results:{transcript:string}[][]})=>void)|null=null;onerror:null=null;onend:null=null;
      start(){(window as unknown as {testRecognition:MockRecognition}).testRecognition=this;}
      abort(){(window as unknown as {recognitionAborted:boolean}).recognitionAborted=true;}
    }
    Object.defineProperty(window,'SpeechRecognition',{value:MockRecognition,configurable:true});
  });
  await page.goto('/beyblade/');await page.locator('.speech-controls summary').click();await page.locator('#speech-start').click();
  await page.evaluate(()=>(window as unknown as {testRecognition:{onresult:(event:{results:{transcript:string}[][]})=>void}}).testRecognition.onresult({results:[[{transcript:'パワー70、傾き10'}]]}));
  await expect(page.locator('#spoken-command')).toHaveValue('パワー70、傾き10');await expect(page.locator('#power')).toHaveValue('60');await page.locator('#speech-apply').click();await expect(page.locator('#power')).toHaveValue('70');
  await page.locator('#speech-start').click();await page.locator('#launch').click();await expect(page.locator('#speech-start')).toBeDisabled();await expect(page.locator('#speech-apply')).toBeDisabled();
  expect(await page.evaluate(()=>(window as unknown as {recognitionAborted:boolean}).recognitionAborted)).toBe(true);await page.locator('#reset-match').click();
});
