import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { CDPSession, Locator, Page } from '@playwright/test';

test.use({ video: 'on' });
test.describe.configure({ retries: 0 });

type Point = { x: number; y: number };
interface WorldState extends Point {
  hp: number; deaths: number; time: number; tool: string;
  resources: Record<string, number>;
  cameraX: number; cameraY: number; width: number; height: number;
}
interface Enemy extends Point { id: number; hp: number; maxHp: number; kind: string; active: boolean; onScreen: boolean; lineOfSight: boolean }
interface CombatState {
  selected: number; ammo: { bomb: number }; kills: number; assistEnabled: boolean; castSequence: number;
  wands: { spells: string[]; mana: number; cursor: number; cooldown: number }[];
  enemies: Enemy[];
  projectiles: (Point & { spell: string; damage: number })[];
  assistedTarget: (Point & { id: number; aimX: number; aimY: number }) | null;
}

/** Every gameplay action uses the same real CDP touch pointer. No keyboard,
 * second touch, injected state, save edits, resource gifts or altered enemies. */
class Thumb {
  active = false;
  maxPointers = 0;
  events: { type: string; point?: Point }[] = [];
  actions: { kind: 'tap' | 'drag'; target: string }[] = [];
  constructor(readonly page: Page, readonly cdp: CDPSession) {}
  async send(type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel', point?: Point) {
    const touchPoints = point ? [{ ...point, id: 1 }] : [];
    if (type === 'touchStart') expect(this.active, 'the previous contact must be released').toBe(false);
    this.maxPointers = Math.max(this.maxPointers, touchPoints.length);
    expect(touchPoints.length).toBeLessThanOrEqual(1);
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    this.active = touchPoints.length > 0;
    this.events.push({ type, point });
  }
  async center(target: Locator): Promise<Point> {
    const box = await target.boundingBox({ timeout: 5000 }); expect(box).not.toBeNull();
    return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  }
  async release() { if (this.active) await this.send('touchEnd'); }
  async tap(target: Locator) {
    this.actions.push({ kind: 'tap', target: target.toString() });
    await this.release(); await this.send('touchStart', await this.center(target)); await this.send('touchEnd');
  }
  async drag(target: Locator, dx: number, dy: number) {
    this.actions.push({ kind: 'drag', target: target.toString() });
    await this.release(); const origin = await this.center(target);
    await this.send('touchStart', origin);
    await this.send('touchMove', { x: origin.x + dx, y: origin.y + dy });
    return origin;
  }
}

for (const profile of [{ width: 393, height: 851, hand: 'right' }, { width: 320, height: 568, hand: 'left' }] as const) {
  test(`one real thumb switches both starter wands, hits a seeded enemy and evades (${profile.width} ${profile.hand})`, async ({ page, context }, info) => {
    test.skip(info.project.name !== 'android-chromium', 'Trusted single-touch phone acceptance');
    test.setTimeout(120000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize(profile);
    const startedAt = Date.now();
    await page.goto('/?seed=3397');
    const thumb = new Thumb(page, await context.newCDPSession(page));
    await thumb.tap(page.getByRole('button', { name: '新しい世界を作る', exact: true }));
    const cave = page.locator('#cave'), pad = page.locator('#thumb-pad');
    const slot = (index: number) => page.locator(`button[data-wand-slot="${index}"]`);
    const world = async () => JSON.parse((await cave.getAttribute('data-survival'))!) as WorldState;
    const combat = async () => await cave.evaluate(element => (element as HTMLCanvasElement & { readonly combatSnapshot: CombatState }).combatSnapshot);
    const snapshots: unknown[] = []; let combatActionStart = 0;
    const capture = async (label: string) => {
      const state = { label, wallMs: Date.now() - startedAt, world: await world(), combat: await combat(), paused: await cave.getAttribute('data-paused') };
      expect(state.combat.enemies.length).toBeLessThanOrEqual(16);
      expect(state.combat.projectiles.length).toBeLessThanOrEqual(24);
      snapshots.push(state); return state;
    };
    const gameWait = async (seconds: number) => {
      const since = (await world()).time;
      await page.waitForFunction(({ since, seconds }) => {
        const raw = document.querySelector<HTMLCanvasElement>('#cave')?.dataset.survival;
        return raw !== undefined && JSON.parse(raw).time - since >= seconds;
      }, { since, seconds }, { timeout: 12000 });
    };
    const mode = async (value: 'travel' | 'work') => {
      await thumb.release();
      if (await cave.getAttribute('data-thumb-mode') !== value) await thumb.tap(page.locator(`button[data-thumb-mode="${value}"]`));
    };
    const aimPick = async (x: number, y: number) => {
      await mode('work'); const s = await world(), dx = x - s.x, dy = y - s.y + 1, distance = Math.hypot(dx, dy);
      await thumb.drag(pad, dx / distance * 38, dy / distance * 38);
      await gameWait(.5); await thumb.release();
    };
    try {
      if (profile.hand === 'left') {
        await thumb.tap(page.locator('#thumb-menu'));
        await thumb.tap(page.locator('[data-tab="settings"]'));
        await page.locator('#control-hand').selectOption('left');
        await thumb.tap(page.getByRole('button', { name: '世界に戻る', exact: true }));
      }
      await expect(cave).toHaveAttribute('data-control-hand', profile.hand);
      await expect(cave).toHaveAttribute('data-control-layout', 'one-hand');
      await expect(slot(0)).toBeVisible(); await expect(slot(1)).toBeVisible();
      expect((await combat()).assistEnabled).toBe(false);
      // A tap selects a specific wand, never cycles an unknown previous weapon.
      await thumb.tap(slot(1)); await expect.poll(async () => (await combat()).selected).toBe(1);
      await gameWait(.35); expect((await combat()).ammo.bomb).toBe(6); expect((await combat()).wands[1].cursor).toBe(0);
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      // The limited/explosive starter deck must remain manual while moving.
      await thumb.drag(pad, -25, -35); await gameWait(.25); await thumb.release();
      expect((await combat()).wands[1].cursor).toBe(0); expect((await combat()).ammo.bomb).toBe(6);
      await thumb.tap(page.locator('[data-quick-tool="pick"]'));
      await mode('travel');
      // Fly over the real entrance tree and approach the original seeded cave.
      await thumb.drag(pad, 24, -38);
      await page.waitForFunction(() => Number(document.querySelector<HTMLCanvasElement>('#cave')?.dataset.playerX) > 98, undefined, { timeout: 25000 });
      await thumb.release();
      // Correct a late release that lands against the reservoir lip, using
      // the same ordinary movement rather than rewriting the player position.
      if ((await world()).x > 105) {
        await thumb.drag(pad, -20, 0);
        await page.waitForFunction(() => Number(document.querySelector<HTMLCanvasElement>('#cave')?.dataset.playerX) < 102, undefined, { timeout: 5000 });
        await thumb.release();
      }
      await expect.poll(async () => (await world()).y, { intervals: [70], timeout: 8000 }).toBeGreaterThan(28);
      await gameWait(.2);
      await capture('surface-entry');
      // Open an ordinary pickaxe-width shaft. It takes several adjacent cuts to
      // fit the unchanged player collider through the three-cell surface floor.
      for (const offset of [-2, 2, 0, -2, 2, 0]) {
        const s = await world();
        if ((await combat()).enemies.some(enemy => enemy.id === 0 && enemy.onScreen && enemy.lineOfSight)) break;
        await aimPick(Math.floor(s.x) + offset, Math.max(36, s.y + 6));
      }
      await expect.poll(async () => (await combat()).enemies.some(enemy => enemy.id === 0 && enemy.onScreen && enemy.lineOfSight), { timeout: 6000 }).toBe(true);
      expect((await world()).resources.stone).toBeGreaterThan(0);
      // Stop on the actual ledge or cave floor before choosing manual aim.
      // LOS can open during a fall; do not keep mining after it opens or assume
      // one fixed altitude, since the shaft lip may still support the player.
      let settled = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const y = (await world()).y; await gameWait(.2);
        if (Math.abs((await world()).y - y) < .5) { settled = true; break; }
      }
      expect(settled).toBe(true);
      combatActionStart = thumb.actions.length;
      const beforeManual = await capture('visible-seeded-moth');
      const enemy = beforeManual.combat.enemies.find(enemy => enemy.id === 0)!;
      expect(enemy.hp).toBe(enemy.maxHp); expect(enemy.kind).toBe('moth');
      // Drag directly from quickslot 2. Its hazardous deck permits one cast
      // per gesture, so holding beyond cooldown must not consume the bomb.
      // Mana/UI changes alone are not accepted as a hit.
      const s = await world(), dx = enemy.x - s.x, dy = enemy.y - s.y + 1, distance = Math.hypot(dx, dy);
      await thumb.drag(slot(1), dx / distance * 38, dy / distance * 38);
      await expect(cave).toBeVisible();
      await expect(slot(0)).toBeVisible();
      await expect.poll(async () => (await combat()).wands[1].cursor, { intervals: [30], timeout: 3000 }).toBe(1);
      await gameWait(.5);
      expect((await combat()).wands[1].cursor).toBe(1);
      expect((await combat()).ammo.bomb).toBe(6);
      await thumb.release();
      await expect(cave).toHaveAttribute('data-thumb-mode', 'travel');
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      await expect.poll(async () => (await combat()).enemies.find(enemy => enemy.id === 0)?.hp, { intervals: [30], timeout: 4000 }).toBe(enemy.hp - 5);
      expect((await combat()).ammo.bomb).toBe(6);
      await capture('wand-2-confirmed-enemy-impact');
      await page.screenshot({ path: info.outputPath('wand-2-real-enemy-hit.png') });
      // Switch beside the pad. The ordinary wand still requires explicit
      // opt-in: moving with a visible wounded enemy must not shoot while OFF.
      await thumb.tap(slot(0)); await expect.poll(async () => (await combat()).selected).toBe(0);
      expect((await combat()).assistEnabled).toBe(false);
      await thumb.drag(pad, -16, 0); await gameWait(.15); await thumb.release();
      expect((await combat()).wands[0].cursor).toBe(0);
      expect((await combat()).enemies.find(enemy => enemy.id === 0)?.hp).toBe(enemy.hp - 5);
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      await capture('live-target-assist-off-no-shot');
      await thumb.tap(page.locator('#combat-toggle'));
      await expect.poll(async () => (await combat()).assistEnabled).toBe(true);
      // The same thumb opts in locally, then moves/flies and causes a real hit.
      const beforeEvasion = await world();
      await thumb.drag(pad, -34, -38);
      await expect(cave).toHaveAttribute('data-input-fly', 'true');
      await expect.poll(async () => Number(await cave.getAttribute('data-input-move'))).toBeLessThan(0);
      await expect.poll(async () => {
        const state = await combat(), target = state.enemies.find(enemy => enemy.id === 0);
        return target ? target.hp < enemy.hp - 5 : state.kills > beforeManual.combat.kills;
      }, { intervals: [30], timeout: 5000 }).toBe(true);
      await gameWait(.25);
      await thumb.release();
      const afterEvasion = await capture('wand-1-moving-enemy-impact');
      expect(afterEvasion.world.x).toBeLessThan(beforeEvasion.x - 3);
      expect(afterEvasion.world.y).toBeLessThan(beforeEvasion.y - 2);
      const wounded = afterEvasion.combat.enemies.find(enemy => enemy.id === 0);
      expect(wounded ? wounded.hp <= enemy.hp - 5 - 13 : afterEvasion.combat.kills > beforeManual.combat.kills).toBe(true);
      expect(afterEvasion.combat.wands[0].cursor).toBeGreaterThan(0);
      expect(afterEvasion.combat.ammo.bomb).toBe(6);
      expect(afterEvasion.world.deaths).toBe(0); expect(afterEvasion.world.hp).toBeGreaterThan(0);
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      await expect(cave).toHaveAttribute('data-input-move', '0');
      await page.screenshot({ path: info.outputPath('one-thumb-combat-evasion.png') });
      await thumb.tap(slot(1));
      await expect.poll(async () => (await combat()).assistedTarget).toBeNull();
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      await expect(page.locator('#combat-toggle')).toBeDisabled();
      await thumb.drag(pad, -20, 0); await gameWait(.3); await thumb.release();
      expect((await combat()).wands[1].cursor).toBe(1);
      expect((await combat()).ammo.bomb).toBe(6);
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      await capture('unsafe-switch-clears-assist-without-bomb');
      expect(thumb.actions.slice(combatActionStart).every(action => !/menu|settings|equipment/.test(action.target))).toBe(true);
      expect(thumb.maxPointers).toBe(1); expect(errors).toEqual([]);
    } finally {
      await thumb.release();
      const receipt = info.outputPath('one-thumb-combat-receipt.json');
      await writeFile(receipt, JSON.stringify({ profile, startedAt, maxPointers: thumb.maxPointers, snapshots, combatActions: thumb.actions.slice(combatActionStart), finalWorld: await world().catch(() => null), finalCombat: await combat().catch(() => null), inputEvents: thumb.events }, null, 2));
      await info.attach('one-thumb-combat-receipt.json', { path: receipt, contentType: 'application/json' });
    }
  });
}

test('quickslots are reachable, explicit and cancel-safe on both hands at 320 and 393 pixels', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'android-chromium', 'Phone reach and trusted cancellation');
  test.setTimeout(90000);
  await page.goto('/?seed=3397');
  const thumb = new Thumb(page, await context.newCDPSession(page));
  await thumb.tap(page.getByRole('button', { name: '新しい世界を作る', exact: true }));
  const cave = page.locator('#cave'), pad = page.locator('#thumb-pad');
  const combat = async () => await cave.evaluate(element => (element as HTMLCanvasElement & { readonly combatSnapshot: CombatState }).combatSnapshot);
  const receipts: unknown[] = [];
  for (const viewport of [{ width: 393, height: 851 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    for (const hand of ['right', 'left']) {
      await thumb.tap(page.locator('#thumb-menu'));
      await thumb.tap(page.locator('[data-tab="settings"]'));
      await page.locator('#control-hand').selectOption(hand);
      await thumb.tap(page.getByRole('button', { name: '世界に戻る', exact: true }));
      await expect(cave).toHaveAttribute('data-control-hand', hand);
      // Regression: work-mode metadata also exists on MAIN and CANVAS. Mode
      // visibility updates must only hide the button, never either play surface.
      for (const index of [0, 1, 0]) {
        await thumb.tap(page.locator('[data-quick-tool="pick"]'));
        await expect(cave).toHaveAttribute('data-thumb-mode', 'work');
        await expect(page.locator('main.survival')).toBeVisible();
        await thumb.tap(page.locator(`button[data-wand-slot="${index}"]`));
        await expect.poll(async () => (await combat()).selected).toBe(index);
        await expect(page.locator('main.survival')).toBeVisible();
        await expect(cave).toBeVisible();
        await expect(cave).toHaveAttribute('data-thumb-mode', 'travel');
      }
      const padCenter = await thumb.center(pad), boxes: unknown[] = [];
      for (const index of [0, 1]) {
        const button = page.locator(`button[data-wand-slot="${index}"]`), box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(48); expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        const center = await thumb.center(button);
        expect(Math.hypot(center.x - padCenter.x, center.y - padCenter.y)).toBeLessThan(140);
        expect(hand === 'right' ? center.x > viewport.width / 2 : center.x < viewport.width / 2).toBe(true);
        await thumb.tap(button);
        await expect.poll(async () => (await combat()).selected).toBe(index);
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(cave).toHaveAttribute('data-thumb-mode', 'travel');
        await expect(cave).toHaveAttribute('data-input-fire', 'false');
        boxes.push({ index, ...box });
      }
      const dangerous = page.locator('button[data-wand-slot="1"]');
      // Holding without a direction is only selection, even well past the dwell.
      await thumb.send('touchStart', await thumb.center(dangerous));
      await page.waitForTimeout(350); await thumb.release();
      expect((await combat()).wands[1].cursor).toBe(0);
      // Record browser-delivered timing. Node/CDP round-trip time does not prove
      // a touch was canceled before the 120 ms manual-fire grace elapsed.
      await dangerous.evaluate(element => {
        const events: { type: string; at: number; trusted: boolean }[] = [], abort = new AbortController();
        for (const type of ['pointermove', 'pointercancel']) element.addEventListener(type, event => {
          events.push({ type, at: performance.now(), trusted: event.isTrusted });
          (element as HTMLElement).dataset.cancelReceipt = JSON.stringify(events);
          if (type === 'pointercancel') abort.abort();
        }, { signal: abort.signal });
      });
      const origin = await thumb.center(dangerous);
      await thumb.send('touchStart', origin);
      await Promise.all([thumb.send('touchMove', { x: origin.x + 36, y: origin.y }), thumb.send('touchCancel')]);
      thumb.active = false;
      const cancel = JSON.parse((await dangerous.getAttribute('data-cancel-receipt'))!) as { type: string; at: number; trusted: boolean }[];
      expect(cancel.map(event => event.type)).toEqual(['pointermove', 'pointercancel']);
      expect(cancel.every(event => event.trusted)).toBe(true);
      expect(cancel[1].at - cancel[0].at).toBeGreaterThanOrEqual(0);
      expect(cancel[1].at - cancel[0].at).toBeLessThan(120);
      await page.waitForTimeout(250);
      await expect(cave).toHaveAttribute('data-input-fire', 'false');
      await expect(cave).toHaveAttribute('data-input-move', '0');
      await expect(cave).toHaveAttribute('data-thumb-mode', 'travel');
      const state = await combat();
      expect(state.wands.map(wand => wand.cursor)).toEqual([0, 0]);
      expect(state.ammo.bomb).toBe(6); expect(state.projectiles).toEqual([]);
      await page.screenshot({ path: info.outputPath(`quickslots-${viewport.width}-${hand}.png`) });
      receipts.push({ viewport, hand, boxes, cancel, combat: state });
    }
  }
  expect(thumb.maxPointers).toBe(1);
  const receipt = info.outputPath('quickslot-reach-and-cancel.json');
  await writeFile(receipt, JSON.stringify({ maxPointers: thumb.maxPointers, receipts }, null, 2));
  await info.attach('quickslot-reach-and-cancel.json', { path: receipt, contentType: 'application/json' });
});
