import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
interface Inventory { loose: string[]; wands: { id: string; name: string; spells: string[]; shuffle: boolean; charges: Record<string, number> }[]; pickups: { id: string; x: number; y: number; wand: { id: string; spells: string[] } }[] }
const inventory = async (page: Page) => JSON.parse((await page.locator('#cave').getAttribute('data-inventory'))!) as Inventory;
const countCards = (i: Inventory) => [...i.loose, ...i.wands.flatMap(w => w.spells), ...i.pickups.flatMap(p => p.wand.spells)].sort();
test('ordinary touch or keyboard pickup swaps finite cards, preserves save and fires payload at impact', async ({ page, context }, info) => {
  test.setTimeout(45000);
  const touch = info.project.name === 'android-chromium';
  await page.setViewportSize(touch ? { width: 393, height: 851 } : { width: 1280, height: 720 });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?mode=expedition&seed=3397');
  const activate = async (selector: string) => { const node = page.locator(selector); if (touch) await node.tap(); else await node.click(); };
  if (touch) await page.getByRole('button', { name: '新しい旅を始める', exact: true }).tap();
  else await page.getByRole('button', { name: '新しい旅を始める', exact: true }).click();
  const cave = page.locator('#cave'); await expect.poll(async () => Number(await cave.getAttribute('data-tick'))).toBeGreaterThan(8);
  const initial = await inventory(page), total = countCards(initial);
  const cdp = touch ? await context.newCDPSession(page) : null;
  if (cdp) {
    const box = (await page.locator('.move-pad').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .8, y: box.y + box.height / 2, id: 1 }] });
  } else await page.keyboard.down('KeyD');
  await expect.poll(async () => Number(await cave.getAttribute('data-player-x')), { intervals: [50], timeout: 5000 }).toBeGreaterThan(65);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await page.keyboard.up('KeyD');
  await expect(page.locator('#pickup')).toBeVisible();
  const rect = (await page.locator('#pickup').boundingBox())!;
  expect(rect.width).toBeGreaterThanOrEqual(48); expect(rect.height).toBeGreaterThanOrEqual(48);
  await activate('#pickup');
  await expect(page.getByRole('heading', { name: '拾った杖' })).toBeVisible();
  await page.screenshot({ path: info.outputPath(touch ? 'pickup-portrait.png' : 'pickup-desktop.png') });
  const swap = page.getByRole('button', { name: '2 採掘師の根 と交換', exact: true });
  if (touch) await swap.tap(); else await swap.click();
  await expect.poll(async () => (await inventory(page)).wands[1].shuffle).toBe(true);
  const swapped = await inventory(page);
  expect(countCards(swapped)).toEqual(total);
  expect(swapped.pickups[0].wand.id).toBe(initial.wands[1].id);
  expect(swapped.wands[1].spells).toContain('pebble'); expect(swapped.wands[1].spells).toContain('echo');
  await activate('#menu-button');
  const save = page.getByRole('button', { name: '保存してタイトルへ' }); if (touch) await save.tap(); else await save.click();
  await page.reload();
  const resume = page.getByRole('button', { name: '旅を続ける', exact: true }); if (touch) await resume.tap(); else await resume.click();
  await expect.poll(async () => (await inventory(page)).wands[1].id).toBe(swapped.wands[1].id);
  expect(countCards(await inventory(page))).toEqual(total);
  // Swap back and back again using ordinary buttons. No card or wand can clone.
  for (let n = 0; n < 2; n++) {
    await activate('#pickup');
    const button = page.locator('#overlay button').filter({ hasText: /^2 .+ と交換$/ });
    if (touch) await button.tap(); else await button.click();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect.poll(async () => (await inventory(page)).wands[1].id).toBe(n === 0 ? initial.wands[1].id : swapped.wands[1].id);
    expect(countCards(await inventory(page))).toEqual(total);
  }
  await activate('[data-wand="1"]');
  if (cdp) {
    const box = (await page.locator('.aim-pad').boundingBox())!;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width * .85, y: box.y + box.height / 2, id: 2 }] });
  } else { const box = (await cave.boundingBox())!; await page.mouse.move(box.width * .85, box.height * .4); await page.mouse.down(); }
  await expect.poll(async () => {
    const raw = await cave.getAttribute('data-trigger-impact');
    if (!raw || raw === 'null') return false;
    const hit = JSON.parse(raw) as { x:number; y:number; playerX:number; playerY:number; payload:{x:number;y:number;spell:string}[] };
    return hit.payload.length > 0 && Math.hypot(hit.x - hit.playerX, hit.y - hit.playerY) > 8 && hit.payload.every(p => Math.hypot(p.x - hit.x,p.y - hit.y) <= 3);
  }, { timeout: 15000, message: 'Trigger children must spawn at remote impact, not the player muzzle' }).toBe(true);
  if (cdp) await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); else await page.mouse.up();
  await info.attach('trigger-impact.json', { body: (await cave.getAttribute('data-trigger-impact'))!, contentType:'application/json' });
  await activate('#menu-button');
  await page.screenshot({ path: info.outputPath(touch ? 'finite-cards-portrait.png' : 'finite-cards-desktop.png') });
  expect(countCards(await inventory(page))).toEqual(total);
  expect(errors).toEqual([]);
});
