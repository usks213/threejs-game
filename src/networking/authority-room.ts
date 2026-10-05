import {helloInfo,sessionInfo} from './coop-handshake';
import {DeliveryWindow} from './delivery-window';
import {SnapshotWireEncoder} from './snapshot-wire';
import {encodeCompactFluidDelta} from './compact-fluid';
import {FluidWireEncoder} from './fluid-wire';
import {initialRoomAccess,validateRoomAccess,validateAdminCommand,isPublicPlayerId,sameAdminCommand,roomAdminMessage,ROOM_ACCESS_LIMITS,type RoomAccessState,type RoomAccessView,type RoomAdminCommand} from './room-access';
import {participantSave} from '../save/participant';
import { SessionAuthority } from '../simulation/session';
import { sessionFrame } from './frame';
import { COOP_PROTOCOL, MAX_COOP_PLAYERS, type CoopWireServerPacket, type CoopAction } from './coop-protocol';
import type { WorldSave } from '../save/format';
export interface RoomCheckpoint { version: 1; actionSequences?:[string,number][]; access?:RoomAccessState; world: WorldSave; receipts: [string, string[]][] }
export interface RoomConnection { send(packet: CoopWireServerPacket,serialized?:string): void; close(code: number, reason: string): void }
interface Connection { delivery:DeliveryWindow; pendingExport?:string; lastExport?:number; lastWelcome?:number; needsWelcome?:boolean; snapshot:SnapshotWireEncoder; water:FluidWireEncoder; wire: RoomConnection; playerId?: string; editBase: number; window: number; messages: number; created:number }
/** Pure authority adapter: used by the public Worker and real-socket integration tests. */
export class AuthorityRoom {
 readonly authority: SessionAuthority;
 readonly epoch: string;
 private connections = new Map<string, Connection>();
 private receipts = new Map<string, Set<string>>();
 private actionSequences=new Map<string,number>();
 private persistedRevision:string|undefined;
 recordPersistedRevision(revision:string):void{if(!/^[a-zA-Z0-9_-]{1,80}$/.test(revision))throw Error('保存世代が不正です');this.persistedRevision=revision;for(const c of this.connections.values())if(c.playerId)c.wire.send({type:'persisted-revision',revision});}
 private elapsed = 0;
 private access:RoomAccessState;
 private pendingAccess:{access:RoomAccessState;command?:RoomAdminCommand;commit:()=>void}|undefined;
 private failed=false;
 get readOnly():boolean{return this.failed;}
 constructor(checkpoint: RoomCheckpoint | null, epoch: string,private readonly roomId:string|null=null) {
  this.authority = new SessionAuthority(checkpoint?.world, true); this.epoch = epoch;this.access=checkpoint?.access?validateRoomAccess(checkpoint.access):initialRoomAccess(!checkpoint,checkpoint?.world.members?.map(m=>m.id));
  for(const [id,sequence] of checkpoint?.actionSequences??[])this.actionSequences.set(id,sequence);
  for (const [id, ids] of checkpoint?.receipts ?? []) this.receipts.set(id, new Set(ids.slice(-256)));
 }
 get size(): number { return this.connections.size; }
 connect(id: string, wire: RoomConnection): void {
  if(this.failed){wire.close(1013,'Room reload required');return;}
  if (this.connections.size >= MAX_COOP_PLAYERS + 2) { wire.close(1008, 'Room full'); return; }
  this.connections.set(id, { delivery:new DeliveryWindow(),snapshot:new SnapshotWireEncoder(),water:new FluidWireEncoder(),wire, editBase: 0, window: this.elapsed, messages: 0,created:this.elapsed });
 }
 disconnect(id: string): void {
  const connection = this.connections.get(id); if (!connection) return;
  this.connections.delete(id);
  if (connection.playerId && ![...this.connections.values()].some(c => c.playerId === connection.playerId)) this.authority.leave(connection.playerId);
  this.broadcastAccess();
 }
 receive(id: string, text: string,authenticatedPlayerId?:string): { changed: boolean; acknowledgment?: () => void } {
  const connection = this.connections.get(id); if (!connection||this.failed) return { changed: false };
  if (text.length > 8192) { connection.wire.close(1009, 'Message too large'); return { changed: false }; }
  if (this.elapsed - connection.window >= 1) { connection.messages = 0; connection.window = this.elapsed; }
  if (++connection.messages > 90) { connection.wire.close(1008, 'Rate limit'); return { changed: false }; }
  try {
   const packet = JSON.parse(text) as Record<string, unknown>;
   if (!packet || typeof packet !== 'object') throw new Error('Invalid packet');
   if (packet.type === 'hello') {
    if(packet.protocol!==COOP_PROTOCOL)throw Error('ゲームの版が違います。ページを更新してください');
    if(Object.keys(packet).some(key=>!['type','protocol','buildId','roomId','clientTick'].includes(key))||!isPublicPlayerId(authenticatedPlayerId))throw Error('認証済みの接続情報が必要です');
    const info=helloInfo(packet);if(this.roomId&&info.roomId&&info.roomId!==this.roomId)throw Error('招待した部屋と接続先が一致しません');
    if(connection.playerId&&connection.playerId!==authenticatedPlayerId)throw Error('Identity cannot change');
    if(this.pendingAccess){connection.wire.close(1013,'Room management is saving');return {changed:false};}
    const playerId=authenticatedPlayerId,known=this.access.knownIds.includes(playerId)||this.authority.hasRecordedPlayer(playerId);
    if(this.access.bannedIds.includes(playerId)){connection.wire.close(4003,'Re-entry refused by administrator');return {changed:false};}
    if(this.access.locked&&!known){connection.wire.close(4004,'New participation is locked');return {changed:false};}
    if(connection.playerId){this.welcome(connection);return {changed:false};}
    if(!this.authority.actors.has(playerId)&&this.authority.actors.size-1>=MAX_COOP_PLAYERS)throw Error('この部屋は4人までです');
    if(!known&&this.access.knownIds.length>=ROOM_ACCESS_LIMITS.members)throw Error('この部屋の参加記録は上限に達しました');
    if(!this.authority.canRecordPlayer(playerId))throw Error('この部屋の参加記録は上限に達しました');
    const next=structuredClone(this.access);
    if(!next.knownIds.includes(playerId)&&next.knownIds.length<ROOM_ACCESS_LIMITS.members){next.knownIds.push(playerId);next.revision++;}
    if(next.claimable){next.administratorId=playerId;next.claimable=false;}
    return this.stageAccess(next,()=>{
     if(!this.connections.has(id))return;connection.playerId=playerId;this.authority.join(playerId);
     for(const [otherId,other]of this.connections)if(otherId!==id&&other.playerId===playerId){this.disconnect(otherId);other.wire.close(4001,'Replaced by reconnect');}
     this.welcome(connection);
    });
   }
   if (!connection.playerId) throw new Error('Handshake required');
   if(packet.type==='delivery'){connection.delivery.acknowledge(packet.token);return {changed:false};}
   if(packet.type==='room-admin')return this.admin(connection,packet);
   if(this.pendingAccess){if(packet.type==='resync')connection.needsWelcome=true;else if(packet.type==='ping')connection.wire.send({type:'pong'});else if(packet.type==='action'&&typeof packet.commandId==='string')connection.wire.send({type:'ack',commandId:packet.commandId,accepted:false,message:'部屋管理の保存中です。保存後に再操作してください'});return {changed:false};}
   if (packet.type === 'input') { helloInfo({clientTick:packet.clientTick});this.authority.input(connection.playerId, packet.input as Parameters<SessionAuthority['input']>[1], packet.sequence as number); }
   else if (packet.type === 'resync') this.welcome(connection);
   else if(packet.type==='export'){if(typeof packet.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,96}$/.test(packet.requestId))throw Error('Invalid export request');connection.pendingExport??=packet.requestId;this.exportPending(connection);}
   else if (packet.type === 'ping') connection.wire.send({ type: 'pong' });
   else if (packet.type === 'action') {
    helloInfo({clientTick:packet.clientTick});
    if (typeof packet.commandId !== 'string' || !/^[a-zA-Z0-9_-]{1,96}$/.test(packet.commandId)) throw new Error('Invalid command id');
    const commandId = packet.commandId, seen = this.receipts.get(connection.playerId) ?? new Set<string>();
    if (seen.has(commandId)) return { changed: true, acknowledgment: () => connection.wire.send({ type: 'ack', commandId, accepted: true, message: '操作は反映済みです' }) };
    const sequenceMatch=/^seq_([1-9][0-9]*)_/.exec(commandId), actionSequence=sequenceMatch?Number(sequenceMatch[1]):undefined;
    if(actionSequence!==undefined&&(!Number.isSafeInteger(actionSequence)||actionSequence<=(this.actionSequences.get(connection.playerId)??0))){connection.wire.send({type:'ack',commandId,accepted:false,message:'反映済みまたは期限切れの操作です。再実行せず最新状態を表示します'});return {changed:false};}
    if(actionSequence===undefined&&seen.size>=256){connection.wire.send({type:'ack',commandId,accepted:false,message:'旧版の操作記録が満杯です。ページを更新してください'});return {changed:false};}
    const action = packet.message as CoopAction;
    if (!action || (action.type !== 'action' && action.type !== 'game-action')) throw new Error('Invalid action');
    let message: string;
    try {
     if(action.type==='action'&&(action.tool==='dig'||action.tool==='add')&&!Number.isSafeInteger(action.expectedRevision))throw Error('地形の版がありません。ページを更新して同期してください');
     if(action.type==='game-action'&&['sky-store','sky-take','sky-camp','sky-move','sky-glue','sky-unglue','sky-recall','sky-salvage','sky-toggle','sky-charge','sky-ride','sky-share','sky-upright','sky-throw'].includes(action.action)&&!Number.isSafeInteger(action.expectedEpoch))throw Error('構造物の版がありません。同期して再試行してください');
     message = this.authority.action(connection.playerId, action).message;
    }
    catch (error) { connection.wire.send({ type: 'ack', commandId, accepted: false, message: error instanceof Error ? error.message : '操作を受理できません' }); return { changed: false }; }
    if(actionSequence!==undefined)this.actionSequences.set(connection.playerId,actionSequence);else {seen.add(commandId);this.receipts.set(connection.playerId,seen);}
    return { changed: true, acknowledgment: () => connection.wire.send({ type: 'ack', commandId, accepted: true, message }) };
   } else throw new Error('Unknown packet');
  } catch (error) { connection.wire.send({ type: 'notice', message: error instanceof Error ? error.message : '通信データが不正です' }); }
  return { changed: false };
 }
 viewAccess(playerId:string):RoomAccessView {
  const canManage=this.access.administratorId===playerId;
  return {canManage,locked:this.access.locked,revision:this.access.revision,pending:!!this.pendingAccess,readOnly:this.failed,...(canManage?{members:this.access.knownIds.map(id=>({id,online:[...this.connections.values()].some(c=>c.playerId===id),banned:this.access.bannedIds.includes(id)}))}:{})};
 }
 private broadcastAccess():void{for(const c of this.connections.values())if(c.playerId)c.wire.send({type:'room-access',access:this.viewAccess(c.playerId)});}
 private stageAccess(access:RoomAccessState,commit:()=>void,command?:RoomAdminCommand):{changed:boolean;acknowledgment:()=>void}{
  const pending=this.pendingAccess={access:validateRoomAccess(access),commit,command};for(const actor of this.authority.actors.values())actor.input={x:0,z:0,jump:false};this.broadcastAccess();
  return {changed:true,acknowledgment:()=>{if(this.failed||this.pendingAccess!==pending)return;this.access=pending.access;this.pendingAccess=undefined;pending.commit();this.broadcastAccess();}};
 }
 private admin(connection:Connection,packet:Record<string,unknown>):{changed:boolean;acknowledgment?:()=>void}{
  const commandId=typeof packet.commandId==='string'?packet.commandId:'';
  const reject=(message:string)=>{connection.wire.send({type:'ack',kind:'room-admin',commandId,accepted:false,message});return {changed:false};};
  try{
   if(Object.keys(packet).some(key=>!['type','commandId','expectedRevision','operation','targetId'].includes(key)))throw Error('部屋管理のフィールドが不正です');
   const command=validateAdminCommand(packet),owner=connection.playerId!;if(this.access.administratorId!==owner)throw Error('この操作は部屋の管理者だけが使えます');
   const prior=this.access.receipts.find(r=>r.commandId===command.commandId);if(prior){if(!sameAdminCommand(prior,command))throw Error('操作IDが別の管理操作に使われています');return {changed:false,acknowledgment:()=>connection.wire.send({type:'ack',kind:'room-admin',commandId,accepted:true,message:roomAdminMessage(command)})};}
   if(this.pendingAccess){if(this.pendingAccess.command&&sameAdminCommand(this.pendingAccess.command,command))return {changed:false};throw Error('別の部屋管理を保存しています。完了を待ってください');}
   if(command.expectedRevision!==this.access.revision)throw Error('部屋情報が更新されています。対象を確認し直してください');
   if(command.targetId){if(command.targetId===owner)throw Error('管理者自身を退出・拒否できません');if(!this.access.knownIds.includes(command.targetId))throw Error('この部屋に記録のある相手を選んでください');if(command.operation==='kick'&&![...this.connections.values()].some(c=>c.playerId===command.targetId))throw Error('その冒険者はすでに退出しています');}
   const next=structuredClone(this.access);if(!Number.isSafeInteger(next.revision+1))throw Error('部屋管理の記録上限です');next.revision++;
   if(command.operation==='lock')next.locked=true;if(command.operation==='unlock')next.locked=false;
   if(command.operation==='ban'&&!next.bannedIds.includes(command.targetId!))next.bannedIds.push(command.targetId!);
   if(command.operation==='unban')next.bannedIds=next.bannedIds.filter(id=>id!==command.targetId);
   next.receipts.push({...command,revision:next.revision});if(next.receipts.length>ROOM_ACCESS_LIMITS.receipts)next.receipts.shift();
   return this.stageAccess(next,()=>{
    if(command.operation==='kick'||command.operation==='ban')for(const [id,c]of [...this.connections])if(c.playerId===command.targetId){this.disconnect(id);c.wire.close(command.operation==='ban'?4003:4005,command.operation==='ban'?'Re-entry refused by administrator':'Removed by administrator; manual reconnect is allowed');}
    connection.wire.send({type:'ack',kind:'room-admin',commandId,accepted:true,message:roomAdminMessage(command)});
   },command);
  }catch(error){return reject(error instanceof Error?error.message:'部屋管理を受理できません');}
 }
 /** A failed write may already have committed remotely. Stop rather than guessing or rolling back access. */
 failPersistence():void{if(this.failed)return;this.failed=true;this.broadcastAccess();this.notice('共有保存の結果を確認できません。操作を停止し、保存から部屋を読み直します');for(const c of this.connections.values())c.wire.close(1011,'Persistence outcome uncertain; reload required');}
 private sendDelivery(connection:Connection,packet:CoopWireServerPacket):void{
  const text=JSON.stringify(packet),bytes=new TextEncoder().encode(text).byteLength+64;
  try{const delivery=connection.delivery.issue(bytes,this.elapsed),message={...packet,delivery};connection.wire.send(message,text.slice(0,-1)+',"delivery":'+JSON.stringify(delivery)+'}');}
  catch{connection.wire.close(1009,'Shared data transfer exceeds receive budget');for(const[id,c]of this.connections)if(c===connection)this.disconnect(id);}
 }
 private exportPending(connection:Connection):void{
  if(!connection.playerId||!connection.pendingExport||!connection.delivery.writable||this.elapsed-(connection.lastExport??-Infinity)<5)return;
  const requestId=connection.pendingExport;connection.pendingExport=undefined;connection.lastExport=this.elapsed;this.sendDelivery(connection,{type:'export',requestId,save:participantSave(this.authority,connection.playerId,{portable:true})});
 }
 private welcome(connection: Connection): void {
  if(!connection.delivery.writable){connection.needsWelcome=true;return;}
  if(connection.lastWelcome!==undefined&&this.elapsed-connection.lastWelcome<1){connection.needsWelcome=true;return;}connection.lastWelcome=this.elapsed;connection.needsWelcome=false;
  const playerId = connection.playerId!; connection.editBase = this.authority.sim.world.edits.length;
  const save=participantSave(this.authority,playerId),state=sessionFrame(this.authority,playerId);connection.water.reset(state.fluids);connection.snapshot.reset({...state,fluids:[]});this.sendDelivery(connection,{ type: 'welcome', protocol: COOP_PROTOCOL,...(this.persistedRevision?{persistedRevision:this.persistedRevision}:{}),actionSequence:this.actionSequences.get(playerId)??0,session:sessionInfo(save,state,this.roomId), epoch: this.epoch, playerId, save, state });connection.wire.send({type:'room-access',access:this.viewAccess(playerId)});
 }
 step(): void {
  this.elapsed += 1 / 30;if(this.failed)return;
  // Handshake connections cannot keep an empty room alive forever.
  for (const [id, c] of this.connections) if (!c.playerId && this.elapsed - c.created > 10) { c.wire.close(1008, 'Handshake timeout'); this.disconnect(id); }
  for(const[id,c]of [...this.connections])if(c.delivery.stalled(this.elapsed)){this.disconnect(id);c.wire.close(1013,'Receive backlog; reconnect for current state');}
  if(this.pendingAccess||![...this.connections.values()].some(c => c.playerId))return;
  for(const c of this.connections.values())if(c.playerId&&c.needsWelcome&&this.elapsed-(c.lastWelcome??-Infinity)>=1)this.welcome(c);
  for(const c of this.connections.values())this.exportPending(c);
  this.authority.step();
  if (this.authority.sim.tick % 3 !== 0) return;
  for (const c of this.connections.values()) if (c.playerId&&c.delivery.writable&&!c.needsWelcome) {
   const edits = this.authority.sim.world.edits;
   const state=sessionFrame(this.authority,c.playerId),water=encodeCompactFluidDelta(c.water.encode(state.fluids)),delta=c.snapshot.encode({...state,fluids:[]});this.sendDelivery(c,{ type: 'delta', epoch: this.epoch,tick:state.tick, state:delta,water, editBase: c.editBase, edits: edits.slice(c.editBase) }); c.editBase = edits.length;
  }
 }
 checkpoint(): RoomCheckpoint {if(this.failed)throw Error('保存結果が不明なため再読込が必要です'); return { version: 1, actionSequences:[...this.actionSequences], access:structuredClone(this.pendingAccess?.access??this.access), world: this.authority.save(), receipts: [...this.receipts].map(([id, seen]) => [id, [...seen]]) }; }
 notice(message: string): void { for (const c of this.connections.values()) c.wire.send({ type: 'notice', message }); }
}
