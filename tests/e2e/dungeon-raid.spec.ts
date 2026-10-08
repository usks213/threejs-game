import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import type {Snapshot} from '../../src/dungeon/types';
import {CENTRAL_APPROACH} from './helpers/dungeon-central-approach';
import {raidCorpseApproaches, raidSafeRoute} from './helpers/dungeon-safe-route';
import {RaidControls, angle, heading, observeActions, own, range, read} from './helpers/dungeon-raid-controls';

// Preserve the complete live combat sequence for visual review, including failure paths.
test.use({video: 'on'});

/** Deployed, unmodified raid: no synthetic sockets, state setters, warps or clock changes. */
test('dungeon G2 two-browser ordinary-input PvPvE raid, contested loot, death and durable extraction', async ({page, browser, isMobile}, testInfo) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed same-origin dungeon server');
  test.skip(isMobile, 'Full G2 route targets Desktop Chrome; the separate smoke covers real touch input');
  test.setTimeout(480000);
  const errors: string[] = [];
  const phases: Array<Record<string, unknown>> = [];
  const actionsA = observeActions(page);
  let actionsB: ReturnType<typeof observeActions> = [];
  page.on('pageerror', error => errors.push(`A: ${error}`));
  page.on('console', message => {if(message.type() === 'error' && /WebGL|shader/i.test(message.text())) errors.push(`A: ${message.text()}`);});
  let rivalContext: BrowserContext | undefined;
  let rival: Page | undefined;
  let a: RaidControls | undefined;
  let b: RaidControls | undefined;
  const phase = async (label: string, screenshot = false, view = page) => {
    const snapshots = await Promise.all([read(page), rival ? read(rival) : null]);
    const compact = (snapshot: Snapshot | null) => snapshot && ({
      you: snapshot.you, raid: snapshot.raid, phase: snapshot.phase, elapsed: snapshot.elapsed,
      tick: snapshot.tick, result: snapshot.result, lastAction: snapshot.lastAction,
      actor: own(snapshot), enemies: snapshot.enemies.map(enemy => ({id: enemy.id, hp: enemy.hp, status: enemy.status, position: enemy.position})),
      stash: snapshot.stash, exits: snapshot.exits, events: snapshot.events,
    });
    phases.push({label, wallTime: new Date().toISOString(), A: compact(snapshots[0]), B: compact(snapshots[1]), recentActions: {A: actionsA.slice(-12), B: actionsB.slice(-12)}});
    if (phases.length > 40) phases.shift();
    console.log(`[dungeon G2] ${label}: elapsed=${snapshots[0]?.elapsed.toFixed(2)}, A=${snapshots[0] && own(snapshots[0]).hp}, B=${snapshots[1] && own(snapshots[1]).hp}`);
    if (screenshot) await view.screenshot({path: testInfo.outputPath(`${String(phases.length).padStart(2, '0')}-${label}.png`)});
  };

  try {
    expect(process.env.EXPECTED_COMMIT, 'Pin acceptance to the deployed commit').toBeTruthy();
    const deployment = await (await page.request.get('/deployment.json')).json();
    expect(deployment.commit).toBe(process.env.EXPECTED_COMMIT);
    const health = await (await page.request.get('/dungeon-room/health')).json();
    expect(health).toMatchObject({enabled: true, authority: 'server', protocol: 1, stashScope: 'room-player'});

    await page.goto('/?mode=dungeon&test=1');
    await expect(page.locator('.dungeon-canvas')).toHaveAttribute('data-ready', 'true');
    await page.getByTestId('dungeon-name').fill('帰還する探索者');
    await page.getByTestId('dungeon-create').click();
    await expect.poll(async () => (await read(page))?.actors.length).toBe(1);
    const invite = new URL(await page.getByTestId('dungeon-invite').inputValue());
    expect(invite.href).not.toContain('identity');
    invite.searchParams.set('test', '1');
    rivalContext = await browser.newContext({viewport: {width: 960, height: 540}, deviceScaleFactor: 1});
    rival = await rivalContext.newPage();
    rival.on('pageerror', error => errors.push(`B: ${error}`));
    rival.on('console', message => {if(message.type() === 'error' && /WebGL|shader/i.test(message.text())) errors.push(`B: ${message.text()}`);});
    actionsB = observeActions(rival);
    await rival.goto(invite.href);
    await expect(rival.locator('.dungeon-canvas')).toHaveAttribute('data-ready', 'true');
    expect(await read(rival), 'Opening the invitation must not silently join').toBeNull();
    await rival.getByTestId('dungeon-name').fill('対抗する探索者');
    await rival.getByTestId('dungeon-join').click();
    a = new RaidControls(page, 'A');
    b = new RaidControls(rival, 'B');
    await Promise.all([a.until(snapshot => snapshot.actors.length === 2, 'both explorers joined'), b.until(snapshot => snapshot.actors.length === 2, 'both explorers joined')]);
    expect(own(await a.state()).id).not.toBe(own(await b.state()).id);
    for (const controls of [a, b]) {
      await controls.page.getByTestId('dungeon-class-keeper').click();
      await controls.until(snapshot => own(snapshot).classId === 'keeper', 'keeper selected');
      await controls.page.getByTestId('dungeon-ready').click();
      await controls.until(snapshot => own(snapshot).ready, 'ready acknowledged');
    }
    await page.getByTestId('dungeon-start').click();
    await Promise.all([a.until(snapshot => snapshot.phase === 'raid', 'raid started'), b.until(snapshot => snapshot.phase === 'raid', 'raid started')]);
    const initialA = await a.state(), initialB = await b.state();
    const idA = initialA.you, idB = initialB.you;
    expect(own(initialA)).toMatchObject({classId: 'keeper', hp: 110, status: 'alive', position: {x: -11, y: 0, z: 11}});
    expect(own(initialB)).toMatchObject({classId: 'keeper', hp: 110, status: 'alive', position: {x: 11, y: 0, z: -11}});
    expect(initialA.enemies.map(enemy => enemy.id).sort()).toEqual(['e0', 'e1', 'e2', 'e3']);
    expect(initialA.enemies.every(enemy => enemy.status === 'alive' && enemy.hp === 70)).toBe(true);
    expect(initialA.stash).toEqual([]);
    expect(initialB.stash).toEqual([]);
    await phase('original-spawns', true);

    await a.walk({x: -12, z: 7});
    await a.open('chest0');
    const key = (await a.state()).containers.find(container => container.id === 'chest0')!.items.find(item => item.kind === 'key');
    expect(key, 'A must find the ordinary starting chest key').toBeTruthy();
    await a.loot('chest0', key!.id);
    await a.walk({x: -4, z: 11});
    await a.walk({x: 0, z: 7.5});
    await phase('south-guard-cleared');
    await b.walk({x: 0, z: -11});
    await b.walk({x: 0, z: -7});
    await phase('north-guard-cleared');
    // Both players prepare behind closed doors, then each engages the nearer
    // central guard. This ordinary two-sided approach avoids leaving B idle
    // while A repeatedly turns/retreats against two simultaneous attackers.
    await Promise.all([a.recover(10), b.recover(10)]);
    for (const controls of [a, b]) expect(own(await controls.state()).hp).toBeGreaterThanOrEqual(100);
    await Promise.all([a, b].map((controls, index) => controls.walk(CENTRAL_APPROACH[index].point, .12)));
    const staged = await a.state();
    const stagedActors = [idA, idB].map(id => staged.actors.find(actor => actor.id === id)!);
    for (const [index, approach] of CENTRAL_APPROACH.entries()) {
      const guard = staged.enemies.find(enemy => enemy.id === approach.enemy)!;
      expect(guard).toMatchObject({hp: 70, status: 'alive'});
      expect(staged.doors.find(door => door.id === approach.door)!.open).toBe(false);
      expect(range(stagedActors[1 - index], guard.position) - range(stagedActors[index], guard.position)).toBeGreaterThan(.35);
      await [a, b][index].face(guard.position);
    }
    await expect(page.locator('.dungeon-hud')).toBeVisible();
    await expect(page.locator('.dungeon-inventory-overlay')).toBeHidden();
    await phase('central-two-sided-approach-ready', true);
    // No screenshot or sequential route between opening and fighting.
    await Promise.all([a.open('door-south'), b.open('door-north')]);
    await Promise.all([a.fight('e0'), b.fight('e1')]);
    const cleared = await a.state();
    expect(cleared.enemies.every(enemy => enemy.status === 'dead')).toBe(true);
    expect(own(cleared).kills).toBe(2);
    expect(own(await b.state()).kills).toBe(2);
    expect(own(cleared).damageTaken).toBeGreaterThan(0);
    expect(own(await b.state()).damageTaken).toBeGreaterThan(0);
    expect(actionsA.some(packet => packet.action.kind === 'attack')).toBe(true);
    expect(actionsB.some(packet => packet.action.kind === 'attack')).toBe(true);
    await phase('all-four-ai-defeated', true);

    // Combat can pull the guard through the doorway into a side aisle. Route
    // around the real walls/pillars rather than steering straight through them.
    const navigate = async (controls: RaidControls, target: {x: number; z: number}) => {
      for (const waypoint of raidSafeRoute(await controls.state(), target)) await controls.walk(waypoint, .12);
    };
    await navigate(a, {x: 0, z: 2});
    await navigate(b, {x: 0, z: -2});

    expect(cleared.containers.find(container => container.id === 'chest4')!.locked).toBe(true);
    await a.open('chest4');
    const unlocked = await a.state();
    expect(unlocked.containers.find(container => container.id === 'chest4')!.locked).toBe(false);
    expect(own(unlocked).bag.some(item => item.id === key!.id)).toBe(false);
    const centralRelic = unlocked.containers.find(container => container.id === 'chest4')!.items.find(item => item.kind === 'relic')!;

    // Both normal visible loot controls must actually send an action. Prepare
    // the physical press on each page before releasing them concurrently, so
    // locator auto-waiting cannot turn a lost race into a retry of a removed item.
    const contest = async (target: string, item: string) => {
      await Promise.all([a!.inventory(true), b!.inventory(true)]);
      const before = await Promise.all([a!.state(), b!.state()]);
      const counts = [actionsA, actionsB].map(actions => actions.filter(packet => packet.action.kind === 'loot' && packet.action.target === target && packet.action.item === item).length);
      await Promise.all([a!, b!].map(async controls => {
        const button = controls.page.locator(`[data-loot-target="${target}"][data-loot-item="${item}"]`);
        await expect(button).toBeVisible();
        await button.scrollIntoViewIfNeeded();
        const bounds = await button.boundingBox();
        if (!bounds) throw new Error(`Loot control is missing for ${target}/${item}`);
        await controls.page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        await controls.page.mouse.down();
      }));
      await Promise.all([b!.page.mouse.up(), a!.page.mouse.up()]);
      await expect.poll(() => [actionsA, actionsB].map(actions => actions.filter(packet => packet.action.kind === 'loot' && packet.action.target === target && packet.action.item === item).length), {
        message: `Both ordinary UI releases must send ${target}/${item}; a missing packet is a driver race, not a rejected server claim`,
        timeout: 4000, intervals: [50, 100],
      }).toEqual(counts.map(count => count + 1));
      await Promise.all([a!, b!].map((controls, index) => controls.until(snapshot => snapshot.lastAction > before[index].lastAction, `contested ${target} action acknowledged`)));
      await a!.until(snapshot => !snapshot.containers.find(container => container.id === target)!.items.some(value => value.id === item), `${item} removed from shared loot`);
      const after = await Promise.all([a!.state(), b!.state()]);
      const owners = after.map(snapshot => own(snapshot).bag.filter(value => value.id === item).length);
      expect(owners.reduce((total, count) => total + count, 0), 'A contested item has exactly one owner').toBe(1);
      expect(owners.every(count => count === 0 || count === 1)).toBe(true);
      await Promise.all([a!.inventory(false), b!.inventory(false)]);
      return owners;
    };
    await contest('chest4', centralRelic.id);
    await phase('locked-chest-contested', true);

    const guardCorpse = (await a.state()).containers.find(container => container.id === 'corpse-e0-1')!;
    expect(guardCorpse).toBeTruthy();
    const approaches = raidCorpseApproaches(await a.state(), guardCorpse.position);
    await navigate(a, approaches.loot[0]);
    await navigate(b, approaches.loot[1]);
    await expect(page.locator(`[data-target="${guardCorpse.id}"]`)).toBeVisible();
    await a.open(guardCorpse.id);
    const guardRelic = (await a.state()).containers.find(container => container.id === guardCorpse.id)!.items.find(item => item.kind === 'relic')!;
    await contest(guardCorpse.id, guardRelic.id);
    await phase('guard-corpse-contested', true);

    // Healing is ordinary keeper/medicine input. Browser scheduling is not a
    // fixed 50 ms simulation: top up A before the intentional unguarded duel.
    for (let attempt = 0; attempt < 4 && own(await a.state()).hp < 100; attempt++) {
      const before = await a.state();
      await a.until(snapshot => own(snapshot).phase === 'idle', 'duel preparation is idle');
      const actor = own(before);
      const medicine = actor.bag.some(item => item.kind === 'potion' || item.kind === 'bandage');
      expect(medicine || actor.spells > 0).toBe(true);
      await a.press(medicine ? 'KeyQ' : 'KeyG');
      await a.until(snapshot => own(snapshot).phase === 'idle', 'duel preparation recovery finished');
      expect(own(await a.state()).hp).toBeGreaterThan(actor.hp);
    }
    expect(own(await a.state()).hp).toBeGreaterThanOrEqual(100);
    await navigate(a, approaches.duel[0]);
    await navigate(b, approaches.duel[1]);
    await Promise.all([a.face(own(await b.state()).position), b.face(own(await a.state()).position)]);
    await Promise.all([a.stop(), b.stop()]);
    const duelStart = await Promise.all([a.state(), b.state()]);
    const damageBefore = duelStart.map(snapshot => own(snapshot).damageTaken);
    const duelBags = duelStart.map(snapshot => own(snapshot).bag.map(item => ({...item})));
    const duelDeadline = Date.now() + 25000;
    await phase('duel-start');
    while (Date.now() < duelDeadline) {
      const snapshots = await Promise.all([a.state(), b.state()]);
      const actors = snapshots.map(own);
      if (actors.some(actor => actor.status !== 'alive')) break;
      await Promise.all([a, b].map(async (controls, index) => {
        const actor = actors[index], target = actors[1 - index];
        const error = angle(heading(actor, target.position) - actor.yaw);
        const d = range(actor, target.position);
        await controls.keys([...(Math.abs(error) > .12 ? [error > 0 ? 'Home' : 'End'] : []), ...(d > 1.45 && Math.abs(error) < .3 ? ['KeyW'] : [])]);
        if (actor.phase === 'idle' && d < 1.65 && Math.abs(error) < .2) await controls.press(index === 0 ? 'KeyR' : 'KeyT', true);
      }));
      await a.next(snapshots[0]);
    }
    await Promise.all([a.stop(), b.stop()]);
    const afterDuel = await Promise.all([a.state(), b.state()]);
    expect(afterDuel.map(snapshot => own(snapshot).status).sort()).toEqual(['alive', 'dead']);
    const survivorIndex = own(afterDuel[0]).status === 'alive' ? 0 : 1;
    const victimIndex = 1 - survivorIndex;
    const survivor = [a, b][survivorIndex], victim = [a, b][victimIndex];
    const victimSnapshot = afterDuel[victimIndex];
    const victimBag = duelBags[victimIndex];
    expect(afterDuel[survivorIndex].phase).toBe('raid');
    expect(own(afterDuel[survivorIndex]).kills).toBe(own(duelStart[survivorIndex]).kills + 1);
    expect(own(victimSnapshot).kills).toBe(own(duelStart[victimIndex]).kills);
    for (const [index, snapshot] of afterDuel.entries()) expect(own(snapshot).damageTaken).toBeGreaterThan(damageBefore[index]);
    expect(own(victimSnapshot).bag).toEqual([]);
    expect(victimSnapshot.stash).toEqual([]);
    expect(victimSnapshot.result).toContain('死亡');
    await expect(victim.page.getByTestId('dungeon-result')).toContainText('死亡');
    const corpseId = `corpse-${victimSnapshot.you}-${victimSnapshot.raid}`;
    expect(afterDuel[survivorIndex].containers.find(container => container.id === corpseId)?.kind).toBe('corpse');
    await phase('pvp-death-bag-lost', true, survivor.page);
    await victim.page.screenshot({path: testInfo.outputPath('victim-death-result.png')});

    await survivor.open(corpseId);
    const dropped = (await survivor.state()).containers.find(container => container.id === corpseId)!.items;
    expect(dropped.map(item => item.id).sort()).toEqual(victimBag.map(item => item.id).sort());
    const contestedIds = [centralRelic.id, guardRelic.id];
    for (const item of dropped.filter(value => contestedIds.includes(value.id))) await survivor.loot(corpseId, item.id);
    // Even if the survivor won both contests, claim a real item from the death drop.
    if (!dropped.some(item => contestedIds.includes(item.id))) await survivor.loot(corpseId, dropped.find(item => item.kind === 'sword')!.id);
    for (const id of contestedIds) expect(own(await survivor.state()).bag.filter(item => item.id === id)).toHaveLength(1);
    await phase('victim-loot-recovered');

    await navigate(survivor, {x: -12, z: 12});
    await survivor.until(snapshot => snapshot.elapsed >= 45, 'west exit opens on server time', 60000);
    const beforeExtract = await survivor.state();
    const carried = own(beforeExtract).bag.map(item => ({id: item.id, kind: item.kind, count: item.count, quality: item.quality}));
    expect(beforeExtract.stash).toEqual([]);
    expect(beforeExtract.exits.find(exit => exit.id === 'exit-west')!.remaining).toBe(2);
    await survivor.page.locator('[data-target="exit-west"]').click();
    const channeling = await survivor.until(snapshot => own(snapshot).interaction === 'exit-west' && own(snapshot).extract >= .5 && own(snapshot).extract < 3, 'ordinary four-second extraction is visibly in progress');
    const extractionStart = channeling.elapsed - own(channeling).extract;
    expect(own(channeling).status).toBe('alive');
    expect(channeling.stash).toEqual([]);
    await expect(survivor.page.getByTestId('dungeon-extraction-progress')).toBeVisible();
    await phase('extraction-channeling', true, survivor.page);
    const extracted = await survivor.until(snapshot => own(snapshot).status === 'extracted', 'extraction completed', 15000);
    expect(extracted.elapsed - extractionStart).toBeGreaterThanOrEqual(3.95);
    expect(extracted.phase).toBe('finished');
    expect(extracted.elapsed).toBeLessThan(240);
    expect(own(extracted).bag).toEqual([]);
    const stored = (snapshot: Snapshot) => snapshot.stash.map(({id, kind, count, quality}) => ({id, kind, count, quality}));
    expect(stored(extracted)).toEqual(carried);
    expect(new Set(extracted.stash.map(item => item.id)).size).toBe(carried.length);
    expect(extracted.stash.every(item => item.found)).toBe(true);
    expect(extracted.exits.find(exit => exit.id === 'exit-west')!.remaining).toBe(1);
    await expect(survivor.page.getByTestId('dungeon-result')).toContainText('帰還成功');
    await phase('extracted-exactly-once', true, survivor.page);

    const beforeReconnectActions = [actionsA.map(packet => ({...packet})), actionsB.map(packet => ({...packet}))];
    const lastActions = [(await a.state()).lastAction, (await b.state()).lastAction];
    // A fresh document requires an explicit join and reads persisted server
    // state using the normal room-scoped identity in each independent context.
    for (const [controls, id, expectedStatus] of [[a, idA, survivorIndex === 0 ? 'extracted' : 'dead'], [b, idB, survivorIndex === 1 ? 'extracted' : 'dead']] as const) {
      await controls.page.reload();
      await expect(controls.page.getByTestId('dungeon-join')).toBeVisible();
      expect(await read(controls.page)).toBeNull();
      await controls.page.getByTestId('dungeon-join').click();
      const rejoined = await controls.until(snapshot => snapshot.you === id && own(snapshot).status === expectedStatus, 'identity and outcome survive reload');
      expect(rejoined.lastAction).toBe(lastActions[controls === a ? 0 : 1]);
      expect(rejoined.actors).toHaveLength(2);
      expect(rejoined.phase).toBe('finished');
      expect(own(rejoined).bag).toEqual([]);
      expect(stored(rejoined)).toEqual(expectedStatus === 'extracted' ? carried : []);
      expect(rejoined.result).toContain(expectedStatus === 'extracted' ? '帰還成功' : '死亡');
      expect(rejoined.exits.find(exit => exit.id === 'exit-west')!.remaining).toBe(1);
      // Observe a fresh actual socket response, rather than accepting a stale
      // probe value that was present before the reconnect button was pressed.
      const freshResponse = controls.page.waitForEvent('websocket').then(socket => socket.waitForEvent('framereceived', {predicate: ({payload}) => {
        try { return JSON.parse(String(payload)).type === 'snapshot'; } catch { return false; }
      }}));
      await controls.page.getByTestId('dungeon-reconnect').click();
      await freshResponse;
      await expect(controls.page.getByTestId('dungeon-connection')).toHaveAttribute('data-state', 'connected');
      const reconnected = await controls.state();
      expect(reconnected.you).toBe(id);
      expect(reconnected.lastAction).toBe(lastActions[controls === a ? 0 : 1]);
      expect(reconnected.phase).toBe('finished');
      expect(own(reconnected).status).toBe(expectedStatus);
      expect(own(reconnected).bag).toEqual([]);
      expect(stored(reconnected)).toEqual(expectedStatus === 'extracted' ? carried : []);
      expect(reconnected.exits.find(exit => exit.id === 'exit-west')!.remaining).toBe(1);
    }
    expect([actionsA, actionsB], 'Reload/join/reconnect must not replay gameplay action packets').toEqual(beforeReconnectActions);
    await phase('both-reconnected-persistent-results', true, survivor.page);
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([a?.stop().catch(() => {}), b?.stop().catch(() => {}), page.mouse.up().catch(() => {}), rival?.mouse.up().catch(() => {})]);
    if (testInfo.status !== testInfo.expectedStatus) {
      await phase('failure').catch(() => {});
      await Promise.all([page.screenshot({path: testInfo.outputPath('failure-A.png')}).catch(() => {}), rival?.screenshot({path: testInfo.outputPath('failure-B.png')}).catch(() => {})]);
    }
    await testInfo.attach('dungeon-raid-phase-log', {body: JSON.stringify({phases, errors, actions: {A: actionsA, B: actionsB}}, null, 2), contentType: 'application/json'});
    await rivalContext?.close();
  }
});
