/// <reference lib="webworker" />
import { GameSimulation, TICK_RATE } from './game-simulation';
import { visibleBricks } from '../world/streaming';
import { meshBrick } from '../world/mesher';
import { CHUNK_SIZE, type Brick, type MeshData } from '../world/types';
import type { ClientMessage, PlayerInput, WorkerMessage } from './protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const emit = (message: WorkerMessage, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
let sim: GameSimulation | null = null;
let input: PlayerInput = { x: 0, z: 0, jump: false };
let bricks = new Map<string, Brick>();
const pending = new Map<string, Brick>();
const triangles = new Map<string, number>();
const dirtyMeshes = new Set<string>(), editedMeshes = new Map<string, MeshData>();
let center = '', initialized = false, paused = false, meshing = false;
let previous = performance.now(), accumulator = 0, meshMs = 0, editMs = 0, editStart = 0;
function stream() {
  if (!sim) return;
  const id = `${Math.floor(sim.player.x / CHUNK_SIZE)},${Math.floor(sim.player.z / CHUNK_SIZE)}`;
  if (id === center) return;
  center = id;
  const next = visibleBricks(sim.player, sim.world.bounds), removed: string[] = [];
  for (const key of bricks.keys()) if (!next.has(key)) { removed.push(key); pending.delete(key); triangles.delete(key); dirtyMeshes.delete(key); editedMeshes.delete(key); }
  const ordered = [...next.values()].sort((a, b) => Math.hypot(a.origin.x - sim!.player.x, a.origin.y - sim!.player.y, a.origin.z - sim!.player.z) - Math.hypot(b.origin.x - sim!.player.x, b.origin.y - sim!.player.y, b.origin.z - sim!.player.z));
  for (const b of ordered) if (!bricks.has(b.id) || bricks.get(b.id)!.step !== b.step) pending.set(b.id, b);
  bricks = next; if (removed.length) emit({ type: 'remove', ids: removed }); publishEdit(); scheduleMesh();
}
function publishEdit() {
  if (dirtyMeshes.size || !editedMeshes.size) return;
  const meshes = [...editedMeshes.values()], transfer: Transferable[] = [];
  for (const mesh of meshes) transfer.push(mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer);
  // Replace all affected bricks in a single main-thread message/animation frame.
  emit({ type: 'mesh-batch', meshes }, transfer); editedMeshes.clear();
  if (editStart) { editMs = performance.now() - editStart; editStart = 0; }
}
function scheduleMesh() {
  if (meshing || !pending.size) return;
  meshing = true;
  setTimeout(() => {
    try {
      const started = performance.now();
      while (sim && pending.size && performance.now() - started < 8) {
        const b = pending.values().next().value!; pending.delete(b.id);
        const mesh = meshBrick(sim.world, b); meshMs = mesh.milliseconds; triangles.set(b.id, mesh.indices.length / 3);
        if (dirtyMeshes.delete(b.id)) { editedMeshes.set(b.id, mesh); publishEdit(); }
        else emit({ type: 'mesh', mesh }, [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer]);
      }
      meshing = false;
      if (pending.size) scheduleMesh();
      else {
        if (editStart) { editMs = performance.now() - editStart; editStart = 0; }
        if (!initialized) { initialized = true; emit({ type: 'ready' }); }
      }
    } catch (error) { meshing = false; emit({ type: 'error', message: String(error) }); }
  }, 0);
}
scope.onmessage = (event: MessageEvent<ClientMessage>) => {
  const message = event.data;
  try {
    if (message.type === 'init') {
      if (bricks.size) emit({ type: 'remove', ids: [...bricks.keys()] });
      sim = new GameSimulation(message.save); bricks.clear(); pending.clear(); triangles.clear(); dirtyMeshes.clear(); editedMeshes.clear(); center = ''; initialized = false; accumulator = 0; previous = performance.now(); input = { x: 0, z: 0, jump: false }; stream();
    } else if (message.type === 'input') input = { ...message.input, jump: input.jump || message.input.jump };
    else if (message.type === 'pause') { paused = message.paused; input = { x: 0, z: 0, jump: false }; previous = performance.now(); accumulator = 0; }
    else if (sim && message.type === 'reset-player') sim.resetPlayer();
    else if (sim && message.type === 'save') emit({ type: 'save', save: sim.save() });
    else if (sim && initialized && message.type === 'action') {
      const result = sim.act(message.tool, message.target);
      if (result.dirty.length) {
        editStart = performance.now(); const queue = new Map(pending); pending.clear();
        for (const id of result.dirty) { const b = bricks.get(id); if (b) { pending.set(id, b); dirtyMeshes.add(id); editedMeshes.delete(id); } }
        for (const [id, b] of queue) if (!pending.has(id)) pending.set(id, b);
        scheduleMesh();
      }
      emit({ type: 'notice', message: result.message }); emit({ type: 'save', save: sim.save() });
    }
  } catch (error) { emit({ type: message.type === 'init' ? 'error' : 'notice', message: error instanceof Error ? error.message : String(error) }); }
};
setInterval(() => {
  if (!sim || paused || !initialized) { previous = performance.now(); return; }
  try {
    const now = performance.now(); accumulator += Math.min(0.1, (now - previous) / 1000); previous = now;
    while (accumulator >= 1 / TICK_RATE) { sim.step(input); input.jump = false; accumulator -= 1 / TICK_RATE; }
    stream();
    emit({ type: 'snapshot', state: { tick: sim.tick, player: { ...sim.player }, edits: sim.world.edits.length, fluids: sim.fluid.snapshot(), bodies: sim.bodies.map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })), metrics: { ...sim.metrics, meshMs, editMs, bricks: bricks.size, pending: pending.size, triangles: [...triangles.values()].reduce((a, b) => a + b, 0) } } });
  } catch (error) { paused = true; emit({ type: 'error', message: String(error) }); }
}, 1000 / TICK_RATE);
