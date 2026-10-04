import { GameSimulation } from '../../src/simulation/game-simulation';
import { test, expect } from '@playwright/test';
test('starts, moves with keyboard and stick, jumps, and rotates safely', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('canvas')).toBeVisible(); await expect(page.getByRole('heading', { name: /TERRA/ })).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('プレイ中');
 await page.keyboard.down('KeyD'); await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.5); await page.keyboard.up('KeyD');
 await systemAction(page, 'reset'); await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeLessThan(0.01);
 const stick = await page.locator('#stick').boundingBox(); if (!stick) throw new Error('Missing stick');
 await page.mouse.move(stick.x+stick.width*0.8,stick.y+stick.height/2); await page.mouse.down();
 await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.3); await page.mouse.up();
 await systemAction(page, 'reset');
 await cooldown(page, 35); await expect(page.locator('#position')).toHaveAttribute('data-grounded','true');
 await page.getByRole('button', { name:'ジャンプ' }).click();
 await expect.poll(async () => Number((await page.locator('#metrics').textContent())?.match(/ジャンプ ([\d.]+)m/)?.[1] ?? '0')).toBeGreaterThan(0.4);
 await expect(page.locator('#position')).toHaveAttribute('data-grounded','true');
 await page.setViewportSize({width:844,height:390}); await expect(page.locator('canvas')).toHaveJSProperty('clientWidth',844);
 await expect(page.locator('#app')).toHaveAttribute('data-state','running'); await expect(page.locator('#error')).toBeHidden();
 const before = await page.locator('#position').getAttribute('data-x');
 await page.mouse.move(420,150); await page.mouse.down(); await page.mouse.move(480,160); await page.mouse.up();
 await expect(page.locator('#position')).toHaveAttribute('data-x',before!);
 expect(errors).toEqual([]);
});
async function systemAction(page: import('@playwright/test').Page, id: string) {
 await page.locator('#system-menu').click(); await page.locator('#' + id).click(); await page.locator('#system-close').click();
}
async function cooldown(page: import('@playwright/test').Page, ticks = 8) {
 const tick = Number(await page.locator('#app').getAttribute('data-tick'));
 await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-tick'))).toBeGreaterThan(tick + ticks);
}
test('edits terrain, pours water, drops a rock, saves and restores after reload', async ({page}, info) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('#use-tool')).toBeEnabled(); await page.locator('#use-tool').click();
 await expect(page.locator('#edit-count')).toHaveAttribute('data-count','1');
 await cooldown(page); await page.locator('[data-tool="add"]').click(); await page.locator('#use-tool').click();
 await expect(page.locator('#edit-count')).toHaveAttribute('data-count','2');
 await cooldown(page); await page.locator('[data-tool="water"]').click(); await page.locator('#use-tool').click();
 await expect(page.locator('#notice')).toContainText('水を流しました');
 await cooldown(page); await page.locator('[data-tool="rock"]').click();
 // Waiting for water receipt plus a UI update crosses the authority action cooldown.
 await expect(page.locator('#metrics')).toContainText('セル');
 await expect.poll(async () => Number((await page.locator('#metrics').textContent())?.match(/水 (\d+)セル/)?.[1] ?? '0')).toBeGreaterThan(0);
 await page.locator('#use-tool').click(); await expect(page.locator('#notice')).toContainText('岩を落としました');
 await systemAction(page, 'save'); await expect(page.locator('#save-status')).toHaveAttribute('data-edits','2'); await expect(page.locator('#save-status')).toHaveAttribute('data-bodies','1');
 await page.reload(); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('#edit-count')).toHaveAttribute('data-count','2');
 await expect(page.locator('#metrics')).toContainText('物理 1個');
 await expect.poll(async () => Number((await page.locator('#metrics').textContent())?.match(/水 (\d+)セル/)?.[1] ?? '0')).toBeGreaterThan(0);
 await page.screenshot({scale:'css',path:info.outputPath('terra-restored.png')}); expect(errors).toEqual([]);
});
test('exports world data and rejects malformed imports without losing the current world', async ({page}) => {
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 const downloadEvent = page.waitForEvent('download'); await systemAction(page, 'export');
 const download = await downloadEvent; expect(download.suggestedFilename()).toBe('terra-world-7319.json');
 await page.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});
 await expect(page.locator('#notice')).toContainText('対応しないセーブ'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
});
test('shows WebGL context loss clearly', async ({page}) => {
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.locator('canvas').dispatchEvent('webglcontextlost'); await expect(page.getByRole('alert')).toContainText('WebGL'); await expect(page.locator('#app')).toHaveAttribute('data-state','error');
});

test('two fingers move and jump together, and camera reaches both vertical poles', async ({ page }) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state', 'running');
 await expect(page.locator('#position')).toHaveAttribute('data-grounded', 'true');
 const stick = await page.locator('#stick').boundingBox(), jump = await page.locator('#jump').boundingBox();
 if (!stick || !jump) throw new Error('Missing touch controls');
 const session = await page.context().newCDPSession(page);
 const left = { x: stick.x + stick.width * 0.8, y: stick.y + stick.height / 2, id: 1 };
 const right = { x: jump.x + jump.width / 2, y: jump.y + jump.height / 2, id: 2 };
 await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left] });
 await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.2);
 const before = Number(await page.locator('#position').getAttribute('data-x'));
 await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, right] });
 // Keep the joystick down; release only the jump finger.
 await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [left] });
 await expect.poll(async () => Number((await page.locator('#metrics').textContent())?.match(/ジャンプ ([\d.]+)m/)?.[1] ?? '0')).toBeGreaterThan(0.4);
 await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(before + 0.4);
 await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
 await page.getByRole('button', { name: '視点を戻す' }).click();
 // Pointer capture keeps dragging active when crossing HUD overlays.
 await page.mouse.move(220, 260); await page.mouse.down(); await page.mouse.move(220, 660); await page.mouse.up();
 await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-camera-pitch'))).toBeCloseTo(Math.PI / 2);
 await page.mouse.move(220, 660); await page.mouse.down(); await page.mouse.move(220, 80); await page.mouse.up();
 await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-camera-pitch'))).toBeCloseTo(-Math.PI / 2);
 await page.locator('[data-tool="water"]').click(); await expect(page.locator('#use-tool')).toBeEnabled();
 const water = await page.locator('#water-cast').boundingBox(); if (!water) throw new Error('Missing water control');
 const jet = { x: water.x + water.width / 2, y: water.y + water.height / 2, id: 2 };
 await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [left, jet] });
 await cooldown(page, 18);
 await expect(page.locator('#notice')).toContainText('水を流しました');
 await expect.poll(async () => Number((await page.locator('#metrics').textContent())?.match(/水 (\d+)セル/)?.[1] ?? '0')).toBeGreaterThan(20);
 await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
 await expect(page.locator('#water-cast')).not.toHaveClass(/held/);
 await page.getByRole('button', { name: '視点を戻す' }).click();
 await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-camera-pitch'))).toBeCloseTo(0.32);
 expect(errors).toEqual([]);
});

test('survival adventure opens Meadows recipes and persists gathered materials', async ({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const sim=new GameSimulation();const n=sim.adventure.state.resources.find(n=>n.kind==='branch')!;Object.assign(sim.player,{x:n.x,y:n.y,z:n.z});
 await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.locator('#import-file').setInputFiles({name:'gather.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sim.save()))});
 await expect(page.locator('#app')).toHaveAttribute('data-state','running');await expect.poll(async()=>Number(await page.locator('#position').getAttribute('data-x'))).toBeCloseTo(sim.player.x);
 await expect(page.locator('#adventure-hud')).toContainText('草原');await expect(page.locator('#journey')).toContainText('落ち枝と石');
 await page.locator('#gather').click();await expect(page.locator('#notice')).toContainText('木材');
 await page.locator('#adventure-menu').click();await page.getByRole('button',{name:/^木材 /}).first().click();await expect(page.locator('#adventure-content')).toContainText('木材');
 await page.locator('[data-tab=craft]').click();await expect(page.locator('#adventure-content')).toContainText('粗末な弓');
 await page.screenshot({scale:'css',path:info.outputPath('meadows-recipes.png')});await page.locator('#adventure-close').click();
 await systemAction(page,'save');await page.reload();await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.locator('#adventure-menu').click();await page.getByRole('button',{name:/^木材 /}).first().click();await expect(page.locator('#adventure-content')).toContainText('木材');expect(errors).toEqual([]);
});

test('renders equipped characters, textured terrain and water without shader errors', async ({ page }, info) => {
 test.setTimeout(120000);
 const errors: string[] = [];
 page.on('pageerror', error => errors.push(error.message));
 page.on('console', message => { if (message.type() === 'error' && /THREE|WebGL|shader/i.test(message.text())) errors.push(message.text()); });
 const sim = new GameSimulation(); sim.adventure.state.inventory = { sword: 1, staff: 1, shield: 1 }; sim.adventure.state.equipment = 'staff';
 const save = sim.save();
 await page.goto('/?graphicsProbe=1'); await expect(page.locator('#app')).toHaveAttribute('data-state', 'running');
 await page.locator('#import-file').setInputFiles({ name: 'visual-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(save)) });
 await expect(page.locator('#adventure-hud')).toContainText('杖');
 await page.locator('[data-tool="water"]').click(); await page.locator('#use-tool').click();
 await expect(page.locator('#notice')).toContainText('水を流しました');
 await cooldown(page, 10); await page.locator('#attack').click();
 await cooldown(page, 15);
 const graphics=async()=>JSON.parse((await page.locator('#app').getAttribute('data-graphics'))!);
 await expect.poll(async()=>(await graphics()).shUpdates).toBeGreaterThan(0);
 await expect.poll(async()=>(await graphics()).samples).toBeGreaterThan(0);
 await expect.poll(async()=>(await graphics()).stageSamples).toBeGreaterThan(0);
 const day=await graphics();expect(day.invalidPixels).toBe(0);expect(day.beautyEnergy).toBeGreaterThan(0);expect(day.volumeEnergy).toBeGreaterThan(0);expect(day.shEnergy).toBeGreaterThan(0);expect(day.luminance).toBeGreaterThan(0);expect(day.probeError).toBe('');
 expect(day.features).toEqual(['pbr','physical-sky','ibl','sh','volumetric','exposure','bloom','shadow','ssr']);
 await page.setViewportSize({width:844,height:390});await page.screenshot({scale:'css',path:info.outputPath('pbr-day-hdr.png')});
 sim.adventure.state.seconds=450; // Midnight, using the same authoritative save/import path as players.
 sim.adventure.state.equipment='staff';
 await page.locator('#import-file').setInputFiles({name:'night-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sim.save()))});
 await expect.poll(async()=>(await graphics()).hour).toBeLessThan(3);
 await expect.poll(async()=>(await graphics()).shUpdates).toBeGreaterThan(day.shUpdates);
 await expect.poll(async()=>(await graphics()).shEnergy,{timeout:30000}).toBeLessThan(day.shEnergy*.5);
 await expect.poll(async()=>(await graphics()).luminance,{timeout:30000}).toBeLessThan(day.luminance*.8);
 await expect.poll(async()=>(await graphics()).exposure,{timeout:30000}).toBeGreaterThan(day.exposure*1.15);
 await expect.poll(async()=>(await graphics()).bloomEnergy,{timeout:30000}).toBeGreaterThan(0);
 await page.screenshot({scale:'css',path:info.outputPath('pbr-night-hdr.png')});
 await info.attach('graphics-measurements',{body:JSON.stringify({day,night:await graphics()},null,2),contentType:'application/json'});
 await expect(page.locator('#error')).toBeHidden(); expect(errors).toEqual([]);
});

test('survival adventure previews, rotates and places a building on mobile',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/THREE|WebGL|shader/i.test(m.text()))errors.push(m.text());});
 const sim=new GameSimulation();sim.adventure.state.inventory={wood:40,stone:40,sword:1,hammer:1};sim.adventure.state.equipment='sword';
 await page.goto('/');await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.locator('#import-file').setInputFiles({name:'building.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sim.save()))});
 await expect(page.locator('#adventure-hud')).toContainText('石剣');
 await page.locator('#adventure-menu').click();await page.locator('[data-tab="build"]').click();await page.locator('[data-game-action="place"][data-id="bench"]').click();
 await expect(page.locator('#build-controls')).toBeVisible();await page.locator('#build-rotate').click();await expect(page.locator('#use-tool')).toBeEnabled();
 await page.screenshot({scale:'css',path:info.outputPath('building-preview.png')});
 await page.locator('#use-tool').click();await expect(page.locator('#notice')).toContainText('作業台を設置');
 await page.locator('#build-cancel').click();await expect(page.locator('#build-controls')).toBeHidden();
 expect(errors).toEqual([]);
});
