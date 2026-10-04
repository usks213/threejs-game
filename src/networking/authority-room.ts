import { SessionAuthority } from '../simulation/session';
import { sessionFrame } from './frame';
import { COOP_PROTOCOL, MAX_COOP_PLAYERS, type CoopServerPacket, type CoopAction } from './coop-protocol';
import type { WorldSave } from '../save/format';
export interface RoomCheckpoint { version: 1; world: WorldSave; receipts: [string, string[]][] }
export interface RoomConnection { send(packet: CoopServerPacket): void; close(code: number, reason: string): void }
interface Connection { wire: RoomConnection; playerId?: string; editBase: number; window: number; messages: number }
/** Pure authority adapter: used by the public Worker and real-socket integration tests. */
export class AuthorityRoom {
 readonly authority: SessionAuthority;
 readonly epoch: string;
 private connections = new Map<string, Connection>();
 private receipts = new Map<string, Set<string>>();
 private elapsed = 0;
 constructor(checkpoint: RoomCheckpoint | null, epoch: string) {
  this.authority = new SessionAuthority(checkpoint?.world, true); this.epoch = epoch;
  for (const [id, ids] of checkpoint?.receipts ?? []) this.receipts.set(id, new Set(ids.slice(-256)));
 }
 get size(): number { return this.connections.size; }
 connect(id: string, wire: RoomConnection): void {
  if (this.connections.size >= MAX_COOP_PLAYERS + 2) { wire.close(1008, 'Room full'); return; }
  this.connections.set(id, { wire, editBase: 0, window: this.elapsed, messages: 0 });
 }
 disconnect(id: string): void {
  const connection = this.connections.get(id); if (!connection) return;
  this.connections.delete(id);
  if (connection.playerId && ![...this.connections.values()].some(c => c.playerId === connection.playerId)) this.authority.leave(connection.playerId);
 }
 receive(id: string, text: string): { changed: boolean; acknowledgment?: () => void } {
  const connection = this.connections.get(id); if (!connection) return { changed: false };
  if (text.length > 8192) { connection.wire.close(1009, 'Message too large'); return { changed: false }; }
  if (this.elapsed - connection.window >= 1) { connection.messages = 0; connection.window = this.elapsed; }
  if (++connection.messages > 90) { connection.wire.close(1008, 'Rate limit'); return { changed: false }; }
  try {
   const packet = JSON.parse(text) as Record<string, unknown>;
   if (!packet || typeof packet !== 'object') throw new Error('Invalid packet');
   if (packet.type === 'hello') {
    if (packet.protocol !== COOP_PROTOCOL) throw new Error('ゲームの版が違います。ページを更新してください');
    if (typeof packet.playerId !== 'string' || !/^[a-zA-Z0-9_-]{16,64}$/.test(packet.playerId) || packet.playerId === 'host') throw new Error('Invalid player identity');
    if (connection.playerId && connection.playerId !== packet.playerId) throw new Error('Identity cannot change');
    for (const [otherId, other] of this.connections) if (otherId !== id && other.playerId === packet.playerId) { this.disconnect(otherId); other.wire.close(4001, 'Replaced by reconnect'); }
    if (!connection.playerId && this.authority.actors.size - 1 >= MAX_COOP_PLAYERS) throw new Error('この部屋は4人までです');
    connection.playerId = packet.playerId; this.authority.join(packet.playerId); this.welcome(connection);
    return { changed: true };
   }
   if (!connection.playerId) throw new Error('Handshake required');
   if (packet.type === 'input') { this.authority.input(connection.playerId, packet.input as Parameters<SessionAuthority['input']>[1], packet.sequence as number); }
   else if (packet.type === 'resync') this.welcome(connection);
   else if (packet.type === 'ping') connection.wire.send({ type: 'pong' });
   else if (packet.type === 'action') {
    if (typeof packet.commandId !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(packet.commandId)) throw new Error('Invalid command id');
    const commandId = packet.commandId, seen = this.receipts.get(connection.playerId) ?? new Set<string>();
    if (seen.has(commandId)) { connection.wire.send({ type: 'ack', commandId, accepted: true, message: '操作は反映済みです' }); return { changed: false }; }
    const action = packet.message as CoopAction;
    if (!action || (action.type !== 'action' && action.type !== 'game-action')) throw new Error('Invalid action');
    let message: string;
    try { message = this.authority.action(connection.playerId, action).message; }
    catch (error) { connection.wire.send({ type: 'ack', commandId, accepted: false, message: error instanceof Error ? error.message : '操作を受理できません' }); return { changed: false }; }
    seen.add(commandId); while (seen.size > 256) seen.delete(seen.values().next().value!); this.receipts.set(connection.playerId, seen);
    return { changed: true, acknowledgment: () => connection.wire.send({ type: 'ack', commandId, accepted: true, message }) };
   } else throw new Error('Unknown packet');
  } catch (error) { connection.wire.send({ type: 'notice', message: error instanceof Error ? error.message : '通信データが不正です' }); }
  return { changed: false };
 }
 private welcome(connection: Connection): void {
  const playerId = connection.playerId!; connection.editBase = this.authority.sim.world.edits.length;
  connection.wire.send({ type: 'welcome', protocol: COOP_PROTOCOL, epoch: this.epoch, playerId, save: this.authority.save(), state: sessionFrame(this.authority, playerId) });
 }
 step(): void {
  this.elapsed += 1 / 30;
  // Handshake connections cannot keep an empty room alive forever.
  for (const [id, c] of this.connections) if (!c.playerId && this.elapsed - c.window > 10) { c.wire.close(1008, 'Handshake timeout'); this.disconnect(id); }
  if (![...this.connections.values()].some(c => c.playerId)) return;
  this.authority.step();
  if (this.authority.sim.tick % 3 !== 0) return;
  for (const c of this.connections.values()) if (c.playerId) {
   const edits = this.authority.sim.world.edits;
   c.wire.send({ type: 'frame', epoch: this.epoch, state: sessionFrame(this.authority, c.playerId), editBase: c.editBase, edits: edits.slice(c.editBase) }); c.editBase = edits.length;
  }
 }
 checkpoint(): RoomCheckpoint { return { version: 1, world: this.authority.save(), receipts: [...this.receipts].map(([id, seen]) => [id, [...seen]]) }; }
 notice(message: string): void { for (const c of this.connections.values()) c.wire.send({ type: 'notice', message }); }
}
