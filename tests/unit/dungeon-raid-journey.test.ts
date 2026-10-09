import {describe, expect, it} from 'vitest';
import {DungeonServer, validDungeonCheckpoint, type DungeonCheckpoint, type DungeonPort} from '../../src/dungeon/server';
import {distance, wallRay} from '../../src/dungeon/world';
import type {Action, Actor, Input, Snapshot} from '../../src/dungeon/types';

type Point = {x: number; z: number};
const keys = ['a'.repeat(64), 'b'.repeat(64)];
const neutral = (yaw = 0): Input => ({x: 0, z: 0, yaw, pitch: 0, block: false, crouch: false});

/** Only the public wire protocol and the server clock can change gameplay state. */
class Journey {
  now = 1000;
  checkpoint: DungeonCheckpoint | undefined;
  save = async (checkpoint: DungeonCheckpoint) => {
    expect(validDungeonCheckpoint(checkpoint)).toBe(true);
    this.checkpoint = JSON.parse(JSON.stringify(checkpoint)) as DungeonCheckpoint;
  };
  server = new DungeonServer({save: this.save}, () => this.now);
  inputs = [0, 0];
  actions = [0, 0];
  snapshots: Array<Snapshot | undefined> = [];
  notices = ['', ''];
  closed: Array<{code: number; reason: string}> = [];

  port(player: number): DungeonPort {
    return {
      send: text => {
        const packet = JSON.parse(text) as {type: 'snapshot'; snapshot: Snapshot} | {type: 'notice'; message: string};
        if (packet.type === 'snapshot') this.snapshots[player] = packet.snapshot;
        else this.notices[player] = packet.message;
      },
      close: (code, reason) => {this.closed.push({code, reason});},
    };
  }
  actor(player: number): Actor {return this.server.sim.state.profiles[player].actor;}
  async join() {
    for (const player of [0, 1]) {
      this.server.connect(String(player), this.port(player));
      await this.server.receive(String(player), JSON.stringify({type: 'hello', protocol: 1, key: keys[player], name: ['帰還する探索者', '対抗する探索者'][player]}));
    }
    await this.action(0, {kind: 'class', classId: 'keeper'});
    await this.action(1, {kind: 'class', classId: 'keeper'});
    await this.action(0, {kind: 'ready'});
    await this.action(1, {kind: 'ready'});
    expect(await this.action(0, {kind: 'start'})).toBe('遠征を開始しました');
  }
  async action(player: number, action: Action) {
    await this.server.receive(String(player), JSON.stringify({type: 'action', sequence: ++this.actions[player], action}));
    expect(this.closed).toEqual([]);
    return this.notices[player];
  }
  async tick(intents: Partial<Record<number, Partial<Input>>> = {}) {
    for (const player of [0, 1]) {
      if (this.actor(player).status !== 'alive') continue;
      const input = {...neutral(this.actor(player).yaw), ...intents[player]};
      await this.server.receive(String(player), JSON.stringify({type: 'input', sequence: ++this.inputs[player], input}));
    }
    this.now += 50;
    await this.server.tick();
    expect(this.closed).toEqual([]);
    expect(this.server.sim.state.elapsed).toBeLessThan(240);
  }
  face(player: number, point: Point) {
    const here = this.actor(player).position;
    return Math.atan2(-(point.x - here.x), -(point.z - here.z));
  }
  async wait(seconds: number) {for (let tick = 0; tick < seconds * 20; tick++) await this.tick();}
  async recover(player: number) {
    if (this.actor(player).hp >= this.actor(player).maxHp - 30) return;
    while (this.actor(player).phase !== 'idle') await this.tick();
    if (this.actor(player).bag.some(item => item.kind === 'potion' || item.kind === 'bandage')) expect(await this.action(player, {kind: 'heal'})).toBe('回復しました');
    else expect(await this.action(player, {kind: 'cast'})).toBe('詠唱中');
    await this.wait(1.25);
  }
  async fight(player: number, enemy: Actor) {
    const before = this.actor(player).damageTaken;
    for (let tick = 0; tick < 400 && enemy.status === 'alive'; tick++) {
      const actor = this.actor(player);
      expect(actor.status, `fight ${enemy.id}: ${JSON.stringify(actor.position)}`).toBe('alive');
      const range = distance(actor.position, enemy.position);
      if (actor.phase === 'idle' && range < 1.65 && (enemy.phase === 'recover' || enemy.phase === 'idle')) await this.action(player, {kind: 'attack', heavy: true});
      await this.tick({[player]: {yaw: this.face(player, enemy.position), z: range > 1.35 ? 1 : 0, block: true}});
    }
    expect(enemy.status, `fight stalled: ${JSON.stringify([this.actor(player), enemy])}`).toBe('dead');
    expect(this.actor(player).damageTaken).toBeGreaterThan(before);
  }
  async walk(player: number, point: Point) {
    for (let tick = 0; tick < 1200; tick++) {
      const actor = this.actor(player);
      expect(actor.status, `walk to ${JSON.stringify(point)}`).toBe('alive');
      if (Math.hypot(actor.position.x - point.x, actor.position.z - point.z) < .2) return;
      const threat = this.server.sim.state.enemies.find(e => e.status === 'alive' && distance(e.position, actor.position) < 6 && !wallRay({...actor.position, y: 1.4}, {...e.position, y: 1.4}, this.server.sim.state.seed, this.server.sim.state.doors));
      if (threat) {await this.fight(player, threat); await this.recover(player); continue;}
      await this.tick({[player]: {yaw: this.face(player, point), z: 1}});
    }
    throw new Error(`walk stalled: ${JSON.stringify({player, point, actor: this.actor(player)})}`);
  }
  async open(player: number, target: string) {
    expect(await this.action(player, {kind: 'interact', target})).toContain('探索中');
    await this.wait(1.6);
    expect(this.server.sim.state.containers.find(c => c.id === target)?.opened).toBe(true);
  }
}

describe('dungeon G2 ordinary-input full raid journey', () => {
  it('walks both players through PvE, contested loot, PvP death, extraction and durable reconnect', async () => {
    const journey = new Journey();
    await journey.join();
    await journey.walk(0, {x: -12, z: 7});
    await journey.open(0, 'chest0');
    const key = journey.server.sim.state.containers[0].items.find(item => item.kind === 'key')!;
    expect(await journey.action(0, {kind: 'loot', target: 'chest0', item: key.id})).toContain('拾いました');
    await journey.walk(0, {x: -4, z: 11});
    await journey.walk(0, {x: 0, z: 7.5});
    await journey.walk(1, {x: 0, z: -11});
    await journey.walk(1, {x: 0, z: -7});
    expect(await journey.action(0, {kind: 'interact', target: 'door-south'})).toBe('扉を開きました');
    await journey.walk(0, {x: 0, z: 2});
    expect(await journey.action(1, {kind: 'interact', target: 'door-north'})).toBe('扉を開きました');
    await journey.walk(1, {x: 0, z: -2});
    expect(journey.server.sim.state.enemies.every(enemy => enemy.status === 'dead')).toBe(true);
    // A carried key must unlock the central chest through a real interaction.
    expect(journey.server.sim.state.containers.find(container => container.id === 'chest4')!.locked).toBe(true);
    await journey.open(0, 'chest4');
    expect(journey.actor(0).bag.some(item => item.id === key.id)).toBe(false);
    expect(journey.server.sim.state.containers.find(container => container.id === 'chest4')!.locked).toBe(false);
    const relic = journey.server.sim.state.containers.find(container => container.id === 'chest4')!.items[0];
    expect(await journey.action(1, {kind: 'loot', target: 'chest4', item: relic.id})).toContain('拾いました');
    expect(await journey.action(0, {kind: 'loot', target: 'chest4', item: relic.id})).toContain('品物がない');
    expect(journey.actor(1).bag.filter(item => item.id === relic.id)).toHaveLength(1);
    expect(journey.actor(0).bag.some(item => item.id === relic.id)).toBe(false);
    const guardCorpse = journey.server.sim.state.containers.find(container => container.id === 'corpse-e0-1')!;
    await journey.walk(0, {x: guardCorpse.position.x + 1, z: guardCorpse.position.z});
    await journey.walk(1, {x: guardCorpse.position.x - 1, z: guardCorpse.position.z});
    await journey.open(0, guardCorpse.id);
    const guardRelic = guardCorpse.items.find(item => item.kind === 'relic')!;
    expect(await journey.action(0, {kind: 'loot', target: guardCorpse.id, item: guardRelic.id})).toContain('拾いました');
    expect(await journey.action(1, {kind: 'loot', target: guardCorpse.id, item: guardRelic.id})).toContain('品物がない');
    expect(journey.actor(0).bag.filter(item => item.id === guardRelic.id)).toHaveLength(1);
    expect(journey.actor(1).bag.some(item => item.id === guardRelic.id)).toBe(false);
    await journey.recover(0);
    await journey.walk(0, {x: guardCorpse.position.x + .65, z: guardCorpse.position.z});
    await journey.walk(1, {x: guardCorpse.position.x - .65, z: guardCorpse.position.z});
    const beforeDuel = [journey.actor(0).damageTaken, journey.actor(1).damageTaken];
    const victimBag = journey.actor(1).bag.map(item => item.id);
    for (let tick = 0; tick < 300 && journey.actor(0).status === 'alive' && journey.actor(1).status === 'alive'; tick++) {
      for (const player of [0, 1]) if (journey.actor(player).phase === 'idle') await journey.action(player, {kind: 'attack', heavy: player === 0});
      await journey.tick({0: {yaw: journey.face(0, journey.actor(1).position)}, 1: {yaw: journey.face(1, journey.actor(0).position)}});
    }
    expect(journey.actor(0).status).toBe('alive');
    expect(journey.actor(1).status).toBe('dead');
    expect(journey.actor(0).kills).toBe(4);
    expect(journey.actor(1).kills).toBe(1);
    for (const player of [0, 1]) expect(journey.actor(player).damageTaken).toBeGreaterThan(beforeDuel[player]);
    expect(journey.actor(1).bag).toEqual([]);
    expect(journey.server.sim.state.profiles[1].stash).toEqual([]);
    const playerCorpse = journey.server.sim.state.containers.find(container => container.id === 'corpse-p2-1')!;
    expect(playerCorpse.items.map(item => item.id)).toEqual(victimBag);
    await journey.open(0, playerCorpse.id);
    expect(await journey.action(0, {kind: 'loot', target: playerCorpse.id, item: relic.id})).toContain('拾いました');
    await journey.walk(0, {x: 0, z: 7.5});
    await journey.walk(0, {x: 0, z: 12});
    await journey.walk(0, {x: -12, z: 12});
    expect(journey.server.sim.state.elapsed).toBeGreaterThan(45);
    expect(await journey.action(0, {kind: 'interact', target: 'exit-west'})).toBe('帰還の光を維持してください');
    const extractionSequence = journey.actions[0];
    const carried = journey.actor(0).bag.map(item => item.id);
    await journey.wait(3.95);
    expect(journey.actor(0).status).toBe('alive');
    expect(journey.server.sim.state.profiles[0].stash).toEqual([]);
    await journey.wait(.15);
    expect(journey.actor(0).status).toBe('extracted');
    expect(journey.server.sim.state.phase).toBe('finished');
    expect(journey.actor(0).bag).toEqual([]);
    expect(journey.server.sim.state.profiles[0].stash.map(item => item.id)).toEqual(carried);
    expect(carried).toContain(relic.id);
    expect(carried).toContain(guardRelic.id);
    expect(validDungeonCheckpoint(journey.checkpoint)).toBe(true);
    expect(journey.server.sim.state.exits.find(exit => exit.id === 'exit-west')!.remaining).toBe(1);
    expect(journey.snapshots[0]!.stash.map(item => item.id)).toEqual(carried);
    expect(journey.checkpoint!.state.profiles[0].stash.map(item => item.id)).toEqual(carried);

    // Simulate a process restart using only the JSON emitted by persistence.
    const serialized = JSON.stringify(journey.checkpoint);
    journey.server = new DungeonServer({save: journey.save}, () => journey.now, JSON.parse(serialized) as DungeonCheckpoint);
    for (const player of [0, 1]) {
      journey.server.connect(String(player), journey.port(player));
      await journey.server.receive(String(player), JSON.stringify({type: 'hello', protocol: 1, key: keys[player], name: '同じ探索者'}));
    }
    expect(journey.server.sim.state.profiles).toHaveLength(2);
    expect(journey.actor(0).status).toBe('extracted');
    expect(journey.actor(1).status).toBe('dead');
    expect(journey.actor(1).bag).toEqual([]);
    expect(journey.snapshots[1]!.stash).toEqual([]);
    expect(journey.snapshots[1]!.result).toContain('死亡');
    expect(journey.snapshots[0]!.result).toContain('帰還成功');
    expect(journey.snapshots[0]!.stash.map(item => item.id)).toEqual(carried);

    // An old extraction packet and a new retry cannot award the bag twice.
    await journey.server.receive('0', JSON.stringify({type: 'action', sequence: extractionSequence, action: {kind: 'interact', target: 'exit-west'}}));
    expect(journey.notices[0]).toBe('処理済みの操作です');
    expect(await journey.action(0, {kind: 'interact', target: 'exit-west'})).toContain('生存者だけ');
    await journey.wait(1);
    const final = journey.server.sim.state;
    const owned = [...final.profiles.flatMap(profile => [...profile.actor.bag, ...profile.stash]), ...final.enemies.flatMap(enemy => enemy.bag), ...final.containers.flatMap(container => container.items)];
    expect(new Set(owned.map(item => item.id)).size).toBe(owned.length);
    expect(owned.filter(item => item.id === relic.id)).toHaveLength(1);
    expect(final.profiles[0].stash.map(item => item.id)).toEqual(carried);
    expect(final.profiles[0].stash.every(item => item.found)).toBe(true);
    expect(final.profiles[1].stash).toEqual([]);
    expect(final.exits.find(exit => exit.id === 'exit-west')!.remaining).toBe(1);
    expect(validDungeonCheckpoint(journey.checkpoint)).toBe(true);
    expect(journey.closed).toEqual([]);
  }, 10000);
});
