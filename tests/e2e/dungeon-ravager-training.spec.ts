import {test, expect, type CDPSession, type Locator, type Page} from '@playwright/test';
import type {RavagerTraining, Snapshot} from '../../src/dungeon/types';
import {angle, observeActions, own, range, read} from './helpers/dungeon-raid-controls';
import {TouchContacts} from './helpers/touch-contacts';

// Raw traces include private invitation URLs and WebSocket hello credentials.
// This test deliberately emits only masked pictures, actions and public snapshots.
test.use({trace: 'off', screenshot: 'off'});

type Sample = {stage: string; tick: number; elapsed: number; lastAction: number; actor: Snapshot['actors'][number]};
type Recovery = {stage: string; rate: number; started: number; ended: number; duration: number; samples: Sample[]};
const selection = (snapshot: Snapshot): RavagerTraining => own(snapshot).ravagerTraining ?? {skill: null, perk: null};
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const clean = (value: string) => value.replace(/[a-f0-9]{64}/gi, '[private token removed]');

async function activate(control: Locator, mobile: boolean) {
  await control.scrollIntoViewIfNeeded();
  if (mobile) await control.tap(); else await control.click();
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

/** Recover entry and the next idle entry are reconstructed from the real server
 * clocks. The recovery rate is OBSERVED from consecutive snapshots, never assumed
 * from the chosen perk or imported from its implementation. Idle time is unscaled.
 * Thus removing the actual recovery benefit cannot leave this comparison green. */
function measuredRecovery(samples: Sample[], stage: string): Recovery {
  const series = samples.filter(sample => sample.stage === stage);
  const recovering = series.filter(sample => sample.actor.phase === 'recover');
  const rates = recovering.flatMap((after, index) => {
    const before = recovering[index - 1], dt = before ? after.elapsed - before.elapsed : 0;
    return before && dt > 0 && dt <= .3 ? [(after.actor.time - before.actor.time) / dt] : [];
  });
  expect(rates.length, `${stage}: multiple real recovery clock observations`).toBeGreaterThanOrEqual(2);
  const rate = median(rates);
  const first = recovering[0];
  const idle = series.find(sample => sample.elapsed > first.elapsed && sample.actor.phase === 'idle');
  expect(idle, `${stage}: actual recovery finishes and control returns to idle`).toBeTruthy();
  const started = first.elapsed - first.actor.time / rate;
  const ended = idle!.elapsed - idle!.actor.time;
  return {stage, rate, started, ended, duration: ended - started, samples: series};
}

/** Read rectangles and hit targets only, without changing DOM or game state. */
async function portraitLayout(page: Page) {
  return page.evaluate(() => {
    const bounds = (node: Element) => {
      const rect = node.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return {id: node.getAttribute('data-testid') ?? node.getAttribute('data-target') ?? node.className,
        x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        hit: !!hit && (hit === node || node.contains(hit)),
        hitElement: hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? hit?.className ?? null};
    };
    const visible = (node: Element) => {const rect = node.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;};
    const notice = document.querySelector('.dungeon-notice');
    return {
      inputProfile: {coarse: matchMedia('(pointer: coarse)').matches, noHover: matchMedia('(hover: none)').matches, maxTouchPoints: navigator.maxTouchPoints},
      controls: [...document.querySelectorAll('.dungeon-action-button, [data-dungeon-pad]')].filter(visible).map(bounds),
      nearby: [...document.querySelectorAll('.dungeon-nearby-target')].filter(visible).map(bounds),
      notice: notice ? {...bounds(notice), visible: visible(notice), text: notice.textContent} : null,
    };
  });
}

test('dungeon optional ravager training preserves class choices and really shortens greatsword heavy recovery', async ({page, isMobile}, info) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed authoritative dungeon');
  test.setTimeout(180000);
  const samples: Sample[] = [], recoveries: Recovery[] = [];
  const checkpoints: Array<{stage: string; snapshot: Snapshot}> = [];
  const interfaceEvidence: Array<{stage: string; details: unknown}> = [];
  const errors: string[] = [];
  const actions = observeActions(page);
  let stage = 'baseline-lobby';
  let touch: CDPSession | null = null;
  page.on('websocket', socket => socket.on('framereceived', ({payload}) => {
    try {
      const packet = JSON.parse(String(payload)) as {type: string; snapshot: Snapshot};
      if (packet.type === 'snapshot') samples.push({stage, tick: packet.snapshot.tick, elapsed: packet.snapshot.elapsed,
        lastAction: packet.snapshot.lastAction, actor: own(packet.snapshot)});
    } catch { /* A passive evidence observer must never modify the connection. */ }
  }));
  page.on('pageerror', error => errors.push(clean(String(error))));
  page.on('console', message => {if (message.type() === 'error') errors.push(clean(message.text()));});
  const record = (name: string, snapshot: Snapshot) => checkpoints.push({stage: name, snapshot});
  const assertMobileProfile = async (name: string) => {
    if (!isMobile) return;
    const layout = await portraitLayout(page);
    interfaceEvidence.push({stage: name, details: layout});
    expect(layout.inputProfile).toMatchObject({coarse: true, noHover: true});
    expect(layout.inputProfile.maxTouchPoints).toBeGreaterThan(0);
    for (const id of ['dungeon-move-pad', 'dungeon-look-pad']) {
      expect(layout.controls.some(control => control.id === id), `${name}: ${id} must remain visible`).toBe(true);
    }
  };
  const screenshot = async (name: string, target?: Locator) => {
    if (target) await target.scrollIntoViewIfNeeded();
    const path = info.outputPath(`${name}.png`);
    if (target) await target.screenshot({path});
    else await page.screenshot({path, mask: [page.getByTestId('dungeon-invite'), page.getByTestId('dungeon-room')]});
    await info.attach(name, {path, contentType: 'image/png'});
  };
  const command = async (kind: 'heavy' | 'attack' | 'skill') => {
    if (touch) await touchTap(touch, await center(page.getByTestId(`dungeon-action-${kind}`)));
    else await page.keyboard.press(kind === 'heavy' ? 'KeyR' : kind === 'attack' ? 'KeyT' : 'KeyV');
  };
  const selectClass = async (classId: 'bastion' | 'ravager' | 'shade') => {
    await activate(page.getByTestId(`dungeon-class-${classId}`), isMobile);
    return until(page, snapshot => own(snapshot).classId === classId, `${classId} is server-confirmed`);
  };
  const choose = async (kind: 'skill' | 'perk', value: string, expected: RavagerTraining, keyboardRepeat = false) => {
    const control = page.getByTestId(`dungeon-ravager-training-${kind}-${value}`);
    const beforeCount = actions.filter(entry => entry.action.kind === 'configure-ravager-training').length;
    let beforeScroll: number | undefined;
    if (keyboardRepeat && !isMobile) {
      await control.scrollIntoViewIfNeeded(); await control.focus();
      beforeScroll = await page.locator('.dungeon-lobby').evaluate(node => node.scrollTop);
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
    } else await activate(control, isMobile);
    const snapshot = await until(page, current => JSON.stringify(selection(current)) === JSON.stringify(expected), `${kind} ${value} is saved by the server`);
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    if (keyboardRepeat && !isMobile) {
      await expect(control).toBeFocused();
      const afterScroll = await page.locator('.dungeon-lobby').evaluate(node => node.scrollTop);
      expect(Math.abs(afterScroll - beforeScroll!)).toBeLessThanOrEqual(1);
      const sent = actions.filter(entry => entry.action.kind === 'configure-ravager-training').length - beforeCount;
      expect(sent, 'Repeated ordinary Enter sends one new choice, with no duplicate request').toBe(1);
      interfaceEvidence.push({stage: 'keyboard-repeat-ack-focus', details: {beforeScroll, afterScroll, sent}});
    }
    return snapshot;
  };
  const start = async () => {
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => own(snapshot).ready, 'The explorer is prepared');
    await activate(page.getByTestId('dungeon-start'), isMobile);
    const snapshot = await until(page, value => value.phase === 'raid', 'The ordinary raid begins');
    expect(own(snapshot)).toMatchObject({classId: 'ravager', weapon: 'greatsword', hp: 145, maxHp: 145,
      status: 'alive', position: {x: -11, y: 0, z: 11}});
    expect(own(snapshot).bag.some(item => item.kind === 'greatsword')).toBe(true);
    return snapshot;
  };
  const attack = async (name: string, heavy: boolean) => {
    const before = await until(page, snapshot => own(snapshot).phase === 'idle', `${name} starts from idle`);
    stage = name;
    await command(heavy ? 'heavy' : 'attack');
    await until(page, snapshot => snapshot.lastAction > before.lastAction && own(snapshot).phase !== 'idle', `${name} enters its real attack`);
    await expect.poll(() => samples.some(sample => sample.stage === name && sample.actor.phase === 'recover'),
      {message: `${name} reaches recovery`, timeout: 8000, intervals: [50, 100]}).toBe(true);
    await screenshot(name);
    const ended = await until(page, snapshot => own(snapshot).phase === 'idle', `${name} completes recovery`, 8000);
    const measured = measuredRecovery(samples, name); recoveries.push(measured);
    expect(own(ended)).toMatchObject({hp: 145, maxHp: 145, status: 'alive', position: own(before).position});
    expect(own(ended).bag).toEqual(own(before).bag);
    return measured;
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
    await page.getByTestId('dungeon-name').fill('大剣の通常回復を試す探索者');
    await activate(page.getByTestId('dungeon-create'), isMobile);
    await until(page, snapshot => snapshot.actors.length === 1, 'A fresh baseline room exists');
    const baseline = await selectClass('ravager');
    expect(selection(baseline)).toEqual({skill: null, perk: null});
    await expect(page.getByTestId('dungeon-ravager-training-skill-none')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dungeon-ravager-training-perk-none')).toHaveAttribute('aria-pressed', 'true');
    record('fresh-ravager-has-no-training', baseline);
    await start();
    if (isMobile) touch = await page.context().newCDPSession(page);
    await assertMobileProfile('baseline-mobile-input-profile');
    await expect(page.getByTestId('dungeon-action-skill')).toBeHidden();
    const baselineHeavy = [await attack('baseline-heavy-1', true), await attack('baseline-heavy-2', true)];
    const baselineLight = await attack('baseline-light', false);
    for (const timing of baselineHeavy) {
      expect(timing.rate).toBeCloseTo(1, 5);
      expect(timing.duration).toBeCloseTo(1, 5);
    }
    // New room via the real leave/create UI keeps both trials at the same safe
    // first spawn with the same weapon; no teleport, fixture or storage writes.
    // Preserve the original Android touch-emulation session across ordinary
    // leave/create and reload; only detach after all touch assertions finish.
    stage = 'trained-lobby';
    await activate(page.getByRole('button', {name: '部屋を離れる', exact: true}), isMobile);
    await page.getByTestId('dungeon-name').fill('荒戦士の任意訓練を試す探索者');
    await activate(page.getByTestId('dungeon-create'), isMobile);
    const fresh = await until(page, snapshot => snapshot.phase === 'lobby' && snapshot.raid === 0 && snapshot.actors.length === 1,
      'A separate fresh selection room exists');
    expect(fresh.stash).toEqual([]); expect(fresh.gold).toBe(0);
    await activate(page.getByTestId('dungeon-training-skill-rush'), isMobile);
    await until(page, snapshot => own(snapshot).training?.skill === 'rush', 'The independent Bastion skill is saved');
    await activate(page.getByTestId('dungeon-training-perk-stride'), isMobile);
    await until(page, snapshot => own(snapshot).training?.perk === 'stride', 'The independent Bastion perk is saved');
    await selectClass('ravager');
    expect(selection((await read(page))!)).toEqual({skill: null, perk: null});
    await choose('skill', 'frenzy', {skill: 'frenzy', perk: null}, true);
    await choose('perk', 'laststand', {skill: 'frenzy', perk: 'laststand'});
    await expect(page.getByTestId('dungeon-training-selection')).toContainText('背水');
    await screenshot('frenzy-and-laststand-options', page.getByTestId('dungeon-training-panel'));
    await choose('skill', 'none', {skill: null, perk: 'laststand'});
    await choose('perk', 'none', {skill: null, perk: null});
    await choose('skill', 'frenzy', {skill: 'frenzy', perk: null});
    await choose('perk', 'followthrough', {skill: 'frenzy', perk: 'followthrough'});
    const bastion = await selectClass('bastion');
    expect(own(bastion).training).toEqual({skill: 'rush', perk: 'stride'});
    expect(selection(bastion)).toEqual({skill: 'frenzy', perk: 'followthrough'});
    await expect(page.getByTestId('dungeon-training-skill-rush')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('dungeon-ravager-training-choices')).toBeHidden();
    await selectClass('shade');
    await expect(page.getByTestId('dungeon-ravager-training-choices')).toBeHidden();
    await selectClass('ravager');
    await page.reload();
    await activate(page.getByTestId('dungeon-join'), isMobile);
    const restored = await until(page, snapshot => own(snapshot).classId === 'ravager' && selection(snapshot).perk === 'followthrough',
      'Ordinary reload and join restore Ravager training');
    expect(restored.you).toBe(fresh.you);
    expect(own(restored).training).toEqual({skill: 'rush', perk: 'stride'});
    expect(selection(restored)).toEqual({skill: 'frenzy', perk: 'followthrough'});
    await expect(page.getByTestId('dungeon-training-selection')).toContainText('狂奔');
    await expect(page.getByTestId('dungeon-training-selection')).toContainText('追撃');
    record('both-class-selections-survive-reload', restored);
    await screenshot('restored-frenzy-and-followthrough', page.getByTestId('dungeon-training-panel'));
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => own(snapshot).ready, 'Ready locks training');
    for (const option of ['skill-none', 'skill-frenzy', 'perk-none', 'perk-laststand', 'perk-followthrough']) {
      await expect(page.getByTestId(`dungeon-ravager-training-${option}`)).toBeDisabled();
    }
    await expect(page.getByTestId('dungeon-class-bastion')).toBeDisabled();
    await expect(page.getByTestId('dungeon-training-reason')).toContainText('準備');
    await screenshot('ready-lock-with-reason', page.getByTestId('dungeon-training-panel'));
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => !own(snapshot).ready, 'Preparation can be canceled normally');
    await expect(page.getByTestId('dungeon-ravager-training-perk-followthrough')).toBeEnabled();
    const sentBeforeNoop = actions.filter(entry => entry.action.kind === 'configure-ravager-training').length;
    await choose('perk', 'followthrough', {skill: 'frenzy', perk: 'followthrough'});
    expect(actions.filter(entry => entry.action.kind === 'configure-ravager-training')).toHaveLength(sentBeforeNoop);
    const started = await start();
    await assertMobileProfile('trained-mobile-profile-after-room-change-and-reload');
    expect(own(started).ravagerSkillState).toBeUndefined();
    await expect(page.getByTestId('dungeon-training-panel')).toBeHidden();
    const trainedHeavy = [await attack('followthrough-heavy-1', true), await attack('followthrough-heavy-2', true)];
    const trainedLight = await attack('followthrough-light', false);
    for (const timing of trainedHeavy) {
      expect(timing.rate, 'The real heavy recovery clock runs 25% faster').toBeCloseTo(1.25, 5);
      expect(timing.duration, 'Actual heavy recovery releases control in .80 server seconds').toBeCloseTo(.8, 5);
    }
    expect(median(trainedHeavy.map(timing => timing.duration)) / median(baselineHeavy.map(timing => timing.duration))).toBeCloseTo(.8, 5);
    expect(trainedLight.rate, 'Light recovery receives no heavy-only benefit').toBeCloseTo(1, 5);
    expect(trainedLight.duration).toBeCloseTo(baselineLight.duration, 5);

    const skillButton = page.getByTestId('dungeon-action-skill'), skillHud = page.getByTestId('dungeon-skill-state');
    await expect(skillButton).toBeEnabled(); await expect(skillHud).toContainText('狂奔');
    const landscape = page.viewportSize()!;
    if (isMobile) await page.setViewportSize({width: 390, height: 844});
    stage = 'first-frenzy';
    await command('skill');
    const active = await until(page, snapshot => (own(snapshot).ravagerSkillState?.activeUntil ?? 0) > snapshot.elapsed,
      'Ordinary input genuinely activates Frenzy');
    const firstUse = own(active).ravagerSkillState!;
    const activationSample = samples.find(sample => sample.stage === 'first-frenzy' && sample.actor.ravagerSkillState?.readyAt === firstUse.readyAt)!;
    expect(firstUse.activeUntil - activationSample.elapsed, 'The authoritative activation grants exactly five seconds').toBeCloseTo(5, 6);
    expect(firstUse.readyAt - activationSample.elapsed, 'The authoritative activation starts an eighteen-second cooldown').toBeCloseTo(18, 6);
    expect(firstUse.readyAt - firstUse.activeUntil).toBeCloseTo(13, 6);
    await expect(skillHud).toContainText(/発動|効果|使用中/);
    await expect(page.locator('.dungeon-notice')).toContainText('狂奔を発動しました', {timeout: 2000});
    if (isMobile) {
      const layout = await portraitLayout(page); interfaceEvidence.push({stage: 'fresh-frenzy-portrait-notice', details: layout});
      expect(layout.inputProfile, 'Portrait remains a real touch-emulated page').toMatchObject({coarse: true, noHover: true});
      expect(layout.inputProfile.maxTouchPoints).toBeGreaterThan(0);
      for (const id of ['dungeon-move-pad', 'dungeon-look-pad', 'dungeon-action-skill']) {
        expect(layout.controls.some(control => control.id === id), `${id} must be visible in the asserted touch geometry`).toBe(true);
      }
      expect(layout.notice?.visible).toBe(true); expect(layout.notice?.text).toContain('狂奔を発動しました');
      expect(layout.nearby.length, 'The ordinary nearby exit also participates in the portrait check').toBeGreaterThan(0);
      for (const control of layout.controls) {
        expect(control.width, `${control.id}: minimum touch width`).toBeGreaterThanOrEqual(48);
        expect(control.height, `${control.id}: minimum touch height`).toBeGreaterThanOrEqual(48);
        expect(control.x).toBeGreaterThanOrEqual(0); expect(control.y).toBeGreaterThanOrEqual(0);
        expect(control.x + control.width).toBeLessThanOrEqual(390); expect(control.y + control.height).toBeLessThanOrEqual(844);
        expect(control.hit, `${control.id}: center touch while fresh notice is visible, hit ${control.hitElement}`).toBe(true);
        for (const other of [...layout.controls.filter(candidate => candidate.id !== control.id), ...layout.nearby, layout.notice!]) {
          const width = Math.min(control.x + control.width, other.x + other.width) - Math.max(control.x, other.x);
          const height = Math.min(control.y + control.height, other.y + other.height) - Math.max(control.y, other.y);
          expect(width <= 0 || height <= 0, `${control.id} must not overlap ${other.id}`).toBe(true);
        }
      }
    }
    await screenshot('frenzy-active-with-fresh-notice');
    // Ordinary movement + cancel must not leave a held stick/key after ability use.
    const moveStart = await read(page);
    if (touch) {
      const point = await center(page.locator('[data-dungeon-pad=move]'));
      const contacts = new TouchContacts(event => touch!.send('Input.dispatchTouchEvent', event));
      await contacts.set(1, {x: point.x, y: point.y - 42});
    } else await page.keyboard.down('KeyW');
    await until(page, snapshot => own(snapshot).position.z < own(moveStart!).position.z - .2, 'Real movement is held after activation');
    if (touch) await touch.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
    else await page.keyboard.up('KeyW');
    const canceledAt = (await read(page))!;
    const settled = await until(page, snapshot => snapshot.elapsed > canceledAt.elapsed + .4, 'Canceled input has settled');
    const afterCancel = await until(page, snapshot => snapshot.elapsed > settled.elapsed + .4, 'A new stationary interval is observed');
    expect(own(afterCancel).position).toEqual(own(settled).position);
    if (isMobile) {
      await page.setViewportSize(landscape);
      await assertMobileProfile('mobile-profile-after-landscape-rotation');
      await screenshot('frenzy-landscape-after-cancel-and-rotation');
    }
    await until(page, snapshot => snapshot.elapsed >= firstUse.activeUntil, 'The real five-second Frenzy expires');
    await expect(skillButton).toBeDisabled(); await expect(skillHud).toContainText(/再使用|待機|残り/);
    await command('skill'); await command('skill');
    const repeated = await until(page, snapshot => snapshot.elapsed > firstUse.activeUntil + .25, 'Unavailable repeated input is observed');
    expect(own(repeated).ravagerSkillState).toEqual(firstUse);
    record('expired-frenzy-cannot-be-restarted-early', repeated);
    stage = 'cooldown-reload';
    await page.reload(); await activate(page.getByTestId('dungeon-join'), isMobile);
    const resumed = await until(page, snapshot => snapshot.you === fresh.you && snapshot.phase === 'raid' && own(snapshot).connected,
      'Reload reconnects the same trained explorer during cooldown');
    expect(own(resumed).ravagerSkillState).toEqual(firstUse);
    expect(selection(resumed)).toEqual({skill: 'frenzy', perk: 'followthrough'});
    expect(own(resumed).training).toEqual({skill: 'rush', perk: 'stride'});
    record('authoritative-cooldown-survives-reload', resumed);
    await until(page, snapshot => snapshot.elapsed >= firstUse.readyAt, 'The real eighteen-second reuse time arrives', 25000);
    await expect(skillButton).toBeEnabled();
    if (isMobile) {
      const layout = await portraitLayout(page);
      interfaceEvidence.push({stage: 'mobile-profile-after-cooldown-reload', details: layout});
      expect(layout.inputProfile).toMatchObject({coarse: true, noHover: true});
      expect(layout.inputProfile.maxTouchPoints).toBeGreaterThan(0);
      for (const id of ['dungeon-move-pad', 'dungeon-look-pad']) expect(layout.controls.some(control => control.id === id)).toBe(true);
    }
    stage = 'second-frenzy'; await command('skill');
    const second = await until(page, snapshot => (own(snapshot).ravagerSkillState?.readyAt ?? 0) > firstUse.readyAt,
      'The skill is reusable through a second real input');
    expect(own(second).ravagerSkillState!.activeUntil).toBeGreaterThan(second.elapsed);
    await screenshot('second-frenzy-active');
    const final = await until(page, snapshot => snapshot.elapsed >= own(second).ravagerSkillState!.activeUntil, 'The reused skill also expires');
    expect(own(final)).toMatchObject({hp: 145, maxHp: 145, status: 'alive'});
    expect(own(final).bag).toEqual(own(started).bag); expect(final.stash).toEqual([]); expect(final.gold).toBe(0);
    expect(final.quests ?? []).toEqual([]);
    expect(actions.filter(entry => entry.action.kind === 'skill')).toHaveLength(2);
    record('reused-skill-expired-with-no-free-resources', final);
    expect(errors).toEqual([]);
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
    if (touch) {
      await touch.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []}).catch(() => {});
      await touch.detach().catch(() => {});
    }
    await info.attach('ravager-ordinary-input-evidence', {body: JSON.stringify({
      platform: isMobile ? 'Android Chromium emulation' : 'desktop Chromium', commit: process.env.EXPECTED_COMMIT,
      checkpoints, interfaceEvidence, recoveries, actions, samples, errors,
    }, null, 2), contentType: 'application/json'});
  }
});

// One real contact is enough to distinguish Frenzy's48×1.25 / head×1.35
// damage from the ordinary48 /65. The timing and menu trial stays independent.
test('dungeon ravager frenzy increases an actual ordinary-input greatsword hit', async ({page, isMobile}, info) => {
  test.skip(process.env.E2E_DUNGEON !== '1', 'Requires the deployed authoritative dungeon');
  test.setTimeout(90000);
  const received: Array<{stage: string; snapshot: Snapshot}> = [];
  const actions = observeActions(page), errors: string[] = [];
  const inputObservations: Array<Record<string, unknown>> = [];
  const frames: Array<{captureTimestampSeconds: number; callbackStage: string; callbackWallTimeMs: number; callbackTick: number | null; jpeg: string}> = [];
  let stage = 'joining', session: CDPSession | null = null;
  let evidence: {before: Snapshot; hit: Snapshot; damage: number; zone: 'body' | 'head'} | null = null;
  page.on('pageerror', error => errors.push(clean(String(error))));
  page.on('console', message => {if (message.type() === 'error') errors.push(clean(message.text()));});
  page.on('websocket', socket => socket.on('framereceived', ({payload}) => {
    try {
      const packet = JSON.parse(String(payload)) as {type: string; snapshot: Snapshot};
      if (packet.type !== 'snapshot') return;
      if (packet.snapshot.enemies.find(enemy => enemy.id === 'e3')?.damageTaken) stage = 'contact';
      received.push({stage, snapshot: packet.snapshot});
    } catch { /* Snapshot evidence never sends or edits a packet. */ }
  }));
  const latest = () => {
    const snapshot = received.at(-1)?.snapshot;
    if (!snapshot) throw new Error('No observed authoritative snapshot');
    expect(own(snapshot).status).toBe('alive');
    expect(snapshot.elapsed, 'A single strike stays within the bounded45-second encounter').toBeLessThan(45);
    return snapshot;
  };
  const target = (snapshot: Snapshot) => {
    const enemy = snapshot.enemies.find(value => value.id === 'e3');
    if (!enemy) throw new Error('The ordinary south guard is missing');
    return enemy;
  };
  try {
    expect(process.env.EXPECTED_COMMIT).toBeTruthy();
    const deployment = await page.request.get('/deployment.json');
    expect(deployment.ok()).toBe(true);
    expect((await deployment.json()).commit).toBe(process.env.EXPECTED_COMMIT);
    await page.goto('/?mode=dungeon&test=1');
    await page.getByTestId('dungeon-name').fill('狂奔の大剣を試す探索者');
    await activate(page.getByTestId('dungeon-create'), isMobile);
    await until(page, snapshot => snapshot.actors.length === 1, 'A fresh ordinary strike room exists');
    await activate(page.getByTestId('dungeon-class-ravager'), isMobile);
    await until(page, snapshot => own(snapshot).classId === 'ravager', 'Ravager is selected');
    await activate(page.getByTestId('dungeon-ravager-training-skill-frenzy'), isMobile);
    await until(page, snapshot => selection(snapshot).skill === 'frenzy', 'Frenzy is saved');
    await activate(page.getByTestId('dungeon-ready'), isMobile);
    await until(page, snapshot => own(snapshot).ready, 'The explorer is prepared');
    await activate(page.getByTestId('dungeon-start'), isMobile);
    const started = await until(page, snapshot => snapshot.phase === 'raid', 'The real strike raid starts');
    expect(selection(started)).toEqual({skill: 'frenzy', perk: null});
    expect(own(started)).toMatchObject({weapon: 'greatsword', hp: 145, maxHp: 145});
    expect(target(started)).toMatchObject({hp: 70, damageTaken: 0, position: {x: 0, y: 0, z: 11}});

    // Start visual recording only after the private lobby/invitation has gone.
    // ACK frames immediately; no PNG, encoder, or network wait delays combat.
    session = await page.context().newCDPSession(page);
    session.on('Page.screencastFrame', frame => {
      void session?.send('Page.screencastFrameAck', {sessionId: frame.sessionId}).catch(() => {});
      // A queued compositor frame may predate the current callback-stage/tick.
      // Keep its capture clock separate; callback context is not capture proof.
      const captureTimestampSeconds = frame.metadata.timestamp ?? 0;
      const sameStage = frames.filter(candidate => candidate.callbackStage === stage);
      if (sameStage.length >= 3 || sameStage.length && captureTimestampSeconds - sameStage.at(-1)!.captureTimestampSeconds < .12) return;
      frames.push({captureTimestampSeconds, callbackStage: stage, callbackWallTimeMs: Date.now(),
        callbackTick: received.at(-1)?.snapshot.tick ?? null, jpeg: frame.data});
    });
    stage = 'safe-spawn';
    await session.send('Page.startScreencast', {format: 'jpeg', quality: 65, maxWidth: 960, maxHeight: 540, everyNthFrame: 2});
    await expect.poll(() => frames.some(frame => frame.callbackStage === 'safe-spawn'), {timeout: 5000}).toBe(true);
    // Resolve ordinary control bounds while safely outside enemy perception.
    const skillPoint = await center(page.getByTestId('dungeon-action-skill'));
    const attackPoint = await center(page.getByTestId('dungeon-action-attack'));
    const movePoint = isMobile ? await center(page.locator('[data-dungeon-pad=move]')) : null;
    const lookBounds = isMobile ? await page.locator('[data-dungeon-pad=look]').boundingBox() : null;
    if (isMobile) expect(lookBounds).toBeTruthy();
    const noteInput = (label: string, event: 'begin' | 'end') => {
      const snapshot = received.at(-1)?.snapshot;
      const actor = snapshot && own(snapshot), guard = snapshot?.enemies.find(enemy => enemy.id === 'e3');
      inputObservations.push({label, event, wallTime: Date.now(), stage, elapsed: snapshot?.elapsed, tick: snapshot?.tick,
        hp: actor?.hp, phase: actor?.phase, position: actor?.position, yaw: actor?.yaw,
        distance: actor && guard ? range(actor, guard.position) : null, guardPhase: guard?.phase});
    };
    const timedTouch = async (point: {x: number; y: number}, label: string, hold: number, id: number) => {
      noteInput(`${label}-start-request`, 'begin');
      const down = session!.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id, ...point}]})
        .then(() => noteInput(`${label}-start-ack`, 'end'));
      // A CDP start ACK can wait for a slow rendered frame. Request release on
      // our timer, in the same ordered session, without holding until that ACK.
      const up = new Promise<void>((resolve, reject) => setTimeout(() => {
        noteInput(`${label}-release-request`, 'begin');
        session!.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []})
          .then(() => {noteInput(`${label}-release-ack`, 'end'); resolve();}, reject);
      }, hold));
      await Promise.all([down, up]);
    };
    const touchCommand = (point: {x: number; y: number}, label: string) => timedTouch(point, label, 80, 7);
    const approachPulse = async () => {
      if (isMobile && movePoint) await timedTouch({x: movePoint.x, y: movePoint.y - 21}, 'approach-pulse', 600, 1);
      else {
        noteInput('approach-key-request', 'begin');
        const down = page.keyboard.down('KeyW');
        const up = new Promise<void>((resolve, reject) => setTimeout(() => {
          page.keyboard.up('KeyW').then(() => resolve(), reject);
        }, 250));
        await Promise.all([down, up]);
        noteInput('approach-key-released', 'end');
      }
    };
    // All look changes are physical keyboard or captured look-pad gestures.
    // We stop turning before entering perception and keep the straight z=11 lane.
    stage = 'turn-east';
    for (let attempt = 0; attempt < 16; attempt++) {
      const before = latest(), error = angle(-Math.PI / 2 - own(before).yaw);
      if (Math.abs(error) <= .06) break;
      if (isMobile && lookBounds) {
        const dx = Math.sign(-error) * Math.min(100, lookBounds.width - 24, Math.abs(error) / .004);
        const x = dx > 0 ? lookBounds.x + 12 : lookBounds.x + lookBounds.width - 12;
        const y = lookBounds.y + lookBounds.height / 2;
        await session.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{id: 3, x, y}]});
        await session.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{id: 3, x: x + dx, y}]});
        await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      } else {
        const key = error > 0 ? 'Home' : 'End';
        await page.keyboard.down('ShiftLeft');
        await page.keyboard.press(key, {delay: Math.max(35, Math.min(350, Math.abs(error) / .65 * 850))});
        await page.keyboard.up('ShiftLeft');
      }
      await expect.poll(() => latest().tick, {timeout: 4000, intervals: [50, 100]}).toBeGreaterThan(before.tick + 2);
    }
    expect(Math.abs(angle(-Math.PI / 2 - own(latest()).yaw)), 'Real controls point the greatsword at the south guard').toBeLessThanOrEqual(.06);
    stage = 'ordinary-approach';
    // Short real gestures release independently of renderer ACK latency.
    // Each half-stick mobile pulse requests only .855m; desktop requests .713m.
    // Stop at perception and let the guard close, with no further movement.
    while (own(latest()).position.x <= -7.9) await approachPulse();
    stage = 'stationary-pull';
    noteInput('stationary-pull', 'begin');
    expect(range(own(latest()), target(latest()).position), 'Release movement well outside melee range').toBeGreaterThan(4);
    await expect.poll(() => range(own(latest()), target(latest()).position),
      {message: 'The real guard approaches a stationary explorer', timeout: 8000, intervals: [50, 75]}).toBeLessThanOrEqual(4.5);
    stage = 'frenzy-approach';
    if (isMobile) await touchCommand(skillPoint, 'skill-tap'); else await page.keyboard.press('KeyV');
    await expect.poll(() => {
      const snapshot = latest(); return (own(snapshot).ravagerSkillState?.activeUntil ?? 0) > snapshot.elapsed;
    }, {message: 'Frenzy activates before the contact', timeout: 4000, intervals: [50, 75]}).toBe(true);
    const before = latest();
    expect(selection(before)).toEqual({skill: 'frenzy', perk: null});
    // Greatsword windup is .56s. Start at2.6m while the1.65m/s guard closes,
    // instead of waiting point-blank through extra touch start/end roundtrips.
    await expect.poll(() => range(own(latest()), target(latest()).position),
      {message: 'The approaching guard enters the normal greatsword windup distance', timeout: 4000, intervals: [50, 75]}).toBeLessThanOrEqual(2.6);
    stage = 'frenzy-strike';
    if (isMobile) await touchCommand(attackPoint, 'attack-tap'); else await page.keyboard.press('KeyT');
    await expect.poll(() => received.some(entry => entry.snapshot.phase === 'raid' && target(entry.snapshot).damageTaken > 0),
      {message: 'One ordinary greatsword attack really contacts the guard', timeout: 4500, intervals: [50, 75]}).toBe(true);
    const hit = received.find(entry => entry.snapshot.phase === 'raid' && target(entry.snapshot).damageTaken > 0)!.snapshot;
    const damage = target(hit).damageTaken - target(before).damageTaken;
    expect(range(own(hit), own(before).position), 'The explorer remains stationary while the guard approaches and the sword swings').toBeLessThan(.16);
    expect([60, 81], 'Actual body/head damage includes Frenzy1.25 and excludes the ordinary48/65').toContain(damage);
    expect(own(hit).ravagerSkillState!.activeUntil, 'The boosted contact occurred inside the authoritative active window').toBeGreaterThan(hit.elapsed);
    expect(own(hit)).toMatchObject({weapon: 'greatsword', ravagerTraining: {skill: 'frenzy', perk: null}, status: 'alive'});
    expect(own(hit).bag.some(item => item.kind === 'greatsword')).toBe(true);
    expect(actions.filter(entry => entry.action.kind === 'attack')).toHaveLength(1);
    expect(actions.filter(entry => entry.action.kind === 'skill')).toHaveLength(1);
    evidence = {before, hit, damage, zone: damage === 60 ? 'body' : 'head'};
    // This confirms frame delivery after contact, not the queued frame's contents.
    await expect.poll(() => frames.some(frame => frame.callbackStage === 'contact'), {timeout: 4000, intervals: [50, 100]}).toBe(true);
    expect(errors).toEqual([]);
    // A new screenshot request is made only after the actual hit assertions.
    // It documents the later rendered result without delaying the five-second hit.
    const resultPath = info.outputPath('ravager-strike-after-confirmed-hit.png');
    await page.screenshot({path: resultPath, mask: [page.getByTestId('dungeon-invite'), page.getByTestId('dungeon-room')]});
    await info.attach('ravager-strike-after-confirmed-hit', {path: resultPath, contentType: 'image/png'});
  } finally {
    await page.keyboard.up('KeyW').catch(() => {});
    await page.keyboard.up('ShiftLeft').catch(() => {});
    if (session) {
      await session.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []}).catch(() => {});
      await session.send('Page.stopScreencast').catch(() => {});
      await session.detach().catch(() => {});
    }
    const stages = ['safe-spawn', 'ordinary-approach', 'stationary-pull', 'frenzy-approach', 'frenzy-strike', 'contact'];
    for (const name of stages) {
      const frame = frames.filter(value => value.callbackStage === name).at(-1);
      if (frame) await info.attach(`ravager-frame-received-during-${name}`, {body: Buffer.from(frame.jpeg, 'base64'), contentType: 'image/jpeg'});
    }
    await info.attach('ravager-strike-ordinary-input-evidence', {body: JSON.stringify({
      commit: process.env.EXPECTED_COMMIT, platform: isMobile ? 'Android Chromium emulation' : 'desktop Chromium',
      evidence, actions, received, inputObservations, visualFrames: frames.map(({jpeg: _jpeg, ...frame}) => frame), errors,
      diagnostics: 'Raw trace is disabled to avoid retaining private invitation URLs and hello credentials. Screencast captureTimestampSeconds is the compositor clock; callbackStage, callbackWallTimeMs and callbackTick describe receipt, not image capture. Actual hit proof is the authoritative snapshot/input evidence. The masked PNG is requested only after those hit assertions pass.',
    }, null, 2), contentType: 'application/json'});
  }
});
