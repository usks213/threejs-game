import {expect, type Page} from '@playwright/test';
import {distance, wallRay} from '../../../src/dungeon/world';
import {closeApproachKey} from './dungeon-approach';
import type {Action, Snapshot} from '../../../src/dungeon/types';

export type Point = {x: number; z: number};
export type Explorer = Snapshot['actors'][number];
export const own = (snapshot: Snapshot): Explorer => {
  const actor = snapshot.actors.find(value => value.id === snapshot.you);
  if (!actor) throw new Error('The authoritative snapshot has no own explorer');
  return actor;
};
export const angle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
export const heading = (actor: Explorer, target: Point) => Math.atan2(-(target.x - actor.position.x), -(target.z - actor.position.z));
export const range = (actor: Explorer, target: Point) => Math.hypot(target.x - actor.position.x, target.z - actor.position.z);
export const read = (page: Page) => page.evaluate(() => window.__dungeonProbe?.() ?? null) as Promise<Snapshot | null>;

/** Observe outgoing normal UI actions only. Never retain hello packets or identity keys. */
export function observeActions(page: Page) {
  const actions: Array<{sequence: number; action: Action}> = [];
  page.on('websocket', socket => socket.on('framesent', ({payload}) => {
    try {
      const packet = JSON.parse(String(payload)) as {type?: string; sequence: number; action: Action};
      if (packet.type === 'action') {
        actions.push({sequence: packet.sequence, action: packet.action});
        if (actions.length > 250) actions.shift();
      }
    } catch { /* A diagnostic observer must not change the connection. */ }
  }));
  return actions;
}

/** All mutations go through real keyboard or mouse input. The probe is read-only. */
export class RaidControls {
  private held = new Set<string>();
  constructor(readonly page: Page, readonly name: string, readonly routeBudget = 240) {}

  async state() {
    const snapshot = await read(this.page);
    if (!snapshot) throw new Error(`${this.name}: no authoritative snapshot`);
    if (snapshot.phase === 'raid') expect(snapshot.elapsed, `${this.name}: route exceeded ${this.routeBudget} server seconds`).toBeLessThan(this.routeBudget);
    return snapshot;
  }

  async until(predicate: (snapshot: Snapshot) => boolean, description: string, timeout = 10000) {
    let snapshot: Snapshot | undefined;
    await expect.poll(async () => {
      // Joining and reloading legitimately have no snapshot until the first
      // server response. Poll that state instead of treating it as an error.
      const next = await read(this.page);
      if (!next) return false;
      snapshot = next;
      if (snapshot.phase === 'raid') expect(snapshot.elapsed, `${this.name}: route exceeded ${this.routeBudget} server seconds`).toBeLessThan(this.routeBudget);
      return predicate(snapshot);
    }, {message: `${this.name}: ${description}`, timeout, intervals: [50, 75, 100]}).toBe(true);
    return snapshot!;
  }

  async next(after: Snapshot, timeout = 5000) {
    return this.until(snapshot => snapshot.tick > after.tick || snapshot.phase !== after.phase, `server tick after ${after.tick}`, timeout);
  }

  async keys(next: string[] = []) {
    const requested = new Set(next);
    for (const key of this.held) if (!requested.has(key)) await this.page.keyboard.up(key);
    for (const key of requested) if (!this.held.has(key)) await this.page.keyboard.down(key);
    this.held = requested;
  }

  async stop() { await this.keys(); }

  async press(key: string) {
    const before = await this.state();
    await this.page.keyboard.press(key);
    return this.until(snapshot => snapshot.lastAction > before.lastAction, `${key} acknowledged by the server`, 6000);
  }

  private steering(actor: Explorer, target: Point, forward: boolean, guard = false) {
    const error = angle(heading(actor, target) - actor.yaw);
    return {
      error,
      keys: [...(Math.abs(error) > .12 ? [error > 0 ? 'Home' : 'End'] : []),
        ...(forward && Math.abs(error) < .3 ? ['KeyW'] : []), ...(guard ? ['KeyZ'] : [])],
    };
  }

  async face(target: Point) {
    const deadline = Date.now() + 10000;
    try {
      while (Date.now() < deadline) {
        const snapshot = await this.state();
        const actor = own(snapshot);
        expect(actor.status, `${this.name}: turning toward ${JSON.stringify(target)}`).toBe('alive');
        const steering = this.steering(actor, target, false);
        if (Math.abs(steering.error) <= .12) {
          await this.stop();
          const settled = await this.next(snapshot);
          if (Math.abs(angle(heading(own(settled), target) - own(settled).yaw)) <= .2) return;
          continue;
        }
        await this.keys(steering.keys);
        await this.next(snapshot);
      }
      throw new Error(`${this.name}: camera did not settle toward ${JSON.stringify(target)}`);
    } finally { await this.stop(); }
  }

  async walk(target: Point, tolerance = .2) {
    const deadline = Date.now() + 45000;
    try {
      while (Date.now() < deadline) {
        const snapshot = await this.state();
        const actor = own(snapshot);
        expect(actor.status, `${this.name}: walking to ${JSON.stringify(target)}`).toBe('alive');
        if (range(actor, target) <= tolerance) {
          await this.stop();
          const settled = await this.next(snapshot);
          if (range(own(settled), target) <= tolerance + .12) return;
          continue;
        }
        const threat = snapshot.enemies.find(enemy => enemy.status === 'alive' && distance(actor.position, enemy.position) < 6 && !wallRay(
          {...actor.position, y: 1.4}, {...enemy.position, y: 1.4}, snapshot.seed, snapshot.doors,
        ));
        if (threat) {
          await this.fight(threat.id);
          await this.recover();
          continue;
        }
        if (range(actor, target) < 1.5) {
          // Full-speed held forward can cross a 15cm waypoint during one delayed
          // snapshot. A short crouched strafe/backstep needs no 180-degree turn.
          await this.stop();
          const stationary = own(await this.next(snapshot));
          if (range(stationary, target) <= tolerance) continue;
          const key = closeApproachKey(stationary.yaw, target.x - stationary.position.x, target.z - stationary.position.z);
          await this.keys(['KeyC', key]);
          await this.page.waitForTimeout(70);
          // Release motion before the crouch modifier, so a rate-limited key
          // update cannot briefly send an unintended full-speed movement.
          await this.keys(['KeyC']);
          await this.stop();
          const released = await this.state();
          await this.until(next => next.tick >= released.tick + 4, 'close approach has settled');
        } else {
          await this.keys(this.steering(actor, target, true).keys);
          await this.next(snapshot);
        }
      }
      throw new Error(`${this.name}: ordinary movement stalled at ${JSON.stringify(own(await this.state()).position)} en route to ${JSON.stringify(target)}`);
    } finally { await this.stop(); }
  }

  private nearestThreat(snapshot: Snapshot, radius = 6) {
    const actor = own(snapshot);
    return snapshot.enemies.filter(enemy => enemy.status === 'alive' && range(actor, enemy.position) < radius && !wallRay(
      {...actor.position, y: 1.4}, {...enemy.position, y: 1.4}, snapshot.seed, snapshot.doors,
    )).sort((a, b) => range(actor, a.position) - range(actor, b.position))[0];
  }

  async fight(enemyId: string) {
    const deadline = Date.now() + 30000;
    try {
      while (Date.now() < deadline) {
        const snapshot = await this.state();
        const actor = own(snapshot);
        const enemy = snapshot.enemies.find(value => value.id === enemyId);
        expect(actor.status, `${this.name}: fighting ${enemyId}, HP ${actor.hp}`).toBe('alive');
        if (!enemy) throw new Error(`Missing initial enemy ${enemyId}`);
        if (enemy.status === 'dead') {
          const next = this.nearestThreat(snapshot);
          if (!next) return;
          // Treat a close group as one encounter. Keep guarding and turn toward
          // the next attacker during recovery instead of drinking beside it.
          enemyId = next.id;
          continue;
        }
        const d = range(actor, enemy.position);
        const steering = this.steering(actor, enemy.position, d > 1.35, true);
        await this.keys(steering.keys);
        // Keeping Z held is ordinary input. The server must lower the shield
        // during windup/strike/recovery; this test never edits guard or HP.
        if (actor.phase === 'idle' && d < 1.65 && Math.abs(steering.error) < .2 && (enemy.phase === 'idle' || enemy.phase === 'recover')) {
          await this.press('KeyR');
        }
        await this.next(snapshot);
      }
      throw new Error(`${this.name}: combat stalled against ${enemyId}: ${JSON.stringify(own(await this.state()))}`);
    } finally { await this.stop(); }
  }

  async recover(missingThreshold = 30) {
    let snapshot = await this.state();
    if (this.nearestThreat(snapshot)) return;
    await this.stop();
    snapshot = await this.state();
    if (this.nearestThreat(snapshot) || own(snapshot).hp >= own(snapshot).maxHp - missingThreshold) return;
    snapshot = await this.until(state => own(state).status !== 'alive' || own(state).phase === 'idle', 'recovery is available');
    expect(own(snapshot).status).toBe('alive');
    if (this.nearestThreat(snapshot)) return;
    const actor = own(snapshot);
    const medicine = actor.bag.some(item => item.kind === 'potion' || item.kind === 'bandage');
    expect(medicine || actor.spells > 0, `${this.name}: normal healing resources remain`).toBe(true);
    await this.press(medicine ? 'KeyQ' : 'KeyG');
    await this.until(state => own(state).status !== 'alive' || own(state).phase === 'idle', 'healing animation has finished');
    expect(own(await this.state()).status).toBe('alive');
  }

  async open(target: string) {
    await this.stop();
    let snapshot = await this.state();
    const container = snapshot.containers.find(value => value.id === target);
    if (container?.opened) return;
    // Do not toggle a door or restart an already running interaction on retry.
    if (snapshot.doors.find(value => value.id === target)?.open) return;
    if (own(snapshot).interaction !== target) {
      let control = this.page.locator(`[data-target="${target}"]`);
      // The compact desktop HUD shows only the nearest target. Walk up to a
      // container normally if another nearby object currently hides its row.
      if (container && !await control.isVisible()) {
        await this.walk(container.position, .15);
        snapshot = await this.state();
        control = this.page.locator(`[data-target="${target}"]`);
      }
      const sequence = snapshot.lastAction;
      if (await control.isVisible()) await control.click();
      else {
        const position = container?.position ?? snapshot.doors.find(value => value.id === target)?.position;
        if (!position) throw new Error(`No reachable interaction target ${target}`);
        // The ordinary E focus has a 2.6 m reach, while the nearby UI uses 2.2 m.
        await this.face(position);
        await this.page.keyboard.press('KeyE');
      }
      snapshot = await this.until(state => state.lastAction > sequence, `${target} interaction acknowledged`);
    }
    await this.until(state => !!state.containers.find(value => value.id === target)?.opened || !!state.doors.find(value => value.id === target)?.open, `${target} opened with ordinary interaction`);
  }

  async inventory(open: boolean) {
    await this.stop();
    const toggle = this.page.getByTestId('dungeon-bag-toggle');
    if ((await toggle.getAttribute('aria-expanded') === 'true') !== open) {
      if (open) await toggle.click();
      else await this.page.getByRole('button', {name: '閉じる · I / Esc', exact: true}).click();
    }
    await expect(toggle).toHaveAttribute('aria-expanded', String(open));
  }

  async loot(target: string, item: string) {
    await this.inventory(true);
    const before = await this.state();
    await this.page.locator(`[data-loot-target="${target}"][data-loot-item="${item}"]`).click();
    await this.until(snapshot => snapshot.lastAction > before.lastAction && own(snapshot).bag.some(value => value.id === item), `${item} moved from ${target} into the bag`);
    await this.inventory(false);
  }
}
