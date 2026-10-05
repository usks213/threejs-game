import {directVisibleBricks,withinDirectFieldRetention} from '../world/field-streaming';
/// <reference lib="webworker" />
import { Prediction } from '../networking/prediction';
import { SessionAuthority } from './session';
import { sessionFrame } from '../networking/frame';
import { GameSimulation, TICK_RATE } from './game-simulation';
import { visibleBricks, withinTerrainRetention } from '../world/streaming';
import { meshTransferables } from '../world/mesh-preparation';
import { TerrainScheduler, TerrainUploadWindow } from '../world/terrain-scheduler';
import type { TerrainRequest, TerrainResponse } from '../world/terrain-protocol';
import { CHUNK_SIZE, type MeshData } from '../world/types';
import type { PlayerInput } from './protocol';
import type { SimulationClientMessage as ClientMessage,SimulationWorkerMessage as WorkerMessage } from './local-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const emit = (message: WorkerMessage, transfer: Transferable[] = []) => scope.postMessage(message.type==='snapshot'?{...message,epoch:terrain.epoch}:message, transfer);
let sim: GameSimulation | null = null, authority: SessionAuthority | null = null, replica = false;
let prediction: Prediction | null = null, replicaState: import('./protocol').Snapshot | null = null;
const peerEdits = new Map<string, number>();
let input: PlayerInput = { x: 0, z: 0, jump: false };
const terrain = new TerrainScheduler();let uploads = new TerrainUploadWindow(4);
const triangles = new Map<string, number>(), editedMeshes = new Map<string, MeshData>();
let mesher: Worker | null = null, sentEditCount = 0;
let direct=false,inputSequence=0,lastAction='',lastError:string|null=null,combatSaveAt=0;
const transientActions=new Set(['guard','dodge','sprint','sneak','glide','climb']);
let center = '', initialized = false, paused = false;
let previous = performance.now(), accumulator = 0, meshMs = 0, editMs = 0, editStart = 0;
function sendTerrain(message: TerrainRequest): void { mesher?.postMessage(message); }
function initializeTerrain(): void {
  // Reinitialization also cancels a synchronous in-flight job in the old world.
  mesher?.terminate(); mesher = null;
  terrain.reset(); uploads.reset(terrain.epoch); triangles.clear(); editedMeshes.clear();
  center = ''; initialized = false; meshMs = 0; editMs = 0; editStart = 0;
  emit({ type: 'terrain-reset', epoch: terrain.epoch });
  const worker = new Worker(new URL('../world/terrain-worker.ts', import.meta.url), { type: 'module' });
  mesher = worker;
  worker.onerror = () => {
    if (mesher !== worker) return;
    paused = true; terrain.paused = true; worker.terminate(); mesher = null;
    emit({ type: 'error', message: '地形の背景処理を開始できませんでした。ページを再読み込みしてください。' });
  };
  worker.onmessage = (event: MessageEvent<TerrainResponse>) => {
    if (mesher !== worker) return;
    const result = event.data;
    if (result.type === 'error') {
      if (result.epoch !== terrain.epoch) return;
      paused = true; terrain.paused = true; worker.terminate(); mesher = null;
      emit({ type: 'error', message: result.message }); return;
    }
    const accepted = terrain.complete(result.job, meshTransferables([result.mesh]).reduce((sum, buffer) => sum + buffer.byteLength, 0));
    if (accepted) {
      const mesh = result.mesh;
      meshMs = mesh.milliseconds; triangles.set(mesh.id, mesh.indices.length / 3);
      if (accepted === 'edit') editedMeshes.set(mesh.id, mesh);
      else { uploads.sent(1); emit({ type: 'mesh', epoch: terrain.epoch, mesh }, meshTransferables([mesh])); }
      publishEdit(); checkReady();
    }
    scheduleMesh();
  };
  sentEditCount = sim!.world.edits.length;
  sendTerrain({ type: 'init', direct,epoch: terrain.epoch, bounds: sim!.world.bounds, generator: sim!.world.generator, edits: sim!.world.edits });
}
function invalidateTerrain(ids: Iterable<string>): void {
  const dirty = new Set(ids);
  if (!dirty.size) return;
  if (!editStart) editStart = performance.now();
  terrain.invalidate(dirty);
  for (const id of dirty) editedMeshes.delete(id);
}
function stream(): void {
  if (!sim) return;
  terrain.setFocus(sim.player);
  const id = `${Math.floor(sim.player.x / (direct?8:CHUNK_SIZE))},${Math.floor(sim.player.z / (direct?8:CHUNK_SIZE))},${direct?Math.floor(sim.player.y/8):0}`;
  if (id === center) return;
  center = id;
  const visible = direct?directVisibleBricks(sim.player,sim.world.bounds,sim.world.generator):visibleBricks(sim.player, sim.world.bounds);
  const removed = terrain.setVisible(visible, sim.player, brick => direct?withinDirectFieldRetention(brick,sim!.player):withinTerrainRetention(brick, sim!.player));
  emit({ type: 'terrain-visibility', epoch: terrain.epoch, ids: [...visible.keys()] });
  for (const key of removed) { triangles.delete(key); editedMeshes.delete(key); }
  if (removed.length) emit({ type: 'remove', epoch: terrain.epoch, ids: removed });
  publishEdit(); scheduleMesh();
}
function publishEdit(): void {
  if (terrain.dirtyPending || !editedMeshes.size || !uploads.available) return;
  const meshes = [...editedMeshes.values()]; editedMeshes.clear();
  // All affected neighboring bricks are prepared before publishing the replacement batch.
  uploads.sent(meshes.length);
  emit({ type: 'mesh-batch', epoch: terrain.epoch, meshes }, meshTransferables(meshes));
  if (editStart) { editMs = performance.now() - editStart; editStart = 0; }
}
function checkReady(): void {
  if (!initialized && sim && !editedMeshes.size && terrain.readyNear(sim.player)) {
    initialized = true; emit({ type: 'ready', epoch: terrain.epoch });
  }
}
function scheduleMesh(): void {
  if (!sim || !mesher || paused) return;
  // The retained meshing world receives only newly appended operations, never a save per brick.
  if (sentEditCount !== sim.world.edits.length) {
    sendTerrain({ type: 'edits', epoch: terrain.epoch, base: sentEditCount, edits: sim.world.edits.slice(sentEditCount) });
    sentEditCount = sim.world.edits.length;
  }
  publishEdit(); checkReady();
  if (!uploads.available) return;
  const job = terrain.next(sentEditCount);
  if (job) sendTerrain({ type: 'mesh', job });
}
scope.onmessage = (event: MessageEvent<ClientMessage>) => {
  const message = event.data;
  try {
    if (message.type === 'init' || message.type === 'replica-init') {
      combatSaveAt=0;direct=!!message.direct;uploads=new TerrainUploadWindow(direct?12:4);authority = new SessionAuthority(message.save); sim = authority.sim; replica = message.type === 'replica-init'; prediction = replica ? new Prediction(sim) : null; replicaState = null; peerEdits.clear(); initializeTerrain(); accumulator = 0; previous = performance.now(); input = { x: 0, z: 0, jump: false }; stream();
    } else if (message.type === 'peer-join' && authority && !replica) { authority.join(message.peer); peerEdits.set(message.peer, sim!.world.edits.length); emit({ type: 'peer-welcome', peer: message.peer, save: sim!.save(), state: sessionFrame(authority, message.peer) }); }
    else if (message.type === 'peer-leave' && authority) { authority.leave(message.peer); peerEdits.delete(message.peer); }
    else if (message.type === 'peer-input' && authority && !replica) authority.input(message.peer, message.input, message.sequence);
    else if (message.type === 'peer-action' && authority && !replica) {
      const result = authority.action(message.peer, message.message);
      invalidateTerrain(result.dirty); scheduleMesh();
      emit({ type: 'notice', message: result.message });
    } else if (message.type === 'replica-state' && sim && replica) {
      replicaState = message.state;
      const dirty = new Set<string>();
      for (const edit of message.edits.slice(sim.world.edits.length)) for (const id of sim.world.apply(edit)) dirty.add(id);
      invalidateTerrain(dirty);
      prediction!.reconcile(message.state);
      stream(); scheduleMesh(); emit({ type: 'snapshot', state: { ...message.state, player: { ...sim.player } } });
    } else if (message.type === 'replica-input' && sim && replica && replicaState) {
      prediction!.input(message.sequence,message.input);stream();
      emit({type:'snapshot',state:{...replicaState,player:{...sim.player}}});
    } else if (message.type === 'input') {inputSequence++;input = { ...message.input, jump: input.jump || message.input.jump };}
    else if (message.type === 'pause') { paused = message.paused; terrain.paused = paused; input = { x: 0, z: 0, jump: false }; previous = performance.now(); accumulator = 0; if (!paused) scheduleMesh(); }
    else if (message.type === 'mesh-ack') { uploads.acknowledge(message.epoch, message.count); scheduleMesh(); }
    else if (sim && message.type === 'reset-player') sim.resetPlayer();
    else if (sim && message.type === 'save' && !replica) emit({ type: 'save', save: authority!.save() });
    else if (sim && (message.type === 'action' || message.type === 'game-action')) {
      lastAction=message.type==='action'?message.tool:message.action;const result = sim.world.generator===4?authority!.action('host',message):message.type === 'action' ? sim.act(message.tool, message.target) : message.action==='revive'?authority!.action('host',message):sim.adventure.action(message.action, message.id, message.target, message.aim);
      invalidateTerrain(result.dirty); scheduleMesh();
      emit({ type: 'notice', message: result.message });
      if(message.type==='game-action'&&(message.action==='attack'||message.action==='heavy'))combatSaveAt=performance.now()+1000;
      else if(message.type==='action'?message.tool!=='water':!transientActions.has(message.action))emit({type:'save',save:authority!.save()});
    }
  } catch (error) { emit({ type: message.type === 'init' || message.type === 'replica-init' ? 'error' : 'notice', message: error instanceof Error ? error.message : String(error) }); }
};
// Collision samples the authoritative SdfWorld directly; visual mesh/GPU credits
// must never pause simulation or input, including the first near-ready handshake.
setInterval(() => {
  if (!sim || replica || paused) { previous = performance.now(); return; }
  try {
    const now = performance.now(); accumulator += Math.min(0.1, (now - previous) / 1000); previous = now;
    while (accumulator >= 1 / TICK_RATE) { authority!.step(input); input.jump = false; accumulator -= 1 / TICK_RATE; }
    if (sim.pendingEdits.size) { invalidateTerrain(sim.pendingEdits); sim.pendingEdits.clear(); scheduleMesh(); }
    stream();
    // Persist resolved combat after a quiet moment, not before contact or on every guard update.
    if(combatSaveAt&&now>=combatSaveAt&&sim.adventure.attack<=0){combatSaveAt=0;emit({type:'save',save:authority!.save()});}
    // UI persistence owns the five-second autosave cadence; avoid a second full copy here.
    if (sim.tick % 3 === 0 && authority!.actors.size > 1) for (const peer of authority!.actors.keys()) if (peer !== 'host') {
      const base = peerEdits.get(peer) ?? 0;
      emit({ type: 'peer-frame', peer, state: sessionFrame(authority!, peer), editBase: base, edits: sim.world.edits.slice(base) });
      peerEdits.set(peer,sim.world.edits.length);
    }
    emit({ type: 'snapshot', state: { peers: authority!.view('host').peers, tick: sim.tick, adventure: sim.adventure.snapshot(), player: { ...sim.player }, edits: sim.world.edits.length, fluids: sim.fluid.snapshot(sim.player), bodies: sim.bodies.filter(b => Math.hypot(b.position.x - sim!.player.x, b.position.z - sim!.player.z) < 65).map(b => ({ ...b, position: { ...b.position }, velocity: { ...b.velocity } })), metrics: { ...sim.metrics, meshMs, editMs, bricks: terrain.size, pending: terrain.pending, triangles: [...triangles.values()].reduce((a, b) => a + b, 0) } } });
  } catch (error) { lastError=String(error);paused = true; emit({ type: 'error', message: String(error) }); }
}, 1000 / TICK_RATE);

setInterval(()=>emit({type:'health',health:{epoch:terrain.epoch,tick:sim?.tick??0,paused,nearReady:initialized,input:{...input},inputSequence,lastAction,pending:terrain.pending,error:lastError}}),1000);
