import { test, expect } from '@playwright/test';
import { random } from '../../src/emberfall/generation';
test.describe.configure({ retries: 0 });
interface Observation { phase: string; seed: number; level: number; x: number; y: number; hp: number; kills: number; gold: number; cameraX: number; cameraY: number; width: number; height: number; enemies: { x: number; y: number }[] }
function route(seed: number, level: number) {
  const rng = random(seed + level * 1879), nodes = [];
  for (let i = 1; i <= 7; i++) nodes.push({ x: i % 2 ? 185 + Math.floor(rng() * 20) : 48 + Math.floor(rng() * 28), y: 20 + i * 46 });
  nodes.push({ x: 213, y: 355 }); return nodes;
}
test('ordinary desktop controls traverse all caves, shop, perks and final guardian', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'Full desktop journey; Android has separate trusted multitouch acceptance');
  test.setTimeout(210000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?mode=expedition&seed=3397'); await page.getByRole('button', { name: '新しい旅を始める', exact: true }).click();
  const canvas = page.locator('#cave');
  await expect.poll(async () => Number(await canvas.getAttribute('data-tick'))).toBeGreaterThan(10);
  let node = 0, currentLevel = 0, keys = new Set<string>(), mouseDown = false;
  let lastPosition = { x: 40, y: 27 }, stuckSince = Date.now(), recoverUntil = 0;
  const receipt: Observation[] = [];
  const setKeys = async (next: Set<string>) => { for (const key of keys) if (!next.has(key)) await page.keyboard.up(key); for (const key of next) if (!keys.has(key)) await page.keyboard.down(key); keys = next; };
  const release = async () => { await setKeys(new Set()); if (mouseDown) { await page.mouse.up(); mouseDown = false; } };
  const started = Date.now();
  while (Date.now() - started < 180000) {
    const state = JSON.parse((await canvas.getAttribute('data-observation'))!) as Observation;
    if (state.phase === 'dead') throw new Error(`Died during ordinary journey: ${JSON.stringify(state)}`);
    if (state.phase === 'won') { receipt.push(state); break; }
    if (state.phase === 'refuge') {
      await release(); receipt.push(state);
      await page.screenshot({ path: info.outputPath(`refuge-${state.level + 1}.png`) });
      const offered = page.locator('.perk-list button:not(:disabled)');
      const options = await offered.allTextContents();
      const preferred = ['耐熱の外套','琥珀の心臓','深い魔力槽','風の靴','金砂の磁針','旅の工房'].find(name => options.some(t => t.includes(name)));
      if (preferred) await page.locator('.perk-list button', { hasText: preferred }).click();
      if (state.level === 0) {
        const first = page.locator('.wand-card').first(), slots = first.locator('select');
        const before = JSON.parse((await canvas.getAttribute('data-inventory'))!) as { loose:string[]; wands:{spells:string[]}[] };
        const owned = [...before.loose, ...before.wands.flatMap(w => w.spells)].sort();
        for (let i = 0; i < await slots.count(); i++) await slots.nth(i).selectOption(i < 3 ? 'shard' : '');
        await first.getByRole('button', { name: 'この構成を適用' }).click();
        await expect(first.locator('.edit-feedback')).toContainText('カードが足りません');
        await page.waitForTimeout(150);
        const afterReject = JSON.parse((await canvas.getAttribute('data-inventory'))!);
        expect([...afterReject.loose, ...afterReject.wands.flatMap((w:{spells:string[]}) => w.spells)].sort()).toEqual(owned);
        for (let i = 0; i < await slots.count(); i++) await slots.nth(i).selectOption('');
        await first.getByRole('button', { name: 'この構成を適用' }).click();
        await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-inventory'))!).wands[0].spells.length).toBe(0);
        const newSlots = page.locator('.wand-card').first().locator('select');
        await newSlots.nth(0).selectOption('shard'); await newSlots.nth(1).selectOption('shard');
        await page.locator('.wand-card').first().getByRole('button', { name: 'この構成を適用' }).click();
        await expect.poll(async () => JSON.parse((await canvas.getAttribute('data-inventory'))!).wands[0].spells.length).toBe(2);
      }
      for (const name of ['暁の槍','重ね力']) { const purchase = page.locator('.shop button', { hasText: name }); if (await purchase.isEnabled()) await purchase.click(); }
      const card = page.locator('.wand-card').first(), selects = card.locator('select');
      const known = await selects.first().locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value));
      if (known.includes('lance')) {
        const spells = known.includes('force') ? ['force','lance'] : ['lance'];
        for (let i = 0; i < await selects.count(); i++) await selects.nth(i).selectOption(spells[i] ?? '');
        await card.getByRole('button', { name: 'この構成を適用' }).click();
      }
      await page.getByRole('button', { name: '次の地層へ' }).click();
      currentLevel = state.level + 1; node = 0; lastPosition = { x: 40, y: 27 }; stuckSince = Date.now(); recoverUntil = 0;
      await expect.poll(async () => (JSON.parse((await canvas.getAttribute('data-observation'))!) as Observation).level).toBe(currentLevel);
      continue;
    }
    const nodes = route(state.seed, currentLevel), target = nodes[node];
    if (Math.abs(state.x - target.x) < 10 && state.y >= target.y - 4 && node < nodes.length - 1) node++;
    const next = nodes[node], desired = new Set<string>();
    if (Math.hypot(state.x - lastPosition.x, state.y - lastPosition.y) > 2) { lastPosition = {x:state.x,y:state.y}; stuckSince = Date.now(); }
    // A real player uses levitation to climb a local ledge even when the next
    // distant room is lower. Recover through ordinary input, never teleport.
    if (Math.abs(next.x - state.x) > 5 && Date.now() - stuckSince > 650) { recoverUntil = Date.now() + 700; stuckSince = Date.now() + 700; }
    if (Math.abs(next.x - state.x) > 2) desired.add(next.x > state.x ? 'KeyD' : 'KeyA');
    if (state.y > next.y + 6 || Date.now() < recoverUntil) desired.add('Space');
    const nearest = state.enemies.sort((a,b) => Math.hypot(a.x - state.x,a.y - state.y) - Math.hypot(b.x - state.x,b.y - state.y))[0];
    // Fight from a distance throughout the final approach, before reaching the
    // locked gate. Charging through the preceding room can pin the player
    // against a ledge within an enemy's contact range before gate combat starts.
    // Back away and levitate into a clear shot with the same ordinary controls.
    if (currentLevel === 2 && node >= nodes.length - 3 && nearest && Math.hypot(nearest.x-state.x,nearest.y-state.y)<70) {
      desired.delete('KeyA');desired.delete('KeyD');
      const side=state.x>=nearest.x?1:-1, firingX=nearest.x+side*32;
      if(Math.abs(firingX-state.x)>3)desired.add(firingX>state.x?'KeyD':'KeyA');
      if(state.y>nearest.y-10)desired.add('Space');
    }
    await setKeys(desired);
    if (nearest) {
      const box = (await canvas.boundingBox())!;
      const x = Math.max(2, Math.min(box.width - 2, (nearest.x - state.cameraX) / state.width * box.width));
      const y = Math.max(2, Math.min(box.height - 2, (nearest.y - state.cameraY) / state.height * box.height));
      await page.mouse.move(x,y); if (!mouseDown) { await page.mouse.down(); mouseDown = true; }
    } else if (mouseDown) { await page.mouse.up(); mouseDown = false; }
    if (node === nodes.length - 1 && Math.hypot(state.x - 213,state.y - 355) < 19) await page.keyboard.press('KeyE');
    await page.waitForTimeout(80);
  }
  await release();
  await info.attach('final-observation.json',{ body: (await canvas.getAttribute('data-observation')) ?? '{}', contentType:'application/json' });
  await expect(canvas).toHaveAttribute('data-phase','won');
  await expect(page.getByRole('heading', { name: '種を持ち帰った' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('victory.png') });
  await info.attach('ordinary-journey.json',{ body: JSON.stringify(receipt,null,2), contentType:'application/json' });
  expect(receipt.filter(s => s.phase === 'refuge')).toHaveLength(2);
  expect(receipt.at(-1)?.hp).toBeGreaterThan(0); expect(errors).toEqual([]);
});
