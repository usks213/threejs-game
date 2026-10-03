import { test, expect } from '@playwright/test';
test('starts, moves with keyboard and stick, jumps, and rotates safely', async ({ page }, info) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('canvas')).toBeVisible(); await expect(page.getByRole('heading', { name: /TERRA/ })).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('プレイ中');
 await page.keyboard.down('KeyD'); await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.5); await page.keyboard.up('KeyD');
 await page.getByRole('button', { name:'出発点へ' }).click(); await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeLessThan(0.01);
 const stick = await page.locator('#stick').boundingBox(); if (!stick) throw new Error('Missing stick');
 await page.mouse.move(stick.x+stick.width*0.8,stick.y+stick.height/2); await page.mouse.down();
 await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.3); await page.mouse.up();
 await page.getByRole('button', { name:'出発点へ' }).click();
 await expect(page.locator('#position')).toHaveAttribute('data-grounded','true');
 const y = Number(await page.locator('#position').getAttribute('data-y'));
 await page.getByRole('button', { name:'ジャンプ' }).click();
 await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-y'))).toBeGreaterThan(y + 0.4);
 await page.setViewportSize({width:844,height:390}); await expect(page.locator('canvas')).toHaveJSProperty('clientWidth',844);
 await expect(page.locator('#app')).toHaveAttribute('data-state','running'); await expect(page.locator('#error')).toBeHidden();
 const before = await page.locator('#position').getAttribute('data-x');
 await page.mouse.move(420,150); await page.mouse.down(); await page.mouse.move(480,160); await page.mouse.up();
 await expect(page.locator('#position')).toHaveAttribute('data-x',before!);
 await page.screenshot({path:info.outputPath('terra-landscape.png')}); expect(errors).toEqual([]);
});
async function cooldown(page: import('@playwright/test').Page) {
 const tick = Number(await page.locator('#app').getAttribute('data-tick'));
 await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-tick'))).toBeGreaterThan(tick + 8);
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
 await page.getByText('性能・試作の範囲', {exact:true}).click();
 await expect(page.locator('#metrics')).toContainText('セル');
 await expect.poll(async () => Number((await page.locator('#metrics').textContent())?.match(/水 (\d+)セル/)?.[1] ?? '0')).toBeGreaterThan(0);
 await page.getByText('性能・試作の範囲', {exact:true}).click();
 await page.locator('#use-tool').click(); await expect(page.locator('#notice')).toContainText('岩を落としました');
 await page.locator('#save').click(); await expect(page.locator('#save-status')).toHaveAttribute('data-edits','2');
 await page.reload(); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('#edit-count')).toHaveAttribute('data-count','2');
 await page.screenshot({path:info.outputPath('terra-restored.png')}); expect(errors).toEqual([]);
});
test('exports world data and rejects malformed imports without losing the current world', async ({page}) => {
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 const downloadEvent = page.waitForEvent('download'); await page.locator('#export').click();
 const download = await downloadEvent; expect(download.suggestedFilename()).toBe('terra-world-7319.json');
 await page.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"version":999}')});
 await expect(page.locator('#notice')).toContainText('対応しないセーブ'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
});
test('shows WebGL context loss clearly', async ({page}) => {
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.locator('canvas').dispatchEvent('webglcontextlost'); await expect(page.getByRole('alert')).toContainText('WebGL'); await expect(page.locator('#app')).toHaveAttribute('data-state','error');
});
