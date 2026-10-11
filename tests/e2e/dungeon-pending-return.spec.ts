import {waitForDungeonWorld} from './helpers/dungeon-world-ready';
import {test, expect} from '@playwright/test';
import {ITEMS} from '../../src/dungeon/catalog';
import type {Item, Snapshot} from '../../src/dungeon/types';
import {own} from './helpers/dungeon-raid-controls';
import {DungeonReturnRoute} from './helpers/dungeon-return-route';

// Position changes on banking/claiming, and extraction marks a carried item found.
// Everything defining the actual item and its stack must survive unchanged.
const manifest = (items: readonly Item[]) => items.map(({id, kind, quality, count, rotated}) =>
  ({id, kind, quality, count, rotated})).sort((a, b) => a.id.localeCompare(b.id));
const pending = (snapshot: Snapshot) => snapshot.pendingReturn ?? [];
const owned = (snapshot: Snapshot) => [...snapshot.stash, ...pending(snapshot), ...own(snapshot).bag];
function expectUnique(items: readonly Item[]) {
  expect(new Set(items.map(item => item.id)).size, 'Every owned item occurs exactly once').toBe(items.length);
}
function footprint(item: Item) {
  const definition = ITEMS[item.kind];
  return item.rotated ? {width: definition.h, height: definition.w} : {width: definition.w, height: definition.h};
}
// Independently enumerate occupied cells. Do not call the production placement
// function to decide whether its own failed placement was correct.
function hasStashSpace(stash: readonly Item[], item: Item) {
  const occupied = new Set<string>();
  for (const stored of stash) {
    const size = footprint(stored);
    for (let y = stored.y; y < stored.y + size.height; y++) {
      for (let x = stored.x; x < stored.x + size.width; x++) occupied.add(`${x},${y}`);
    }
  }
  const size = footprint(item);
  for (let y = 0; y <= 10 - size.height; y++) {
    for (let x = 0; x <= 10 - size.width; x++) {
      let free = true;
      for (let dy = 0; dy < size.height; dy++) {
        for (let dx = 0; dx < size.width; dx++) if (occupied.has(`${x + dx},${y + dy}`)) free = false;
      }
      if (free) return true;
    }
  }
  return false;
}

test('dungeon real repeated extractions preserve a full-stash return batch through reload and ordinary claims', async ({page, isMobile}, info) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed authoritative dungeon');
  // Eight natural 14-cell hauls normally reach a 100-cell stash. Keep the real
  // 45-second exit timer for every raid; this gate is intentionally independent.
  test.setTimeout(18 * 60 * 1000);
  const route = new DungeonReturnRoute(page, isMobile);
  const errors: Array<{source: string; text: string}> = [];
  const evidence: Array<{stage: string; raid: number; tick: number; elapsed: number; status: string;
    hp: number; stash: Item[]; pending: Item[]; bag: Item[]}> = [];
  const record = (stage: string, snapshot: Snapshot) => evidence.push({stage, raid: snapshot.raid,
    tick: snapshot.tick, elapsed: snapshot.elapsed, status: own(snapshot).status, hp: own(snapshot).hp,
    stash: snapshot.stash, pending: pending(snapshot), bag: own(snapshot).bag});
  page.on('pageerror', error => errors.push({source: 'pageerror', text: String(error)}));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({source: 'console', text: message.text()});
  });

  try {
    expect(process.env.EXPECTED_COMMIT).toBeTruthy();
    const deployment = await page.request.get('/deployment.json');
    expect(deployment.ok()).toBe(true);
    expect((await deployment.json()).commit).toBe(process.env.EXPECTED_COMMIT);
    const health = await page.request.get('/dungeon-room/health');
    expect(health.ok()).toBe(true);
    expect(await health.json()).toMatchObject({enabled: true, authority: 'server', protocol: 1, stashScope: 'room-player'});
    await page.goto('/?mode=dungeon&test=1');
    await page.getByTestId('dungeon-name').fill('満杯でも帰還する探索者');
    await route.activate(page.getByTestId('dungeon-create'));
    let current = await route.until(snapshot => snapshot.actors.length === 1, 'A fresh private solo room exists');
    const explorer = current.you;
    expect(current.raid).toBe(0);
    expect(current.stash).toEqual([]);
    expect(pending(current)).toEqual([]);
    expect(own(current).bag).toEqual([]);
    expect(current.gold).toBe(0);
    record('fresh-room', current);
    let collected: Item[] = [];

    for (let raid = 1; raid <= 10; raid++) {
      const previousStash = current.stash;
      expect(pending(current)).toEqual([]);
      expect(own(current).bag, 'Every new haul uses the ordinary empty-bag free kit').toEqual([]);
      await expect(page.getByTestId('dungeon-loadout-preview')).toContainText('無料補給');
      await route.activate(page.getByTestId('dungeon-ready'));
      await route.until(snapshot => own(snapshot).ready, `Raid ${raid} is prepared normally`);
      await route.activate(page.getByTestId('dungeon-start'));
      const started = await route.until(snapshot => snapshot.raid === raid && snapshot.phase === 'raid', `Raid ${raid} begins normally`);
    await waitForDungeonWorld(page);
      expect(own(started).status).toBe('alive');
      expect(own(started).bag.map(item => [item.kind, item.count]).sort()).toEqual([
        ['potion', 2], ['shield', 1], ['sword', 1],
      ]);
      expect(started.stash).toEqual(previousStash);

      await route.walk(-12, 8);
      await route.activate(page.locator('[data-target=chest0]'));
      const opened = await route.until(snapshot => !!snapshot.containers.find(box => box.id === 'chest0')?.opened, 'The ordinary west chest opens');
      const loot = opened.containers.find(box => box.id === 'chest0')!.items;
      expect(loot).toHaveLength(3);
      expect(loot.map(item => item.kind).sort()).toEqual(['key', 'ore', 'relic']);
      await route.activate(page.locator('[data-target=chest0]'));
      await expect(page.getByTestId('dungeon-inventory')).toBeVisible();
      for (const item of loot) {
        await route.activate(page.locator(`[data-loot-target=chest0][data-loot-item="${item.id}"]`));
        await route.until(snapshot => own(snapshot).bag.some(value => value.id === item.id), `${item.kind} is actually picked up`);
      }
      const carrying = await route.state();
      expect(own(carrying).status).toBe('alive');
      expect(own(carrying).bag).toHaveLength(6);
      expect(carrying.containers.find(box => box.id === 'chest0')?.items).toEqual([]);
      collected = [...collected, ...own(carrying).bag];
      expectUnique(collected);
      record('carrying-before-extraction', carrying);
      await route.inventory(false);

      current = await route.extract();
      expect(current.raid).toBe(raid);
      expect(own(current).status).toBe('extracted');
      expect(own(current).hp).toBeGreaterThan(0);
      expect(current.phase).toBe('finished');
      expect(own(current).bag).toEqual([]);
      expect(manifest([...current.stash, ...pending(current)])).toEqual(manifest([...previousStash, ...own(carrying).bag]));
      expect(manifest(owned(current))).toEqual(manifest(collected));
      expectUnique(owned(current));
      for (const item of previousStash) expect(current.stash.find(value => value.id === item.id)).toEqual(item);
      expect([...current.stash, ...pending(current)].every(item => item.found)).toBe(true);
      record('extracted-with-all-items-accounted-for', current);
      if (pending(current).length) break;

      await route.activate(page.getByRole('button', {name: '補給所へ戻る', exact: true}));
      current = await route.until(snapshot => own(snapshot).status === 'lobby', `Raid ${raid} returns to the supplier`);
    }

    const batch = pending(current);
    expect(batch.length, 'Actual repeated raids must overflow the real stash within ten hauls').toBeGreaterThan(0);
    expect(batch.length).toBeLessThanOrEqual(50);
    expect(batch.reduce((cells, item) => cells + footprint(item).width * footprint(item).height, 0)).toBeLessThanOrEqual(50);
    for (const item of batch) expect(hasStashSpace(current.stash, item), `${item.id} genuinely cannot fit in the bank`).toBe(false);
    await expect(page.getByTestId('dungeon-result')).toContainText(`未受領 ${batch.length}品`);
    await page.screenshot({path: info.outputPath('overflow-successful-extraction.png')});
    await route.activate(page.getByRole('button', {name: `未受領品 ${batch.length}品を確認`, exact: true}));
    await expect(page.getByTestId('dungeon-pending-return')).toBeVisible();
    await expect(page.getByTestId('dungeon-claim-bag')).toBeDisabled();
    await expect(page.getByTestId('dungeon-claim-bag-reason')).toContainText('補給所へ戻って');
    await route.inventory(false);
    await route.activate(page.getByRole('button', {name: '補給所へ戻る', exact: true}));
    current = await route.until(snapshot => own(snapshot).status === 'lobby', 'The survivor returns to the supplier with the batch protected');
    await expect(page.getByTestId('dungeon-ready')).toBeDisabled();
    await expect(page.getByTestId('dungeon-start')).toBeDisabled();
    await expect(page.getByTestId('dungeon-start-hint')).toContainText('未受領品');
    await route.activate(page.getByTestId('dungeon-pending-open'));
    await expect(page.getByTestId('dungeon-pending-count')).toHaveText(`${batch.length}品 · 帰還1回分`);
    await route.activate(page.locator(`[data-return-item="${batch[0].id}"]`));
    await expect(page.getByTestId('dungeon-claim-stash')).toBeDisabled();
    await expect(page.getByTestId('dungeon-claim-stash-reason')).toContainText('空きがありません');
    await expect(page.getByTestId('dungeon-claim-bag')).toBeEnabled();
    for (const supply of ['potion', 'bandage']) {
      await expect(page.getByTestId(`dungeon-buy-${supply}`)).toBeDisabled();
      await expect(page.locator(`#dungeon-buy-${supply}-reason`)).toHaveText('未受領品をすべて受け取ってください');
    }
    await page.getByTestId('dungeon-pending-count').scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('pending-return-before-reload.png')});
    record('pending-before-reload', current);

    // Reload and use the ordinary join button. No identity, save, inventory,
    // elapsed-time or server state is inserted or rewritten by this test.
    const savedStash = current.stash;
    const savedBatch = pending(current);
    const savedRaid = current.raid;
    await page.reload();
    await route.activate(page.getByTestId('dungeon-join'));
    current = await route.until(snapshot => snapshot.you === explorer && snapshot.raid === savedRaid, 'The same explorer reconnects after reload');
    expect(current.stash).toEqual(savedStash);
    expect(pending(current)).toEqual(savedBatch);
    expect(own(current).bag).toEqual([]);
    expect(own(current).status).toBe('lobby');
    expect(manifest(owned(current))).toEqual(manifest(collected));
    expectUnique(owned(current));
    await expect(page.getByTestId('dungeon-ready')).toBeDisabled();
    await expect(page.getByTestId('dungeon-start')).toBeDisabled();
    await route.activate(page.getByTestId('dungeon-pending-open'));
    await expect(page.getByTestId('dungeon-pending-count')).toHaveText(`${savedBatch.length}品 · 帰還1回分`);
    record('pending-survives-reload', current);
    await page.getByTestId('dungeon-claim-bag').scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('pending-return-claim-controls.png')});

    for (const item of savedBatch) {
      const before = await route.state();
      await route.activate(page.locator(`[data-return-item="${item.id}"]`));
      await expect(page.locator(`[data-return-item="${item.id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByTestId('dungeon-claim-stash')).toBeDisabled();
      await expect(page.getByTestId('dungeon-claim-bag')).toBeEnabled();
      await route.activate(page.getByTestId('dungeon-claim-bag'));
      current = await route.until(snapshot => !pending(snapshot).some(value => value.id === item.id)
        && own(snapshot).bag.some(value => value.id === item.id), 'A real claim moves the selected item exactly once');
      expect(pending(current)).toHaveLength(pending(before).length - 1);
      expect(own(current).bag).toHaveLength(own(before).bag.length + 1);
      expect(current.stash).toEqual(before.stash);
      expect(manifest(pending(current))).toEqual(manifest(pending(before).filter(value => value.id !== item.id)));
      expect(manifest(own(current).bag)).toEqual(manifest([...own(before).bag, item]));
      expect(own(current).bag.filter(value => value.id === item.id)).toHaveLength(1);
      expectUnique(owned(current));
      expect(manifest(owned(current))).toEqual(manifest(collected));
      await expect(page.locator(`[data-return-item="${item.id}"]`)).toHaveCount(0);
      record('one-item-claimed-once', current);
    }
    await expect(page.getByTestId('dungeon-pending-return')).toBeHidden();
    expect(pending(current)).toEqual([]);

    // An overflow batch can consist solely of non-weapons. Use a real banked
    // sword when necessary, so the normal weapon preparation gate still applies.
    if (!own(current).bag.some(item => ['sword', 'greatsword', 'dagger', 'bow', 'staff'].includes(item.kind))) {
      const sword = current.stash.find(item => item.kind === 'sword');
      expect(sword, 'An earlier successful raid banked a real sword').toBeTruthy();
      const before = current;
      await route.activate(page.locator(`[data-item="${sword!.id}"]`));
      await route.activate(page.getByRole('button', {name: '鞄へ移す', exact: true}));
      current = await route.until(snapshot => own(snapshot).bag.some(item => item.id === sword!.id), 'A real banked weapon is carried for preparation');
      expect(current.stash.some(item => item.id === sword!.id)).toBe(false);
      expect(manifest(current.stash)).toEqual(manifest(before.stash.filter(item => item.id !== sword!.id)));
      expect(manifest(own(current).bag)).toEqual(manifest([...own(before).bag, sword!]));
    }
    await page.getByTestId('dungeon-inventory-loadout').scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('return-batch-claimed-into-bag.png')});
    await route.inventory(false);
    await expect(page.getByTestId('dungeon-pending-summary')).toBeHidden();
    await expect(page.getByTestId('dungeon-ready')).toBeEnabled();
    await route.activate(page.getByTestId('dungeon-ready'));
    current = await route.until(snapshot => own(snapshot).ready, 'Receiving the complete batch permits ordinary preparation');
    await expect(page.getByTestId('dungeon-start')).toBeEnabled();
    expect(current.raid, 'This gate stops at readiness; it does not claim another completed raid').toBe(savedRaid);
    expect(pending(current)).toEqual([]);
    expect(manifest(owned(current))).toEqual(manifest(collected));
    expectUnique(owned(current));
    expect(current.gold).toBe(0);
    expect(current.trades).toEqual([]);
    record('all-items-preserved-and-ready-unblocked', current);
    await page.getByTestId('dungeon-ready').scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath('return-batch-claimed-ready-unblocked.png')});
    expect(errors).toEqual([]);
  } finally {
    await info.attach('real-extractions-and-claim-conservation', {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'});
    await info.attach('browser-errors', {body: JSON.stringify(errors, null, 2), contentType: 'application/json'});
  }
});
