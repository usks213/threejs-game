import {test, expect, type Locator} from '@playwright/test';
import type {Item, QuestId, QuestProgress, Snapshot} from '../../src/dungeon/types';
import {observeActions, own} from './helpers/dungeon-raid-controls';
import {DungeonReturnRoute} from './helpers/dungeon-return-route';

// The journal is optional so saves made before quests remain readable.
const journal = (snapshot: Snapshot) => snapshot.quests ?? [];
const quest = (snapshot: Snapshot, id: QuestId) => journal(snapshot).find(value => value.id === id);
const owned = (snapshot: Snapshot) => [...snapshot.stash, ...(snapshot.pendingReturn ?? []), ...own(snapshot).bag];
// Banking may repack positions and marks extracted items found. Other item
// properties, including the original ID, quality and stack count, must survive.
const manifest = (items: readonly Item[]) => items.map(({id, kind, quality, count, rotated}) =>
  ({id, kind, quality, count, rotated})).sort((a, b) => a.id.localeCompare(b.id));
function expectUnique(items: readonly Item[]) {
  expect(new Set(items.map(item => item.id)).size, 'Each remaining owned item exists exactly once').toBe(items.length);
}

test('dungeon supplier quests require real extraction, selected ore delivery and explicit persistent rewards', async ({page, isMobile}, info) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed authoritative dungeon');
  test.setTimeout(5 * 60 * 1000);
  const route = new DungeonReturnRoute(page, isMobile);
  const errors: Array<{source: string; text: string}> = [];
  const evidence: Array<{stage: string; raid: number; tick: number; elapsed: number; status: string; hp: number;
    gold: number; quests: QuestProgress[]; stash: Item[]; pending: Item[]; bag: Item[]; receipts: string[]}> = [];
  const actions = observeActions(page);
  const record = (stage: string, snapshot: Snapshot) => evidence.push({stage, raid: snapshot.raid,
    tick: snapshot.tick, elapsed: snapshot.elapsed, status: own(snapshot).status, hp: own(snapshot).hp,
    gold: snapshot.gold, quests: journal(snapshot), stash: snapshot.stash,
    pending: snapshot.pendingReturn ?? [], bag: own(snapshot).bag, receipts: snapshot.trades});
  const card = (id: QuestId) => page.getByTestId(`dungeon-quest-${id}`);
  const accept = (id: QuestId) => page.getByTestId(`dungeon-quest-accept-${id}`);
  const claim = (id: QuestId) => page.getByTestId(`dungeon-quest-claim-${id}`);
  const status = (id: QuestId) => page.getByTestId(`dungeon-quest-status-${id}`);
  const progress = (id: QuestId) => page.getByTestId(`dungeon-quest-progress-${id}`);
  const delivery = page.getByTestId('dungeon-quest-deliver-ore-delivery');
  const screenshot = async (name: string, target: Locator, cardHeading = true) => {
    // Capture the actual scrollable lobby viewport. A whole-card screenshot
    // can clip tall ore cards inside the landscape Android scroll container.
    await (cardHeading ? target.locator('.dungeon-quest-heading').first() : target).scrollIntoViewIfNeeded();
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({path});
    await info.attach(name, {path, contentType: 'image/png'});
  };
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
    await page.getByTestId('dungeon-name').fill('補給所の依頼を果たす探索者');
    await route.activate(page.getByTestId('dungeon-create'));
    let current = await route.until(snapshot => snapshot.actors.length === 1, 'A fresh private solo room exists');
    const explorer = current.you;
    expect(current.raid).toBe(0);
    expect(current.gold).toBe(0);
    expect(current.stash).toEqual([]);
    expect(current.pendingReturn ?? []).toEqual([]);
    expect(own(current).bag).toEqual([]);
    expect(journal(current)).toEqual([]);
    const questEntry = page.getByTestId('dungeon-quest-open');
    await expect(questEntry).toBeVisible();
    await expect(questEntry).toHaveText('補給所の依頼を見る · 2件');
    await screenshot('initial-lobby-quest-entry', questEntry, false);
    await route.activate(questEntry);
    await expect(page.getByTestId('dungeon-quest-panel')).toBeVisible();
    await expect(status('first-return')).toHaveText('受注前');
    await expect(accept('first-return')).toBeEnabled();
    await expect(claim('first-return')).toBeDisabled();
    await expect(accept('ore-delivery')).toBeDisabled();
    await expect(claim('ore-delivery')).toBeDisabled();
    await expect(delivery).toBeDisabled();
    record('fresh-room-no-automatic-acceptance', current);

    await route.activate(accept('first-return'));
    current = await route.until(snapshot => !!quest(snapshot, 'first-return'), 'The first quest is explicitly accepted');
    expect(journal(current)).toEqual([{id: 'first-return', progress: 0, claimed: false}]);
    expect(current.gold).toBe(0);
    await expect(status('first-return')).toHaveText('進行中');
    await expect(progress('first-return')).toContainText(/0\s*\/\s*1/);
    await expect(accept('first-return')).toBeDisabled();
    await expect(claim('first-return')).toBeDisabled();
    await expect(accept('ore-delivery')).toBeDisabled();
    await screenshot('first-quest-accepted-not-completed', card('first-return'));
    record('first-quest-accepted', current);

    await route.activate(page.getByTestId('dungeon-ready'));
    await route.until(snapshot => own(snapshot).ready, 'The ordinary empty-bag free kit is prepared');
    await expect(claim('first-return')).toBeDisabled();
    await expect(accept('ore-delivery')).toBeDisabled();
    await route.activate(page.getByTestId('dungeon-start'));
    const started = await route.until(snapshot => snapshot.raid === 1 && snapshot.phase === 'raid', 'The one real raid begins');
    expect(own(started).status).toBe('alive');
    expect(own(started).bag.map(item => [item.kind, item.count]).sort()).toEqual([
      ['potion', 2], ['shield', 1], ['sword', 1],
    ]);
    expect(quest(started, 'first-return')).toEqual({id: 'first-return', progress: 0, claimed: false});
    await expect(page.getByTestId('dungeon-quest-panel')).toBeHidden();
    await expect(page.getByTestId('dungeon-quest-raid')).toBeVisible();
    await expect(page.getByTestId('dungeon-quest-raid')).toContainText('初めての生還 0/1');
    await screenshot('accepted-quest-objective-at-normal-spawn', page.getByTestId('dungeon-quest-raid'), false);
    record('accepted-objective-at-normal-spawn', await route.state());

    await route.walk(-12, 8);
    await route.activate(page.locator('[data-target=chest0]'));
    const opened = await route.until(snapshot => !!snapshot.containers.find(box => box.id === 'chest0')?.opened, 'The ordinary west chest opens');
    const loot = opened.containers.find(box => box.id === 'chest0')!.items;
    expect(loot).toHaveLength(3);
    expect(loot.map(item => item.kind).sort()).toEqual(['key', 'ore', 'relic']);
    const ore = loot.find(item => item.kind === 'ore')!;
    const relic = loot.find(item => item.kind === 'relic')!;
    expect(ore.count).toBe(2);
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
    expect(quest(carrying, 'first-return')?.progress).toBe(0);
    expect(carrying.gold).toBe(0);
    const hauled = own(carrying).bag;
    expectUnique(hauled);
    record('real-loot-before-extraction', carrying);
    await route.inventory(false);

    current = await route.extract();
    expect(current.raid).toBe(1);
    expect(current.elapsed).toBeGreaterThanOrEqual(49);
    expect(own(current).status).toBe('extracted');
    expect(own(current).hp).toBeGreaterThan(0);
    expect(current.pendingReturn ?? []).toEqual([]);
    expect(own(current).bag).toEqual([]);
    expect(manifest(current.stash)).toEqual(manifest(hauled));
    expect(current.stash.every(item => item.found)).toBe(true);
    expect(quest(current, 'first-return')).toEqual({id: 'first-return', progress: 1, claimed: false});
    expect(current.gold, 'Extraction completes the objective without paying an automatic reward').toBe(0);
    expect(current.trades).toEqual([]);
    record('alive-extraction-completed-unclaimed', current);

    await route.activate(page.getByRole('button', {name: '補給所へ戻る', exact: true}));
    current = await route.until(snapshot => own(snapshot).status === 'lobby', 'The survivor returns to the supplier');
    await expect(status('first-return')).toHaveText('達成・報酬未受取');
    await expect(progress('first-return')).toContainText(/1\s*\/\s*1/);
    await expect(claim('first-return')).toBeEnabled();
    await expect(accept('ore-delivery')).toBeDisabled();
    await screenshot('first-quest-complete-reward-unclaimed', card('first-return'));
    const banked = current.stash;
    await route.activate(claim('first-return'));
    current = await route.until(snapshot => !!quest(snapshot, 'first-return')?.claimed, 'The first reward is explicitly claimed');
    expect(current.gold).toBe(20);
    expect(current.stash).toEqual(banked);
    expect(current.trades).toHaveLength(1);
    await expect(status('first-return')).toHaveText('受取済み');
    await expect(accept('first-return')).toBeDisabled();
    await expect(claim('first-return')).toBeDisabled();
    await expect(accept('ore-delivery')).toBeEnabled();
    record('first-reward-explicitly-claimed-once', current);

    await route.activate(accept('ore-delivery'));
    current = await route.until(snapshot => !!quest(snapshot, 'ore-delivery'), 'The unlocked ore quest is explicitly accepted');
    expect(quest(current, 'ore-delivery')).toEqual({id: 'ore-delivery', progress: 0, claimed: false});
    expect(current.gold).toBe(20);
    expect(current.stash).toEqual(banked);
    await expect(status('ore-delivery')).toHaveText('進行中');
    await expect(progress('ore-delivery')).toContainText(/0\s*\/\s*2/);
    await expect(accept('ore-delivery')).toBeDisabled();
    await expect(claim('ore-delivery')).toBeDisabled();
    await expect(delivery, 'Eligible stored ore is never selected or consumed automatically').toBeDisabled();
    const chosen = current.stash.find(item => item.id === ore.id)!;
    expect(chosen).toMatchObject({id: ore.id, kind: 'ore', count: 2, found: true, quality: ore.quality});
    await expect(page.locator('[data-quest-item]')).toHaveCount(1);
    await expect(page.locator(`[data-quest-item="${relic.id}"]`)).toHaveCount(0);
    for (const item of own(started).bag) await expect(page.locator(`[data-quest-item="${item.id}"]`)).toHaveCount(0);
    const oreChoice = page.locator(`[data-quest-item="${chosen.id}"]`);
    await expect(oreChoice).toBeEnabled();
    await route.activate(oreChoice);
    await expect(oreChoice).toHaveAttribute('aria-pressed', 'true');
    await expect(delivery).toBeEnabled();
    await screenshot('ore-quest-in-progress-before-delivery', card('ore-delivery'));
    await screenshot('ore-quest-selected-real-found-stack', page.getByTestId('dungeon-quest-selection-ore-delivery'), false);
    record('ore-quest-accepted-selected-not-delivered', await route.state());

    await route.activate(delivery);
    current = await route.until(snapshot => quest(snapshot, 'ore-delivery')?.progress === 2, 'Exactly two real found ore are delivered');
    const expectedRemaining = banked.filter(item => item.id !== chosen.id);
    expect(current.stash).toEqual(expectedRemaining);
    expect(owned(current).some(item => item.id === chosen.id)).toBe(false);
    expect(current.stash.find(item => item.id === relic.id)).toEqual(banked.find(item => item.id === relic.id));
    expectUnique(owned(current));
    expect(current.gold, 'Delivery completes the objective but does not automatically pay').toBe(20);
    expect(current.trades).toHaveLength(1);
    expect(quest(current, 'ore-delivery')).toEqual({id: 'ore-delivery', progress: 2, claimed: false});
    await expect(status('ore-delivery')).toHaveText('達成・報酬未受取');
    await expect(progress('ore-delivery')).toContainText(/2\s*\/\s*2/);
    await expect(delivery).toBeDisabled();
    await expect(claim('ore-delivery')).toBeEnabled();
    await expect(page.locator(`[data-quest-item="${chosen.id}"]`)).toHaveCount(0);
    await screenshot('ore-delivered-reward-unclaimed', card('ore-delivery'));
    record('two-ore-consumed-reward-unclaimed', current);

    await route.activate(claim('ore-delivery'));
    current = await route.until(snapshot => !!quest(snapshot, 'ore-delivery')?.claimed, 'The second reward is explicitly claimed');
    const completed = [{id: 'first-return', progress: 1, claimed: true}, {id: 'ore-delivery', progress: 2, claimed: true}];
    expect(journal(current)).toEqual(completed);
    expect(current.gold).toBe(50);
    expect(current.trades).toHaveLength(2);
    expect(current.stash).toEqual(expectedRemaining);
    expect(manifest(owned(current))).toEqual(manifest(hauled.filter(item => item.id !== ore.id)));
    expectUnique(owned(current));
    await expect(status('ore-delivery')).toHaveText('受取済み');
    await expect(claim('ore-delivery')).toBeDisabled();
    await expect(accept('ore-delivery')).toBeDisabled();
    await expect(delivery).toBeDisabled();
    record('both-finite-rewards-claimed-gold-50', current);
    const receipts = current.trades;

    // Use the ordinary persisted identity and join flow; never insert local
    // storage, manufacture socket actions, alter the clock or teleport.
    await page.reload();
    await route.activate(page.getByTestId('dungeon-join'));
    current = await route.until(snapshot => snapshot.you === explorer && snapshot.raid === 1, 'The same explorer reconnects after reload');
    expect(own(current).status).toBe('lobby');
    expect(journal(current)).toEqual(completed);
    expect(current.gold).toBe(50);
    expect(current.trades).toEqual(receipts);
    expect(current.stash).toEqual(expectedRemaining);
    expect(current.pendingReturn ?? []).toEqual([]);
    expect(own(current).bag).toEqual([]);
    expectUnique(owned(current));
    expect(manifest(owned(current))).toEqual(manifest(hauled.filter(item => item.id !== ore.id)));
    for (const id of ['first-return', 'ore-delivery'] as const) {
      await expect(status(id)).toHaveText('受取済み');
      await expect(accept(id)).toBeDisabled();
      await expect(claim(id)).toBeDisabled();
      await screenshot(`${id}-claimed-after-reload`, card(id));
    }
    await expect(delivery).toBeDisabled();
    record('reload-preserves-rewards-journal-and-all-remaining-items', current);
    expect(actions.map(value => value.action).filter(action => ['accept-quest', 'deliver-quest', 'claim-quest'].includes(action.kind))).toEqual([
      {kind: 'accept-quest', quest: 'first-return'},
      {kind: 'claim-quest', quest: 'first-return'},
      {kind: 'accept-quest', quest: 'ore-delivery'},
      {kind: 'deliver-quest', quest: 'ore-delivery', item: chosen.id},
      {kind: 'claim-quest', quest: 'ore-delivery'},
    ]);
    expect(errors).toEqual([]);
  } finally {
    await info.attach('real-quest-rewards-and-item-conservation', {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'});
    await info.attach('browser-errors', {body: JSON.stringify(errors, null, 2), contentType: 'application/json'});
  }
});
