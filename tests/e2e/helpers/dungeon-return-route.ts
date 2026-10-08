import {expect, type Locator, type Page} from '@playwright/test';
import type {Snapshot} from '../../../src/dungeon/types';
import {own, read} from './dungeon-raid-controls';
import {dungeonApproachDeflection, dungeonApproachWait} from './dungeon-touch-approach';

/** The same ordinary, fixed-yaw western route exercised by dungeon-resupply. */
export class DungeonReturnRoute {
  constructor(readonly page: Page, readonly mobile: boolean) {}

  async activate(control: Locator) {
    await control.scrollIntoViewIfNeeded();
    if (this.mobile) await control.tap();
    else await control.click();
  }

  async state() {
    const snapshot = await read(this.page);
    if (!snapshot) throw new Error('No authoritative dungeon snapshot');
    return snapshot;
  }

  async until(predicate: (snapshot: Snapshot) => boolean, message: string, timeout = 15000) {
    let snapshot: Snapshot | undefined;
    await expect.poll(async () => {
      const next = await read(this.page);
      if (!next) return false;
      snapshot = next;
      return predicate(next);
    }, {message, timeout, intervals: [50, 100, 200]}).toBe(true);
    return snapshot!;
  }

  async inventory(open: boolean) {
    const panel = this.page.getByTestId('dungeon-inventory');
    if (await panel.isVisible() === open) return;
    await this.activate(open ? this.page.getByTestId('dungeon-bag-toggle')
      : this.page.getByRole('button', {name: '閉じる · I / Esc', exact: true}));
    if (open) await expect(panel).toBeVisible();
    else await expect(panel).toBeHidden();
  }

  async walk(x: number, z: number) {
    const session = this.mobile ? await this.page.context().newCDPSession(this.page) : null;
    try {
      for (let step = 0; step < 70; step++) {
        const actor = own(await this.state());
        expect(actor.status, 'The west route must be survived normally').toBe('alive');
        expect(actor.hp).toBeGreaterThan(0);
        expect(Math.abs(actor.yaw), 'Movement uses the real starting camera direction').toBeLessThan(.01);
        const dx = x - actor.position.x, dz = z - actor.position.z;
        if (Math.hypot(dx, dz) < .35) return;
        const horizontal = Math.abs(dx) > Math.abs(dz);
        const positive = horizontal ? dx > 0 : dz < 0;
        const ms = Math.max(70, Math.min(200, (horizontal ? Math.abs(dx) : Math.abs(dz)) / 3 * 650));
        if (session) {
          const bounds = await this.page.locator('[data-dungeon-pad=move]').boundingBox();
          if (!bounds) throw new Error('The ordinary movement pad is missing');
          const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
          const deflection = dungeonApproachDeflection(horizontal ? dx : dz);
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchStart', touchPoints: [{id: 1, x: cx, y: cy, radiusX: 4, radiusY: 4, force: 1}],
          });
          const started = Date.now();
          await session.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: [{id: 1,
              x: cx + (horizontal ? (positive ? deflection : -deflection) : 0),
              y: cy + (!horizontal ? (positive ? -deflection : deflection) : 0), radiusX: 4, radiusY: 4, force: 1}],
          });
          const remaining = dungeonApproachWait(Date.now() - started);
          if (remaining) await this.page.waitForTimeout(remaining);
          await session.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
        } else {
          const key = horizontal ? (positive ? 'KeyD' : 'KeyA') : (positive ? 'KeyW' : 'KeyS');
          await this.page.keyboard.press(key, {delay: ms});
        }
        await this.page.waitForTimeout(160);
      }
      throw new Error(`The west route did not reach ${x},${z}: ${JSON.stringify(own(await this.state()).position)}`);
    } finally {
      if (session) {
        await session.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []}).catch(() => {});
        await session.detach();
      }
    }
  }

  async extract() {
    await this.walk(-12, 12);
    const before = await this.state();
    expect(before.exits.find(exit => exit.id === 'exit-west')?.opensAt).toBe(45);
    await this.until(snapshot => {
      expect(own(snapshot).status, 'Waiting for the actual exit must preserve survival').toBe('alive');
      return snapshot.elapsed >= 45;
    }, 'The real 45-second west exit opening', 60000);
    await this.activate(this.page.locator('[data-target=exit-west]'));
    const extracted = await this.until(snapshot => own(snapshot).status === 'extracted', 'The ordinary four-second extraction completes');
    expect(own(extracted).hp).toBeGreaterThan(0);
    expect(extracted.elapsed).toBeGreaterThanOrEqual(49);
    return this.until(snapshot => snapshot.phase === 'finished', 'The solo raid has settled');
  }
}
