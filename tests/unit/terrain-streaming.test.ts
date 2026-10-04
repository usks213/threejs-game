import { describe, expect, it, vi } from 'vitest';
import type { SimulationClientMessage as ClientMessage,SimulationWorkerMessage as WorkerMessage } from '../../src/simulation/local-protocol';
import type { TerrainRequest, TerrainResponse } from '../../src/world/terrain-protocol';
import { SdfWorld } from '../../src/world/density';
import { grassSamples, meshTransferables, prepareTerrainMesh } from '../../src/world/mesh-preparation';
import { meshBrick } from '../../src/world/mesher';
import { TerrainRuntime } from '../../src/world/terrain-runtime';
import { TerrainScheduler, TerrainUploadWindow, type TerrainJob } from '../../src/world/terrain-scheduler';
import { WORLD, type Brick, type EditOperation } from '../../src/world/types';

const near: Brick = { id: '0,0,0', origin: { x: 0, y: 0, z: 0 }, step: .5 };
const far: Brick = { id: '4,0,0', origin: { x: 32, y: 0, z: 0 }, step: .5 };
const focus = { x: 4, y: 4, z: 4 };
const visible = (...bricks: Brick[]) => new Map(bricks.map(brick => [brick.id, brick]));
const edit: EditOperation = { id: 1, kind: 'dig', position: { x: 4, y: 2, z: 4 }, radius: 1, material: 'stone', tick: 0 };
const job = (epoch = 1, editCount = 0): TerrainJob => ({ epoch, editCount, version: 1, brick: near });

describe('background terrain scheduling', () => {
  it('keeps one job active, prioritizes nearby terrain and counts the active startup brick', () => {
    const queue = new TerrainScheduler(); queue.reset(); queue.setVisible(visible(far, near), focus);
    const first = queue.next(0)!;
    expect(first.brick.id).toBe(near.id); expect(queue.next(0)).toBeNull();
    expect(queue.pending).toBe(2); expect(queue.readyNear(focus)).toBe(false);
    expect(queue.complete(first)).toBe('stream'); expect(queue.readyNear(focus)).toBe(true);
    expect(queue.pending).toBe(1); expect(queue.next(0)!.brick.id).toBe(far.id);
  });
  it('invalidates an edited in-flight result and prioritizes its current revision', () => {
    const queue = new TerrainScheduler(); queue.reset(); queue.setVisible(visible(near, far), focus);
    const old = queue.next(0)!; queue.invalidate([near.id]); queue.invalidate([near.id]);
    expect(queue.complete(old)).toBeNull(); expect(queue.dirtyPending).toBe(1);
    const current = queue.next(2)!;
    expect(current.brick.id).toBe(near.id); expect(current.version).toBeGreaterThan(old.version);
    expect(current.editCount).toBe(2); expect(queue.complete(current)).toBe('edit'); expect(queue.dirtyPending).toBe(0);
  });
  it('ignores stale unload/reload and out-of-order duplicate completions', () => {
    const queue = new TerrainScheduler(); queue.reset(); queue.setVisible(visible(near), focus);
    const removed = queue.next(0)!;
    expect(queue.setVisible(visible(), focus)).toEqual([near.id]); queue.setVisible(visible(near, far), focus);
    expect(queue.complete(removed)).toBeNull(); const replacement = queue.next(0)!;
    expect(queue.complete(removed)).toBeNull(); expect(queue.next(0)).toBeNull();
    expect(queue.complete(replacement)).toBe('stream');
    const active = queue.next(0)!;
    expect(queue.complete({ ...active, editCount: 99 })).toBeNull(); expect(queue.next(0)).toBeNull();
    expect(queue.complete(active)).toBe('stream');
  });
  it('rejects an earlier world epoch without clearing the new active job', () => {
    const queue = new TerrainScheduler(); queue.reset(); queue.setVisible(visible(near), focus);
    const old = queue.next(0)!; queue.reset(); queue.setVisible(visible(near), focus);
    const current = queue.next(0)!;
    expect(queue.complete(old)).toBeNull(); expect(queue.next(0)).toBeNull();
    expect(queue.complete(current)).toBe('stream');
  });
  it('pauses dispatch, retains an in-flight completion and safely resumes', () => {
    const queue = new TerrainScheduler(); queue.reset(); queue.setVisible(visible(near, far), focus);
    const active = queue.next(0)!; queue.paused = true;
    expect(queue.complete(active)).toBe('stream'); expect(queue.next(0)).toBeNull();
    queue.paused = false; expect(queue.next(0)!.brick.id).toBe(far.id);
  });
  it('updates proximity and sampling revisions without retaining distant queued work', () => {
    const queue = new TerrainScheduler(); queue.reset(); queue.setVisible(visible(near, far), focus);
    queue.setFocus({ x: 36, y: 4, z: 4 }); const first = queue.next(0)!;
    expect(first.brick.id).toBe(far.id); queue.setVisible(visible({ ...far, step: 1 }), focus);
    expect(queue.complete(first)).toBeNull(); expect(queue.pending).toBe(1); expect(queue.next(0)!.brick.step).toBe(1);
  });
  it('bounds rendering backlog and ignores acknowledgements from an old epoch', () => {
    const window = new TerrainUploadWindow(4); window.reset(1); window.sent(4);
    expect(window.available).toBe(false); window.acknowledge(0, 4); expect(window.available).toBe(false);
    window.acknowledge(1, 1); expect(window.available).toBe(true);
    window.sent(12); expect(window.available).toBe(false); window.acknowledge(1, 15); expect(window.available).toBe(true);
    window.sent(4); window.acknowledge(1, Infinity); expect(window.available).toBe(false);
    window.reset(2); expect(window.available).toBe(true);
  });
});

describe('terrain worker world and transferable preparation', () => {
  it('retains the seeded world, applies only incremental edits, and rejects revision gaps', () => {
    const runtime = new TerrainRuntime();
    runtime.handle({ type: 'init', epoch: 1, bounds: WORLD, generator: 3, edits: [] });
    const original = runtime.handle({ type: 'mesh', job: job() }); expect(original?.type).toBe('mesh');
    runtime.handle({ type: 'edits', epoch: 1, base: 0, edits: [edit] });
    expect(() => runtime.handle({ type: 'mesh', job: job() })).toThrow('revision');
    const edited = runtime.handle({ type: 'mesh', job: job(1, 1) });
    if (original?.type !== 'mesh' || edited?.type !== 'mesh') throw new Error('Expected mesh results');
    expect([...edited.mesh.positions]).not.toEqual([...original.mesh.positions]);
    const world = new SdfWorld(WORLD, 3); world.apply(edit);
    const expected = prepareTerrainMesh(meshBrick(world, near), near);
    expect(edited.mesh.positions).toEqual(expected.positions); expect(edited.mesh.indices).toEqual(expected.indices);
    expect(() => runtime.handle({ type: 'edits', epoch: 1, base: 0, edits: [edit] })).toThrow('sequence');
    expect(runtime.handle({ type: 'edits', epoch: 0, base: 0, edits: [edit] })).toBeNull();
    runtime.handle({ type: 'init', epoch: 2, bounds: WORLD, generator: 1, edits: [] });
    expect(runtime.handle({ type: 'mesh', job: job(1, 1) })).toBeNull();
    const legacy = runtime.handle({ type: 'mesh', job: job(2) });
    if (legacy?.type !== 'mesh') throw new Error('Expected legacy mesh');
    expect(legacy.mesh.positions).toEqual(prepareTerrainMesh(meshBrick(new SdfWorld(WORLD, 1), near), near).positions);
  });
  it('prepares local positions, valid bounds and the same world-space grass without copying geometry', () => {
    const raw = meshBrick(new SdfWorld(WORLD, 3), near), positions = raw.positions;
    const original = positions.slice(), grass = grassSamples(raw), coarse = raw.coarse!.positions.slice();
    const mesh = prepareTerrainMesh(raw, near);
    expect(mesh.positions).toBe(positions); expect(mesh.origin).toEqual(focus); expect(mesh.grass).toEqual(grass);
    for (let i = 0; i < original.length; i += 3) {
      expect(mesh.positions[i] + focus.x).toBeCloseTo(original[i], 5);
      expect(Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2])).toBeLessThanOrEqual(mesh.bounds!.radius + 1e-6);
    }
    for (let i = 0; i < coarse.length; i += 3) expect(mesh.coarse!.positions[i] + focus.x).toBeCloseTo(coarse[i], 5);
    const buffers = meshTransferables([mesh, mesh]);
    expect(buffers.length).toBe(9); expect(buffers).toContain(mesh.coarse!.indices.buffer); expect(buffers).toContain(mesh.grass!.buffer);
    const received = structuredClone(mesh, { transfer: buffers });
    expect(mesh.positions.byteLength).toBe(0); expect(mesh.coarse!.indices.byteLength).toBe(0); expect(mesh.grass!.byteLength).toBe(0);
    expect(received.positions.length).toBe(original.length); expect(received.grass).toEqual(grass);
  });
});


it('keeps save/input handling live while meshing, bounds uploads, and terminates the old mesher on init', async () => {
  vi.useFakeTimers({ toFake: ['setInterval'] });
  const outputs: WorkerMessage[] = [];
  const scope = {
    onmessage: null as ((event: MessageEvent<ClientMessage>) => void) | null,
    postMessage(message: WorkerMessage, transfer: Transferable[] = []) { outputs.push(structuredClone(message, { transfer })); },
  };
  const workers: FakeTerrainWorker[] = [];
  class FakeTerrainWorker {
    readonly messages: TerrainRequest[] = [];
    readonly runtime = new TerrainRuntime();
    onmessage: ((event: MessageEvent<TerrainResponse>) => void) | null = null;
    onerror: (() => void) | null = null;
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(message: TerrainRequest): void { this.messages.push(structuredClone(message)); }
    terminate(): void { this.terminated = true; }
    finishOneJob(): void {
      while (this.messages.length) {
        const result = this.runtime.handle(this.messages.shift()!);
        if (result) {
          const cloned = structuredClone(result, { transfer: result.type === 'mesh' ? meshTransferables([result.mesh]) : [] });
          this.onmessage?.({ data: cloned } as MessageEvent<TerrainResponse>); return;
        }
      }
      throw new Error('No pending mesh');
    }
  }
  vi.stubGlobal('self', scope); vi.stubGlobal('Worker', FakeTerrainWorker);
  const send = (data: ClientMessage) => scope.onmessage!({ data } as MessageEvent<ClientMessage>);
  const save = { version: 1 as const, generator: 3 as const, seed: WORLD.seed, player: { x: 0, y: 3, z: 8 }, edits: [], fluids: [], bodies: [] };
  try {
    vi.resetModules(); await import('../../src/simulation/worker');
    send({ type: 'init', save });
    expect(workers).toHaveLength(1); expect(outputs.map(message => message.type)).toEqual(['terrain-reset', 'terrain-visibility']);
    expect(outputs[1]).toMatchObject({ type: 'terrain-visibility', epoch: 1 });
    expect(workers[0].messages.map(message => message.type)).toEqual(['init', 'mesh']);
    // Meshing has not executed. These messages are still handled immediately by simulation.
    send({ type: 'input', input: { x: 1, z: 0, jump: true } }); send({ type: 'save' });
    expect(outputs.at(-1)?.type).toBe('save');
    send({ type: 'pause', paused: true }); workers[0].finishOneJob();
    expect(workers[0].messages).toHaveLength(0);
    send({ type: 'pause', paused: false });
    for (let i = 0; i < 3; i++) workers[0].finishOneJob();
    expect(outputs.filter(message => message.type === 'mesh')).toHaveLength(4);
    expect(workers[0].messages).toHaveLength(0);
    send({ type: 'mesh-ack', epoch: 0, count: 4 }); expect(workers[0].messages).toHaveLength(0);
    send({ type: 'mesh-ack', epoch: 1, count: 4 }); expect(workers[0].messages.at(-1)?.type).toBe('mesh');
    send({ type: 'replica-init', save });
    expect(workers[0].terminated).toBe(true); expect(workers).toHaveLength(2);
    expect(outputs.at(-2)).toEqual({ type: 'terrain-reset', epoch: 2 });
    expect(outputs.at(-1)).toMatchObject({ type: 'terrain-visibility', epoch: 2 });
    const length = outputs.length; workers[0].finishOneJob(); expect(outputs).toHaveLength(length);
    workers[1].finishOneJob(); expect(outputs.at(-1)).toMatchObject({ type: 'mesh', epoch: 2 });
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
});
