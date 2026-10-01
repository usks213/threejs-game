import { test, expect } from '@playwright/test';
test('starts, moves, resets and resizes without JavaScript errors', async ({ page }, info) => {
 const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await expect(page.locator('canvas')).toBeVisible(); await expect(page.getByRole('heading', { name: 'FIELD', exact: true })).toBeVisible();
 await expect(page.getByRole('status')).toHaveText('プレイ中');
 await page.keyboard.down('KeyD'); await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.5); await page.keyboard.up('KeyD');
 await page.getByRole('button', { name:'中央へ戻る' }).click(); await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBe(0);
 const stick = await page.locator('#stick').boundingBox(); if (!stick) throw new Error('Missing stick');
 await page.mouse.move(stick.x+stick.width*0.8,stick.y+stick.height/2); await page.mouse.down();
 await expect.poll(async () => Number(await page.locator('#position').getAttribute('data-x'))).toBeGreaterThan(0.3);
 await page.mouse.up();
 await page.setViewportSize({width:844,height:390}); await expect(page.locator('canvas')).toHaveJSProperty('clientWidth',844);
 await expect(page.locator('#app')).toHaveAttribute('data-state','running'); await expect(page.locator('#error')).toBeHidden();
 await page.screenshot({path:info.outputPath('game.png')}); expect(errors).toEqual([]);
});
test('shows WebGL context loss clearly', async ({page}) => {
 await page.goto('/'); await expect(page.locator('#app')).toHaveAttribute('data-state','running');
 await page.locator('canvas').dispatchEvent('webglcontextlost'); await expect(page.getByRole('alert')).toContainText('WebGL'); await expect(page.locator('#app')).toHaveAttribute('data-state','error');
});
