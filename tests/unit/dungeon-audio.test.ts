import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDungeonAudio, dungeonAudioCues } from '../../src/dungeon/audio';
import { DungeonSimulation } from '../../src/dungeon/simulation';
import type { Snapshot } from '../../src/dungeon/types';

function snapshot() {
  const sim = new DungeonSimulation(), owner = sim.join('a'.repeat(64), 'Owner')!;
  const value = sim.snapshot(owner.actor.id);
  value.phase = 'raid'; value.raid = 1; value.tick = 20; value.elapsed = 1;
  value.actors[0].status = 'alive'; value.actors[0].position = { x: 0, y: 0, z: 0 };
  value.actors[0].yaw = 0; value.actors[0].pitch = 0;
  value.doors = []; value.containers = [];
  return value;
}
function advance(value: Snapshot) { const next = structuredClone(value); next.tick++; next.elapsed += .05; return next; }
function swing(value: Snapshot) { const next = advance(value); next.actors[0].phase = 'windup'; return next; }
function chest(value: Snapshot) {
  value.containers = [{ id: 'chest', name: 'Chest', kind: 'chest', locked: false, opened: false, items: [], position: { x: 0, y: 0, z: -2 } }];
}
function pickup(value: Snapshot) {
  value.actors[0].bag.push({ id: 'new-loot', kind: 'relic', count: 1, quality: 1, found: false, x: 0, y: 0, rotated: false });
}
afterEach(() => vi.unstubAllGlobals());

describe('confirmed dungeon audio cues', () => {
  it('plays one local windup cue but never invents a hit from a swing or enemy health', () => {
    const before = snapshot(), after = swing(before);
    expect(dungeonAudioCues(before, after)).toEqual(['swing']);
    const continued = advance(after); continued.actors[0].time = .1;
    expect(dungeonAudioCues(after, continued)).toEqual([]);
    const enemy = structuredClone(before.actors[0]); enemy.id = 'other'; enemy.hp = 1;
    continued.actors.push(enemy); expect(dungeonAudioCues(after, continued)).toEqual([]);
    continued.actors[0].phase = 'strike'; expect(dungeonAudioCues(after, continued)).toEqual([]);
  });
  it('uses confirmed local damage, including simultaneous recovery, and prioritizes return', () => {
    const before = snapshot(), after = advance(before);
    before.actors[0].hp = 60; after.actors[0].hp = 75; after.actors[0].damageTaken = 10;
    expect(dungeonAudioCues(before, after)).toEqual(['hurt']);
    after.actors[0].damageTaken = 0; after.actors[0].hp = 40;
    expect(dungeonAudioCues(before, after)).toEqual(['hurt']);
    after.actors[0].status = 'extracted'; after.phase = 'finished';
    expect(dungeonAudioCues(before, after)).toEqual(['return', 'hurt']);
  });
  it('cues pickups only on newly acquired item IDs during a living raid', () => {
    const before = snapshot(), after = advance(before); pickup(after);
    expect(dungeonAudioCues(before, after)).toEqual(['pickup']);
    const moved = advance(after); moved.actors[0].bag[0].x = 2;
    expect(dungeonAudioCues(after, moved)).toEqual([]);
    before.phase = 'lobby'; expect(dungeonAudioCues(before, after)).toEqual([]);
  });
  it('cues a newly opened nearby visible chest, without replaying one already open', () => {
    const before = snapshot(); chest(before); const after = advance(before); after.containers[0].opened = true;
    expect(dungeonAudioCues(before, after)).toEqual(['chest']);
    expect(dungeonAudioCues(after, advance(after))).toEqual([]);
    after.containers[0].kind = 'corpse'; expect(dungeonAudioCues(before, after)).toEqual([]);
  });
  it.each(['far', 'rear', 'wall', 'door', 'offscreen', 'portrait'])('does not reveal a %s chest opening', reason => {
    const before = snapshot(); chest(before); const after = advance(before); after.containers[0].opened = true;
    if (reason === 'far') after.containers[0].position.z = -4;
    if (reason === 'rear') after.containers[0].position.z = 2;
    if (reason === 'wall') { after.actors[0].position = { x: -8, y: 0, z: -4 }; after.containers[0].position = { x: -8, y: 0, z: -6 }; }
    if (reason === 'door') after.doors = [{ id: 'door', open: false, position: { x: 0, y: 0, z: -1 } }];
    if (reason === 'offscreen') after.actors[0].pitch = 1;
    if (reason === 'portrait') after.containers[0].position.x = 1;
    expect(dungeonAudioCues(before, after, reason === 'portrait' ? .4 : 1)).toEqual([]);
  });
  it.each(['join', 'raid', 'owner', 'dead', 'clock', 'tick', 'reconnect'])('does not replay %s state', reason => {
    const before = snapshot(), after = swing(before); pickup(after);
    if (reason === 'raid') after.raid++;
    if (reason === 'owner') after.you = 'other';
    if (reason === 'dead') before.actors[0].status = 'dead';
    if (reason === 'clock') after.elapsed = 0;
    if (reason === 'tick') after.tick = 0;
    if (reason === 'reconnect') after.elapsed = 5;
    expect(dungeonAudioCues(reason === 'join' ? null : before, after)).toEqual([]);
  });
  it('does not infer blocks from untrusted names or unowned global event text', () => {
    const before = snapshot(), after = advance(before);
    after.events.push('Ownerが防いだ', 'Ownerが戦利品を拾った', 'Ownerが帰還した');
    expect(dungeonAudioCues(before, after)).toEqual([]);
  });
});

class Parameter {
  calls: { kind: string; value: number; at: number }[] = [];
  setValueAtTime(value: number, at: number) { this.calls.push({ kind: 'set', value, at }); }
  linearRampToValueAtTime(value: number, at: number) { this.calls.push({ kind: 'linear', value, at }); }
  exponentialRampToValueAtTime(value: number, at: number) { this.calls.push({ kind: 'exponential', value, at }); }
}
class Oscillator {
  type = 'sine'; frequency = new Parameter(); onended: (() => void) | null = null;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Gain { gain = new Parameter(); connect = vi.fn(); disconnect = vi.fn(); }
class Context {
  static instances: Context[] = []; static suspended = false; static denied = false; static fail = false;
  state = Context.suspended ? 'suspended' : 'running'; currentTime = 1; destination = {};
  oscillators: Oscillator[] = []; gains: Gain[] = [];
  constructor() { if (Context.fail) throw new Error('Unavailable audio'); Context.instances.push(this); }
  createOscillator() { const node = new Oscillator(); this.oscillators.push(node); return node; }
  createGain() { const node = new Gain(); this.gains.push(node); return node; }
  resume = vi.fn(async () => { if (Context.denied) throw new Error('Gesture denied'); this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
}
function audioFixture() {
  Context.instances = []; Context.suspended = Context.denied = Context.fail = false;
  vi.stubGlobal('AudioContext', Context);
  return createDungeonAudio();
}

describe('bounded gesture-unlocked dungeon audio', () => {
  it('creates no audio context before unlock and never replays locked events afterward', () => {
    const audio = audioFixture(), before = snapshot(), after = swing(before);
    audio.update(before, after); expect(Context.instances).toHaveLength(0);
    audio.unlock(); const context = Context.instances[0];
    audio.update(before, after); expect(context.oscillators).toHaveLength(0);
    const later = swing(advance(before)); audio.update(before, later);
    expect(context.oscillators).toHaveLength(1); audio.dispose();
  });
  it('is graceful when AudioContext is absent, construction fails, or resume is denied', async () => {
    const audio = audioFixture(); vi.stubGlobal('AudioContext', undefined);
    expect(() => audio.unlock()).not.toThrow(); expect(Context.instances).toHaveLength(0);
    vi.stubGlobal('AudioContext', Context); Context.fail = true; expect(() => audio.unlock()).not.toThrow();
    Context.fail = false; Context.suspended = Context.denied = true; audio.unlock();
    const context = Context.instances[0]; await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const before = snapshot(); audio.update(before, swing(before)); expect(context.oscillators).toHaveLength(0);
    expect(context.resume).toHaveBeenCalledTimes(1); audio.dispose(); expect(context.close).toHaveBeenCalledTimes(1);
  });
  it('caps concurrent voices at three and keeps every gain short and quiet', () => {
    const audio = audioFixture(); audio.unlock(); const context = Context.instances[0];
    const before = snapshot(); chest(before); const after = swing(before);
    after.actors[0].hp -= 10; after.containers[0].opened = true; pickup(after);
    audio.update(before, after);
    expect(context.oscillators).toHaveLength(3);
    for (const [index, oscillator] of context.oscillators.entries()) {
      expect(oscillator.start).toHaveBeenCalledWith(1);
      expect(oscillator.stop.mock.calls[0][0]).toBeLessThan(1.4);
      expect(Math.max(...context.gains[index].gain.calls.map(call => call.value))).toBeLessThan(.03);
    }
    context.currentTime = 1.5; const later = advance(after); later.actors[0].hp -= 10;
    audio.update(after, later); expect(context.oscillators).toHaveLength(3);
    context.oscillators[0].onended?.(); const latest = advance(later); latest.actors[0].hp -= 10;
    audio.update(later, latest); expect(context.oscillators).toHaveLength(4); audio.dispose();
  });
  it('rate limits repeated hurt cues even after a voice ends', () => {
    const audio = audioFixture(); audio.unlock(); const context = Context.instances[0];
    const before = snapshot(), after = advance(before); after.actors[0].hp -= 10;
    audio.update(before, after); context.oscillators[0].onended?.();
    context.currentTime += .05; const next = advance(after); next.actors[0].hp -= 10;
    audio.update(after, next); expect(context.oscillators).toHaveLength(1);
    context.currentTime += .13; const later = advance(next); later.actors[0].hp -= 10;
    audio.update(next, later); expect(context.oscillators).toHaveLength(2); audio.dispose();
  });
  it('mute stops current voices, ignores muted snapshots and resumes only future cues', () => {
    const audio = audioFixture(); audio.unlock(); const context = Context.instances[0];
    const before = snapshot(), after = swing(before); audio.update(before, after);
    audio.setMuted(true); expect(context.oscillators[0].disconnect).toHaveBeenCalled(); expect(context.gains[0].disconnect).toHaveBeenCalled();
    const next = advance(after); next.actors[0].hp -= 10; audio.update(after, next);
    audio.setMuted(false); audio.update(after, next); expect(context.oscillators).toHaveLength(1);
    const later = advance(next); later.actors[0].hp -= 10; audio.update(next, later);
    expect(context.oscillators).toHaveLength(2); audio.dispose();
  });
  it('does not initialize a muted context and permanently cleans up on disposal', () => {
    const audio = audioFixture(); audio.setMuted(true); audio.unlock(); expect(Context.instances).toHaveLength(0);
    audio.setMuted(false); audio.unlock(); const context = Context.instances[0];
    const before = snapshot(); audio.update(before, swing(before)); audio.dispose(); audio.dispose();
    expect(context.close).toHaveBeenCalledTimes(1); expect(context.oscillators[0].onended).toBeNull();
    expect(context.oscillators[0].disconnect).toHaveBeenCalled(); expect(context.gains[0].disconnect).toHaveBeenCalled();
    audio.unlock(); audio.update(before, swing(advance(before))); expect(Context.instances).toHaveLength(1); expect(context.oscillators).toHaveLength(1);
  });
});
