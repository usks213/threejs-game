import {test, expect, type CDPSession, type Locator, type Page} from '@playwright/test';
import type {BastionTraining, Snapshot} from '../../src/dungeon/types';
import {observeActions, own, read} from './helpers/dungeon-raid-controls';
import {TouchContacts} from './helpers/touch-contacts';

type Sample = {
  stage: string; raid: number; tick: number; elapsed: number; lastAction: number;
  x: number; z: number; yaw: number; hp: number; maxHp: number; status: string;
  phase: string; training: BastionTraining; activeUntil: number; readyAt: number;
};
const selection = (snapshot: Snapshot): BastionTraining => own(snapshot).training ?? {skill: null, perk: null};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Server distance / server elapsed avoids conflating render/CDP latency with speed.
 * Only consecutive moving snapshots in the same ordinary-input segment count. */
function measuredSpeeds(samples: Sample[], stage: string, boosted: boolean) {
  return samples.flatMap((after, index) => {
    const before = samples[index - 1];
    if (!before || before.stage !== stage || after.stage !== stage || before.raid !== after.raid) return [];
    const dt = after.elapsed - before.elapsed, dz = after.z - before.z;
    if (dt <= 0 || dt > .5 || Math.abs(after.x - before.x) > .01 || Math.abs(dz) < .01) return [];
    if (before.phase !== 'idle' || after.phase !== 'idle') return [];
    if (boosted ? before.activeUntil <= after.elapsed || dz <= 0 : before.activeUntil > before.elapsed || dz >= 0) return [];
    return [Math.abs(dz) / dt];
  });
}

async function activate(control: Locator, mobile: boolean) {
  await control.scrollIntoViewIfNeeded();
  if (mobile) await control.tap();
  else await control.click();
}
async function until(page: Page, predicate: (snapshot: Snapshot) => boolean, message: string, timeout = 15000) {
  let result: Snapshot | undefined;
  await expect.poll(async () => {
    const snapshot = await read(page);
    if (!snapshot) return false;
    result = snapshot;
    return predicate(snapshot);
  }, {message, timeout, intervals: [50, 100, 200]}).toBe(true);
  return result!;
}
async function center(control: Locator) {
  const bounds = await control.boundingBox();
  if (!bounds) throw new Error('The real input control has no visible bounds');
  return {x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2};
}
async function touchTap(session: CDPSession, point: {x: number; y: number}) {
  await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 7, ...point}]});
  await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
}

test('dungeon optional bastion training persists, locks and gives a real reusable movement skill', async ({page, isMobile}, info) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed authoritative dungeon');
  test.setTimeout(180000);
  const samples: Sample[] = [];
  const checkpoints: Array<{stage: string; snapshot: Snapshot}> = [];
  const interfaceEvidence: Array<{stage: string; details: unknown}> = [];
  const errors: Array<{source: string; text: string}> = [];
  const actions = observeActions(page);
  let stage = 'joining';
  let touch: CDPSession | null = null;
  const snapshotSample = (snapshot: Snapshot): Sample => {
    const actor = own(snapshot);
    return {stage, raid: snapshot.raid, tick: snapshot.tick, elapsed: snapshot.elapsed,
      lastAction: snapshot.lastAction, x: actor.position.x, z: actor.position.z, yaw: actor.yaw,
      hp: actor.hp, maxHp: actor.maxHp, status: actor.status, phase: actor.phase,
      training: selection(snapshot), activeUntil: actor.skillState?.activeUntil ?? 0,
      readyAt: actor.skillState?.readyAt ?? 0};
  };
  page.on('websocket', socket => socket.on('framereceived', ({payload}) => {
    try {
      const packet = JSON.parse(String(payload)) as {type: string; snapshot: Snapshot};
      if (packet.type === 'snapshot') samples.push(snapshotSample(packet.snapshot));
    } catch { /* Passive observation must never affect the connection. */ }
  }));
  page.on('pageerror', error => errors.push({source: 'pageerror', text: String(error)}));
  page.on('console', message => {
    if (message.type() === 'error') errors.push({source: 'console', text: message.text()});
  });
  const screenshot = async (name: string, target?: Locator) => {
    if (target) await target.scrollIntoViewIfNeeded();
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({path});
    await info.attach(name, {path, contentType: 'image/png'});
  };
  const record = (name: string, snapshot: Snapshot) => checkpoints.push({stage: name, snapshot});
  const choose = async (kind: 'skill' | 'perk', value: string, expected: BastionTraining) => {
    const control = page.getByTestId(`dungeon-training-${kind}-${value}`);
    const keyboardSelection = !isMobile && kind === 'skill' && value === 'brace';
    let beforeScroll: number | null = null;
    if (keyboardSelection) {
      await control.scrollIntoViewIfNeeded();
      await control.focus();
      beforeScroll = await page.locator('.dungeon-lobby').evaluate(node => node.scrollTop);
      await page.keyboard.press('Enter');
      // Repeat physical activation while the ACK may still be in flight. The
      // same selected option remains a no-op even if the ACK arrives quickly.
      await page.keyboard.press('Enter');
      await expect(control).toBeFocused();
    } else await activate(control, isMobile);
    const current = await until(page, snapshot => JSON.stringify(selection(snapshot)) === JSON.stringify(expected),
      `${kind} ${value} is confirmed by the server`);
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    if (keyboardSelection) {
      await expect(control, 'The selected keyboard control retains focus after its server ACK').toBeFocused();
      const afterScroll = await page.locator('.dungeon-lobby').evaluate(node => node.scrollTop);
      expect(Math.abs(afterScroll - beforeScroll!), 'Selection ACK must not jump the lobby scroll').toBeLessThanOrEqual(1);
      const requests = actions.filter(entry => entry.action.kind === 'configure-training' && entry.action.skill === 'brace');
      expect(requests, 'Repeated Enter must not send duplicate training requests').toHaveLength(1);
      interfaceEvidence.push({stage: 'keyboard-selection-ack-focus-and-scroll', details: {beforeScroll, afterScroll, requests}});
    }
    await expect(page.getByTestId('dungeon-training-skill-rush')).toBeEnabled();
    return current;
  };

  try {
    expect(process.env.EXPECTED_COMMIT).toBeTruthy();
    const deployment = await page.request.get('/deployment.json');
    expect(deployment.ok()).toBe(true);
    expect((await deployment.json()).commit).toBe(process.env.EXPECTED_COMMIT);
    const health = await page.request.get('/dungeon-room/health');
    expect(health.ok()).toBe(true);
    expect(await health.json()).toMatchObject({enabled: true, authority: 'server', protocol: 1});
    await page.goto('/?mode=dungeon&test=1');
    await page.getByTestId('dungeon-name').fill('城塞兵の任意訓練を試す探索者');
    await activate(page.getByTestId('dungeon-create'), isMobile);
    const fresh = await until(page, snapshot => snapshot.actors.length === 1, 'A fresh private room is created');
    expect(selection(fresh)).toEqual({skill: null, perk: null});
    expect(own(fresh)).toMatchObject({classId: 'bastion', maxHp: 125, hp: 125, bag: []});
    expect(fresh.stash).toEqual([]);
    expect(fresh.gold).toBe(0);
    await expect(page.getByTestId('dungeon-training-skill-none')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dungeon-training-perk-none')).toHaveAttribute('aria-pressed', 'true');
    record('default-training-is-empty', fresh);

    // Exercise both optional sets and removing a choice, without editing storage.
    await choose('skill', 'brace', {skill: 'brace', perk: null});
    const vigor = await choose('perk', 'vigor', {skill: 'brace', perk: 'vigor'});
    expect(own(vigor)).toMatchObject({maxHp: 135, hp: 135});
    await expect(page.getByTestId('dungeon-training-stats')).toContainText('135');
    await screenshot('optional-brace-and-vigor-description', page.getByTestId('dungeon-training-selection'));
    await choose('skill', 'none', {skill: null, perk: 'vigor'});
    const cleared = await choose('perk', 'none', {skill: null, perk: null});
    expect(own(cleared)).toMatchObject({maxHp: 125, hp: 125});
    await choose('skill', 'rush', {skill: 'rush', perk: null});
    const selected = await choose('perk', 'stride', {skill: 'rush', perk: 'stride'});
    expect(own(selected).maxHp).toBe(125);
    await expect(page.getByTestId('dungeon-training-selection')).toContainText('疾駆');
    await expect(page.getByTestId('dungeon-training-selection')).toContainText('軽足');
    await expect(page.getByTestId('dungeon-training-stats')).toContainText('3.15');
    record('explicit-rush-and-stride', selected);
    await screenshot('rush-and-stride-server-confirmed', page.getByTestId('dungeon-training-selection'));

    await page.reload();
    await activate(page.getByTestId('dungeon-join'), isMobile);
    const rejoined = await until(page, snapshot => snapshot.you === fresh.you && selection(snapshot).skill === 'rush',
      'Ordinary reload and join restore the same training');
    expect(selection(rejoined)).toEqual({skill: 'rush', perk: 'stride'});
    await expect(page.getByTestId('dungeon-training-skill-rush')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dungeon-training-perk-stride')).toHaveAttribute('aria-pressed', 'true');
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    const ready = await until(page, snapshot => own(snapshot).ready, 'The selected explorer is ready');
    for (const option of ['skill-none', 'skill-rush', 'skill-brace', 'perk-none', 'perk-vigor', 'perk-stride']) {
      await expect(page.getByTestId(`dungeon-training-${option}`)).toBeDisabled();
    }
    await expect(page.getByTestId('dungeon-training-reason')).toContainText('準備');
    record('ready-lock-preserves-selection', ready);
    await screenshot('ready-lock-with-visible-reason', page.getByTestId('dungeon-training-reason'));
    // Preparation may be canceled normally; choosing the same option is harmless.
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => !own(snapshot).ready, 'Readiness can be canceled');
    await expect(page.getByTestId('dungeon-training-skill-rush')).toBeEnabled();
    await choose('skill', 'rush', {skill: 'rush', perk: 'stride'});
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => own(snapshot).ready, 'The explorer is ready again');
    await activate(page.getByTestId('dungeon-start'), isMobile);
    const started = await until(page, snapshot => snapshot.phase === 'raid', 'The ordinary raid starts');
    expect(selection(started)).toEqual({skill: 'rush', perk: 'stride'});
    expect(own(started)).toMatchObject({position: {x: -11, y: 0, z: 11}, maxHp: 125, hp: 125, status: 'alive'});
    expect(own(started).skillState).toBeUndefined();
    await expect(page.getByTestId('dungeon-training-panel')).toBeHidden();
    const skillButton = page.getByTestId('dungeon-action-skill');
    const skillHud = page.getByTestId('dungeon-skill-state');
    await expect(skillButton).toBeEnabled();
    await expect(skillHud).toContainText('疾駆');
    if (isMobile) {
      touch = await page.context().newCDPSession(page);
      const bounds = await skillButton.boundingBox();
      expect(bounds).toBeTruthy();
      expect(bounds!.width).toBeGreaterThanOrEqual(48);
      expect(bounds!.height).toBeGreaterThanOrEqual(48);
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
    }
    await screenshot('raid-skill-ready-and-touch-layout');
    if (isMobile) {
      const landscape = page.viewportSize()!;
      await page.setViewportSize({width: 390, height: 844});
      await expect(skillButton).toBeVisible();
      // Read rectangles and hit-testing only. No DOM/state/control mutations.
      const portrait = await page.evaluate(() => {
        const bounds = (node: Element) => {
          const rect = node.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
          const hit = document.elementFromPoint(x, y);
          return {id: node.getAttribute('data-testid') ?? node.getAttribute('data-target') ?? node.className,
            x: rect.x, y: rect.y, width: rect.width, height: rect.height, hit: !!hit && (node === hit || node.contains(hit))};
        };
        const visible = (node: Element) => {const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;};
        return {
          controls: [...document.querySelectorAll('.dungeon-action-button, [data-dungeon-pad]')].filter(visible).map(bounds),
          nearby: [...document.querySelectorAll('.dungeon-nearby-target')].filter(visible).map(bounds),
          hud: document.querySelector('[data-testid="dungeon-skill-state"]')?.textContent,
        };
      });
      interfaceEvidence.push({stage: 'selected-rush-portrait-layout', details: portrait});
      expect(portrait.controls.some(control => control.id === 'dungeon-action-skill')).toBe(true);
      expect(portrait.nearby.length, 'The real nearby west exit is included in the layout check').toBeGreaterThan(0);
      for (const control of portrait.controls) {
        expect(control.width, `${control.id} touch width`).toBeGreaterThanOrEqual(48);
        expect(control.height, `${control.id} touch height`).toBeGreaterThanOrEqual(48);
        expect(control.x).toBeGreaterThanOrEqual(0);
        expect(control.y).toBeGreaterThanOrEqual(0);
        expect(control.x + control.width).toBeLessThanOrEqual(390);
        expect(control.y + control.height).toBeLessThanOrEqual(844);
        expect(control.hit, `${control.id} receives an ordinary center touch`).toBe(true);
        for (const other of [...portrait.controls.filter(candidate => candidate.id !== control.id), ...portrait.nearby]) {
          const width = Math.min(control.x + control.width, other.x + other.width) - Math.max(control.x, other.x);
          const height = Math.min(control.y + control.height, other.y + other.height) - Math.max(control.y, other.y);
          expect(width <= 0 || height <= 0, `${control.id} does not overlap ${other.id}`).toBe(true);
        }
      }
      await screenshot('selected-rush-portrait-controls-and-nearby-exit');
      await page.setViewportSize(landscape);
      await expect(skillButton).toBeVisible();
      await screenshot('selected-rush-landscape-after-rotation');
    }
    const movePoint = isMobile ? await center(page.locator('[data-dungeon-pad=move]')) : null;
    const skillPoint = isMobile ? await center(skillButton) : null;

    // Stay in the safe x=-11 western lane. Holding toward its solid end is safe
    // even on slow CI; speed uses moving frames, never distance after collision.
    stage = 'baseline-forward';
    if (touch && movePoint) {
      await touch.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 1, x: movePoint.x, y: movePoint.y - 42}]});
    } else await page.keyboard.down('KeyW');
    await expect.poll(() => measuredSpeeds(samples, stage, false).length,
      {message: 'Ordinary stride movement produces multiple authoritative moving samples', timeout: 8000, intervals: [50, 100]}).toBeGreaterThanOrEqual(5);
    if (touch) await touch.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    else await page.keyboard.up('KeyW');
    stage = 'baseline-released';
    await page.waitForTimeout(450);
    const normalSpeeds = measuredSpeeds(samples, 'baseline-forward', false);
    expect(median(normalSpeeds), 'Stride actually moves at 3.15 m/s').toBeCloseTo(3.15, 1);

    stage = 'rush-backward';
    // Real simultaneous movement and ability contacts exercise multitouch rather
    // than dispatching DOM events or injecting an action/position into the game.
    if (touch && movePoint && skillPoint) {
      const contacts = new TouchContacts(event => touch!.send('Input.dispatchTouchEvent', event));
      await contacts.set(1, {x: movePoint.x, y: movePoint.y + 42});
      await contacts.set(2, skillPoint);
      await contacts.release(2);
    } else {
      await page.keyboard.down('KeyS');
      await page.keyboard.press('KeyV');
    }
    await expect.poll(() => measuredSpeeds(samples, 'rush-backward', true).length,
      {message: 'The real rush activation accelerates held ordinary movement', timeout: 8000, intervals: [50, 100]}).toBeGreaterThanOrEqual(3);
    // Cancel the actual touch gesture, then verify that no movement remains held.
    if (touch) await touch.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    else await page.keyboard.up('KeyS');
    stage = 'rush-canceled';
    const boostedSpeeds = measuredSpeeds(samples, 'rush-backward', true);
    expect(median(boostedSpeeds)).toBeCloseTo(4.41, 1);
    expect(median(boostedSpeeds) / median(normalSpeeds)).toBeCloseTo(1.4, 1);
    const firstUse = samples.find(sample => sample.readyAt > 0)!;
    expect(firstUse).toBeTruthy();
    expect(firstUse.readyAt - firstUse.activeUntil).toBeCloseTo(11.5, 6);
    await until(page, snapshot => snapshot.elapsed >= firstUse.activeUntil, 'The rush effect expires naturally');
    await expect(skillButton).toBeDisabled();
    await expect(skillHud).toContainText(/再使用|待機|残り/);

    const stationary = await until(page, snapshot => snapshot.elapsed > firstUse.activeUntil + .4, 'Canceled input has settled');
    const stopped = {...own(stationary).position};
    const afterStop = await until(page, snapshot => snapshot.elapsed >= stationary.elapsed + .6, 'Observe a fresh stationary interval');
    expect(own(afterStop).position).toEqual(stopped);
    expect(own(afterStop)).toMatchObject({status: 'alive', hp: 125, maxHp: 125});
    // Repeated ordinary input while unavailable must not extend/restart the skill.
    if (touch && skillPoint) {await touchTap(touch, skillPoint); await touchTap(touch, skillPoint);}
    else {await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');}
    const rejected = await until(page, snapshot => snapshot.tick > afterStop.tick, 'Observe the unavailable repeated input');
    expect(own(rejected).skillState).toMatchObject({activeUntil: firstUse.activeUntil, readyAt: firstUse.readyAt});
    record('real-movement-benefit-and-cooldown-no-restart', rejected);
    await screenshot('rush-expired-real-cooldown');

    stage = 'raid-reload';
    if (touch) {await touch.detach(); touch = null;}
    await page.reload();
    await activate(page.getByTestId('dungeon-join'), isMobile);
    const resumed = await until(page, snapshot => snapshot.you === fresh.you && snapshot.raid === 1 && own(snapshot).connected,
      'Ordinary in-raid reload reconnects the same explorer');
    expect(own(resumed).skillState).toMatchObject({activeUntil: firstUse.activeUntil, readyAt: firstUse.readyAt});
    expect(selection(resumed)).toEqual({skill: 'rush', perk: 'stride'});
    record('reload-retains-authoritative-cooldown', resumed);
    await until(page, snapshot => snapshot.elapsed >= firstUse.readyAt, 'The real 14-second reuse time arrives', 25000);
    await expect(skillButton).toBeEnabled();
    stage = 'second-rush';
    if (isMobile) {
      touch = await page.context().newCDPSession(page);
      await touchTap(touch, await center(skillButton));
    } else await page.keyboard.press('KeyV');
    const second = await until(page, snapshot => (own(snapshot).skillState?.readyAt ?? 0) > firstUse.readyAt,
      'A second normal input activates the skill after its real cooldown');
    expect(own(second).skillState!.activeUntil).toBeGreaterThan(second.elapsed);
    await expect(skillHud).toContainText(/発動|効果|使用中/, {timeout: 2000});
    await screenshot('second-rush-active-visible-hud');
    const final = await until(page, snapshot => snapshot.elapsed >= own(second).skillState!.activeUntil,
      'The repeated skill also ends normally');
    expect(own(final)).toMatchObject({status: 'alive', hp: 125, maxHp: 125});
    expect(final.gold).toBe(0);
    expect(final.stash).toEqual([]);
    expect(final.quests ?? []).toEqual([]);
    expect(own(final).bag).toEqual(own(started).bag);
    expect(actions.filter(value => value.action.kind === 'skill').length).toBeGreaterThanOrEqual(2);
    record('second-activation-expires-without-resources-or-health-mutation', final);
    expect(errors).toEqual([]);
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
    await page.keyboard.up('KeyS').catch(() => {});
    if (touch) {
      await touch.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []}).catch(() => {});
      await touch.detach().catch(() => {});
    }
    await info.attach('training-ordinary-input-evidence', {body: JSON.stringify({
      platform: isMobile ? 'Android Chromium emulation' : 'desktop Chromium', commit: process.env.EXPECTED_COMMIT,
      checkpoints, interfaceEvidence, actions, samples, normalSpeeds: measuredSpeeds(samples, 'baseline-forward', false),
      boostedSpeeds: measuredSpeeds(samples, 'rush-backward', true), errors,
    }, null, 2), contentType: 'application/json'});
    await info.attach('training-browser-errors', {body: JSON.stringify(errors, null, 2), contentType: 'application/json'});
  }
});

// A separate fresh room keeps the shield option independent of the movement
// route. Exact damage-angle reductions are covered by the server rule tests;
// this gate proves a real player can equip and use it with the ordinary shield.
test('dungeon optional brace and vigor work through normal shield and skill controls', async ({page, isMobile}, info) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed authoritative dungeon');
  test.setTimeout(120000);
  const errors: string[] = [];
  const evidence: Array<{stage: string; snapshot: Snapshot}> = [];
  const actions = observeActions(page);
  const received: Snapshot[] = [];
  let touch: CDPSession | null = null;
  page.on('websocket', socket => socket.on('framereceived', ({payload}) => {
    try {
      const packet = JSON.parse(String(payload)) as {type: string; snapshot: Snapshot};
      if (packet.type === 'snapshot') received.push(packet.snapshot);
    } catch { /* Read-only evidence, never an injected packet. */ }
  }));
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  const screenshot = async (name: string, target?: Locator) => {
    if (target) await target.scrollIntoViewIfNeeded();
    const path = info.outputPath(`${name}.png`);
    await page.screenshot({path});
    await info.attach(name, {path, contentType: 'image/png'});
  };
  try {
    expect(process.env.EXPECTED_COMMIT).toBeTruthy();
    const deployment = await page.request.get('/deployment.json');
    expect(deployment.ok()).toBe(true);
    expect((await deployment.json()).commit).toBe(process.env.EXPECTED_COMMIT);
    await page.goto('/?mode=dungeon&test=1');
    await page.getByTestId('dungeon-name').fill('硬守と盾を試す城塞兵');
    await activate(page.getByTestId('dungeon-create'), isMobile);
    const fresh = await until(page, snapshot => snapshot.actors.length === 1, 'A separate fresh brace room exists');
    await activate(page.getByTestId('dungeon-training-skill-brace'), isMobile);
    await until(page, snapshot => selection(snapshot).skill === 'brace', 'Brace is saved from its ordinary option');
    await activate(page.getByTestId('dungeon-training-perk-vigor'), isMobile);
    const selected = await until(page, snapshot => selection(snapshot).perk === 'vigor', 'Vigor is saved from its ordinary option');
    expect(own(selected)).toMatchObject({maxHp: 135, hp: 135});
    evidence.push({stage: 'brace-and-vigor-confirmed', snapshot: selected});
    await screenshot('brace-and-vigor-lobby-options', page.getByTestId('dungeon-training-selection'));
    await page.reload();
    await activate(page.getByTestId('dungeon-join'), isMobile);
    const restored = await until(page, snapshot => snapshot.you === fresh.you && selection(snapshot).skill === 'brace',
      'Reload restores the selected shield training');
    expect(selection(restored)).toEqual({skill: 'brace', perk: 'vigor'});
    await expect(page.getByTestId('dungeon-training-skill-brace')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dungeon-training-perk-vigor')).toHaveAttribute('aria-pressed', 'true');
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => own(snapshot).ready, 'The brace explorer prepares');
    await activate(page.getByTestId('dungeon-start'), isMobile);
    const started = await until(page, snapshot => snapshot.phase === 'raid', 'The brace raid starts normally');
    expect(own(started)).toMatchObject({hp: 135, maxHp: 135, guard: 0, status: 'alive'});
    expect(own(started).bag.some(item => item.kind === 'shield')).toBe(true);
    const skillButton = page.getByTestId('dungeon-action-skill');
    const skillHud = page.getByTestId('dungeon-skill-state');
    await expect(skillButton).toBeEnabled();
    await expect(skillHud).toContainText('硬守');
    const blockButton = page.getByTestId('dungeon-action-block');
    if (isMobile) {
      touch = await page.context().newCDPSession(page);
      const contacts = new TouchContacts(event => touch!.send('Input.dispatchTouchEvent', event));
      await contacts.set(1, await center(blockButton));
      await until(page, snapshot => own(snapshot).guard > .8, 'A real held shield contact raises the shield');
      await contacts.set(2, await center(skillButton));
      await contacts.release(2);
    } else {
      await page.keyboard.down('KeyZ');
      await until(page, snapshot => own(snapshot).guard > .8, 'The ordinary guard key raises the shield');
      await page.keyboard.press('KeyV');
    }
    await expect.poll(() => received.some(snapshot => own(snapshot).skillState?.skill === 'brace' &&
      own(snapshot).guard > .8 && own(snapshot).skillState!.activeUntil > snapshot.elapsed),
    {message: 'Brace is genuinely active while the separate physical shield input stays held', timeout: 8000}).toBe(true);
    const active = received.find(snapshot => own(snapshot).skillState?.skill === 'brace')!;
    const skillState = own(active).skillState!;
    expect(skillState.readyAt - skillState.activeUntil).toBeCloseTo(14, 6);
    evidence.push({stage: 'real-shield-and-brace-active', snapshot: active});
    await expect(skillHud).toContainText(/発動|効果|使用中/, {timeout: 2000});
    await screenshot('brace-active-with-ordinary-shield');
    // A canceled touch/keyup must lower the guard even while brace remains active.
    if (touch) await touch.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    else await page.keyboard.up('KeyZ');
    await until(page, snapshot => own(snapshot).guard < .01, 'Canceled guard input lowers the shield');
    const expired = await until(page, snapshot => snapshot.elapsed >= skillState.activeUntil, 'The real four-second brace duration expires');
    expect(own(expired).skillState).toEqual(skillState);
    await expect(skillButton).toBeDisabled();
    await expect(skillHud).toContainText(/再使用|待機|残り/);
    await screenshot('brace-real-cooldown-after-guard-cancel');
    if (touch) {const point = await center(skillButton); await touchTap(touch, point); await touchTap(touch, point);}
    else {await page.keyboard.press('KeyV'); await page.keyboard.press('KeyV');}
    const repeated = await until(page, snapshot => snapshot.tick > expired.tick, 'Repeated unavailable brace input is observed');
    expect(own(repeated).skillState).toEqual(skillState);
    expect(own(repeated)).toMatchObject({hp: 135, maxHp: 135, status: 'alive', guard: 0});
    expect(own(repeated).bag).toEqual(own(started).bag);
    expect(repeated.stash).toEqual([]);
    expect(repeated.gold).toBe(0);
    evidence.push({stage: 'brace-expired-repeated-input-did-not-reset-it', snapshot: repeated});
    expect(actions.some(value => value.action.kind === 'skill')).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await page.keyboard.up('KeyZ').catch(() => {});
    if (touch) {
      await touch.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []}).catch(() => {});
      await touch.detach().catch(() => {});
    }
    await info.attach('brace-ordinary-input-evidence', {body: JSON.stringify({commit: process.env.EXPECTED_COMMIT,
      platform: isMobile ? 'Android Chromium emulation' : 'desktop Chromium', evidence, actions, received, errors}, null, 2),
    contentType: 'application/json'});
    await info.attach('brace-browser-errors', {body: JSON.stringify(errors), contentType: 'application/json'});
  }
});
