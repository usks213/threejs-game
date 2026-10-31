import {test,expect,devices} from '@playwright/test';
test('real desktop and phone clients match, launch, receive same result and leave',async({browser,baseURL},testInfo)=>{
  test.skip(testInfo.project.name!=='desktop-chromium','One isolated two-device match prevents cross-project queue interference');
  test.setTimeout(120_000);
  const desktop=await browser.newContext({baseURL});const mobile=await browser.newContext({...devices['Pixel 7'],baseURL});
  const a=await desktop.newPage(),b=await mobile.newPage();const errors:string[]=[];
  const snapshots:[Map<number,string>,Map<number,string>]=[new Map(),new Map()];
  for(const [i,page] of [a,b].entries())page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const message=JSON.parse(String(frame.payload));if(message.type==='state'&&message.battle){const battle=message.battle;snapshots[i].set(battle.tick,JSON.stringify(battle.tops.map((t:{x:number;y:number;z:number;orientation:unknown;angularMomentum:unknown})=>({x:t.x,y:t.y,z:t.z,orientation:t.orientation,angularMomentum:t.angularMomentum}))));}}catch{/* non-JSON protocol frames are ignored here */}}));
  await test.step('open desktop and phone online clients',async()=>{
    for(const page of [a,b]){page.on('pageerror',e=>errors.push(e.message));await page.goto('/beyblade/');await page.getByRole('tab',{name:'オンライン'}).click();}
  });
  await test.step('queue distinct clients and confirm both are ready',async()=>{
    await a.locator('#queue').click();await expect(a.locator('#connection')).toContainText('queued');
    await b.locator('#queue').click();
    for(const page of [a,b])await expect(page.locator('#connection')).toContainText('ready');
  });
  await test.step('launch the unchanged same-build asymmetric inputs',async()=>{
    await a.locator('#power').fill('100');await b.locator('#power').fill('20');await b.locator('#angle').fill('35');
    // Observe the actual DOM transition before launching: a legitimate short round may finish
    // while the second click awaits its browser acknowledgement on a loaded runner.
    for(const page of [a,b])await page.evaluate(()=>{
      const phase=document.getElementById('phase')!;
      const target=window as unknown as {arenaBattleObserved:boolean};target.arenaBattleObserved=false;
      const observer=new MutationObserver(()=>{if(phase.textContent?.includes('ONLINE BATTLE')){target.arenaBattleObserved=true;observer.disconnect();}});
      observer.observe(phase,{childList:true,characterData:true,subtree:true});
    });
    await a.locator('#launch').click();await b.locator('#launch').click();
  });
  await test.step('observe live battle and compare exact authoritative poses',async()=>{
    for(const page of [a,b])await expect.poll(()=>page.evaluate(()=>(window as unknown as {arenaBattleObserved:boolean}).arenaBattleObserved),{timeout:10_000}).toBe(true);
    await expect.poll(()=>[...snapshots[0].keys()].filter(tick=>tick>0&&snapshots[1].has(tick)).length).toBeGreaterThan(0);
    const sharedTick=[...snapshots[0].keys()].find(tick=>tick>0&&snapshots[1].has(tick))!;
    expect(snapshots[0].get(sharedTick)).toBe(snapshots[1].get(sharedTick));
    const poses=JSON.parse(snapshots[0].get(sharedTick)!);for(const pose of poses){expect(Number.isFinite(pose.y)).toBe(true);expect(pose.orientation).toBeDefined();expect(pose.angularMomentum).toBeDefined();expect(Math.hypot(pose.orientation.x,pose.orientation.y,pose.orientation.z,pose.orientation.w)).toBeCloseTo(1,6);}
  });
  await test.step('receive the same round result and mirrored scores',async()=>{
    await expect(a.locator('#phase')).toContainText('ROUND-END',{timeout:80_000});
    await expect(b.locator('#phase')).toContainText('ROUND-END');
    expect(await a.locator('#score-you').textContent()).toBe(await b.locator('#score-other').textContent());
    expect(await a.locator('#score-other').textContent()).toBe(await b.locator('#score-you').textContent());
    for(const page of [a,b])await expect(page.locator('#battle-result')).toBeVisible();
    expect(await a.locator('#result-finish').textContent()).toBe(await b.locator('#result-finish').textContent());
    const aWinner=await a.locator('#battle-result').getAttribute('data-winner');expect(await b.locator('#battle-result').getAttribute('data-winner')).toBe(aWinner==='0'?'1':'0');
  });
  // Live coverage comes from the transition and exact snapshots above, not a screenshot
  // that may arrive after a short round. Full-page layout is covered by the arena tests.
  await test.step('capture final desktop and phone stages',async()=>{
    await a.locator('.stage').screenshot({path:testInfo.outputPath('online-desktop.png'),scale:'css'});
    await b.locator('.stage').screenshot({path:testInfo.outputPath('online-phone.png'),scale:'css'});
  });
  await test.step('acknowledge the next round on both clients',async()=>{
    await a.locator('#launch').click();await b.locator('#launch').click();
    for(const page of [a,b])await expect(page.locator('#phase')).toContainText('ONLINE READY');
  });
  await test.step('leave and verify opponent match end without browser errors',async()=>{
    await b.locator('#cancel-queue').click();
    await expect(a.locator('#phase')).toContainText('MATCH-END');
    await expect(a.locator('#result-finish')).toHaveText('退出・接続切れによる決着');await expect(a.locator('#result-title')).toHaveText('YOU WIN');
    await expect(b.locator('#connection')).toContainText('接続を終了');
    expect(errors).toEqual([]);
  });
  await test.step('close both browser contexts',async()=>{await desktop.close();await mobile.close();});
});
