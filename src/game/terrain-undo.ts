import {assertBuildingTerrain} from './building-permissions';
import {buildingVoxels,buildingPose,worldPoint} from './voxel/model';
import type {GameSimulation} from '../simulation/game-simulation';
import {SdfWorld} from '../world/density';
import {MAX_EDITS,type Vec3} from '../world/types';
import {canCarry} from './meadows/inventory';
interface UndoRecord{before:number;after:number;tick:number;point:Vec3;bodies:number[];drops:{id:number;amount:number}[];buildingIds:number[];refund:number}
export class TerrainUndo{
 private records=new Map<string,UndoRecord>();
 constructor(private readonly sim:GameSimulation){}
 begin(){return {before:this.sim.world.edits.length,bodies:new Set(this.sim.bodies.map(b=>b.id)),drops:new Set(this.sim.adventure.state.resources.map(r=>r.id)),buildings:this.sim.adventure.state.buildings.map(b=>b.id)};}
 record(owner:string,start:ReturnType<TerrainUndo['begin']>,point:Vec3,refund:number):void{
  const s=this.sim.adventure.state,unchanged=start.buildings.length===s.buildings.length&&start.buildings.every(id=>s.buildings.some(b=>b.id===id));
  if(!unchanged){this.records.delete(owner);return;}
  this.records.set(owner,{before:start.before,after:this.sim.world.edits.length,tick:this.sim.tick,point:{...point},bodies:this.sim.bodies.filter(b=>!start.bodies.has(b.id)).map(b=>b.id),drops:s.resources.filter(r=>r.drop&&!start.drops.has(r.id)).map(r=>({id:r.id,amount:r.amount})),buildingIds:start.buildings,refund});
 }
 undo(owner:string):{dirty:string[];message:string}{
  const sim=this.sim,r=this.records.get(owner),s=sim.adventure.state;
  if(!r||sim.tick-r.tick>300)throw Error('戻せるのは自分の直近10秒以内の地形操作です');
  if(sim.world.edits.length!==r.after)throw Error('その後に世界が編集されました。他の操作を上書きしないため戻せません');
  if(Math.hypot(sim.player.x-r.point.x,sim.player.y-r.point.y,sim.player.z-r.point.z)>9)throw Error('編集した場所へ戻ってください');
  if(r.drops.some(drop=>s.resources.find(n=>n.id===drop.id)?.amount!==drop.amount)||r.bodies.some(id=>!sim.bodies.some(b=>b.id===id)))throw Error('生じた素材が取得・変更されたため戻せません');
  if(r.buildingIds.length!==s.buildings.length||r.buildingIds.some(id=>!s.buildings.some(b=>b.id===id)))throw Error('建築が変化したため、安全に戻せません');
  if(r.refund&&!canCarry(s.inventory,'stone',r.refund,s.meadows))throw Error('返却する石を入れる持ち物の空きを作ってください');
  const removed=sim.world.edits.slice(r.before,r.after);if(sim.world.edits.length+removed.length>MAX_EDITS)throw Error('地形履歴の上限で取消を記録できません');
  const future=new SdfWorld(sim.world.bounds,sim.world.generator);for(const edit of sim.world.edits)future.apply(edit);
  const markers=removed.map((edit,i)=>({...edit,id:r.after+i+1,undo:edit.id,tick:sim.tick}));for(const edit of markers){assertBuildingTerrain(sim.adventure,edit.position,edit.radius);future.apply(edit);}
  const players=sim.targets.length?sim.targets.map(t=>t.player):[sim.player];
  if(players.some(p=>[.15,.8,1.4].some(y=>future.density({x:p.x,y:p.y+y,z:p.z})<.05)))throw Error('戻す地面に冒険者が入っています。離れてから試してください');
  if(sim.skybound.state.parts.some(p=>Math.hypot(p.position.x-r.point.x,p.position.y-r.point.y,p.position.z-r.point.z)<5&&future.density(p.position)<0))throw Error('戻す地面に部品が入っています。先に運び出してください');
  for(const building of s.buildings){if(Math.hypot(building.x-r.point.x,building.y-r.point.y,building.z-r.point.z)>8)continue;const model=buildingVoxels(building.definition),pose=buildingPose(building);for(const cell of model.cells.values()){const point=worldPoint({x:(cell.x+.5)*.125,y:(cell.y+.5)*.125,z:(cell.z+.5)*.125},pose,pose.rotation);if(future.density(point)<-.05&&sim.world.density(point)>.05)throw Error('戻す地面に建築が入っています。先に安全な場所へ移してください');}}
  const dirty=new Set<string>();for(const edit of markers)for(const id of sim.world.apply(edit))dirty.add(id);
  const dropIds=new Set(r.drops.map(d=>d.id)),bodyIds=new Set(r.bodies);for(let i=s.resources.length-1;i>=0;i--)if(dropIds.has(s.resources[i].id))s.resources.splice(i,1);for(let i=sim.bodies.length-1;i>=0;i--)if(bodyIds.has(sim.bodies[i].id))sim.bodies.splice(i,1);
  if(r.refund)s.inventory.stone=(s.inventory.stone??0)+r.refund;for(const p of sim.skybound.state.parts)p.sleeping=false;for(const b of sim.bodies)b.sleeping=false;
  this.records.delete(owner);return {dirty:[...dirty],message:'直近の地形操作を取り消しました。未取得の発生素材を戻し、使用した石を返しました'};
 }
}
